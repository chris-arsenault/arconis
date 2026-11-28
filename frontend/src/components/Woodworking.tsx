import { useState } from "react";
import {
  AXES,
  LUMBER,
  SCREWS,
  PROJECTIONS,
  WOOD_FIELDS,
  WOOD_REFS,
  acceptsWoodRef,
  inchText,
  isStock,
  locationIssue,
  type Parts,
  type WoodPart,
} from "../document/woodworking";
import type { Item } from "../document/types";
import { quote } from "../language/printer";
import type { EditorController } from "../editor/controller";
import { writeWood } from "../editor/woodworking";
import { PropertyValue } from "./PropertyValue";
import "./woodworking.css";

const LABELS: Record<string, string> = {
  name: "Part name",
  stock: "Nominal lumber size",
  length: "Cut length",
  width: "Cut width",
  thickness: "Sheet thickness",
  material: "Material or species",
  grade: "Grade",
  grain: "Grain direction",
  occupies: "Dimension along span",
  inset: "Support inset",
  span: "Outside span piece",
  "span-axis": "Outside span dimension",
  left: "Left bounding piece",
  right: "Right bounding piece",
  "left-axis": "Left face dimension",
  "right-axis": "Right face dimension",
  "left-inset": "Left inset override",
  "right-inset": "Right inset override",
  gauge: "Screw gauge",
  diameter: "Bolt diameter",
  bracket: "Mounting bracket",
  fastener: "Attached fastener",
  side: "Washer position",
  size: "Nominal fastener size",
  thread: "Thread designation",
  "outer-diameter": "Outside diameter",
  bore: "Inside diameter",
  depth: "Joint depth",
  projection: "Bracket projection",
  joint: "Joint",
  through: "Through piece",
  into: "Receiving piece",
  clearance: "Clearance hole",
  pilot: "Pilot hole",
  "clearance-depth": "Clearance depth",
  "pilot-depth": "Pilot depth",
  face: "Entry or contact face",
  end: "Reference end",
  edge: "Reference edge",
  offset: "Distance from end",
  "edge-offset": "Distance from edge",
  "receiving-face": "Receiving face",
  bearing: "Bearing contact",
  type: "Type",
  hardware: "Hardware notes",
  surface: "Glued surfaces",
  member: "Attached piece",
  direction: "Load direction",
  magnitude: "Load and unit",
  "measured-width": "Measured width",
  "measured-thickness": "Measured thickness",
};
function choices(key: string, parts: Parts, id: string): [string, string][] | null {
  if (WOOD_REFS.includes(key))
    return [...parts]
      .filter(([other, part]) => other !== id && acceptsWoodRef(parts.get(id)!.kind, key, part))
      .map(([other, p]) => [other, `${p.facts.name || other} (${other})`]);
  let values: readonly string[];
  if (key === "stock") values = Object.keys(LUMBER);
  else if (key === "gauge") values = Object.keys(SCREWS);
  else if (key === "end") values = ["A", "B"];
  else if (key === "occupies" || key.endsWith("-axis")) values = AXES;
  else return null;
  return values.map((v) => [v, v]);
}

const shopLabels: Partial<Record<WoodPart["kind"], Record<string, string>>> = {
  screw: { length: "Fastener length" },
  bolt: { length: "Fastener length" },
  bracket: {
    length: "Bracket length",
    width: "Bracket width",
    thickness: "Bracket thickness",
    material: "Hardware material",
  },
  joint: { length: "Joint length", width: "Joint width" },
  washer: { thickness: "Washer thickness", material: "Hardware material" },
  nut: { material: "Hardware material" },
};

function inheritedRole(field: string, part: WoodPart, parts: Parts) {
  if (field !== "through" && field !== "into") return "Unspecified";
  const member = parts.get(part.facts.joint)?.facts[field];
  return member
    ? `From joint · ${parts.get(member)?.facts.name || member} (${member})`
    : "Unspecified";
}
function ShopField({
  id,
  part,
  field,
  parts,
  onChange,
}: Readonly<{
  id: string;
  part: WoodPart;
  field: string;
  parts: Parts;
  onChange: (key: string, value: string) => void;
}>) {
  const label = shopLabels[part.kind]?.[field] ?? LABELS[field] ?? field,
    value = part.facts[field] || "";
  const options = choices(field, parts, id);
  return (
    <div className="wood-field">
      <span>{label}</span>
      {options !== null ? (
        <select
          aria-label={label}
          data-hint-detail={"Set " + label.toLowerCase() + " for this physical part."}
          value={value}
          onChange={(e) => onChange(field, e.target.value)}
        >
          <option value="">{inheritedRole(field, part, parts)}</option>
          {options.map(([key, text]) => (
            <option key={key} value={key}>
              {text}
            </option>
          ))}
        </select>
      ) : (
        <PropertyValue
          name={label}
          value={value}
          onCommit={(text) => onChange(field, text.trim())}
        />
      )}
    </div>
  );
}

