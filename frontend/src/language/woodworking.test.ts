import { expect, it } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import { cutList, shopInches } from "../document/woodworking";
import { serializeDocument, importDocument } from "../files/canvasFile";
import { LanguageSession } from "./session";
import { BOOKSHELF } from "./woodworkingExample";

function assembly() {
  const doc = new CanvasDocument(),
    agent = new LanguageSession(doc, "Builder");
  expect(agent.write(BOOKSHELF)).toContain("Done");
  return { doc, agent };
}
it("opens older drawings that use depicts as an item id or a style name", () => {
  const doc = new CanvasDocument();
  importDocument(
    doc,
    'arconis 1\nstyle depicts fill #eeeeee\nnode depicts z 1 at 0,0 size 160,90\nnode old "Old" depicts z 2 at 200,0 size 160,90'
  );
  expect(doc.get("depicts")?.wood).toBeNull();
  expect(doc.get("old")?.style).toBe("depicts");
  expect(doc.wood.parts().size).toBe(0);
});
it("resolves a fitted cut, its basis, unknowns and fixed sections across views", () => {
  const { doc, agent } = assembly();
  const rail = () => cutList(doc.wood.parts()).filter((row) => row.id === "rail");
  expect(rail()).toMatchObject([
    { quantity: 1, dimensions: "41 in × 3.5 in × 1.5 in", basis: "48 in − 3.5 in − 3.5 in" },
  ]);
  expect(agent.read({ items: ["rail_end"] })).toContain("Specify length on left_post");
  expect(agent.write('part top panel length "50 in"')).toContain("Done");
  expect(doc.get("rail_view")?.width).toBe(43 * 12);
  expect(doc.get("rail_end")?.width).toBe(3.5 * 12);
  expect(
    agent.write(
      'part top panel length "48 in"\npart left_post board occupies "thickness"\npart right_post board occupies "thickness"'
    )
  ).toContain("Done");
  expect(rail()[0].dimensions).toContain("45 in");
  expect(
    agent.write(
      'part left_post board occupies "width" inset "1/2 in"\npart right_post board occupies "width" inset "1/2 in"'
    )
  ).toContain("Done");
  expect(rail()[0].dimensions).toContain("40 in");
  expect(shopInches("1 1/2 in")).toBe(1.5);
  expect(shopInches("25.4 mm")).toBeCloseTo(1);
  expect(shopInches("1/0 in")).toBeNull();
});
it("resolves physical fastening roles across views and rejects diameter overrides atomically", () => {
  const { doc, agent } = assembly();
  expect(agent.write('part fixing screw gauge "#7" length "2 in"')).toContain("Done");
  expect(agent.read({ items: ["screw_detail"] })).toContain("0.151 in");
  expect(agent.write('part fixing screw length "3 in" diameter "1 in"')).toContain(
    "Nothing was changed"
  );
  expect(doc.wood.parts().get("fixing")?.facts.length).toBe("2 in");
  expect(agent.write('part fixing screw pilot "5/32 in"')).toContain("Done");
  expect(doc.wood.parts().get("fixing")?.facts.clearance).toBe("3/16 in");
  expect(agent.write('part fixing screw offset "42 in"')).toContain("Done");
  expect(agent.read()).toContain("outside rail");
  expect(agent.write("edit rail_end size 500,900")).toContain("Nothing was changed");
  expect(doc.get("rail_end")?.height).toBe(18);
});
it("round-trips independent physical identities, methods and dependencies including partial imports", () => {
  const { doc, agent } = assembly();
  expect(
    agent.write(
      'part glue1 glue joint "corner" type "PVA" surface "Mating faces"\npart bolt1 bolt joint "corner" diameter "1/4 in" hardware "Washer on each face"'
    )
  ).toContain("Done");
  const file = serializeDocument(doc),
    copy = new CanvasDocument();
  importDocument(copy, file);
  expect(serializeDocument(copy)).toBe(file);
  const jointSection = serializeDocument(doc, ["rail_end", "left_end"]);
  expect(jointSection).toContain("part glue1 glue");
  expect(jointSection).toContain("part bolt1 bolt");
  const partial = serializeDocument(doc, ["rail_end"]);
  const imported = importDocument(doc, partial);
  const second = doc.get(imported[0])!.wood!.part;
  expect(second).not.toBe("rail");
  const lookup = doc.wood.parts();
  expect(lookup.get(second)?.facts.span).not.toBe("top");
  expect(cutList(lookup).find((row) => row.id === second)?.dimensions).toContain("41 in");
  agent.read();
  expect(agent.write("delete rail_view")).toContain("Done");
  expect(doc.get("rail_end")?.wood?.part).toBe("rail");
});
it("merges physical identity explicitly, preserving references and undo", () => {
  const { doc, agent } = assembly();
  expect(agent.write('part other board stock "2x6"\nnode v depicts other edge')).toContain("Done");
  expect(agent.write("same-as v rail_end")).toContain("Resolve conflicting stock");
  expect(agent.write('part other board stock "2x4"\nsame-as v rail_end')).toContain("Done");
  expect(doc.get("v")?.wood?.part).toBe("rail");
  expect(doc.wood.records.has("other")).toBe(false);
  agent.undoLast();
  expect(doc.get("v")?.wood?.part).toBe("other");
  expect(doc.wood.parts().get("other")?.facts.stock).toBe("2x6");
});

