import { defaultSize, type CanvasDocument } from "../document/canvasDocument";
import { BLANK } from "../document/itemDefaults";
import { branchPlacement } from "../document/relations";
import { layoutTree } from "../document/treeLayout";
import { isBox, isFrame, isLink, type Item } from "../document/types";
import { placeInDeck, resolveHolder, slideArea } from "./slideWriting";
import { checkLayers, writeLayer } from "./layerWriting";
import { declareStyle, describeItem, givenSize, matchSizes } from "./describe";
import { routeLineAround } from "../document/routeLine";
import { isShared, placeJunctions, shareTrunks, type PendingJunction } from "./junctions";
import { Draft } from "./draft";
import { LanguageError } from "./lexer";
import { LANGUAGE_VERSION } from "./printer";
import { DEFAULT_GAP, paddingOf } from "../document/layout";
import { combineRules, type Rules } from "./placement";
import type {
  Follow,
  PictureData,
  Scope,
  WriteOptions,
  WriteRequest,
  WriteResult,
} from "./writing";
import {
  arrangeMembers,
  canvasStart,
  fitFrame,
  growHolders,
  reflowDraft,
  spotInside,
} from "./arranging";
import {
  converse,
  describeLink,
  finishBands,
  finishLinks,
  pendingLinkItems,
  type PendingBand,
  type PendingLink,
} from "./connections";
import type {
  ArrangeStatement,
  Attribute,
  EditStatement,
  Endpoint,
  ItemStatement,
  LinkStatement,
  Statement,
  Block,
} from "./syntax";
import { requestedId } from "./syntax";
import { isConversation, type Conversation } from "./effects";
import { attributesFor } from "./attributeRouting";
import { checkedDrawingEndpoint, checkDrawings, reshapePanel } from "./drawing";

export type { PictureData, WriteOptions, WriteResult } from "./writing";

type Handler<K extends Statement["kind"]> = (
  writer: Writer,
  statement: Extract<Statement, { kind: K }>,
  scope: Scope
) => void;

const HANDLERS: { [K in Exclude<Statement, Conversation>["kind"]]: Handler<K> } = {
  header: (_writer, statement) => {
    if (statement.version > LANGUAGE_VERSION)
      throw new LanguageError(
        `This uses language version ${statement.version}; this canvas reads up to ${LANGUAGE_VERSION}.`,
        statement.line
      );
  },
  title: (writer, statement) => (writer.draft.title = statement.title),
  style: (writer, statement) => writer.style(statement.name, statement.attributes, statement.line),
  item: (writer, statement, scope) => writer.newItem(statement, scope),
  edit: (writer, statement, scope) => writer.edit(statement, scope),
  arrange: (writer, statement, scope) => writer.arrangement(statement, scope),
  link: (writer, statement, scope) => writer.link(statement, scope),
  delete: (writer, statement) =>
    statement.refs.forEach((ref) => writer.draft.remove(writer.draft.resolve(ref, statement.line))),
  tidy: (writer, statement) => writer.tidy(statement),
  data: (writer, statement) =>
    writer.pictures.push({ hash: statement.hash, format: statement.format, data: statement.data }),
  layer: (writer, statement) => writer.layer(statement),
  merge: (writer, statement) => writer.layer(statement),
  dropLayer: (writer, statement) => writer.layer(statement),
};

/** Applies statements of the canvas language to a document, all of them or none. */
export function writeStatements(
  document: CanvasDocument,
  statements: Statement[],
  options: WriteRequest
): WriteResult {
  return new Writer(document, { importing: false, now: Date.now(), ...options }).run(statements);
}

class Writer {
  readonly draft: Draft;
  readonly explicitSize = new Set<string>();
  readonly pictures: PictureData[] = [];
  private readonly links: PendingLink[] = [];
  private readonly bands: PendingBand[] = [];
  private readonly junctions: PendingJunction[] = [];
  private start: { x: number; y: number } | null = null;
  private arrangements = 0;

  constructor(
    document: CanvasDocument,
    private readonly options: WriteOptions
  ) {
    this.draft = new Draft(document);
  }

