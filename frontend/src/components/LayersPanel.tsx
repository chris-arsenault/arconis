import { useState, type DragEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  Combine,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Trash2,
  MoveRight,
} from "lucide-react";
import type { EditorController } from "../editor/controller";
import { layerCommands, layerBelow, layerRoots } from "../document/layerCommands";
import { BASE_LAYER, byIds, inLayers, layerOf, type Layer } from "../document/layers";
import { isMarkup } from "../document/ink";
import type { Item } from "../document/types";

/**
 * The layer browser: content layers top to bottom. A row's name makes it the layer new objects
 * go into; the toolbar acts on that layer, as in a paint program. Markup is not a layer and has
 * its own bar.
 */
export function LayersPanel({ editor }: Readonly<{ editor: EditorController }>) {
  const { document } = editor;
  const active = editor.layers.active;
  const layers = document.layerList();
  const current = layers.find((layer) => layer.id === active) ?? layers[0];
  const [renaming, setRenaming] = useState("");
  const movable = editor.selected().filter((item) => !item.inside && !isMarkup(item));
  const moveSelection = () => {
    const ids = movable.map((item) => item.id);
    if (layerCommands.moveItems(document, ids, active).length)
      editor.room?.setNotice("Objects inside a frame or group move with their holder.");
  };
  return (
    <section aria-label="Layers" className="layers-panel">
      <div className="rail-heading">
        <h2>Layers</h2>
        <p>New objects go into the chosen layer. Hiding a layer changes only your view.</p>
      </div>
      <LayerList editor={editor} renaming={renaming} setRenaming={setRenaming} />
      <LayerToolbar editor={editor} current={current} onRename={() => setRenaming(active)} />
      <button
        className="layer-move-selection"
        disabled={!movable.length}
        data-hint={`Move selection to ${current.name}`}
        data-hint-detail="Move the selected objects onto the top of the chosen layer."
        onClick={moveSelection}
      >
        <MoveRight size={14} /> Move selection to {current.name}
      </button>
    </section>
  );
}

