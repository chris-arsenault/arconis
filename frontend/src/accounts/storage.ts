import { MAX_WORKSPACES, TOTAL_STORAGE_BYTES, USER_STORAGE_BYTES } from "./api";

/** Storage accounting joins the metadata mutation in the same DynamoDB transaction. */
export function storageUpdate(
  TableName: string,
  user: string | null,
  delta: number,
  count: number | null
) {
  const limit = user === null ? TOTAL_STORAGE_BYTES : USER_STORAGE_BYTES;
  const names: Record<string, string> = { "#bytes": "bytes" };
  const values: Record<string, number> = { ":delta": delta };
  const clauses: string[] = [];
  if (delta > 0) {
    values[":space"] = limit - delta;
    clauses.push("(attribute_not_exists(#bytes) OR #bytes <= :space)");
  }
  let expression = "ADD #bytes :delta";
  if (user !== null && count !== null) {
    names["#count"] = "workspaceCount";
    values[":count"] = count;
    expression += ", #count :count";
    if (count > 0) {
      values[":max"] = MAX_WORKSPACES;
      clauses.push("(attribute_not_exists(#count) OR #count < :max)");
    }
  }
  return {
    Update: {
      TableName,
      Key: user === null ? { pk: "SERVICE", sk: "STORAGE" } : { pk: `USER#${user}`, sk: "PROFILE" },
      UpdateExpression: expression,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ...(clauses.length ? { ConditionExpression: clauses.join(" AND ") } : {}),
    },
  };
}
