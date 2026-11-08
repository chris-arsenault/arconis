import { BLANK, defaultSize, type CanvasDocument } from "../document/canvasDocument";
import { branchPlacement, tidyBranch } from "../document/relations";
import { isBox, isFrame, isLink, type Item } from "../document/types";
import { DEFAULT_DECK, nextSlideNumber } from "../document/slides";
import { declareStyle, describeItem, matchSizes } from "./describe";
import { routeLineAround } from "../document/routeLine";
import { isShared, placeJunctions, shareTrunks, type PendingJunction } from "./junctions";
import { Draft } from "./draft";
import { LanguageError } from "./lexer";
import { LANGUAGE_VERSION } from "./printer";
import { DEFAULT_GAP, paddingOf } from "../document/layout";
import { combineRules, type Rules } from "./placement";
import type { Follow, PictureData, Scope, WriteOptions, WriteResult } from "./writing";
import { arrangeMembers, canvasStart, fitFrame, reflowDraft, spotInside } from "./arranging";
import {
  converse,
  describeLink,
  finishBands,
  finishLinks,
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
} from "./syntax";
import { isConversation, type Conversation } from "./effects";
import { attributesFor } from "./attributeRouting";

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
  tidy: (writer, statement) => writer.tidy(statement.ref, statement.line),
  data: (writer, statement) =>
    writer.pictures.push({ hash: statement.hash, format: statement.format, data: statement.data }),
};

