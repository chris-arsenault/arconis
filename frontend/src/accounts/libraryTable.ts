import {
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import { libraryEntrySchema, type LibraryEntry } from "../protocol/library";
import type { LibraryTable } from "./library";
import {
  ConditionalCheckFailedException,
  TransactionCanceledException,
} from "@aws-sdk/client-dynamodb";
import { storageUpdate } from "./storage";

const sameRevision = (entry: LibraryEntry) => ({
  ConditionExpression: "#entry.#revision = :revision",
  ExpressionAttributeNames: { "#entry": "entry", "#revision": "revision" },
  ExpressionAttributeValues: { ":revision": entry.revision },
});

async function create(
  client: DynamoDBDocumentClient,
  TableName: string,
  Key: { pk: string; sk: string },
  user: string,
  entry: LibraryEntry
) {
  try {
    await client.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName,
              Item: { ...Key, entry },
              ConditionExpression: "attribute_not_exists(pk)",
            },
          },
          storageUpdate(TableName, user, entry.size, null),
          storageUpdate(TableName, null, entry.size, null),
        ],
      })
    );
    return "saved" as const;
  } catch (error) {
    if (!(error instanceof TransactionCanceledException)) throw error;
    if (error.CancellationReasons?.[0]?.Code === "ConditionalCheckFailed")
      return "conflict" as const;
    if (
      error.CancellationReasons?.slice(1).some((reason) => reason.Code === "ConditionalCheckFailed")
    )
      return "full" as const;
    throw error;
  }
}

export function dynamoLibrary(client: DynamoDBDocumentClient, TableName: string): LibraryTable {
  const Key = (user: string, id: string) => ({ pk: `USER#${user}`, sk: `LIBRARY#${id}` });
  return {
    createLibrary: (user, entry) => create(client, TableName, Key(user, entry.id), user, entry),
    library: async (user) => {
      const entries: LibraryEntry[] = [];
      let cursor: Record<string, unknown> | undefined;
      do {
        const result = await client.send(
          new QueryCommand({
            TableName,
            KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
            ExpressionAttributeValues: { ":pk": `USER#${user}`, ":prefix": "LIBRARY#" },
            ExclusiveStartKey: cursor,
            ConsistentRead: true,
          })
        );
        entries.push(...(result.Items ?? []).map((item) => libraryEntrySchema.parse(item.entry)));
        cursor = result.LastEvaluatedKey;
      } while (cursor);
      return entries;
    },
    libraryEntry: async (user, id) => {
      const { Item } = await client.send(
        new GetCommand({ TableName, Key: Key(user, id), ConsistentRead: true })
      );
      return Item ? libraryEntrySchema.parse(Item.entry) : null;
    },
    renameLibrary: async (user, entry) => {
      const condition = sameRevision(entry);
      try {
        await client.send(
          new UpdateCommand({
            TableName,
            Key: Key(user, entry.id),
            ...condition,
            UpdateExpression: "SET #entry.#name = :name",
            ExpressionAttributeNames: { ...condition.ExpressionAttributeNames, "#name": "name" },
            ExpressionAttributeValues: {
              ...condition.ExpressionAttributeValues,
              ":name": entry.name,
            },
          })
        );
        return true;
      } catch (error) {
        if (error instanceof ConditionalCheckFailedException) return false;
        throw error;
      }
    },
    deleteLibrary: async (user, entry) => {
      try {
        await client.send(
          new TransactWriteCommand({
            TransactItems: [
              { Delete: { TableName, Key: Key(user, entry.id), ...sameRevision(entry) } },
              storageUpdate(TableName, user, -entry.size, null),
              storageUpdate(TableName, null, -entry.size, null),
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
