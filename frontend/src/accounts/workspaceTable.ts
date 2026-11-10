import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import {
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  type DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import type { WorkspaceRecord } from "../protocol/account";
import type { WorkspaceTable } from "./workspaces";
import { storageUpdate } from "./storage";

const currentKey = (user: string, id: string) => ({ pk: `USER#${user}`, sk: `WORKSPACE#${id}` });
const revisionKey = (user: string, record: WorkspaceRecord) => ({
  pk: `USER#${user}`,
  sk: `SNAPSHOT#${record.id}#${String(record.updated).padStart(16, "0")}#${record.revision}`,
});
const expectedCondition = (revision: string) =>
  revision
    ? {
        ConditionExpression: "#record.#revision = :revision",
        ExpressionAttributeNames: { "#record": "record", "#revision": "revision" },
        ExpressionAttributeValues: { ":revision": revision },
      }
    : { ConditionExpression: "attribute_not_exists(pk)" };

async function records(
  client: DynamoDBDocumentClient,
  TableName: string,
  user: string,
  prefix: string
) {
  const entries: WorkspaceRecord[] = [];
  let cursor: Record<string, unknown> | undefined;
  do {
    const result = await client.send(
      new QueryCommand({
        TableName,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: { ":pk": `USER#${user}`, ":prefix": prefix },
        ConsistentRead: true,
        ScanIndexForward: false,
        ExclusiveStartKey: cursor,
      })
    );
    entries.push(...(result.Items ?? []).map((item) => item.record as WorkspaceRecord));
    cursor = result.LastEvaluatedKey;
  } while (cursor);
  return entries;
}

async function commit(
  client: DynamoDBDocumentClient,
  TableName: string,
  user: string,
  record: WorkspaceRecord,
  expected: string,
  pruned: WorkspaceRecord[]
) {
  const delta = record.size - pruned.reduce((size, entry) => size + entry.size, 0);
  try {
    await client.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName,
              Item: { ...currentKey(user, record.id), record },
              ...expectedCondition(expected),
            },
          },
          {
            Put: {
              TableName,
              Item: { ...revisionKey(user, record), record },
              ConditionExpression: "attribute_not_exists(pk)",
            },
          },
          ...pruned.map((entry) => ({ Delete: { TableName, Key: revisionKey(user, entry) } })),
          storageUpdate(TableName, user, delta, expected ? 0 : 1),
          storageUpdate(TableName, null, delta, 0),
        ],
      })
    );
    return "saved" as const;
  } catch (error) {
    if (!(error instanceof TransactionCanceledException)) throw error;
    if (
      error.CancellationReasons?.slice(0, 2).some(
        (reason) => reason.Code === "ConditionalCheckFailed"
      )
    )
      return "conflict" as const;
    if (error.CancellationReasons?.some((reason) => reason.Code === "ConditionalCheckFailed"))
      return "full" as const;
    throw error;
  }
}

export function dynamoWorkspaces(
  client: DynamoDBDocumentClient,
  TableName: string
): WorkspaceTable {
  const history = (user: string, id: string) => records(client, TableName, user, `SNAPSHOT#${id}#`);
  return {
    workspaces: (user) => records(client, TableName, user, "WORKSPACE#"),
    workspaceHistory: history,
    workspace: async (user, id) => {
      const { Item } = await client.send(
        new GetCommand({ TableName, Key: currentKey(user, id), ConsistentRead: true })
      );
      return (Item?.record as WorkspaceRecord | undefined) ?? null;
    },
    commitWorkspace: (user, record, expected, pruned) =>
      commit(client, TableName, user, record, expected, pruned),
    deleteWorkspace: async (user, record) => {
      const entries = await history(user, record.id);
      const delta = -entries.reduce((size, entry) => size + entry.size, 0);
      try {
        await client.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Delete: {
                  TableName,
                  Key: currentKey(user, record.id),
                  ...expectedCondition(record.revision),
                },
              },
              ...entries.map((entry) => ({ Delete: { TableName, Key: revisionKey(user, entry) } })),
              storageUpdate(TableName, user, delta, -1),
              storageUpdate(TableName, null, delta, 0),
            ],
          })
        );
        return true;
      } catch (error) {
        if (
          error instanceof TransactionCanceledException &&
          error.CancellationReasons?.[0]?.Code === "ConditionalCheckFailed"
        )
          return false;
        throw error;
      }
    },
  };
}
