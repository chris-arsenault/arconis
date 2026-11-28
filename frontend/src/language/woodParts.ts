import { newId } from "../document/ids";
import { hardwareList } from "../document/woodHardware";
import { isLink, type Item } from "../document/types";
import {
  validField,
  renamePartRefs,
  checkPart,
  cutList,
  inchText,
  locationIssue,
  partClosure,
  physicalSize,
  PROFILE_FIELDS,
  SCREWS,
  WOOD_REFS,
  worldPerInch,
  type Parts,
  type WoodPart,
} from "../document/woodworking";
import type { Draft } from "./draft";
import { LanguageError } from "./lexer";
import type { Statement } from "./syntax";

export function shopReport(parts: Parts) {
  const lines = cutList(parts).map(
    (row) =>
      `Cut ${row.id} · ${row.name} · qty ${row.quantity} · ${row.stock} · L × W × T: ${row.dimensions} · length: ${row.basis}`
  );
  for (const row of hardwareList(parts))
    lines.push(
      ["Hardware", row.label, "qty " + row.quantity, row.details].filter(Boolean).join(" · ")
    );
  for (const [id, part] of parts) {
    const issue = locationIssue(part, parts);
    if (part.kind === "joint")
      lines.push(id + ": bearing contact " + (part.facts.bearing || "unspecified"));
    if (issue) lines.push(`${id}: ${issue}`);
    if (part.kind === "screw" && part.facts.gauge)
      lines.push(`${id}: ${part.facts.gauge} basic diameter ${inchText(SCREWS[part.facts.gauge])}`);
  }
  return lines.map((line) => "// " + line.replace(/[\r\n]/g, " "));
}
function combineParts(parts: Map<string, WoodPart>, from: string, to: string, line: number) {
  const source = parts.get(from),
    target = parts.get(to);
  if (!source || !target || source.kind !== target.kind)
    throw new LanguageError("Choose two depictions of the same kind.", line);
  for (const [key, value] of Object.entries(source.facts))
    if (key !== "name" && target.facts[key] && target.facts[key] !== value)
      throw new LanguageError(
        `Resolve conflicting ${key} on ${from} and ${to} before using same-as.`,
        line
      );
  parts.set(to, { kind: target.kind, facts: { ...source.facts, ...target.facts } });
}

function followCatalogName(previous: WoodPart, part: WoodPart) {
  const profile = PROFILE_FIELDS[part.kind];
  if (
    profile &&
    previous.facts[profile] === previous.facts.name &&
    part.facts.name === previous.facts.name
  )
    part.facts.name = part.facts[profile] || part.kind;
}