/** Each content layer, top first; drag a row onto another to put it above. */
function LayerList({
  editor,
  renaming,
  setRenaming,
}: Readonly<{ editor: EditorController; renaming: string; setRenaming: (id: string) => void }>) {
  const { document } = editor;
  const items = document.list();
  const layers = document.layerList();
  const active = editor.layers.active;
  const [dragging, setDragging] = useState("");
  const drop = (event: DragEvent, target: Layer) => {
    event.preventDefault();
    setDragging("");
    if (!dragging || dragging === target.id) return;
    const others = layers.filter((layer) => layer.id !== dragging);
    layerCommands.move(document, dragging, others.findIndex((layer) => layer.id === target.id) + 1);
  };
  return (
    <ul className="rail-list layer-list" aria-label="Layers, top first">
      {[...layers].reverse().map((layer) =>
        renaming === layer.id ? (
          <RenameLayer
            key={layer.id}
            layer={layer}
            onRename={(name) => layerCommands.rename(document, layer.id, name)}
            onDone={() => setRenaming("")}
          />
        ) : (
          <li
            key={layer.id}
            className="rail-row layer-row"
            data-testid="layer"
            data-layer={layer.id}
            data-active={layer.id === active}
            draggable
            onDragStart={() => setDragging(layer.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => drop(event, layer)}
          >
            <VisibilityButton
              name={layer.name}
              hidden={editor.layers.isHidden(layer.id)}
              onToggle={() => editor.layers.setHidden(layer.id, !editor.layers.isHidden(layer.id))}
            />
            <button
              className="rail-entry layer-name"
              aria-pressed={layer.id === active}
              data-hint={`Draw into ${layer.name}`}
              data-hint-detail="Make this the layer new objects go into; double-click to rename it."
              onClick={() => editor.layers.setActive(layer.id)}
              onDoubleClick={() => setRenaming(layer.id)}
            >
              {layer.name}
            </button>
            <span className="rail-count">{layerRoots(items, layer.id).length}</span>
          </li>
        )
      )}
    </ul>
  );
}

/** Actions on the chosen layer, as a paint program's layer toolbar has. */
function LayerToolbar({
  editor,
  current,
  onRename,
}: Readonly<{ editor: EditorController; current: Layer; onRename: () => void }>) {
  const { document } = editor;
  const layers = document.layerList();
  const active = current.id;
  const index = layers.findIndex((layer) => layer.id === active);
  return (
    <div className="layer-toolbar" role="toolbar" aria-label={`Layer actions for ${current.name}`}>
      <LayerAction
        label="New layer"
        disabled={false}
        detail="Add a layer above the chosen one, where new objects then go."
        onClick={() => editor.layers.setActive(layerCommands.create(document, "", active))}
      >
        <Plus size={14} />
      </LayerAction>
      <LayerAction
        label={`Rename ${current.name}`}
        disabled={false}
        detail="Give the chosen layer a new name for everyone in the room."
        onClick={onRename}
      >
        <Pencil size={13} />
      </LayerAction>
      <LayerAction
        label={`Move ${current.name} up`}
        detail="Stack the chosen layer above the next layer, so it draws on top."
        disabled={layers.at(-1)?.id === active}
        onClick={() => layerCommands.move(document, active, index + 1)}
      >
        <ArrowUp size={14} />
      </LayerAction>
      <LayerAction
        label={`Move ${current.name} down`}
        detail="Stack the chosen layer below the next layer, so it draws underneath."
        disabled={layers[0]?.id === active}
        onClick={() => layerCommands.move(document, active, index - 1)}
      >
        <ArrowDown size={14} />
      </LayerAction>
      <LayerAction
        label={`Merge ${current.name} down`}
        detail="Move the chosen layer's objects into the layer beneath, keeping how they stack."
        disabled={active === BASE_LAYER || !layerBelow(layers, active)}
        onClick={() => {
          const into = layerBelow(layers, active);
          if (layerCommands.mergeDown(document, active)) editor.layers.setActive(into);
        }}
      >
        <Combine size={14} />
      </LayerAction>
      <LayerAction
        label={`Delete ${current.name}`}
        detail="Remove the chosen layer and its objects for everyone; Undo restores them."
        disabled={active === BASE_LAYER}
        onClick={() => {
          if (layerCommands.delete(document, active)) editor.layers.setActive(BASE_LAYER);
        }}
      >
        <Trash2 size={14} />
      </LayerAction>
    </div>
  );
}

/**
 * The selection's layer in Properties. Contents follow their holder, so a selection that is all
 * held shows its holder's layer without a choice.
 */
export function LayerField({
  editor,
  selected,
}: Readonly<{ editor: EditorController; selected: Item[] }>) {
  const { document } = editor;
  const inLayer = selected.filter(inLayers);
  if (!inLayer.length) return null;
  const byId = byIds(document.list());
  const layers = document.layerList();
  const current = new Set(inLayer.map((item) => layerOf(item, byId)));
  const free = inLayer.filter((item) => !item.inside);
  return (
    <label
      className="layer-field"
      data-hint-detail="Move the selected objects to another layer; contents follow their frame or group."
    >
      <span>Layer</span>
      <select
        aria-label="Object layer"
        value={current.size === 1 ? [...current][0] : ""}
        disabled={!free.length}
        onChange={(event) => {
          const refused = layerCommands.moveItems(
            document,
            free.map((item) => item.id),
            event.target.value
          );
          if (refused.length || free.length < inLayer.length)
            editor.room?.setNotice("Objects inside a frame or group move with their holder.");
        }}
      >
        {current.size > 1 && <option value="">Several layers</option>}
        {[...layers].reverse().map((layer) => (
          <option key={layer.id} value={layer.id}>
            {layer.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function VisibilityButton({
  name,
  hidden,
  onToggle,
}: Readonly<{ name: string; hidden: boolean; onToggle: () => void }>) {
  const label = `${hidden ? "Show" : "Hide"} ${name}`;
  return (
    <button
      className="rail-action layer-eye"
      aria-label={label}
      aria-pressed={!hidden}
      data-hint={label}
      data-hint-detail="Show or hide this layer in your view only; others still see it."
      onClick={onToggle}
    >
      {hidden ? <EyeOff size={13} /> : <Eye size={13} />}
    </button>
  );
}

function LayerAction({
  label,
  detail,
  disabled,
  onClick,
  children,
}: Readonly<{
  label: string;
  detail: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}>) {
  return (
    <button
      className="rail-action"
      aria-label={label}
      data-hint={label}
      data-hint-detail={detail}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function RenameLayer({
  layer,
  onRename,
  onDone,
}: Readonly<{ layer: Layer; onRename: (name: string) => void; onDone: () => void }>) {
  const [name, setName] = useState(layer.name);
  const commit = () => {
    if (name.trim() && name.trim() !== layer.name) onRename(name.trim());
    onDone();
  };
  return (
    <li className="rail-row layer-row">
      <form
        className="layer-rename"
        onSubmit={(event) => {
          event.preventDefault();
          commit();
        }}
      >
        <input
          // eslint-disable-next-line jsx-a11y/no-autofocus -- renaming starts in the field
          autoFocus
          onFocus={(event) => event.currentTarget.select()}
          className="rail-rename"
          aria-label={`New name for ${layer.name}`}
          data-hint-detail="Type the layer's new name; Enter keeps it and Escape cancels."
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => event.key === "Escape" && onDone()}
        />
      </form>
    </li>
  );
}
