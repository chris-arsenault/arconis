import type { EditorController } from "../editor/controller";
import type { Item } from "../document/types";
import { effectiveAppearance } from "../document/appearance";
import { changeSelectionLook, routeAround } from "../editor/commands";
import { ConnectionControls } from "./ConnectionControls";

/** Compose the connection's semantic controls with the current selection's operations. */
export function SelectionConnection({
  editor,
  selected,
}: Readonly<{ editor: EditorController; selected: Item[] }>) {
  const [item] = selected;
  const canvas = editor.document;
  return (
    <section className="inspector-primary" aria-label="Connection">
      <ConnectionControls
        item={item}
        look={effectiveAppearance(item, canvas.namedStyle(item.style))}
        onLook={(look) => changeSelectionLook(canvas, [item], look)}
        onRoute={() => routeAround(canvas, item)}
      />
    </section>
  );
}
