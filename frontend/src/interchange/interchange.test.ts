import { expect, it } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { isBox, isLink, type Item } from "../document/types";
import { importDocument } from "../files/canvasFile";
import { fileFormat, foreignFormat, foreignStatements, type ForeignFormat } from "./index";
import { looksLikeD2 } from "./d2";
import { parseXml, plainText } from "./xml";

/** Writes a foreign text onto a fresh canvas, as a paste does, and returns its items. */
async function imported(text: string, format: ForeignFormat) {
  const document = new CanvasDocument();
  const statements = await foreignStatements(text, format);
  importDocument(document, `arconis 1\n${statements}`);
  const items = document.list();
  document.destroy();
  return items;
}

const named = (items: Item[], name: string) => items.find((item) => item.name === name)!;
const lines = (items: Item[]) => items.filter(isLink);
const joins = (items: Item[], from: string, to: string) =>
  lines(items).find(
    (line) => line.from === named(items, from).id && line.to === named(items, to).id
  );
const within = (inner: Item, outer: Item) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;
const apart = (items: Item[]) => {
  const boxes = items.filter((item) => isBox(item) && item.type === "node");
  return boxes.every((a, index) =>
    boxes
      .slice(index + 1)
      .every(
        (b) =>
          a.x + a.width <= b.x ||
          b.x + b.width <= a.x ||
          a.y + a.height <= b.y ||
          b.y + b.height <= a.y
      )
  );
};

it("reads a Mermaid flowchart's shapes, labels, chains, fan-outs and subgraphs", async () => {
  const items = await imported(
    `%% a comment
flowchart LR
  A[Start] --> B{Is it ready?}
  B -->|Yes| C[(Orders)]
  B -- No --> D((Wait))
  D -.-> A
  subgraph backend [Back end]
    C --> E([Queue]) & F
  end
  style A fill:#f9f,stroke:#333
  classDef hot fill:#ff0000
  class F hot`,
    "mermaid"
  );
  expect(named(items, "Is it ready?").stencil).toBe("decision");
  expect(named(items, "Orders").stencil).toBe("database");
  expect(named(items, "Wait").stencil).toBe("ellipse");
  expect(joins(items, "Is it ready?", "Orders")?.name).toBe("Yes");
  expect(joins(items, "Is it ready?", "Wait")?.name).toBe("No");
  expect(joins(items, "Wait", "Start")?.look.dashed).toBe(true);
  expect(joins(items, "Orders", "Queue")).toBeTruthy();
  expect(joins(items, "Orders", "F")).toBeTruthy();
  const frame = named(items, "Back end");
  expect(frame.type).toBe("frame");
  expect(named(items, "Orders").inside).toBe(frame.id);
  // The frame is drawn around what it holds, and not around what it does not.
  for (const member of ["Orders", "Queue", "F"])
    expect(within(named(items, member), frame)).toBe(true);
  expect(within(named(items, "Start"), frame)).toBe(false);
  expect(named(items, "Start").inside).toBe("");
  expect(named(items, "Start").look.fill).toBe("#ff99ff");
  expect(named(items, "F").look.fill).toBe("#ff0000");
  expect(apart(items)).toBe(true);
  // Ranked left to right along its lines.
  expect(named(items, "Start").x).toBeLessThan(named(items, "Is it ready?").x);
});

it("ranks a top-down Mermaid graph downward and keeps arrowless and two-way lines", async () => {
  const items = await imported("graph TD; a --- b; b <--> c; c ==> d", "mermaid");
  expect(named(items, "a").y).toBeLessThan(named(items, "b").y);
  expect(joins(items, "a", "b")?.look.arrow).toBe("none");
  expect(joins(items, "b", "c")?.look.startArrow).toBe("arrow");
  expect(joins(items, "c", "d")?.look.arrow).not.toBe("none");
});

