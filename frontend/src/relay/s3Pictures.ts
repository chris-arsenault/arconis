import { ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { UploadRequest } from "../collaboration/serviceProtocol";
import type { StoredPictures } from "./uploads";

const PREFIX = "pictures/";
const LINK_SECONDS = 300;

/** Pictures in the website's bucket, which CloudFront already serves. */
export function s3Pictures(bucket: string): StoredPictures {
  // The link fixes a checksum of its own, so the SDK must not add another one.
  const client = new S3Client({ requestChecksumCalculation: "WHEN_REQUIRED" });
  return {
    list: async () => {
      const found = new Map<string, number>();
      let token: string | undefined;
      do {
        const page = await client.send(
          new ListObjectsV2Command({ Bucket: bucket, Prefix: PREFIX, ContinuationToken: token })
        );
        page.Contents?.forEach(({ Key, Size }) => {
          if (Key) found.set(Key.slice(PREFIX.length), Size ?? 0);
        });
        token = page.NextContinuationToken;
      } while (token);
      return found;
    },
    sign: ({ hash, type, size, checksum }: UploadRequest) =>
      getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: bucket,
          Key: `${PREFIX}${hash}`,
          ContentType: type,
          ContentLength: size,
          ChecksumSHA256: checksum,
        }),
        {
          expiresIn: LINK_SECONDS,
          signableHeaders: new Set(["content-type", "content-length"]),
          unhoistableHeaders: new Set(["x-amz-checksum-sha256"]),
        }
      ),
  };
}
