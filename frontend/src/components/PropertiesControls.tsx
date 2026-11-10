import { useId, useState } from "react";
import { Plus, X } from "lucide-react";
import type { Item } from "../document/types";
import { isId } from "../document/ids";
import { Section } from "./ConnectionControls";
import { PropertyValue } from "./PropertyValue";

/**
 * An object's named values: owner, environment, ticket, whatever the canvas is about. They show
 * on hover, and {name} in a label reads the value. Agents write them as `property name "value"`.
 */
export function PropertiesControls({
  item,
  onChange,
}: Readonly<{ item: Item; onChange: (properties: Record<string, string> | undefined) => void }>) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const feedback = useId();
  const invalidName = key.trim() !== "" && !isId(key.trim());
  const properties = item.properties ?? {};
  const entries = Object.entries(properties).sort(([a], [b]) => a.localeCompare(b));
  const set = (next: Record<string, string>) =>
    onChange(Object.keys(next).length ? next : undefined);
  const add = () => {
    const name = key.trim();
    if (!isId(name)) return;
    set({ ...properties, [name]: value });
    setKey("");
    setValue("");
  };
  return (
    <Section title="Properties">
      {entries.map(([name, current]) => (
        <PropertyRow
          key={`${item.id}:${name}`}
          name={name}
          value={current}
          properties={properties}
          onChange={set}
        />
      ))}
      <form
        className="control-row property-row"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <input
          className="object-subtitle property-key-input"
          aria-label="New property name"
          data-hint-detail="Name a value to keep on this object; {name} in its text shows the value."
          placeholder="name"
          aria-invalid={invalidName || undefined}
          aria-describedby={invalidName ? feedback : undefined}
          value={key}
          onChange={(event) => setKey(event.target.value)}
        />
        <input
          className="object-subtitle property-value"
          aria-label="New property value"
          data-hint-detail="The value stored under the new name; hovering the object lists its values."
          placeholder="value"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <button
          className="icon-action"
          aria-label="Add property"
          data-hint-detail="Store this name and value on the object for everyone in the room."
          disabled={!isId(key.trim())}
        >
          <Plus size={13} />
        </button>
      </form>
      {invalidName && (
        <small id={feedback} className="field-feedback" role="status">
          Start with a letter or underscore; use letters, digits, underscores or hyphens.
        </small>
      )}
    </Section>
  );
}

function PropertyRow({
  name,
  value,
  properties,
  onChange,
}: Readonly<{
  name: string;
  value: string;
  properties: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}>) {
  return (
    <div className="control-row property-row">
      <span className="property-key">{name}</span>
      <PropertyValue
        name={name}
        value={value}
        onCommit={(text) => onChange({ ...properties, [name]: text })}
      />
      <button
        className="icon-action"
        aria-label={`Remove property ${name}`}
        data-hint-detail="Delete this named value from the object."
        onClick={() => {
          const next = { ...properties };
          delete next[name];
          onChange(next);
        }}
      >
        <X size={13} />
      </button>
    </div>
  );
}