it("reads Mermaid state, class and entity diagrams as boxes and lines", async () => {
  const states = await imported(
    `stateDiagram-v2
  [*] --> Idle
  Idle --> Running : start
  state Running {
    Warm --> Hot
  }
  Running --> [*]`,
    "mermaid"
  );
  expect(joins(states, "Start", "Idle")).toBeTruthy();
  expect(joins(states, "Idle", "Running")?.name).toBe("start");
  expect(named(states, "Running").type).toBe("frame");
  expect(named(states, "Warm").inside).toBe(named(states, "Running").id);

  const classes = await imported(
    `classDiagram
  class Animal {
    +String name
    +eat()
  }
  Animal <|-- Dog
  Dog : +bark()`,
    "mermaid"
  );
  const animal = classes.find((item) => item.name.startsWith("**Animal**"))!;
  const dog = classes.find((item) => item.name.startsWith("**Dog**"))!;
  expect(animal.name).toContain("+eat()");
  expect(dog.name).toContain("+bark()");
  // Inheritance points at the parent.
  expect(lines(classes)[0]).toMatchObject({ from: dog.id, to: animal.id });

  const entities = await imported(
    `erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER {
    int id PK
  }`,
    "mermaid"
  );
  const order = entities.find((item) => item.name.startsWith("**ORDER**"))!;
  expect(order.name).toContain("int id PK");
  expect(lines(entities)[0].name).toBe("places");
});

it("reads a Mermaid mind map as a topic tree", async () => {
  const items = await imported(
    `mindmap
  root((Launch))
    Marketing
      Blog post
    Engineering`,
    "mermaid"
  );
  const branches = items.filter((item) => item.type === "branch");
  expect(branches).toHaveLength(3);
  expect(branches.find((branch) => branch.to === named(items, "Blog post").id)?.from).toBe(
    named(items, "Marketing").id
  );
  expect(named(items, "Launch").x).toBeLessThan(named(items, "Marketing").x);
});

it("refuses Mermaid kinds that have no boxes and lines", async () => {
  await expect(foreignStatements("gantt\n  title Plan", "mermaid")).rejects.toThrow(/flowcharts/);
  expect(foreignFormat("gantt\n  title Plan")).toBeNull();
});

it("reads D2 keys, containers, shapes, styles and connection chains", async () => {
  const items = await imported(
    `direction: right
# a comment
users: Users { shape: person }
network: Network {
  api: API
  db: Orders {
    shape: cylinder
    style.fill: "#ffeeaa"
  }
  api -> db: reads
}
users -> network.api -> cache: asks
cache <-> network.db
notes: |md
  # Read me
|`,
    "d2"
  );
  expect(named(items, "Users").stencil).toBe("person");
  expect(named(items, "Network").type).toBe("frame");
  expect(named(items, "API").inside).toBe(named(items, "Network").id);
  expect(named(items, "Orders")).toMatchObject({ stencil: "database", look: { fill: "#ffeeaa" } });
  expect(joins(items, "API", "Orders")?.name).toBe("reads");
  expect(joins(items, "Users", "API")?.name).toBe("asks");
  expect(joins(items, "API", "cache")).toBeTruthy();
  expect(joins(items, "cache", "Orders")?.look.startArrow).toBe("arrow");
  expect(named(items, "# Read me").type).toBe("text");
  expect(named(items, "Users").x).toBeLessThan(named(items, "cache").x);
});

it("offers D2 only for text made of keys and arrowed connections", () => {
  expect(looksLikeD2("a -> b: calls\nb -> c")).toBe(true);
  expect(looksLikeD2("Buy milk\nCall the bank -- before noon")).toBe(false);
  expect(looksLikeD2("The plan: ship it.\nThen we rest -> maybe, if all goes well today.")).toBe(
    false
  );
});