/** Physical declarations share the writer's all-or-nothing draft with their placements. */
export class WoodDraft {
  private readonly before: Parts;
  readonly parts: Map<string, WoodPart>;
  readonly aliases = new Map<string, string>();
  private readonly imported = new Set<string>();
  enabled: boolean | null = null;
  constructor(
    private readonly draft: Draft,
    private readonly importing: boolean
  ) {
    this.before = draft.document.wood.parts();
    this.parts = new Map(this.before);
  }
  declare(s: Extract<Statement, { kind: "part" }>) {
    let id = s.id;
    if (this.importing) {
      if (this.imported.has(id)) throw new LanguageError(`Repeated physical part ${id}.`, s.line);
      this.imported.add(id);
      if (this.parts.has(id)) {
        id = newId((value) => this.parts.has(value) || this.imported.has(value));
        this.aliases.set(s.id, id);
      }
    }
    const existing = this.parts.get(id);
    if (existing && existing.kind !== s.woodKind)
      throw new LanguageError(`${id} is a ${existing.kind}.`, s.line);
    const facts = { ...existing?.facts };
    for (const [field, value] of s.fields) {
      if (!validField(s.woodKind, field))
        throw new LanguageError(
          id + ": " + field + " is not editable on a " + s.woodKind + ".",
          s.line
        );
      if (value === null) delete facts[field];
      else facts[field] = value;
    }
    const part = { kind: s.woodKind, facts };
    this.updateLabels(id, existing, part);
    this.parts.set(id, part);
  }
  /** A catalog label follows its profile. A custom name or view caption is preserved. */
  private updateLabels(id: string, previous: WoodPart | undefined, part: WoodPart) {
    if (!previous?.facts.name) return;
    const oldName = previous.facts.name;
    followCatalogName(previous, part);
    const label = part.facts.name || part.kind;
    if (label === oldName) return;
    for (const view of this.draft.items.values())
      if (view.wood?.part === id && view.name === oldName) view.name = label;
  }
  merge(viewId: string, otherId: string, line: number) {
    if (this.importing)
      throw new LanguageError("A portable view declares its shared part using depicts.", line);
    const from = this.draft.item(viewId, line).wood?.part,
      to = this.draft.item(otherId, line).wood?.part;
    if (!from || !to) throw new LanguageError("Select two woodworking depictions.", line);
    if (from === to) return;
    combineParts(this.parts, from, to, line);
    this.parts.delete(from);
    this.repoint(from, to);
  }
  private repoint(from: string, to: string) {
    const aliases = new Map([[from, to]]);
    for (const [id, part] of this.parts)
      if (WOOD_REFS.some((key) => part.facts[key] === from))
        this.parts.set(id, renamePartRefs(part, aliases));
    for (const item of this.draft.items.values())
      if (item.wood?.part === from) item.wood = { ...item.wood, part: to };
  }
  project(item: Item) {
    if (!item.wood || isLink(item)) return;
    const change = this.draft.calibrationChange;
    const scale = worldPerInch(
      change.kind === "set" ? change.value : this.draft.document.calibration()
    );
    Object.assign(item, physicalSize(this.parts, item.wood, scale));
  }
  private resolveImports() {
    for (const source of this.imported) {
      const id = this.aliases.get(source) ?? source;
      const part = this.parts.get(id)!;
      for (const key of WOOD_REFS)
        if (part.facts[key] && !this.imported.has(part.facts[key]))
          throw new LanguageError(
            `Imported part ${source} needs the declaration of ${part.facts[key]}.`
          );
      this.parts.set(id, renamePartRefs(part, this.aliases));
    }
  }
  finish(sized: Set<string>) {
    this.resolveImports();
    for (const [id, part] of this.parts) {
      const error = checkPart(id, part, this.parts);
      if (error) throw new LanguageError(error);
    }
    for (const item of this.draft.items.values()) this.finishView(item, sized);
  }
  private finishView(item: Item, sized: Set<string>) {
    if (!item.wood) return;
    this.bindImportedView(item);
    if (!this.parts.has(item.wood.part))
      throw new LanguageError(`${item.id} depicts unknown part ${item.wood.part}.`);
    const before = { width: item.width, height: item.height };
    this.project(item);
    if (this.importing) return;
    for (const axis of ["width", "height"] as const)
      if (sized.has(`${item.id} ${axis}`) && Math.abs(before[axis] - item[axis]) > 1e-8)
        throw new LanguageError(
          `Edit the physical dimensions of ${item.wood.part} to resize ${item.id}.`
        );
  }
  private bindImportedView(item: Item) {
    if (!item.wood) return;
    if (this.importing && this.draft.created.includes(item.id)) {
      if (!this.imported.has(item.wood.part))
        throw new LanguageError(`Missing imported part ${item.wood.part}.`);
      item.wood = { ...item.wood, part: this.aliases.get(item.wood.part) ?? item.wood.part };
    }
  }
  remove(id: string, line: number) {
    if (this.importing)
      throw new LanguageError("An imported drawing can only add physical pieces.", line);
    if (!this.parts.delete(id)) throw new LanguageError(`Unknown physical part ${id}.`, line);
  }
  commit() {
    const doc = this.draft.document;
    doc.wood.commit(this.before, this.parts);
    if (this.enabled !== null) {
      if (this.enabled) {
        doc.meta.set("woodworking", "on");
        if (!doc.calibration() && this.draft.calibrationChange.kind === "keep")
          doc.setCalibration({ world: 12, distance: 1, unit: "in" });
      } else doc.meta.delete("woodworking");
    }
  }
}

export function connectedParts(parts: Parts, seeds: string[]) {
  const connected = partClosure(parts, seeds);
  let previous = -1;
  while (previous !== connected.size) {
    previous = connected.size;
    for (const [id, part] of parts)
      if (WOOD_REFS.some((key) => connected.has(part.facts[key]))) {
        for (const ref of partClosure(parts, [id])) connected.add(ref);
      }
  }
  return new Map([...parts].filter(([id]) => connected.has(id)));
}
