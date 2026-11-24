import {
  GetObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
  type GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DeliveryError, headSchema, type DeliveryStorage, type Head } from "./hosted";

const prefix = (user: string) => "delivery/" + encodeURIComponent(user) + "/";
const key = (user: string, project: string, name: string) => prefix(user) + project + "/" + name;
const missing = (error: unknown) =>
  error instanceof Error && (error.name === "NoSuchKey" || error.name === "NotFound");
const read = (body: string) => headSchema.parse(JSON.parse(body) as unknown);

export async function deleteDeliveryUser(client: S3Client, bucket: string, user: string) {
  let continuation: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix(user),
        ContinuationToken: continuation,
      })
    );
    const objects = (page.Contents ?? []).flatMap((value) =>
      value.Key ? [{ Key: value.Key }] : []
    );
    if (objects.length) {
      const deleted = await client.send(
        new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects, Quiet: true } })
      );
      if (deleted.Errors?.length) throw new Error("Delivery project deletion is incomplete.");
    }
    continuation = page.NextContinuationToken;
  } while (continuation);
}

export function s3Delivery(client: S3Client, bucket: string): DeliveryStorage {
  const get = (Key: string) => client.send(new GetObjectCommand({ Bucket: bucket, Key }));
  const signed = (Key: string, filename?: string) =>
    getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: bucket,
        Key,
        ...(filename
          ? {
              ResponseContentDisposition:
                "attachment; filename*=UTF-8''" + encodeURIComponent(filename),
              ResponseContentType: "application/octet-stream",
            }
          : {}),
      }),
      { expiresIn: 300 }
    );
  const put = (Key: string, Body: string | Uint8Array, condition: object = {}) =>
    client.send(new PutObjectCommand({ Bucket: bucket, Key, Body, ...condition }));
  const text = async (Key: string) => (await get(Key)).Body?.transformToString() ?? "";

  return {
    list: (user) => listProjectHeads(client, bucket, text, user),
    readHead: (user, project) => loadHead(get, user, project),
    readVersion: (user, project, version) =>
      text(key(user, project, "versions/" + version + ".json")),
    writeVersion: async (user, project, version, body) => {
      await put(key(user, project, "versions/" + version + ".json"), body, { IfNoneMatch: "*" });
    },
    async publish(user, head, etag) {
      try {
        await put(
          key(user, head.project, "head.json"),
          JSON.stringify(head),
          etag ? { IfMatch: etag } : { IfNoneMatch: "*" }
        );
        return true;
      } catch (error) {
        if (wasReplaced(error)) return false;
        throw error;
      }
    },
    async stage(user, project, transfer, size, checksum) {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key(user, project, "staged/" + transfer),
        ContentLength: size,
        ChecksumSHA256: checksum,
        IfNoneMatch: "*",
      });
      const url = await getSignedUrl(client, command, {
        expiresIn: 300,
        unhoistableHeaders: new Set(["x-amz-checksum-sha256"]),
        signableHeaders: new Set(["if-none-match", "content-length"]),
      });
      return { url, headers: { "x-amz-checksum-sha256": checksum, "if-none-match": "*" } };
    },
    async readStage(user, project, transfer) {
      try {
        const object = await get(key(user, project, "staged/" + transfer));
        return Buffer.from((await object.Body?.transformToByteArray()) ?? []).toString("base64");
      } catch (error) {
        if (missing(error)) throw new DeliveryError(404, "Upload the project or artifact first.");
        throw error;
      }
    },
    getVersion: (user, project, version) =>
      signed(key(user, project, "versions/" + version + ".json")),
    async asset(user, project, version, bytes, type, name) {
      const target = key(user, project, "assets/" + version);
      await put(target, bytes, { ContentType: type });
      return signed(target, name);
    },
  };
}
async function listProjectHeads(
  client: S3Client,
  bucket: string,
  text: (key: string) => Promise<string>,
  user: string
) {
  const results: Head[] = [];
  let continuation: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix(user),
        Delimiter: "/",
        ContinuationToken: continuation,
      })
    );
    const heads = await Promise.all(
      (page.CommonPrefixes ?? []).map(async ({ Prefix }) => {
        try {
          return read(await text(Prefix + "head.json"));
        } catch (error) {
          if (missing(error)) return null;
          throw error;
        }
      })
    );
    results.push(...heads.filter((head) => head !== null));
    continuation = page.NextContinuationToken;
  } while (continuation);
  return results;
}
async function loadHead(
  get: (key: string) => Promise<GetObjectCommandOutput>,
  user: string,
  project: string
) {
  try {
    const reply = await get(key(user, project, "head.json"));
    if (!reply.ETag || !reply.Body) throw new Error("No project manifest revision.");
    return { head: read(await reply.Body.transformToString()), etag: reply.ETag };
  } catch (error) {
    if (missing(error)) return null;
    throw error;
  }
}
function wasReplaced(error: unknown) {
  return (
    error instanceof Error &&
    ["PreconditionFailed", "ConditionalRequestConflict"].includes(error.name)
  );
}
