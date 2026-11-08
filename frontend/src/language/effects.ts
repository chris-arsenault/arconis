import type { Statement } from "./syntax";

export type Conversation = Extract<
  Statement,
  { kind: "view" | "discussion" | "comment" | "reply" | "resolve" }
>;

type NonItemEffect = {
  [Kind in "conversation" | "metadata" | "pictures" | "validation"]: { kind: Kind; reason: string };
}["conversation" | "metadata" | "pictures" | "validation"];
type Effect = { kind: "items"; targets: string[]; children: Statement[] } | NonItemEffect;
type Effects = {
  [Kind in Statement["kind"]]: (
    statement: Extract<Statement, { kind: Kind }>
  ) => Kind extends Conversation["kind"]
    ? Extract<Effect, { reason: string }> & { kind: "conversation" }
    : Exclude<Effect, { kind: "conversation" }>;
};

/**
 * Direct item targets govern stale checks. Layout, cascade deletion, routing and holder growth
 * remain derived consequences of the write; reading a placement/line endpoint is not an edit to it.
 */
const EFFECTS: Effects = {
  item: (statement) => ({
    kind: "items",
    targets: statement.id ? [statement.id] : [],
    children: statement.body ?? [],
  }),
  edit: (statement) => ({
    kind: "items",
    targets: [statement.ref],
    children: statement.body ?? [],
  }),
  arrange: (statement) => ({ kind: "items", targets: [], children: statement.body }),
  link: (statement) => ({
    kind: "items",
    targets: statement.id ? [statement.id] : [],
    // Inline declarations may restate existing items. Plain endpoint references only read them.
    children: [
      ...new Set(statement.segments.flatMap(({ from, to }) => [from.item, to.item])),
    ].filter((item) => item !== undefined),
  }),
  delete: (statement) => ({ kind: "items", targets: statement.refs, children: [] }),
  tidy: (statement) => ({ kind: "items", targets: [statement.ref], children: [] }),
  header: () => ({ kind: "validation", reason: "Checks the file version without naming an item." }),
  title: () => ({ kind: "metadata", reason: "Canvas titles retain last-write-wins semantics." }),
  style: () => ({ kind: "metadata", reason: "Named looks retain last-write-wins semantics." }),
  data: () => ({
    kind: "pictures",
    reason: "File picture bytes are returned separately from items.",
  }),
  view: () => ({ kind: "conversation", reason: "Views have no item stale-check policy." }),
  discussion: () => ({
    kind: "conversation",
    reason: "Imported discussions preserve their contents.",
  }),
  comment: () => ({
    kind: "conversation",
    reason: "Appending a comment does not overwrite its item.",
  }),
  reply: () => ({ kind: "conversation", reason: "Appending a reply does not overwrite its item." }),
  resolve: () => ({
    kind: "conversation",
    reason: "Discussion state keeps its existing merge policy.",
  }),
};

function effect(statement: Statement): Effect {
  const analyze = EFFECTS[statement.kind] as (statement: Statement) => Effect;
  return analyze(statement);
}

/** This same classification selects the writer's conversation interpreter. */
export function isConversation(statement: Statement): statement is Conversation {
  return effect(statement).kind === "conversation";
}

export function directTargets(statements: Statement[]): string[] {
  return statements.flatMap((statement) => {
    const found = effect(statement);
    return found.kind === "items" ? [...found.targets, ...directTargets(found.children)] : [];
  });
}