it("preserves a bracket's fastening assembly and counts physical washers across views", () => {
  const { doc, agent } = assembly();
  expect(
    agent.write(
      [
        'part corner joint type "Dado" depth "1/4 in" width "3/4 in"',
        'part brace bracket type "Shelf bracket" joint "corner" projection "8 in"',
        'part mount bolt bracket "brace" diameter "1/4 in" hardware "galvanized"',
        'part near washer type "Flat washer" size "1/4 in" fastener "mount" side "under head"',
        'part far washer type "Flat washer" size "1/4 in" fastener "mount" side "under nut"',
        'part retainer nut type "Hex nut" fastener "mount" thread "1/4-20"',
        "node near_face depicts near face",
        "node near_edge depicts near edge",
      ].join("\n")
    )
  ).toContain("Done");
  const read = agent.read({ items: ["near_edge"] });
  for (const fact of [
    'type "Dado"',
    'projection "8 in"',
    'hardware "galvanized"',
    'thread "1/4-20"',
    "Hardware · Flat washer · qty 2",
  ])
    expect(read).toContain(fact);
  for (const invalid of [
    'part retainer nut fastener "fixing"',
    'part near washer fastener "brace"',
    'part brace bracket joint "rail"',
    'part corner joint depth "1/0 in"',
  ])
    expect(agent.write(invalid)).toContain("Nothing was changed");
  expect(agent.write('part near washer fastener "fixing"')).toContain("Done");
  expect(agent.write('part near washer fastener "mount"')).toContain("Done");
  const file = serializeDocument(doc);
  const copy = new CanvasDocument();
  importDocument(copy, file);
  expect(serializeDocument(copy)).toBe(file);
  const partial = serializeDocument(doc, ["left_end", "rail_end"]);
  for (const id of ["brace", "mount", "near", "far", "retainer"])
    expect(partial).toContain("part " + id + " ");
  const added = importDocument(doc, partial);
  const clonedRail = doc.get(added.find((id) => doc.get(id)?.name === "Crossbeam end")!)!.wood!
    .part;
  const cloned = agent.read({ items: ["part:" + clonedRail] });
  expect(cloned).toContain("Hardware · Flat washer · qty 2");
  expect(cloned).not.toContain('fastener "mount"');
  expect(cloned).not.toContain('bracket "brace"');
});

it("keeps physical locations on the same end across view rotation, trimming and deletion", () => {
  const { doc, agent } = assembly();
  expect(
    agent.write('part fixing screw offset "2 in"\nedit rail_view rotate 180 by 60,90')
  ).toContain("Done");
  expect(agent.read({ items: ["rail_end"] })).toContain("41 in × 3.5 in");
  expect(agent.write('part top panel length "8 in"')).toContain("Done");
  const read = agent.read({ items: ["screw_detail"] });
  expect(read).toContain("2 in from end A is outside rail (1 in long)");
  expect(doc.wood.parts().get("fixing")?.facts.face).toBe("wide face");
  expect(agent.write("delete screw_detail\nremove-part fixing")).toContain("Nothing was changed");
  expect(doc.get("screw_detail")?.wood?.part).toBe("fixing");
  expect(agent.write("delete screw_detail, screw_callout\nremove-part fixing")).toContain(
    "removed part:fixing"
  );
  expect(agent.write('part fixing screw gauge "#7"')).toContain("Done");
});