/** Applies statements of the canvas language to a document, all of them or none. */
export function writeStatements(
  document: CanvasDocument,
  statements: Statement[],
  options: WriteOptions
): WriteResult {
  return new Writer(document, options).run(statements);
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
    const scope: Scope = { holder: "", previous: "", nested: false };
    statements.forEach((statement) => this.statement(statement, scope));
    const { draft } = this;
    // A file says exactly where everything is; anything else keeps arranged frames arranged.
    if (!this.options.importing) reflowDraft(draft);
    placeJunctions(draft, this.junctions);
    const around = finishLinks(draft, this.links, Boolean(this.options.importing));
    for (const { id, ref, line } of draft.anchors)
      draft.items.get(id)!.onLine = draft.resolve(ref, line);
    finishBands(draft, this.bands);
    // A file says exactly where everything is, even a child left outside its frame.
    if (!this.options.importing) this.growHolders();
    // Routing around items comes last, once every item it avoids is where it will be.
    const all = [...draft.items.values()];
    for (const id of around) {
      const line = draft.items.get(id)!;
      Object.assign(line, routeLineAround(all, line, (item) => draft.lookOf(item)) ?? {});
    }
    return { ...draft.commit(), pictures: this.pictures };
  }

  statement(statement: Statement, scope: Scope) {
    if (isConversation(statement))
      converse(this.draft, statement, {
        author: this.options.author,
        time: this.options.now ?? Date.now(),
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
    if (!statement.id || this.options.importing) return null;
    const existing = this.draft.items.get(statement.id);
    if (existing && existing.type !== statement.type)
      throw new LanguageError(
        `"${statement.id}" is a ${existing.type}, not a ${statement.type}.`,
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
    const item: Item = {
      ...BLANK,
      id: draft.idFor(statement.id, statement.line),
      type: statement.type,
      inside: scope.holder,
      order: draft.nextOrder(),
      name: statement.name ?? "",
      subtitle: statement.subtitle ?? "",
    };
    draft.add(item, statement.id);
    this.describe(item, statement.attributes, statement.line);
    if (item.type === "slide") this.placeInDeck(item);
    this.defaultSize(item);
    this.matchSizes(item, statement.attributes, statement.line);
    // A band over items is sized once they are all placed; one read from a file has its own box.
    const over = attributesFor(statement.attributes, "item", "band")[0];
    if (item.type === "band" && over)
      this.bands.push({ id: item.id, refs: over.refs, line: statement.line });
    // A drawing's points are where it is; it takes no placement.
    else if (item.type !== "drawing")
      this.place(item, statement.attributes, scope, statement, true, follow);
    return item.id;
  }

  private given(item: Item) {
    return {
      width: this.explicitSize.has(`${item.id} width`),
      height: this.explicitSize.has(`${item.id} height`),
    };
  }

  /** A new slide joins the default deck unless told otherwise, and takes the next number. */
  private placeInDeck(item: Item) {
    item.deck ||= DEFAULT_DECK;
    item.slide ??= nextSlideNumber(
      [...this.draft.items.values()].filter((other) => other.id !== item.id),
      item.deck
    );
  }

  private defaultSize(item: Item) {
    const [width, height] = defaultSize(item.type, item.stencil);
    const scale = this.draft.lookOf(item).scale ?? 1;
    const given = this.given(item);
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
    const holder = draft.items.get(item.inside);
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
    { body, line }: { body?: Statement[]; line: number },
    fresh: boolean,
    follow?: Follow
  ) {
    const { draft } = this;
    const inside = attributesFor(attributes, "item", "holder")[0];
    if (inside) item.inside = draft.resolve(inside.ref, line);
    const rules = this.rules(attributes, line, body !== undefined);
    if (scope.members) scope.members.push(item.id);
    else this.placeFirst(item, rules, scope, fresh, follow);
    const by = attributesFor(attributes, "item", "offset").find(
      (attribute) => attribute.kind === "by"
    );
    if (by && !scope.members) draft.moveTo(item, item.x + by.dx, item.y + by.dy);
    if (body) this.body(item, attributes, body);
    if (!scope.members) this.settle(item, rules, attributes);
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
          throw new Error(`Unhandled offset attribute: ${unhandled}`);
        }
      }
    }
  }

  private body(item: Item, attributes: Attribute[], body: Statement[]) {
    const { draft } = this;
    const arrange = attributesFor(attributes, "item", "arrange")[0];
    const inner: Scope = { holder: item.id, previous: "", nested: true };
    // A file says where each member is; it is not arranged again on the way in.
    if (arrange && !this.options.importing) inner.members = [];
    body.forEach((statement) => this.statement(statement, inner));
    if (arrange && inner.members) {
      const padding = paddingOf(item, draft.lookOf(item));
      const laid = arrangeMembers(draft, inner.members, arrange);
      draft.shift(inner.members, item.x + padding.left - laid.x, item.y + padding.top - laid.y);
    }
    // A file says exactly where everything is, even a child left outside its frame.
    if (isFrame(item) && !this.options.importing)
      fitFrame(draft, item, draft.createdHere.has(item.id), this.given(item));
  }

  arrangement(statement: ArrangeStatement, scope: Scope) {
    const { draft } = this;
    const members: string[] = [];
    const inner: Scope = { holder: scope.holder, previous: "", nested: scope.nested, members };
    statement.body.forEach((child) => this.statement(child, inner));
    const arrange = attributesFor(statement.attributes, "arrangement", "arrange")[0]!;
    const laid = arrangeMembers(draft, members, arrange);
    const id = statement.id ?? `arrangement ${++this.arrangements}`;
    if (statement.id && (draft.items.has(id) || draft.virtual.has(id)))
      throw new LanguageError(`The id "${id}" is already taken.`, statement.line);
    draft.virtual.set(id, laid);
    const target = this.arrangementSpot(id, statement, scope);
    draft.shift([...members, id], target.x - laid.x, target.y - laid.y);
    if (scope.members) scope.members.push(id);
    scope.previous = id;
  }

  /** Where an arrangement's corner goes, once its members' extent is known. */
  private arrangementSpot(id: string, statement: ArrangeStatement, scope: Scope) {
    const laid = this.draft.virtual.get(id)!;
    const rules = this.rules(statement.attributes, statement.line, false, "arrangement");
    const own = { box: laid, space: laid };
    let spot = { x: laid.x, y: laid.y };
    if (!scope.members && (!rules.x || !rules.y)) {
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
    if (statement.name !== undefined) item.name = statement.name;
    if (statement.subtitle !== undefined) item.subtitle = statement.subtitle;
    if (isLink(item)) {
      describeLink(draft, item, statement.attributes, statement.line);
      return;
    }
    this.describe(item, statement.attributes, statement.line);
    this.matchSizes(item, statement.attributes, statement.line);
    const movesIn = scope.nested && item.inside !== scope.holder;
    if (movesIn) item.inside = scope.holder;
    if (movesIn || attributesFor(statement.attributes, "item", "holder").length)
      draft.moved.add(item.id);
    const placed = attributesFor(statement.attributes, "item", ["rules", "offset"]).length > 0;
    this.place(item, statement.attributes, scope, statement, movesIn && !placed);
  }

  tidy(ref: string, line: number) {
    const { draft } = this;
    const root = draft.item(ref, line);
    tidyBranch([...draft.items.values()], root.id).forEach(({ x, y }, id) =>
      draft.moveTo(draft.items.get(id)!, x, y)
    );
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
    if (endpoint.ref) return this.draft.resolve(endpoint.ref, line);
    const follow = from ? this.follower(from, branch) : undefined;
    return this.newItem(endpoint.item!, scope, follow);
  }

  /** An item declared at a line's far end goes to the right of its start, or as a topic's branch. */
  private follower(from: string, branch: boolean): Follow | undefined {
    const { draft } = this;
    const source = draft.items.get(from);
    if (!source || !isBox(source)) return undefined;
    return (own) => {
      if (branch) return branchPlacement([...draft.items.values()], source, own.box);
      const start = draft.extentOf(source);
      return {
        x: start.space.x + start.space.width + DEFAULT_GAP * 1.5 + (own.box.x - own.space.x),
        y: start.box.y + (start.box.height - own.box.height) / 2,
      };
    };
  }

  /** Frames grow to hold whatever was added or moved into them during the write, innermost first. */
  private growHolders() {
    const { draft } = this;
    const holders = new Set<string>();
    for (const id of [...draft.created, ...draft.moved]) {
      const item = draft.items.get(id);
      if (item) draft.ancestors(item).forEach((holder) => holders.add(holder));
    }
    const frames = [...holders].map((id) => draft.items.get(id)!).filter(isFrame);
    frames.sort((a, b) => draft.ancestors(b).length - draft.ancestors(a).length);
    frames.forEach((frame) => fitFrame(draft, frame, false, { width: true, height: true }));
  }
}
