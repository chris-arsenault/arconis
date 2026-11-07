import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { CanvasDocument } from "../document/canvasDocument";
import { addComment } from "../document/comments";
import { RELATION_BRANCH } from "../document/relations";
import type { DomainItem } from "./model";
import { DomainSession, type Outcome } from "./session";

const open: CanvasDocument[] = [];
afterEach(() => open.splice(0).forEach((document) => document.destroy()));

/** Two peers of one room, kept in sync the way the relay would. */
function room() {
  const [agentSide, person] = [new CanvasDocument(), new CanvasDocument()];
  open.push(agentSide, person);
  agentSide.doc.on("update", (update: Uint8Array, origin: unknown) => {
    if (origin !== "remote") Y.applyUpdate(person.doc, update, "remote");
  });
  person.doc.on("update", (update: Uint8Array, origin: unknown) => {
    if (origin !== "remote") Y.applyUpdate(agentSide.doc, update, "remote");
  });
  return { session: new DomainSession(agentSide, "Test agent"), agentSide, person };
}

function done<T>(outcome: Outcome<T>): T {
  if (outcome.status !== "done") throw new Error(`${outcome.status}: ${outcome.reason}`);
  return outcome.result;
}

function item(session: DomainSession, ref: string) {
  return done(session.read({ items: [ref] })).items[0] as DomainItem & { x: number; y: number };
}

describe("placing items", () => {
  it("takes exact, relative and relational places", () => {
    const { session } = room();
    done(
      session.apply([
        { op: "add", type: "node", name: "Users", stencil: "person", at: { x: 100, y: 100 } },
      ])
    );
    done(
      session.apply([
        {
          op: "add",
          type: "node",
          name: "Auth",
          stencil: "service",
          at: { beside: "Users", side: "right", gap: 50 },
        },
      ])
    );
    const users = item(session, "Users");
    const auth = item(session, "Auth");
    expect(auth.x).toBe(users.x + (users as { width: number }).width + 50);
    done(session.apply([{ op: "place", item: "Auth", to: { by: { dx: 0, dy: 30 } } }]));
    expect(item(session, "Auth").y).toBe(auth.y + 30);
    done(session.apply([{ op: "place", item: "Auth", to: { alignWith: "Users", edge: "top" } }]));
    expect(item(session, "Auth").y).toBe(users.y);
  });

  it("puts items inside a region, clear of what it already holds, and says what they overlap", () => {
    const { session } = room();
    const result = done(
      session.apply([
        {
          op: "add",
          type: "region",
          name: "Backend",
          at: { x: 0, y: 0 },
          size: { width: 600, height: 300 },
          as: "backend",
        },
        { op: "add", type: "node", name: "API", inside: "backend" },
        { op: "add", type: "node", name: "Worker", inside: "backend" },
        { op: "add", type: "node", name: "Loose", at: { x: 30, y: 30 } },
      ])
    );
    const [api, worker] = [item(session, "API"), item(session, "Worker")];
    expect(api.inside).toBe(result.created.backend);
    expect(worker.inside).toBe(result.created.backend);
    expect(worker.x).toBeGreaterThanOrEqual(api.x + 160);
    // Dropped on the region without being put inside it, so it overlaps the region too.
    expect(result.done[3]).toContain('overlaps "Backend", "API"');
  });

  it("moves an item with what it holds and the topics branching from it", () => {
    const { session } = room();
    done(
      session.apply([
        {
          op: "add",
          type: "region",
          name: "Box",
          at: { x: 0, y: 0 },
          size: { width: 400, height: 300 },
        },
        { op: "add", type: "node", name: "Held", inside: "Box" },
        { op: "branch", from: "Box", name: "Idea" },
      ])
    );
    const [held, idea] = [item(session, "Held"), item(session, "Idea")];
    done(session.apply([{ op: "place", item: "Box", to: { by: { dx: 100, dy: 50 } } }]));
    expect(item(session, "Held")).toMatchObject({ x: held.x + 100, y: held.y + 50 });
    expect(item(session, "Idea")).toMatchObject({ x: idea.x + 100, y: idea.y + 50 });
  });
});