  run(statements: Statement[]): WriteResult {
    const scope: Scope = { kind: "flow", holder: "", previous: "", nested: false };
    statements.forEach((statement) => this.statement(statement, scope));
    const { draft } = this;
    // A file says exactly where everything is; anything else keeps arranged frames arranged.
    if (!this.options.importing) reflowDraft(draft);
    placeJunctions(draft, this.junctions);
    const around = finishLinks(draft, this.links, Boolean(this.options.importing));
    for (const { id, ref, line } of draft.anchors)
      draft.items.get(id)!.onLine = draft.resolve(ref, line);
    for (const { id, ref, line } of draft.highlights) {
      const target = draft.item(ref, line);
      if (!isBox(target) || target.type === "highlight")
        throw new LanguageError("Highlight a workspace object with a box.", line);
      const highlight = draft.items.get(id)!;
      highlight.target = target.id;
      if (highlight.markup !== false) highlight.inside = "";
    }
    finishBands(draft, this.bands);
    // A file says exactly where everything is, even a child left outside its frame.
    if (!this.options.importing) growHolders(draft);
    // Routing around items comes last, once every item it avoids is where it will be.
    const all = [...draft.items.values()];
    for (const id of around) {
      const line = draft.items.get(id)!;
      Object.assign(line, routeLineAround(all, line, (item) => draft.lookOf(item)) ?? {});
    }
    checkDrawings(draft);
    checkLayers(draft);
    return { ...draft.commit(), pictures: this.pictures };
  }

  layer(statement: Extract<Statement, { kind: "layer" | "merge" | "dropLayer" }>) {
    writeLayer(this.draft, statement, Boolean(this.options.importing));
  }

  statement(statement: Statement, scope: Scope) {
    if (isConversation(statement))
      converse(this.draft, statement, {
        author: this.options.author,
        time: this.options.now,
        importing: Boolean(this.options.importing),
      });
    else {
      const handler = HANDLERS[statement.kind] as Handler<typeof statement.kind>;
      handler(this, statement, scope);
    }
  }

  style(name: string, attributes: Attribute[], line: number) {
    declareStyle(this.draft, name, attributes, line);
  }

  /** An existing item named by an item statement, which then changes it instead. */
  private restated(statement: ItemStatement) {
    const id = requestedId(statement.identity);
    if (!id || this.options.importing) return null;
    const existing = this.draft.items.get(id);
    if (existing && existing.type !== statement.type)
      throw new LanguageError(
        `"${id}" is a ${existing.type}, not a ${statement.type}.`,
        statement.line
      );
    return existing ?? null;
  }

  newItem(statement: ItemStatement, scope: Scope, follow?: Follow): string {
    const existing = this.restated(statement);
    if (existing) {
      this.edit({ ...statement, kind: "edit", ref: existing.id }, scope);
      return existing.id;
    }
    const { draft } = this;
    const item = draft.declare(statement, scope.holder);
    this.describe(item, statement.attributes, statement.line);
    if (item.type === "slide") placeInDeck(this.draft, item, statement.attributes);
    this.defaultSize(item);
    this.matchSizes(item, statement.attributes, statement.line);
    // A band over items is sized once they are all placed; one read from a file has its own box.
    const over = attributesFor(statement.attributes, "item", "band")[0];
    if (item.type === "band" && over)
      this.bands.push({ id: item.id, refs: over.refs, line: statement.line });
    // A drawing's points are where it is; it takes no placement.
    else if (item.type !== "drawing" && item.type !== "highlight")
      this.place(item, statement.attributes, scope, statement, true, follow);
    else this.pathHolder(item, statement.attributes, statement.line);
    return item.id;
  }

  private pathHolder(item: Item, attributes: Attribute[], line: number) {
    const holder = attributesFor(attributes, "item", "holder")[0];
    if (holder) item.inside = resolveHolder(this.draft, holder.ref, line);
  }

  private defaultSize(item: Item) {
    const [width, height] = defaultSize(item.type, item.stencil);
    const scale = this.draft.lookOf(item).scale ?? 1;
    const given = givenSize(item, this.explicitSize);
    if (!given.width) item.width = width * scale;
    if (!given.height) item.height = height * scale;
  }

  private describe(item: Item, attributes: Attribute[], line: number) {
    describeItem(item, attributes, { draft: this.draft, sized: this.explicitSize, line });
  }
  private matchSizes(item: Item, attributes: Attribute[], line: number) {
    matchSizes(item, attributes, { draft: this.draft, sized: this.explicitSize, line });
  }

  // Placement

  private rules(
    attributes: Attribute[],
    line: number,
    holder = false,
    context: "item" | "arrangement" = "item"
  ): Rules {
    return combineRules(attributes, (ref) => this.draft.extent(ref, line), holder, context);
  }

  /** Where an item with no place of its own goes: after the previous item, or into free space. */
  private defaultSpot(item: Item, scope: Scope, follow?: Follow) {
    const { draft } = this;
    const own = draft.extentOf(item);
    if (follow) return follow(own);
    const inset = own.box.x - own.space.x;
    const previous = scope.previous ? draft.spaceOf(scope.previous) : null;
    if (previous) return { x: previous.x + previous.width + DEFAULT_GAP + inset, y: previous.y };
    const holder = draft.items.get(scope.kind === "slide" ? scope.area : item.inside);
    if (holder) return spotInside(draft, holder, item, inset);
    this.start ??= canvasStart(draft);
    return { x: this.start.x + inset, y: this.start.y };
  }

