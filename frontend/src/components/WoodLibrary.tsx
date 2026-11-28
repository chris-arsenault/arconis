import {
  Ruler,
  Layers,
  Drill,
  Bolt,
  Nut,
  CircleDot,
  TriangleRight,
  Droplet,
  Link2,
  ArrowDown,
  Anvil,
} from "lucide-react";
import { useState } from "react";
import type { EditorController } from "../editor/controller";
import {
  LUMBER,
  SHEET_THICKNESSES,
  SCREWS,
  type WoodKind,
  WOOD_LABELS,
} from "../document/woodworking";
import { findWoodPresets } from "../document/woodCatalog";
import { placeWood } from "../editor/woodworking";
import { HardwareList } from "./WoodLists";
import { pointInCanvas } from "../editor/creationScale";
import { StencilButton } from "./StencilButton";
function ProfilePicker({
  label,
  value,
  choices,
  change,
}: Readonly<{
  label: string;
  value: string;
  choices: readonly string[];
  change: (v: string) => void;
}>) {
  return (
    <label className="wood-field">
      {label}
      <select value={value} onChange={(e) => change(e.target.value)}>
        {choices.map((key) => (
          <option key={key}>{key}</option>
        ))}
      </select>
    </label>
  );
}
const woodIcons = {
  board: Ruler,
  panel: Layers,
  screw: Drill,
  bolt: Bolt,
  nut: Nut,
  bracket: TriangleRight,
  washer: CircleDot,
  glue: Droplet,
  joint: Link2,
  load: ArrowDown,
  support: Anvil,
};
type WoodGridProps = Readonly<{
  editor: EditorController;
  stock: string;
  sheet: string;
  gauge: string;
  search: string;
}>;
function WoodButton({
  editor,
  kind,
  profile,
  label,
}: Readonly<{ editor: EditorController; kind: WoodKind; profile: string; label: string }>) {
  const Icon = woodIcons[kind];
  const choice = { kind, profile, existing: "", projection: "face" } as const;
  const armed = editor.armedWood?.stencil;
  return (
    <StencilButton
      label={label}
      pressed={armed?.kind === kind && armed.profile === profile && !armed.existing}
      onArm={() => editor.armWood(choice)}
      onDrop={(event) => {
        const at = pointInCanvas(editor, event);
        if (at) placeWood(editor, choice, at, editor.selected());
      }}
    >
      <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
      <span>{label}</span>
    </StencilButton>
  );
}
function WoodGrid({ editor, stock, sheet, gauge, search }: WoodGridProps) {
  const query = search.toLowerCase().trim().replace("×", "x");
  const presets = findWoodPresets(query);
  const profiles = {
    board: searchedProfile("board", query, stock),
    panel: sheet,
    screw: searchedProfile("screw", query, gauge),
    bolt: "1/4 in",
    load: "",
    support: "",
    joint: "",
    glue: "",
  };
  return (
    <>
      <div className="stencil-grid">
        {(Object.keys(profiles) as (keyof typeof profiles)[]).map((kind) => {
          const profile = profiles[kind];
          const label = [WOOD_LABELS[kind], profile].filter(Boolean).join(" ");
          if (query && !("woodworking " + kind + " " + label.toLowerCase()).includes(query))
            return null;
          return (
            <WoodButton key={kind} editor={editor} kind={kind} label={label} profile={profile} />
          );
        })}
      </div>
      {["Joinery", "Brackets, washers and nuts"].map((group) => {
        const matches = presets.filter(({ kind }) => (kind === "joint") === (group === "Joinery"));
        if (!matches.length) return null;
        const grid = (
          <div className="stencil-grid">
            {matches.map(({ kind, type }) => (
              <WoodButton key={type} editor={editor} kind={kind} label={type} profile={type} />
            ))}
          </div>
        );
        return query ? (
          <section aria-label={group} key={group}>
            {grid}
          </section>
        ) : (
          <details key={group}>
            <summary data-hint-detail={"Browse " + group.toLowerCase() + " stencils."}>
              {group}
            </summary>
            {grid}
          </details>
        );
      })}
    </>
  );
}
function searchedProfile(kind: WoodKind, query: string, chosen: string) {
  if (kind === "board" && Object.hasOwn(LUMBER, query)) return query;
  if (kind === "screw" && Object.hasOwn(SCREWS, query)) return query;
  return chosen;
}
export function WoodLibrary({
  editor,
  search,
}: Readonly<{ editor: EditorController; search: string }>) {
  const [stock, setStock] = useState("2x4"),
    [gauge, setGauge] = useState("#7"),
    [sheet, setSheet] = useState("3/4 in");
  return (
    <section className="wood-library" aria-label="Woodworking stencils">
      <h3>Woodworking</h3>
      <ProfilePicker
        label="Lumber size"
        value={stock}
        choices={Object.keys(LUMBER)}
        change={setStock}
      />
      <ProfilePicker
        label="Sheet thickness"
        value={sheet}
        choices={SHEET_THICKNESSES}
        change={setSheet}
      />
      <ProfilePicker
        label="Fastener gauge"
        value={gauge}
        choices={Object.keys(SCREWS)}
        change={setGauge}
      />
      <WoodGrid editor={editor} stock={stock} sheet={sheet} gauge={gauge} search={search} />
      <UnplacedParts editor={editor} />
      <HardwareList editor={editor} />
    </section>
  );
}

function UnplacedParts({ editor }: Readonly<{ editor: EditorController }>) {
  const placed = new Set(editor.document.list().map((item) => item.wood?.part));
  const unplaced = [...editor.document.wood.parts()].filter(([id]) => !placed.has(id));
  if (!unplaced.length) return null;
  return (
    <details>
      <summary>Parts without a view ({unplaced.length})</summary>
      {unplaced.map(([id, part]) => (
        <button
          key={id}
          onClick={() =>
            editor.armWood({ kind: part.kind, existing: id, profile: "", projection: "face" })
          }
        >
          Place {part.facts.name || id}
        </button>
      ))}
    </details>
  );
}