describe("batches", () => {
  it("applies nothing when any operation fails, and sends nothing to the room", () => {
    const { session, person } = room();
    let updates = 0;
    person.doc.on("update", () => updates++);
    const outcome = session.apply([
      { op: "add", type: "node", name: "Kept?" },
      { op: "connect", from: "Kept?", to: "Missing" },
    ]);
    expect(outcome.status).toBe("failed");
    expect(outcome.status !== "done" && outcome.reason).toMatch(
      /Operation 2: .*"Missing".*Nothing was changed/
    );
    expect(person.list()).toHaveLength(0);
    expect(updates).toBe(0);
  });

  it("links items created earlier in the same batch through their handles", () => {
    const { session, person } = room();
    done(
      session.apply([
        { op: "add", type: "node", name: "A", as: "a" },
        { op: "add", type: "node", name: "A", at: { beside: "a", side: "below" }, as: "b" },
        { op: "connect", from: "a", to: "b", route: "straight", arrow: "open" },
      ])
    );
    const line = person.list().find((object) => object.kind === "connector")!;
    expect(line.style).toMatchObject({ edgeStyle: "none", endArrow: "open" });
  });

  it("asks for an id when a name is ambiguous", () => {
    const { session } = room();
    done(
      session.apply([
        { op: "add", type: "node", name: "Same" },
        { op: "add", type: "node", name: "Same" },
      ])
    );
    const outcome = session.apply([{ op: "relabel", item: "Same", name: "Other" }]);
    expect(outcome.status !== "done" && outcome.reason).toMatch(
      /2 items are named "Same"; use one of their ids/
    );
  });
});

describe("working alongside people", () => {
  it("never refuses an agent working alone", () => {
    const { session } = room();
    done(session.apply([{ op: "add", type: "node", name: "Solo", at: { x: 0, y: 0 } }]));
    for (let step = 1; step <= 3; step++)
      done(session.apply([{ op: "place", item: "Solo", to: { x: step * 10, y: 0 } }]));
    expect(item(session, "Solo").x).toBe(30);
  });

  it("refuses an edit to an item someone else changed since the agent saw it, with its current state", () => {
    const { session, person } = room();
    done(session.apply([{ op: "add", type: "node", name: "Box", at: { x: 0, y: 0 } }]));
    const id = person.list()[0].id;
    person.patch(id, { y: -300 });
    const outcome = session.apply([{ op: "place", item: "Box", to: { by: { dx: -200, dy: 0 } } }]);
    expect(outcome.status).toBe("refused");
    if (outcome.status !== "refused") return;
    expect(outcome.current?.[0]).toMatchObject({ id, y: -300 });
    expect(outcome.changes.items).toEqual([
      expect.objectContaining({ id, change: "changed", what: ["moved"] }),
    ]);
    expect(person.get(id)!.x).toBe(0);
    // Having been shown the change, the agent decides again and the move now composes with it.
    done(session.apply([{ op: "place", item: "Box", to: { by: { dx: -200, dy: 0 } } }]));
    expect(person.get(id)).toMatchObject({ x: -200, y: -300 });
  });

  it("reports others' additions, removals and discussions, and never its own edits", () => {
    const { session, person } = room();
    done(session.apply([{ op: "add", type: "node", name: "Mine" }]));
    const theirs = person.create("rectangle", 500, 0, { label: "Theirs" });
    addComment(person, { objectId: theirs, author: "Alice", text: "Is this right?" });
    const outcome = session.describe(["Alice"]);
    expect(outcome.changes.items).toEqual([
      expect.objectContaining({ change: "added", name: "Theirs" }),
    ]);
    expect(outcome.changes.discussions).toEqual([
      expect.objectContaining({
        change: "started",
        on: theirs,
        comments: [expect.objectContaining({ author: "Alice" })],
      }),
    ]);
    person.remove([theirs]);
    expect(session.describe().changes.items).toEqual([
      expect.objectContaining({ change: "removed", name: "Theirs" }),
    ]);
  });

  it("undoes only its own last change", () => {
    const { session, person } = room();
    done(session.apply([{ op: "add", type: "node", name: "Agent's" }]));
    person.create("rectangle", 500, 0, { label: "Person's" });
    done(session.undoLast());
    expect(person.list().map((object) => object.label)).toEqual(["Person's"]);
  });
});