it("reads PlantUML elements, aliases, containers, members and relations", async () => {
  const items = await imported(
    `@startuml
' a comment
left to right direction
actor "End user" as user
package "Back end" {
  [Web app] as web
  database Orders
}
class Account {
  +id: int
  +close()
}
user --> web : uses
web ..> Orders
Account <|-- Savings
note right of web : skipped
@enduml`,
    "plantuml"
  );
  expect(named(items, "End user").stencil).toBe("person");
  expect(named(items, "Back end").type).toBe("frame");
  expect(named(items, "Web app")).toMatchObject({
    stencil: "service",
    inside: named(items, "Back end").id,
  });
  expect(named(items, "Orders").stencil).toBe("database");
  expect(joins(items, "End user", "Web app")?.name).toBe("uses");
  expect(joins(items, "Web app", "Orders")?.look.dashed).toBe(true);
  const account = items.find((item) => item.name.startsWith("**Account**"))!;
  expect(account.name).toContain("+close()");
  expect(lines(items).some((line) => line.to === account.id)).toBe(true);
  expect(items.some((item) => item.name.includes("skipped"))).toBe(false);
});

it("numbers a PlantUML sequence's messages and reads its mind map as a tree", async () => {
  const sequence = await imported(
    `@startuml
participant Browser
participant Server
Browser -> Server: GET /
Server --> Browser: 200
@enduml`,
    "plantuml"
  );
  expect(joins(sequence, "Browser", "Server")?.name).toBe("1. GET /");
  expect(joins(sequence, "Server", "Browser")?.name).toBe("2. 200");

  const tree = await imported(
    `@startmindmap
* Launch
** Marketing
*** Blog post
** Engineering
@endmindmap`,
    "plantuml"
  );
  expect(tree.filter((item) => item.type === "branch")).toHaveLength(3);
});

const DRAWIO = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net">
  <diagram name="Page-1" id="p1">
    <mxGraphModel>
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <mxCell id="pool" value="Team &amp;amp; tools" style="swimlane;fillColor=#dae8fc;" vertex="1" parent="1">
          <mxGeometry x="40" y="40" width="400" height="300" as="geometry"/>
        </mxCell>
        <mxCell id="a" value="&lt;b&gt;Plan&lt;/b&gt;&lt;br&gt;first" style="rounded=1;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="pool">
          <mxGeometry x="20" y="50" width="120" height="60" as="geometry"/>
        </mxCell>
        <mxCell id="b" value="Decide" style="rhombus;whiteSpace=wrap;" vertex="1" parent="1">
          <mxGeometry x="600" y="80" width="100" height="100" as="geometry"/>
        </mxCell>
        <object label="Store" id="c">
          <mxCell style="shape=cylinder3;" vertex="1" parent="1">
            <mxGeometry x="600" y="300" width="80" height="100" as="geometry"/>
          </mxCell>
        </object>
        <mxCell id="e1" style="edgeStyle=orthogonalEdgeStyle;dashed=1;" edge="1" parent="1" source="a" target="b">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="e1l" value="go" style="edgeLabel;" vertex="1" connectable="0" parent="e1">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="e2" value="save" style="endArrow=none;" edge="1" parent="1" source="b" target="c">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="e3" style="endArrow=classic;" edge="1" parent="1">
          <mxGeometry relative="1" as="geometry">
            <mxPoint x="100" y="500" as="sourcePoint"/>
            <mxPoint x="300" y="560" as="targetPoint"/>
          </mxGeometry>
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

it("reads a draw.io file with its positions, containers, labels and loose lines", async () => {
  const items = await imported(DRAWIO, "drawio");
  const pool = named(items, "Team & tools");
  expect(pool).toMatchObject({ type: "frame", x: 40, y: 40, width: 400, height: 300 });
  expect(pool.look.fill).toBe("#dae8fc");
  // A child's position is relative to its container in the file and absolute on the canvas.
  expect(named(items, "Plan\nfirst")).toMatchObject({
    x: 60,
    y: 90,
    width: 120,
    height: 60,
    inside: pool.id,
    look: { fill: "#fff2cc", line: "#d6b656" },
  });
  expect(named(items, "Decide")).toMatchObject({ stencil: "decision", x: 600, y: 80 });
  expect(named(items, "Store").stencil).toBe("database");
  expect(joins(items, "Plan\nfirst", "Decide")).toMatchObject({
    name: "go",
    look: { dashed: true },
  });
  expect(joins(items, "Decide", "Store")).toMatchObject({ name: "save", look: { arrow: "none" } });
  const loose = items.find((item) => item.type === "drawing")!;
  expect(loose.points).toEqual([
    [100, 500],
    [300, 560],
  ]);
});

