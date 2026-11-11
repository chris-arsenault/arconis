import { requestedId, type Statement } from "./syntax";

export type Conversation = Extract<
  Statement,
  { kind: "discussion" | "comment" | "reply" | "resolve" }
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
    targets: statement.identity.kind === "named" ? [requestedId(statement.identity)] : [],
    children: statement.body.kind === "block" ? statement.body.statements : [],
  }),
  edit: (statement) => ({
    kind: "items",
    targets: [statement.ref],
    children: statement.body.kind === "block" ? statement.body.statements : [],
  }),
  arrange: (statement) => ({ kind: "items", targets: [], children: statement.body }),
  link: (statement) => ({
    kind: "items",
    targets: statement.identity.kind === "named" ? [requestedId(statement.identity)] : [],
    // Inline declarations may restate existing items. Plain endpoint references only read them.
    children: [
      ...new Set(
        statement.segments.flatMap(({ from, to }) =>
          [from, to].flatMap((end) => (end.kind === "item" ? [end.item] : []))
        )
      ),
    ],
  }),
  delete: (statement) => ({ kind: "items", targets: statement.refs, children: [] }),
  tidy: (statement) => ({ kind: "items", targets: [statement.ref], children: [] }),
  header: () => ({ kind: "validation", reason: "Checks the file version without naming an item." }),
  title: () => ({ kind: "metadata", reason: "Canvas titles retain last-write-wins semantics." }),
  scale: () => ({
    kind: "metadata",
    reason: "Calibration is shared metadata and never transforms items.",
  }),
  style: () => ({ kind: "metadata", reason: "Named looks retain last-write-wins semantics." }),
  data: () => ({
    kind: "pictures",
    reason: "File picture bytes are returned separately from items.",
  }),
  layer: () => ({ kind: "metadata", reason: "Layer records retain last-write-wins semantics." }),
  merge: () => ({
    kind: "metadata",
    reason: "Merging moves a layer's items as a consequence, as a holder carries its contents.",
  }),
  dropLayer: () => ({
    kind: "metadata",
    reason: "Deleting a layer removes its items as a consequence, as deleting a holder does.",
  }),
  opening: (statement) =>
    statement.ref
      ? { kind: "items", targets: [statement.ref], children: [] }
      : { kind: "metadata", reason: "The room's opening view retains last-write-wins semantics." },
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