describe("relationships", () => {
  it("grows topic trees, references and discussions in domain terms", () => {
    const { session, person } = room();
    const { done: messages } = done(
      session.apply([
        { op: "add", type: "node", name: "Root", at: { x: 0, y: 0 } },
        { op: "branch", from: "Root", name: "Child" },
        { op: "add", type: "text", note: true, name: "Aside", at: { x: 0, y: 400 } },
        { op: "reference", from: "Aside", to: "Child" },
        { op: "comment", on: "Child", text: "Needs detail" },
      ])
    );
    expect(
      person.list().filter((object) => object.style.relation === RELATION_BRANCH)
    ).toHaveLength(1);
    const child = done(session.read({ items: ["Child"] }));
    expect(child.items[0]).toMatchObject({
      type: "node",
      links: expect.arrayContaining([
        expect.objectContaining({ type: "branch", direction: "in", other: "Root" }),
        expect.objectContaining({ type: "reference", direction: "in", other: "Aside" }),
      ]),
    });
    expect(child.discussions[0].comments[0]).toMatchObject({
      author: "Test agent",
      text: "Needs detail",
    });
    const discussion = child.discussions[0].id;
    done(
      session.apply([
        { op: "reply", to: discussion, text: "Added" },
        { op: "resolve", discussion },
      ])
    );
    expect(done(session.read({ items: ["Child"] })).discussions[0]).toMatchObject({
      resolved: true,
    });
    expect(messages[1]).toMatch(/^Branched "Child"/);
  });
});

describe("containment and removal", () => {
  it("says what else went when removing an item", () => {
    const { session } = room();
    done(
      session.apply([
        {
          op: "add",
          type: "region",
          name: "Holder",
          at: { x: 0, y: 0 },
          size: { width: 400, height: 300 },
        },
        { op: "add", type: "node", name: "Inner", inside: "Holder" },
        { op: "add", type: "node", name: "Outside", at: { x: 600, y: 0 } },
        { op: "connect", from: "Inner", to: "Outside" },
      ])
    );
    const { done: messages } = done(session.apply([{ op: "remove", items: ["Holder"] }]));
    expect(messages[0]).toMatch(/Removed "Holder", and with them .*node "Inner".*connection/);
    expect(done(session.read()).items.map((i) => i.name)).toEqual(["Outside"]);
  });

  it("keeps a container from going inside what it holds", () => {
    const { session } = room();
    done(
      session.apply([
        {
          op: "add",
          type: "region",
          name: "Outer",
          at: { x: 0, y: 0 },
          size: { width: 600, height: 400 },
        },
        { op: "add", type: "region", name: "Inner", inside: "Outer" },
      ])
    );
    const outcome = session.apply([{ op: "contain", items: ["Outer"], in: "Inner" }]);
    expect(outcome.status !== "done" && outcome.reason).toMatch(/cannot go inside itself/);
  });
});

describe("orientation", () => {
  it("outlines the canvas and who is present", () => {
    const { session } = room();
    done(
      session.apply([
        { op: "title", title: "Plan" },
        { op: "add", type: "node", name: "One", at: { x: 0, y: 0 } },
      ])
    );
    expect(done(session.describe(["Alice"]))).toMatchObject({
      title: "Plan",
      present: ["Alice"],
      counts: { node: 1 },
      outline: [expect.objectContaining({ type: "node", name: "One" })],
      bounds: { x: 0, y: 0, width: 160, height: 90 },
    });
  });
});
