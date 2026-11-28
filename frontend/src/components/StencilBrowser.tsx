import { useState, useSyncExternalStore } from "react";
import type { EditorController } from "../editor/controller";
import { modulePanels } from "./modulePanels";
import { ShapeLibrary } from "./StencilLibraries";
import { useRailSections } from "./useRailSections";

const LIBRARIES = {
  Basics: true,
  Architecture: true,
  Screens: false,
  Infrastructure: false,
  Technology: false,
  aws: false,
  azure: false,
  gcp: false,
};

export function StencilBrowser({ editor }: Readonly<{ editor: EditorController }>) {
  useSyncExternalStore(editor.subscribe, editor.snapshot);
  const [query, setQuery] = useState("");
  const sections = useRailSections(LIBRARIES, "arconis.libraries");
  const search = query.trim().toLowerCase();
  const props = { editor, sections, search };
  return (
    <div className="stencil-browser">
      <div className="rail-heading">
        <h2>Add to canvas</h2>
        <p>Drag an item onto the canvas, or choose it and click to place.</p>
      </div>
      <input
        className="stencil-search"
        type="search"
        aria-label="Search stencils"
        placeholder="Search shapes and icons"
        data-hint-detail="Find shapes, screens and icons from every library by name."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="stencil-groups">
        <ShapeLibrary {...props} title="Basics" />
        {modulePanels(editor.document, "library").map(({ id, Panel: Library }) => (
          <Library key={id} {...props} />
        ))}
        {search && <p className="stencil-empty">No stencils match.</p>}
      </div>
    </div>
  );
}
