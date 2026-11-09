import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { feedbackKey, feedbackTags, type FeedbackStorage } from "./feedback";

/** No public reads or listings: the browser receives only a short-lived, checksum-bound PUT. */
export function feedbackStorage(
  Bucket: string,
  s3 = new S3Client({ requestChecksumCalculation: "WHEN_REQUIRED" })
): FeedbackStorage {
  return {
    signScreenshot: (id, { size, checksum }) =>
      getSignedUrl(
        s3,
        new PutObjectCommand({
          Bucket,
          Key: feedbackKey(id, "canvas.png"),
          ContentType: "image/png",
          ContentLength: size,
          ChecksumSHA256: checksum,
          Metadata: { "feedback-id": id },
          Tagging: "Project=arconis&kind=feedback-screenshot",
        }),
        {
          expiresIn: 300,
          signableHeaders: new Set(["content-type", "content-length"]),
          // These are signed query parameters; the browser need only send the PNG and checksum.
          unhoistableHeaders: new Set(["x-amz-checksum-sha256"]),
        }
      ),
    hasScreenshot: async ({ id, size, checksum }) => {
      try {
        const object = await s3.send(
          new HeadObjectCommand({
            Bucket,
            Key: feedbackKey(id, "canvas.png"),
            ChecksumMode: "ENABLED",
          })
        );
        return (
          object.ContentType === "image/png" &&
          object.ContentLength === size &&
          object.ChecksumSHA256 === checksum
        );
      } catch (error) {
        if (error instanceof Error && error.name === "NotFound") return false;
        throw error;
      }
    },
    save: async (record) => {
      await s3.send(
        new PutObjectCommand({
          Bucket,
          Key: feedbackKey(record.id, "report.json"),
          ContentType: "application/json",
          Body: JSON.stringify(record),
          IfNoneMatch: "*",
          Metadata: { "feedback-id": record.id, "received-at": record.receivedAt },
          Tagging: feedbackTags(record),
        })
      );
    },
  };
}
