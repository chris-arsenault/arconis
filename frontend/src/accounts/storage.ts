export const MAX_WORKSPACES = 100;
export const MAX_WORKSPACE_BYTES = 50 * 1024 * 1024;
export const USER_STORAGE_BYTES = 1024 * 1024 * 1024;
export const TOTAL_STORAGE_BYTES = 20 * 1024 * 1024 * 1024;

/** Storage accounting joins the metadata mutation in the same DynamoDB transaction. */
export function storageUpdate(
  TableName: string,
  user: string | null,
  delta: number,
  count: number | null,
  saving = false
) {
  const limit = user === null ? TOTAL_STORAGE_BYTES : USER_STORAGE_BYTES;
  const names: Record<string, string> = { "#bytes": "bytes" };
  const values: Record<string, number> = { ":delta": delta };
  const clauses: string[] = [];
  if (saving) {
    names["#deleting"] = "deleting";
    clauses.push("attribute_not_exists(#deleting)");
  }
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
