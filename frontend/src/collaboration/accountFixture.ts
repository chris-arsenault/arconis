import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { AccountsApi, tokenSubject } from "../accounts/api";
import { memoryAccountTable } from "../accounts/memoryTable";

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/** A token shaped like Cognito's. The real ALB validates tokens; this stand-in has nothing to check. */
function token(sub: string, use: string) {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  return `${part({ alg: "none" })}.${part({ sub, username: sub, token_use: use, iat: now, exp: now + 3600 })}.x`;
}

const CONFIRMATION_CODE = "123456";

type CognitoBody = Partial<{
  Username: string;
  ConfirmationCode: string;
  AuthParameters: Record<string, string>;
  ChallengeResponses: Record<string, string>;
}>;

type CognitoReply = [number, object];

function cognitoStandIn(
  users: Map<string, { confirmed: boolean }>
): Record<string, (body: CognitoBody) => CognitoReply> {
  const authenticated = (username: string) => ({
    AuthenticationResult: {
      AccessToken: token(username, "access"),
      IdToken: token(username, "id"),
      RefreshToken: "refresh",
      ExpiresIn: 3600,
      TokenType: "Bearer",
    },
    ChallengeParameters: {},
  });
  return {
    SignUp: ({ Username }) => {
      users.set(Username!, { confirmed: false });
      return [200, { UserConfirmed: false, UserSub: Username }];
    },
    ConfirmSignUp: ({ Username, ConfirmationCode }) => {
      if (ConfirmationCode !== CONFIRMATION_CODE)
        return [400, { __type: "CodeMismatchException", message: "Invalid code." }];
      users.set(Username!, { confirmed: true });
      return [200, {}];
    },
    InitiateAuth: ({ AuthParameters }) => {
      const username = AuthParameters?.USERNAME ?? "";
      if (!users.get(username)?.confirmed)
        return [400, { __type: "UserNotConfirmedException", message: "User is not confirmed." }];
      return [
        200,
        {
          ChallengeName: "PASSWORD_VERIFIER",
          ChallengeParameters: {
            USER_ID_FOR_SRP: username,
            USERNAME: username,
            SALT: randomBytes(16).toString("hex"),
            SECRET_BLOCK: randomBytes(64).toString("base64"),
            SRP_B: randomBytes(256).toString("hex"),
          },
        },
      ];
    },
    RespondToAuthChallenge: ({ ChallengeResponses }) => [
      200,
      authenticated(ChallengeResponses?.USERNAME ?? ""),
    ],
  };
}

/**
 * Test-only: the real accounts API over memory, and a stand-in for Cognito's wire protocol, so the
 * real sign-in library runs unchanged. SRP's proof is not checked, so wrong passwords are the one
 * thing here that only real Cognito can refuse.
 */
export function accountFixture(base: () => string) {
  const objects = new Map<string, Buffer>();
  const users = new Map<string, { confirmed: boolean }>();
  const api = new AccountsApi(memoryAccountTable(), {
    signUpload: (user, id) => Promise.resolve(`${base()}/objects/${user}/${id}`),
    signDownload: (user, id) => Promise.resolve(`${base()}/objects/${user}/${id}`),
    deleteObject: (user, id) => {
      objects.delete(`/objects/${user}/${id}`);
      return Promise.resolve();
    },
    deleteLogin: (user) => {
      users.delete(user);
      return Promise.resolve();
    },
    now: Date.now,
    newRevision: () => crypto.randomUUID(),
  });
  const cognito = cognitoStandIn(users);
  const answerCognito = async (request: IncomingMessage, response: ServerResponse) => {
    const target = String(request.headers["x-amz-target"]).split(".").pop()!;
    const body = JSON.parse(String(await readBody(request))) as CognitoBody;
    const [status, result] = cognito[target]?.(body) ?? [200, {}];
    response.statusCode = status;
    response.setHeader("content-type", "application/x-amz-json-1.1");
    response.end(JSON.stringify(result));
  };
  const answerObject = async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method === "PUT") objects.set(request.url!, await readBody(request));
    const stored = objects.get(request.url!);
    response.statusCode = request.method === "GET" && !stored ? 404 : 200;
    response.end(request.method === "GET" ? stored : undefined);
  };
  const answerApi = async (request: IncomingMessage, response: ServerResponse) => {
    const user = tokenSubject(request.headers.authorization);
    const body = String(await readBody(request));
    response.setHeader("content-type", "application/json");
    const result = user
      ? await api.handle(user, request.method!, request.url!, body)
      : { status: 401, body: {} };
    response.statusCode = result.status;
    response.end(JSON.stringify(result.body));
  };
  return {
    objects,
    /** Answers this fixture's requests, and returns false for anyone else's. */
    handle(request: IncomingMessage, response: ServerResponse) {
      const url = request.url ?? "";
      if (url === "/cognito") void answerCognito(request, response);
      else if (url.startsWith("/objects/")) void answerObject(request, response);
      else if (url.startsWith("/api/")) void answerApi(request, response);
      else return false;
      return true;
    },
  };
}
