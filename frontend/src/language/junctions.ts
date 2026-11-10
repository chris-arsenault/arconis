import { defaultSize } from "../document/canvasDocument";
import type { Item } from "../document/types";
import type { Draft } from "./draft";
import { BLANK } from "../document/canvasDocument";
import { LanguageError } from "./lexer";
import { DEFAULT_GAP, union } from "../document/layout";
import type { PendingLink } from "./connections";
import { KEEP_TEXT, type LinkStatement, type Segment } from "./syntax";

/**
 * Lines that share a trunk: `a -> b, c shared` runs one line from `a` to a junction, a small point
 * item, and from there a line to each end. The junction is placed once every item is.
 */

export interface PendingJunction {
  id: string;
  from: string;
  to: string[];
}

export function isShared(statement: LinkStatement) {
  return statement.attributes.some(
    (attribute) => attribute.kind === "word" && attribute.word === "shared"
  );
}

/** The lines of a shared fan-out, rerouted through a junction for each start with several ends. */
export function shareTrunks(draft: Draft, links: PendingLink[], junctions: PendingJunction[]) {
  const statement = links[0].statement;
  const attributes = statement.attributes.filter(
    (attribute) => !(attribute.kind === "word" && attribute.word === "shared")
  );
  const rest = { ...statement, attributes };
  const result: PendingLink[] = [];
  for (const from of new Set(links.map((link) => link.from))) {
    const fan = links.filter((link) => link.from === from);
    if (fan.length < 2)
      throw new LanguageError(
        "shared joins lines that fan out from one item: a -> b, c shared.",
        statement.line
      );
    const [width, height] = defaultSize("node", "junction");
    const junction: Item = {
      ...BLANK,
      id: draft.freshId(),
      type: "node",
      stencil: "junction",
      width,
      height,
      order: draft.nextOrder(),
    };
    draft.add(junction);
    junctions.push({ id: junction.id, from, to: fan.map((link) => link.to) });
    const [first] = fan;
    const trunk: Segment = {
      from: first.segment.from,
      to: { kind: "reference", ref: junction.id, port: null },
      type: "line" as const,
      arrow: false,
      both: false,
      label: KEEP_TEXT,
    };
    result.push({ from, to: junction.id, segment: trunk, statement: rest });
    for (const link of fan)
      result.push({
        ...link,
        from: junction.id,
        segment: {
          ...link.segment,
          from: { kind: "reference", ref: junction.id, port: null },
          both: false,
        },
        statement: rest,
      });
  }
  return result;
}

/** How far a junction sits out from its start, at most half the way to its nearest end. */
function stepOut(edge: number, near: number) {
  const room = (near - edge) / 2;
  return edge + Math.sign(room) * Math.min(Math.abs(room), DEFAULT_GAP / 2);
}

/**
 * A junction sits just out from its start, toward where its ends mostly lie, so the trunk stays
 * short and clear of what lies between. It goes in the innermost item holding all of them.
 */
export function placeJunctions(draft: Draft, junctions: PendingJunction[]) {
  for (const { id, from, to } of junctions) {
    const junction = draft.items.get(id)!;
    const start = draft.extentOf(draft.items.get(from)!).box;
    const ends = union(to.map((end) => draft.extentOf(draft.items.get(end)!).box))!;
    const dx = ends.x + ends.width / 2 - (start.x + start.width / 2);
    const dy = ends.y + ends.height / 2 - (start.y + start.height / 2);
    let x = start.x + start.width / 2;
    let y = start.y + start.height / 2;
    if (Math.abs(dx) >= Math.abs(dy))
      x = dx >= 0 ? stepOut(start.x + start.width, ends.x) : stepOut(start.x, ends.x + ends.width);
    else
      y =
        dy >= 0 ? stepOut(start.y + start.height, ends.y) : stepOut(start.y, ends.y + ends.height);
    junction.x = x - junction.width / 2;
    junction.y = y - junction.height / 2;
    const chains = [from, ...to].map((member) => draft.ancestors(draft.items.get(member)!));
    junction.inside =
      chains[0].find((holder) => chains.every((chain) => chain.includes(holder))) ?? "";
  }
}
