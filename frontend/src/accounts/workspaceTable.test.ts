import { expect, it, vi } from "vitest";
import { DynamoDBClient, TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { dynamoWorkspaces } from "./workspaceTable";
import type { WorkspaceRecord } from "../protocol/account";

function setup() {
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: "us-east-1" }));
  const send = vi.spyOn(client, "send").mockImplementation(async () => ({}));
  const table = dynamoWorkspaces(client, "accounts");
  const record: WorkspaceRecord = {
    id: crypto.randomUUID(),
    roomId: "a".repeat(48),
    name: "Current",
    revision: crypto.randomUUID(),
    size: 100,
    updated: 1000,
  };
  return { send, table, record };
}

it("publishes the current pointer, immutable revision and quota changes in one conditional transaction", async () => {
  const { send, table, record } = setup();
  expect(await table.commitWorkspace("a", record, "base", [])).toBe("saved");
  expect(send.mock.calls[0][0].input).toMatchObject({
    TransactItems: [
      { Put: { Item: { record }, ExpressionAttributeValues: { ":revision": "base" } } },
      { Put: { ConditionExpression: "attribute_not_exists(pk)", Item: { record } } },
      { Update: { ExpressionAttributeValues: { ":delta": 100, ":count": 0 } } },
      { Update: { ExpressionAttributeValues: { ":delta": 100 } } },
    ],
  });
});

it("distinguishes stale publication, quota refusal and storage outages", async () => {
  const { send, table, record } = setup();
  const canceled = (reasons: { Code: string }[]) =>
    new TransactionCanceledException({
      $metadata: {},
      message: "Refused",
      CancellationReasons: reasons,
    });
  send.mockRejectedValueOnce(canceled([{ Code: "ConditionalCheckFailed" }]));
  expect(await table.commitWorkspace("a", record, "base", [])).toBe("conflict");
  send.mockRejectedValueOnce(
    canceled([{ Code: "None" }, { Code: "None" }, { Code: "ConditionalCheckFailed" }])
  );
  expect(await table.commitWorkspace("a", record, "base", [])).toBe("full");
  send.mockRejectedValueOnce(new Error("Unavailable"));
  await expect(table.commitWorkspace("a", record, "base", [])).rejects.toThrow("Unavailable");
});
