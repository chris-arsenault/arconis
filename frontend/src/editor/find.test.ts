import { describe, expect, it } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { addComment, listComments } from "../document/comments";
import { LOCAL } from "../document/types";
import { parse } from "../language/parser";
import { writeStatements } from "../language/writer";
import { describeMatch, findMatches } from "./find";
import { ViewHistory } from "./viewHistory";
import { EMPTY_FILTER, toggled } from "./filter";

function canvas(text: string) {
  const document = new CanvasDocument();
  document.doc.transact(() => writeStatements(document, parse(text), { author: "" }), LOCAL);
  return document;
}

describe("find on canvas", () => {
  it("finds exact tags and markers and intersects words with highlighted metadata", () => {
    const document = canvas(`
      note a "Orders" tags api marker star at 0,0
      note b "Orders cache" tags apiary marker square at 300,0
      note c "Billing" tags api marker square at 600,0
    `);
    const items = document.list();
    expect(findMatches(items, [], "#api").map(({ item }) => item.id)).toEqual(["a", "c"]);
    expect(findMatches(items, [], ":star").map(({ item }) => item.id)).toEqual(["a"]);
    expect(findMatches(items, [], "Star")[0].where).toBe("marker");
    expect(findMatches(items, [], "square").map(({ item }) => item.id)).toEqual(["b", "c"]);
    const filter = toggled(EMPTY_FILTER, "tags", "api");
    expect(findMatches(items, [], "Orders", filter).map(({ item }) => item.id)).toEqual(["a"]);
    expect(findMatches(items, [], "", filter).map(describeMatch)).toEqual(["Orders", "Billing"]);
  });

  it("matches names, subtitles, tags, comments and ids, in reading order", () => {
    const document = canvas(`
      node low "Orders API" at 0,400
      node high "Billing" / "orders ledger" at 300,0
      node tagged "Other" tags orders at 0,0
      node far "Nothing" at 600,0
      node ghost "Orders cache" at 900,0
    `);
    addComment(document, { on: "far", author: "A", text: "ask about orders" });
    const matches = findMatches(document.list(), listComments(document), "ORDERS");
    expect(matches.map((match) => match.item.id)).toEqual([
      "tagged",
      "high",
      "far",
      "ghost",
      "low",
    ]);
    expect(matches.map((match) => match.where)).toEqual([
      "tag",
      "subtitle",
      "comment",
      "name",
      "name",
    ]);
    expect(describeMatch(matches[1])).toBe("Billing (subtitle)");
    expect(describeMatch(matches[3])).toBe("Orders cache");
    expect(findMatches(document.list(), [], "far")[0].where).toBe("id");
    expect(findMatches(document.list(), [], "  ")).toEqual([]);
  });
});

describe("view history", () => {
  it("returns to the view before each jump and forward again, forgetting the future on a new jump", () => {
    const view = { scale: 1, translate: { x: 0, y: 0 } };
    const graph = { view } as never;
    const history = new ViewHistory(graph, { clientWidth: 1000, clientHeight: 800 });
    expect(history.canGoBack()).toBe(false);
    history.record();
    view.scale = 2;
    view.translate = { x: -100, y: -50 };
    expect(history.goBack()).toMatchObject({ zoom: 1, center: { x: 500, y: 400 } });
    expect(history.canGoForward()).toBe(true);
    expect(history.goForward()).toMatchObject({ zoom: 2, center: { x: 350, y: 250 } });
    history.travel(() => history.record());
    expect(history.canGoBack()).toBe(true);
    history.record();
    expect(history.canGoForward()).toBe(false);
  });
});
