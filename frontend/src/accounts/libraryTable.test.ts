import { expect, it, vi } from "vitest";
import { DynamoDBClient, TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { dynamoLibrary } from "./libraryTable";
import type { LibraryEntry } from "../protocol/library";

function setup() {
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: "us-east-1" }));
  const send = vi.spyOn(client, "send").mockImplementation(() => ({}));
  const table = dynamoLibrary(client, "accounts");
  const entry: LibraryEntry = {
    id: crypto.randomUUID(),
    name: "Layout",
    size: 100,
    updated: 1000,
    revision: crypto.randomUUID(),
    checksum: "checked",
  };
  return { send, table, entry };
}
const canceled = (codes: string[]) =>
  new TransactionCanceledException({
    $metadata: {},
    message: "Refused",
    CancellationReasons: codes.map((Code) => ({ Code })),
  });

it("publishes and removes metadata with both quota changes in conditional transactions", async () => {
  const { send, table, entry } = setup();
  expect(await table.createLibrary("a", entry)).toBe("saved");
  expect(send.mock.calls[0][0].input).toMatchObject({
    TransactItems: [
      {
        Put: {
          Item: { pk: "USER#a", sk: `LIBRARY#${entry.id}`, entry },
          ConditionExpression: "attribute_not_exists(pk)",
        },
      },
      {
        Update: {
          Key: { pk: "USER#a", sk: "PROFILE" },
          ConditionExpression: expect.any(String) as unknown,
          ExpressionAttributeValues: { ":delta": 100 },
        },
      },
      {
        Update: {
          Key: { pk: "SERVICE", sk: "STORAGE" },
          ConditionExpression: expect.any(String) as unknown,
          ExpressionAttributeValues: { ":delta": 100 },
        },
      },
    ],
  });
  expect(await table.deleteLibrary("a", entry)).toBe(true);
  expect(send.mock.calls[1][0].input).toMatchObject({
    TransactItems: [
      {
        Delete: {
          ConditionExpression: "#entry.#revision = :revision",
          ExpressionAttributeValues: { ":revision": entry.revision },
        },
      },
      { Update: { ExpressionAttributeValues: { ":delta": -100 } } },
      { Update: { ExpressionAttributeValues: { ":delta": -100 } } },
    ],
  });
});

it("distinguishes duplicate publication, quota refusal and storage failure", async () => {
  const { send, table, entry } = setup();
  send.mockRejectedValueOnce(canceled(["ConditionalCheckFailed"]));
  expect(await table.createLibrary("a", entry)).toBe("conflict");
  send.mockRejectedValueOnce(canceled(["None", "ConditionalCheckFailed"]));
  expect(await table.createLibrary("a", entry)).toBe("full");
  send.mockRejectedValueOnce(new Error("Unavailable"));
  await expect(table.createLibrary("a", entry)).rejects.toThrow("Unavailable");
  send.mockRejectedValueOnce(canceled(["ConditionalCheckFailed"]));
  expect(await table.deleteLibrary("a", entry)).toBe(false);
  send.mockRejectedValueOnce(new Error("Unavailable"));
  await expect(table.deleteLibrary("a", entry)).rejects.toThrow("Unavailable");
});

it("updates only the name and refuses a rename after deletion", async () => {
  const { send, table, entry } = setup();
  send.mockRejectedValueOnce(canceled(["ConditionalCheckFailed"]));
  expect(await table.renameLibrary("a", entry)).toBe(false);
  expect(send.mock.calls[0][0].input).toMatchObject({
    TransactItems: [
      {
        Update: {
          ConditionExpression: "#entry.#revision = :revision",
          UpdateExpression: "SET #entry.#name = :name",
        },
      },
      {
        ConditionCheck: {
          Key: { pk: "USER#a", sk: "PROFILE" },
          ConditionExpression: "attribute_not_exists(#deleting)",
        },
      },
    ],
  });
});

it("reports account deletion distinctly from full storage and blocks rename", async () => {
  const { send, table, entry } = setup();
  send.mockRejectedValueOnce(canceled(["None", "ConditionalCheckFailed"]));
  send.mockImplementationOnce(() => ({ Item: { deleting: true } }));
  expect(await table.createLibrary("a", entry)).toBe("deleting");
  expect(send.mock.calls[0][0].input).toMatchObject({
    TransactItems: [
      {},
      {
        Update: {
          ConditionExpression: expect.stringContaining(
            "attribute_not_exists(#deleting)"
          ) as unknown,
        },
      },
      {},
    ],
  });
  send.mockRejectedValueOnce(canceled(["None", "ConditionalCheckFailed"]));
  expect(await table.renameLibrary("a", entry)).toBe(false);
});