  /** Puts an item where rules that do not depend on its own size say, or at a default spot. */
  private placeFirst(item: Item, rules: Rules, scope: Scope, fresh: boolean, follow?: Follow) {
    const { draft } = this;
    const spot = fresh && !(rules.x || rules.y) ? this.defaultSpot(item, scope, follow) : item;
    const own = draft.extentOf(item);
    const x = rules.x && !rules.x.sized ? rules.x.value(own) : spot.x;
    const y = rules.y && !rules.y.sized ? rules.y.value(own) : spot.y;
    draft.moveTo(item, x, y);
  }

  /**
   * Places an item, lays out what its block holds, then settles rules that depend on the item's own
   * size once that is known. A `fresh` item with no place of its own takes a default spot.
   */
  private place(
    item: Item,
    attributes: Attribute[],
    scope: Scope,
    { body, line }: { body: Block; line: number },
    fresh: boolean,
    follow?: Follow
  ) {
    const { draft } = this;
    const inside = attributesFor(attributes, "item", "holder")[0];
    if (inside) item.inside = resolveHolder(draft, inside.ref, line);
    const rules = this.rules(attributes, line, body.kind === "block");
    if (scope.kind === "arrangement") scope.members.push(item.id);
    else this.placeFirst(item, rules, scope, fresh, follow);
    const by = attributesFor(attributes, "item", "offset").find(
      (attribute) => attribute.kind === "by"
    );
    if (by && scope.kind !== "arrangement") draft.moveTo(item, item.x + by.dx, item.y + by.dy);
    const carried = body.kind === "block" ? this.body(item, attributes, body.statements) : [];
    const [x, y] = [item.x, item.y];
    if (scope.kind !== "arrangement") this.settle(item, rules, attributes);
    draft.shift(carried, item.x - x, item.y - y);
    if (scope.kind === "slide") scope.carried.push(item.id);
    scope.previous = item.id;
  }

  /** Applies the rules that needed the item's final size, then any nudge. */
  private settle(item: Item, rules: Rules, attributes: Attribute[]) {
    const own = this.draft.extentOf(item);
    const x = rules.x?.sized ? rules.x.value(own) : item.x;
    const y = rules.y?.sized ? rules.y.value(own) : item.y;
    this.draft.moveTo(item, x, y);
    for (const attribute of attributesFor(attributes, "item", "offset")) {
      switch (attribute.kind) {
        case "by":
          break; // The first `by` was applied before the item's body was laid out.
        case "nudge":
          this.draft.moveTo(item, item.x + attribute.dx, item.y + attribute.dy);
          break;
        default: {
          const unhandled: never = attribute;
          throw new Error("Unhandled offset attribute", { cause: unhandled });
        }
      }
    }
  }

  /** Lays out what an item's block declares; returns what a slide's block placed. */
  private body(item: Item, attributes: Attribute[], body: Statement[]): string[] {
    const { draft } = this;
    if (item.type === "slide") {
      const area = slideArea(item);
      body.forEach((statement) => this.statement(statement, area));
      return area.carried;
    }
    const arrange = attributesFor(attributes, "item", "arrange")[0];
    const inner: Scope =
      arrange && !this.options.importing
        ? { kind: "arrangement", holder: item.id, previous: "", nested: true, members: [] }
        : { kind: "flow", holder: item.id, previous: "", nested: true };
    // A file says where each member is; it is not arranged again on the way in.
    body.forEach((statement) => this.statement(statement, inner));
    if (arrange && inner.kind === "arrangement") {
      const padding = paddingOf(item, draft.lookOf(item));
      const laid = arrangeMembers(draft, inner.members, arrange);
      draft.shift(inner.members, item.x + padding.left - laid.x, item.y + padding.top - laid.y);
    }
    // A file says exactly where everything is, even a child left outside its frame.
    if (isFrame(item) && !this.options.importing)
      fitFrame(draft, item, draft.createdHere.has(item.id), givenSize(item, this.explicitSize));
    return [];
  }

  arrangement(statement: ArrangeStatement, scope: Scope) {
    const { draft } = this;
    const members: string[] = [];
    const inner: Scope = {
      kind: "arrangement",
      holder: scope.holder,
      previous: "",
      nested: scope.nested,
      members,
    };
    statement.body.forEach((child) => this.statement(child, inner));
    const arrange = attributesFor(statement.attributes, "arrangement", "arrange")[0];
    const laid = arrangeMembers(draft, members, arrange);
    const named = requestedId(statement.identity);
    const id = named || `arrangement ${++this.arrangements}`;
    if (named && (draft.items.has(id) || draft.virtual.has(id)))
      throw new LanguageError(`The id "${id}" is already taken.`, statement.line);
    draft.virtual.set(id, laid);
    const target = this.arrangementSpot(id, statement, scope);
    draft.shift([...members, id], target.x - laid.x, target.y - laid.y);
    if (scope.kind === "arrangement") scope.members.push(id);
    scope.previous = id;
  }