it("reads a compressed draw.io page", async () => {
  const model = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="x" value="Packed" vertex="1" parent="1"><mxGeometry x="10" y="20" width="100" height="50" as="geometry"/></mxCell></root></mxGraphModel>`;
  const stream = new Blob([encodeURIComponent(model)])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  const encoded = btoa(String.fromCharCode(...bytes));
  const items = await imported(`<mxfile><diagram name="P">${encoded}</diagram></mxfile>`, "drawio");
  expect(named(items, "Packed")).toMatchObject({ x: 10, y: 20, width: 100, height: 50 });
});

it("reads OPML and headed or indented text as topic trees", async () => {
  const opml = await imported(
    `<?xml version="1.0"?>
<opml version="2.0"><head><title>Trip</title></head><body>
  <outline text="Pack"><outline text="Passport &amp; tickets"/></outline>
  <outline text="Book"/>
</body></opml>`,
    "opml"
  );
  expect(opml.filter((item) => item.type === "branch")).toHaveLength(3);
  const branchTo = (items: Item[], name: string) =>
    items.find((item) => item.type === "branch" && item.to === named(items, name).id)!;
  expect(branchTo(opml, "Pack").from).toBe(named(opml, "Trip").id);
  expect(branchTo(opml, "Passport & tickets").from).toBe(named(opml, "Pack").id);

  const headed = await imported("# Plan\n## Now\n- ship\n  - test\n## Later\n", "outline");
  expect(branchTo(headed, "Now").from).toBe(named(headed, "Plan").id);
  expect(branchTo(headed, "ship").from).toBe(named(headed, "Now").id);
  expect(branchTo(headed, "test").from).toBe(named(headed, "ship").id);
  expect(branchTo(headed, "Later").from).toBe(named(headed, "Plan").id);
});

it("names the format of pasted text and of chosen files", () => {
  expect(foreignFormat("flowchart TD\n a --> b")).toBe("mermaid");
  expect(foreignFormat("```mermaid\ngraph LR\n a --> b\n```")).toBe("mermaid");
  expect(foreignFormat("@startuml\nA -> B\n@enduml")).toBe("plantuml");
  expect(foreignFormat(DRAWIO)).toBe("drawio");
  expect(foreignFormat("<opml><body/></opml>")).toBe("opml");
  expect(foreignFormat("x -> y: calls\ny -> z")).toBe("d2");
  expect(foreignFormat("Just two\nlines of prose")).toBeNull();
  expect(fileFormat("flow.d2", "a\nb")).toBe("d2");
  expect(fileFormat("notes.txt", "Plan\n  ship\n  rest")).toBe("outline");
  expect(fileFormat("notes.txt", "one\ntwo")).toBeNull();
  expect(fileFormat("room.arconis", "arconis 1\nnode a")).toBeNull();
});

it("keeps ids the canvas language can read, whatever the source names things", async () => {
  const items = await imported(
    `flowchart LR
  node --> frame --> 1st --> fill --> my-step.two`,
    "mermaid"
  );
  expect(items.filter((item) => item.type === "node")).toHaveLength(5);
  expect(lines(items)).toHaveLength(4);
  expect(joins(items, "node", "frame")).toBeTruthy();
  expect(joins(items, "fill", "my-step.two")).toBeTruthy();
});

it("reads XML with entities, comments, character data and quoted angle brackets", () => {
  const root = parseXml(
    `<?xml version="1.0"?><!-- note --><a x="1 &gt; 0" y='<b>'><b/><c><![CDATA[1 < 2]]> &amp; more</c></a>`
  );
  expect(root).toMatchObject({ name: "a", attributes: { x: "1 > 0", y: "<b>" } });
  expect(root.children.map((child) => child.name)).toEqual(["b", "c"]);
  expect(root.children[1].text).toBe("1 < 2 & more");
  expect(plainText("<div>One</div><div><b>Two</b>&nbsp;three</div>")).toBe("One\nTwo three");
});
