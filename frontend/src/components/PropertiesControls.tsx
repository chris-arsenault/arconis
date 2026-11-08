import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { Item } from "../document/types";
import { isId } from "../document/ids";
import { Section } from "./ConnectionControls";

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
        <div className="control-row property-row" key={name}>
          <span className="property-key">{name}</span>
          <input
            className="object-subtitle property-value"
            aria-label={`Value of ${name}`}
            defaultValue={current}
            onBlur={(event) => {
              if (event.target.value !== current)
                set({ ...properties, [name]: event.target.value });
            }}
          />
          <button
            className="icon-action"
            aria-label={`Remove property ${name}`}
            onClick={() => {
              const next = { ...properties };
              delete next[name];
              set(next);
            }}
          >
            <X size={13} />
          </button>
        </div>
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
          placeholder="name"
          value={key}
          onChange={(event) => setKey(event.target.value)}
        />
        <input
          className="object-subtitle property-value"
          aria-label="New property value"
          placeholder="value"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <button className="icon-action" aria-label="Add property" disabled={!isId(key.trim())}>
          <Plus size={13} />
        </button>
      </form>
    </Section>
  );
}