  /** Where an arrangement's corner goes, once its members' extent is known. */
  private arrangementSpot(id: string, statement: ArrangeStatement, scope: Scope) {
    const laid = this.draft.virtual.get(id)!;
    const rules = this.rules(statement.attributes, statement.line, false, "arrangement");
    const own = { box: laid, space: laid };
    let spot = { x: laid.x, y: laid.y };
    if (scope.kind !== "arrangement" && (!rules.x || !rules.y)) {
      const probe: Item = { ...BLANK, id, type: "group", inside: scope.holder, ...laid };
      spot = this.defaultSpot(probe, scope);
    }
    return { x: rules.x ? rules.x.value(own) : spot.x, y: rules.y ? rules.y.value(own) : spot.y };
  }

  edit(statement: EditStatement, scope: Scope) {
    if (this.options.importing)
      throw new LanguageError(
        "A file declares its items; it cannot edit existing ones.",
        statement.line
      );
    const { draft } = this;
    const item = draft.item(statement.ref, statement.line);
    const before = { ...item };
    if (statement.name.kind === "set") item.name = statement.name.value;
    if (statement.subtitle.kind === "set") item.subtitle = statement.subtitle.value;
    if (isLink(item)) {
      describeLink(draft, item, statement.attributes, statement.line);
      return;
    }
    this.describe(item, statement.attributes, statement.line);
    this.matchSizes(item, statement.attributes, statement.line);
    reshapePanel(draft, before, item);
    const movesIn = scope.nested && item.inside !== scope.holder;
    if (movesIn) item.inside = scope.holder;
    if (movesIn || attributesFor(statement.attributes, "item", "holder").length)
      draft.moved.add(item.id);
    this.placeEdited(item, statement, scope, movesIn);
  }

  private placeEdited(item: Item, statement: EditStatement, scope: Scope, movesIn: boolean) {
    const placed = attributesFor(statement.attributes, "item", ["rules", "offset"]).length > 0;
    this.place(item, statement.attributes, scope, statement, movesIn && !placed && isBox(item));
  }

  tidy(statement: Extract<Statement, { kind: "tidy" }>) {
    const { draft } = this;
    const root = draft.item(statement.ref, statement.line);
    const moves = layoutTree(this.itemsWithPendingLinks(), root.id, statement);
    moves.forEach(({ x, y }, id) => draft.moveTo(draft.items.get(id)!, x, y));
  }

  /** The draft's items with this write's unsettled lines, so a tree being built is seen whole. */
  private itemsWithPendingLinks(): Item[] {
    return [...this.draft.items.values(), ...pendingLinkItems(this.links)];
  }

  /** Every end of every segment, with items declared at an end created where they appear. */
  link(statement: LinkStatement, scope: Scope) {
    const ends = new Map<Endpoint, string>();
    const idOf = (endpoint: Endpoint, from?: string, branch = false) => {
      if (!ends.has(endpoint))
        ends.set(endpoint, this.endpoint(endpoint, statement.line, scope, from, branch));
      return ends.get(endpoint)!;
    };
    const links: PendingLink[] = statement.segments.map((segment) => {
      const from = idOf(segment.from);
      const to = idOf(segment.to, from, segment.type === "branch");
      return { from, to, segment, statement };
    });
    this.links.push(
      ...(isShared(statement) ? shareTrunks(this.draft, links, this.junctions) : links)
    );
  }

  private endpoint(endpoint: Endpoint, line: number, scope: Scope, from?: string, branch = false) {
    if (endpoint.kind === "reference")
      return checkedDrawingEndpoint(this.draft, this.draft.resolve(endpoint.ref, line), line);
    const follow = from ? this.follower(from, branch) : undefined;
    return checkedDrawingEndpoint(this.draft, this.newItem(endpoint.item, scope, follow), line);
  }

  /** An item declared at a line's far end goes to the right of its start, or as a topic's branch. */
  private follower(from: string, branch: boolean): Follow | undefined {
    const { draft } = this;
    const source = draft.items.get(from);
    if (!source || !isBox(source)) return undefined;
    return (own) => {
      if (branch) return branchPlacement(this.itemsWithPendingLinks(), source, own.box);
      const start = draft.extentOf(source);
      return {
        x: start.space.x + start.space.width + DEFAULT_GAP * 1.5 + (own.box.x - own.space.x),
        y: start.box.y + (start.box.height - own.box.height) / 2,
      };
    };
  }
}
