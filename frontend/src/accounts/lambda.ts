import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AccountsApi, tokenSubject, type AccountTable } from "./api";
import { dynamoLibrary } from "./libraryTable";
import { dynamoWorkspaces } from "./workspaceTable";

const TableName = process.env.TABLE_NAME ?? "";
const Bucket = process.env.BUCKET_NAME ?? "";
const siteOrigin = process.env.SITE_ORIGIN ?? "";
const LINK_SECONDS = 300;

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({ requestChecksumCalculation: "WHEN_REQUIRED" });
const userKey = (user: string) => `USER#${user}`;
const objectKey = (user: string, id: string) => `workspaces/${user}/${id}`;

const table: AccountTable = {
  ...dynamoLibrary(dynamo, TableName),
  ...dynamoWorkspaces(dynamo, TableName),
  isDeleting: async (user) => {
    const { Item } = await dynamo.send(
      new GetCommand({ TableName, Key: { pk: userKey(user), sk: "PROFILE" }, ConsistentRead: true })
    );
    return Boolean(Item?.deleting);
  },
  profile: async (user) => {
    const { Item } = await dynamo.send(
      new GetCommand({ TableName, Key: { pk: userKey(user), sk: "PROFILE" }, ConsistentRead: true })
    );
    if (!Item?.name || Item.deleting) return null;
    return { name: Item.name as string, bytes: Number(Item.bytes ?? 0) };
  },
  saveProfile: async (user, { name }) => {
    try {
      await dynamo.send(
        new UpdateCommand({
          TableName,
          Key: { pk: userKey(user), sk: "PROFILE" },
          UpdateExpression: "SET #name = :name",
          ConditionExpression: "attribute_not_exists(deleting)",
          ExpressionAttributeNames: { "#name": "name" },
          ExpressionAttributeValues: { ":name": name },
        })
      );
      return true;
    } catch (error) {
      if (error instanceof Error && error.name === "ConditionalCheckFailedException") return false;
      throw error;
    }
  },
  beginDelete: async (user) => {
    await dynamo.send(
      new UpdateCommand({
        TableName,
        Key: { pk: userKey(user), sk: "PROFILE" },
        UpdateExpression: "SET deleting = :yes",
        ExpressionAttributeValues: { ":yes": true },
      })
    );
  },
  deleteProfile: async (user) => {
    await dynamo.send(
      new UpdateCommand({
        TableName,
        Key: { pk: userKey(user), sk: "PROFILE" },
        UpdateExpression: "SET deleting = :yes REMOVE #name, #bytes, workspaceCount",
        ExpressionAttributeNames: { "#name": "name", "#bytes": "bytes" },
        ExpressionAttributeValues: { ":yes": true },
      })
    );
  },
};

const api = new AccountsApi(table, {
  objectInfo: async (user, id) => {
    try {
      const result = await s3.send(
        new HeadObjectCommand({ Bucket, Key: objectKey(user, id), ChecksumMode: "ENABLED" })
      );
      return { size: result.ContentLength ?? 0, checksum: result.ChecksumSHA256 ?? "" };
    } catch (error) {
      if (error instanceof Error && error.name === "NotFound") return null;
      throw error;
    }
  },
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
  now: Date.now,
  newRevision: () => crypto.randomUUID(),
});

interface AlbEvent {
  path: string;
  httpMethod: string;
  headers: Record<string, string>;
  body: string;
  isBase64Encoded: boolean;
}
type AlbInput = Pick<AlbEvent, "path" | "httpMethod"> &
  Partial<Omit<AlbEvent, "path" | "httpMethod">>;

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

export async function handler(input: AlbInput) {
  const event: AlbEvent = { headers: {}, body: "", isBase64Encoded: false, ...input };
  const user = tokenSubject(event.headers.authorization);
  if (!user) return response(401, { error: "Sign in again." });
  const raw = event.body;
  const body = event.isBase64Encoded ? Buffer.from(raw, "base64").toString() : raw;
  try {
    const { status, body: result } = await api.handle(user, event.httpMethod, event.path, body);
    return response(status, result);
  } catch (error) {
    console.error(error);
    return response(500, { error: "The account request failed." });
  }
}
