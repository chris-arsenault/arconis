import { newId } from "../document/ids";
import { LOCAL, type Item } from "../document/types";
import {
  acceptsWoodRef,
  isStock,
  PROFILE_FIELDS,
  type Parts,
  type Projection,
  type WoodFacts,
  type WoodKind,
} from "../document/woodworking";
import { parse } from "../language/parser";
import { quote, partStatement } from "../language/printer";
import { writeStatements } from "../language/writer";
import type { EditorController } from "./controller";
import { containerAt } from "./panels";

export interface WoodStencil {
  kind: WoodKind;
  profile: string;
  /** Nonempty for another depiction of an existing part. */
  existing: string;
  projection: Projection;
}

export function writeWood(editor: EditorController, statements: string) {
  const doc = editor.document;
  doc.undo.stopCapturing();
  doc.doc.transact(() => writeStatements(doc, parse(statements), { author: doc.author }), LOCAL);
  doc.undo.stopCapturing();
}

function stencilFacts(choice: WoodStencil, name: string) {
  const facts: WoodFacts = { name };
  const field = PROFILE_FIELDS[choice.kind];
  if (field && choice.profile) facts[field] = choice.profile;
  return facts;
}
function selectedJoint(selection: Item[], parts: Parts) {
  for (const view of selection) {
    if (!view.wood) continue;
    const part = parts.get(view.wood.part);
    if (part?.kind === "joint") return view.wood.part;
    if (part?.facts.joint) return part.facts.joint;
  }
  return "";
}
function attachFitting(kind: WoodKind, selection: Item[], parts: Parts, facts: WoodFacts) {
  let key: string;
  if (kind === "nut" || kind === "washer") key = "fastener";
  else if (kind === "screw" || kind === "bolt") key = "bracket";
  else return false;
  const targets = new Set<string>();
  for (const { wood } of selection) {
    const target = wood && parts.get(wood.part);
    if (target && acceptsWoodRef(kind, key, target)) targets.add(wood.part);
  }
  if (targets.size !== 1) return false;
  facts[key] = [...targets][0];
  return true;
}
function attachOperation(
  parts: Parts,
  kind: WoodKind,
  id: string,
  selection: Item[],
  members: Item[],
  facts: WoodFacts,
  statements: string[]
) {
  if (attachFitting(kind, selection, parts, facts)) return false;
  const operation = ["joint", "screw", "bolt", "bracket", "glue"].includes(kind);
  let line = false;
  if (operation) {
    const joint = selectedJoint(selection, parts);
    if (joint && kind !== "joint") facts.joint = joint;
    else if (members.length === 2 && members[0].wood!.part !== members[1].wood!.part) {
      facts.through = members[0].wood!.part;
      facts.into = members[1].wood!.part;
      line = true;
      if (kind !== "joint") {
        const jointId = newId((key) => parts.has(key) || key === id);
        statements.push(
          partStatement(jointId, {
            kind: "joint",
            facts: { through: facts.through, into: facts.into },
          })
        );
        facts.joint = jointId;
        delete facts.through;
        delete facts.into;
      }
    }
  }
  if (["load", "support"].includes(kind) && members.length === 1)
    facts.member = members[0].wood!.part;
  return line;
}
export function placeWood(
  editor: EditorController,
  choice: WoodStencil,
  at: { x: number; y: number },
  selection: Item[]
) {
  const doc = editor.document,
    parts = doc.wood.parts();
  const id = choice.existing || newId((key) => parts.has(key));
  const view = doc.freshId();
  const existing = parts.get(id);
  const name = existing?.facts.name || choice.profile || choice.kind;
  const facts = stencilFacts(choice, name);
  const members = selection.filter((item) => {
    const part = item.wood && parts.get(item.wood.part);
    return part && isStock(part);
  });
  const statements: string[] = [];
  const line =
    !choice.existing &&
    attachOperation(parts, choice.kind, id, selection, members, facts, statements);
  if (!choice.existing) statements.push(partStatement(id, { kind: choice.kind, facts }));
  const holder = containerAt(doc, at.x, at.y, { width: 100, height: 30 });
  const depicts = `depicts ${id} ${choice.projection}`;
  if (line)
    statements.push(`${members[0].id} -> ${members[1].id} ${quote(name)} as ${view} ${depicts}`);
  else {
    const fill = ["board", "panel"].includes(choice.kind) ? "#ead5ae" : "#e3edf4";
    statements.push(
      `node ${view} ${quote(name)} ${depicts} at ${at.x},${at.y} fill ${fill} ${holder ? "in " + holder : ""}`
    );
  }
  writeWood(editor, statements.join("\n"));
  editor.setTool("select");
  editor.select(view);
  return view;
}
