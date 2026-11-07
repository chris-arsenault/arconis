import { ConditionalCheckFailedException, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { admitSignup } from "./signupLimit";

const TableName = process.env.TABLE_NAME ?? "";
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/** One conditional update, so simultaneous sign-ups cannot pass the limit between them. */
async function claim(day: string, limit: number) {
  try {
    await dynamo.send(
      new UpdateCommand({
        TableName,
        Key: { pk: "SERVICE", sk: `SIGNUPS#${day}` },
        UpdateExpression: "ADD #count :one",
        ConditionExpression: "attribute_not_exists(#count) OR #count < :limit",
        ExpressionAttributeNames: { "#count": "count" },
        ExpressionAttributeValues: { ":one": 1, ":limit": limit },
      })
    );
    return true;
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) return false;
    throw error;
  }
}

export function handler<Event extends { triggerSource: string }>(event: Event) {
  return admitSignup(event, { now: Date.now, claim });
}