interface PartProps {
  part: WoodPart;
  parts: Parts;
  id: string;
  apply: (statements: string) => void;
}
const fitKeys = WOOD_FIELDS.board.slice(WOOD_FIELDS.board.indexOf("span"));
function PartSummary({ part }: Readonly<Pick<PartProps, "part">>) {
  return (
    <>
      {part.kind === "screw" && part.facts.gauge && (
        <p>Basic diameter · {inchText(SCREWS[part.facts.gauge])}</p>
      )}
      {part.kind === "board" && part.facts.stock && (
        <p>Dressed section · {LUMBER[part.facts.stock]?.join(" × ")} in</p>
      )}
    </>
  );
}
function PartFields({ part, parts, id, apply }: Readonly<PartProps>) {
  const setField = (key: string, value: string) =>
    apply(`part ${id} ${part.kind} ${key} ${value ? quote(value) : "none"}`);
  const field = (key: string) => (
    <ShopField key={key} id={id} part={part} field={key} parts={parts} onChange={setField} />
  );
  const fitted = Boolean(part.facts.span || part.facts.left || part.facts.right);
  const common = [
    "name",
    "stock",
    "gauge",
    "width",
    "thickness",
    "length",
    "joint",
    "through",
    "into",
    "member",
    "clearance",
    "pilot",
    "direction",
    "magnitude",
    "diameter",
    "type",
    "bracket",
    "fastener",
    "size",
    "side",
    "depth",
    "projection",
  ];
  const fields: string[] = ["name", ...WOOD_FIELDS[part.kind]];
  return (
    <>
      <h3>
        {part.facts.name || part.kind} <small>{id}</small>
      </h3>
      <div className="wood-fields">
        {fields.filter((key) => common.includes(key) && !(key === "length" && fitted)).map(field)}
      </div>
      <PartSummary part={part} />
      <details>
        <summary>Shop details</summary>
        <div className="wood-fields">
          {fields.filter((key) => !common.includes(key) && !fitKeys.includes(key)).map(field)}
        </div>
      </details>
    </>
  );
}
function FitFields({ part, parts, id, apply }: Readonly<PartProps>) {
  const [showFit, setShowFit] = useState(false);
  const fitted = Boolean(part.facts.span || part.facts.left || part.facts.right);
  return (
    <>
      {isStock(part) && (
        <>
          <button type="button" aria-expanded={showFit} onClick={() => setShowFit(!showFit)}>
            Fit between faces
          </button>
          {showFit && (
            <div className="wood-fields">
              {fitKeys.map((key) => (
                <ShopField
                  key={key}
                  field={key}
                  part={part}
                  id={id}
                  parts={parts}
                  onChange={(fieldName, value) =>
                    apply(
                      `part ${id} ${part.kind} length none ${fieldName} ${value ? quote(value) : "none"}`
                    )
                  }
                />
              ))}
              {fitted && (
                <button
                  onClick={() =>
                    apply(
                      `part ${id} ${part.kind} ${fitKeys.map((key) => key + " none").join(" ")}`
                    )
                  }
                >
                  Use literal cut length
                </button>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
function removePhysicalPart(editor: EditorController, id: string) {
  const ids = editor.document
    .list()
    .filter((v) => v.wood?.part === id)
    .map((v) => v.id);
  return ["delete " + ids.join(", "), "remove-part " + id].join("\n");
}
function PlacementFields({
  editor,
  item,
  part,
  parts,
  id,
  apply,
}: PartProps & { editor: EditorController; item: Item }) {
  const view = item.wood!;
  const [other, setOther] = useState("");
  const peers = editor.document
    .list()
    .filter(
      (candidate) =>
        candidate.wood &&
        candidate.wood.part !== view.part &&
        parts.get(candidate.wood.part)?.kind === part.kind
    );
  return (
    <>
      <label className="wood-field">
        Projection
        <select
          aria-label="Projection"
          value={view.projection}
          onChange={(e) => apply(`edit ${item.id} depicts ${view.part} ${e.target.value}`)}
        >
          {PROJECTIONS.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </label>
      <button
        onClick={() =>
          editor.armWood({
            kind: part.kind,
            existing: view.part,
            profile: "",
            projection: view.projection,
          })
        }
      >
        Place another view
      </button>
      {peers.length > 0 && (
        <label className="wood-field">
          Same as
          <select
            aria-label="Same as another view"
            value={other}
            onChange={(e) => setOther(e.target.value)}
          >
            <option value="">Choose a view</option>
            {peers.map((p) => (
              <option value={p.id} key={p.id}>
                {p.name || p.id} ({p.id})
              </option>
            ))}
          </select>
        </label>
      )}
      {other && (
        <button onClick={() => apply(`same-as ${item.id} ${other}`)}>
          Link same physical part
        </button>
      )}
      <button onClick={() => apply(removePhysicalPart(editor, id))}>Remove physical part</button>
    </>
  );
}
export function WoodInspector({
  editor,
  selected,
}: Readonly<{ editor: EditorController; selected: Item[] }>) {
  const [error, setError] = useState("");
  const item = selected[0],
    view = item.wood;
  if (!view) return null;
  const parts = editor.document.wood.parts();
  const part = parts.get(view.part);
  if (!part) return null;
  const apply = (statements: string) => {
    try {
      writeWood(editor, statements);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  if (selected.length > 1) {
    if (selected.length !== 2 || !selected[1].wood) return null;
    return (
      <section className="wood-inspector">
        <button onClick={() => apply(`same-as ${item.id} ${selected[1].id}`)}>Same as</button>
        {error && <p role="alert">{error}</p>}
      </section>
    );
  }
  const props = { id: view.part, part, parts, apply };
  const issue = locationIssue(part, parts);
  return (
    <section className="wood-inspector" aria-label="Woodworking properties">
      <PartFields {...props} />
      <FitFields {...props} />
      <PlacementFields key={item.id} editor={editor} item={item} {...props} />
      {issue && <p role="status">{issue}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
