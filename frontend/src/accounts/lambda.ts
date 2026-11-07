import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  TransactionCanceledException,
} from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  AccountsApi,
  TOTAL_STORAGE_BYTES,
  USER_STORAGE_BYTES,
  tokenSubject,
  type AccountTable,
  type WorkspaceRecord,
} from "./api";
import { managementFromEnvironment } from "./auth0Management";

const TableName = process.env.TABLE_NAME ?? "";
const Bucket = process.env.BUCKET_NAME ?? "";
const siteOrigin = process.env.SITE_ORIGIN ?? "";
const LINK_SECONDS = 300;
const TOTAL_KEY = { pk: "SERVICE", sk: "STORAGE" };

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({ requestChecksumCalculation: "WHEN_REQUIRED" });
const management = managementFromEnvironment(process.env);
const userKey = (user: string) => `USER#${user}`;
const objectKey = (user: string, id: string) => `workspaces/${user}/${id}`;
const WORKSPACE_PREFIX = "WORKSPACE#";

const table: AccountTable = {
  profile: async (user) => {
    const { Item } = await dynamo.send(
      new GetCommand({ TableName, Key: { pk: userKey(user), sk: "PROFILE" } })
    );
    if (!Item?.name) return null;
    return { name: Item.name as string, bytes: Number(Item.bytes ?? 0) };
  },
  saveProfile: async (user, { name }) => {
    await dynamo.send(
      new UpdateCommand({
        TableName,
        Key: { pk: userKey(user), sk: "PROFILE" },
        UpdateExpression: "SET #name = :name",
        ExpressionAttributeNames: { "#name": "name" },
        ExpressionAttributeValues: { ":name": name },
      })
    );
  },
  workspaces: async (user) => {
    const { Items } = await dynamo.send(
      new QueryCommand({
        TableName,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: { ":pk": userKey(user), ":prefix": WORKSPACE_PREFIX },
      })
    );
    return (Items ?? []).map((item) => item.record as WorkspaceRecord);
  },
  workspace: async (user, id) => {
    const { Item } = await dynamo.send(
      new GetCommand({ TableName, Key: { pk: userKey(user), sk: `${WORKSPACE_PREFIX}${id}` } })
    );
    return (Item?.record as WorkspaceRecord | undefined) ?? null;
  },
  saveWorkspace: async (user, record) => {
    await dynamo.send(
      new PutCommand({
        TableName,
        Item: { pk: userKey(user), sk: `${WORKSPACE_PREFIX}${record.id}`, record },
      })
    );
  },
  deleteWorkspace: async (user, id) => {
    await dynamo.send(
      new DeleteCommand({
        TableName,
        Key: { pk: userKey(user), sk: `${WORKSPACE_PREFIX}${id}` },
      })
    );
  },
  addBytes: async (user, delta) => {
    const limited = delta > 0;
    const add = (Key: object, limit: number) => ({
      Update: {
        TableName,
        Key,
        UpdateExpression: "ADD #bytes :delta",
        ExpressionAttributeNames: { "#bytes": "bytes" },
        ExpressionAttributeValues: {
          ":delta": delta,
          ...(limited ? { ":room": limit - delta } : {}),
        },
        ...(limited
          ? { ConditionExpression: "attribute_not_exists(#bytes) OR #bytes <= :room" }
          : {}),
      },
    });
    try {
      await dynamo.send(
        new TransactWriteCommand({
          TransactItems: [
            add({ pk: userKey(user), sk: "PROFILE" }, USER_STORAGE_BYTES),
            add(TOTAL_KEY, TOTAL_STORAGE_BYTES),
          ],
        })
      );
      return true;
    } catch (error) {
      if (error instanceof TransactionCanceledException) return false;
      if (error instanceof ConditionalCheckFailedException) return false;
      throw error;
    }
  },
  deleteProfile: async (user) => {
    await dynamo.send(new DeleteCommand({ TableName, Key: { pk: userKey(user), sk: "PROFILE" } }));
  },
};

const api = new AccountsApi(table, {
  signUpload: (user, id, size, checksum) =>
    getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket,
        Key: objectKey(user, id),
        ContentType: "application/octet-stream",
        ContentLength: size,
        ChecksumSHA256: checksum,
      }),
      {
        expiresIn: LINK_SECONDS,
        signableHeaders: new Set(["content-type", "content-length"]),
        unhoistableHeaders: new Set(["x-amz-checksum-sha256"]),
      }
    ),
  signDownload: (user, id) =>
    getSignedUrl(s3, new GetObjectCommand({ Bucket, Key: objectKey(user, id) }), {
      expiresIn: LINK_SECONDS,
    }),
  deleteObject: async (user, id) => {
    await s3.send(new DeleteObjectCommand({ Bucket, Key: objectKey(user, id) }));
  },
  // The token's subject is the Auth0 user.
  deleteLogin: (sub) => management.deleteUser(sub),
  now: Date.now,
  newRevision: () => crypto.randomUUID(),
});

interface AlbEvent {
  path: string;
  httpMethod: string;
  headers?: Record<string, string>;
  body?: string;
  isBase64Encoded?: boolean;
}

function response(statusCode: number, body: object) {
  return {
    statusCode,
    isBase64Encoded: false,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": siteOrigin,
      "cache-control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

export async function handler(event: AlbEvent) {
  const user = tokenSubject(event.headers?.authorization);
  if (!user) return response(401, { error: "Sign in again." });
  const raw = event.body ?? "";
  const body = event.isBase64Encoded ? Buffer.from(raw, "base64").toString() : raw;
  try {
    const { status, body: result } = await api.handle(user, event.httpMethod, event.path, body);
    return response(status, result);
  } catch (error) {
    console.error(error);
    return response(500, { error: "The account request failed." });
  }
}
