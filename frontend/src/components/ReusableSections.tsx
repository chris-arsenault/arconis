import { useEffect, useState } from "react";
import type { AccountStore } from "../account/accountStore";
import type { RoomSession } from "../collaboration/room";
import type { EditorController } from "../editor/controller";
import type { LibraryEntry } from "../protocol/library";
import { worldBounds } from "../document/relations";
import { isBox } from "../document/types";
import { offsetPoints } from "../document/geometry";

interface Props {
  account: AccountStore;
  session: RoomSession;
  editor: EditorController;
}
type Run = (action: () => Promise<void>) => void;

function LibraryEntryControls({
  entry,
  account,
  insert,
  run,
}: Readonly<{
  entry: LibraryEntry;
  account: AccountStore;
  insert: (id: string) => Promise<void>;
  run: Run;
}>) {
  const [name, setName] = useState(entry.name);
  return (
    <li>
      <button onClick={() => run(() => insert(entry.id))}>Insert {entry.name}</button>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          run(() => account.renameLayout(entry.id, name));
        }}
      >
        <input
          aria-label={`Layout name for ${entry.name}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <button>Rename layout</button>
      </form>
      <button onClick={() => run(() => account.removeLayout(entry.id))}>Delete {entry.name}</button>
    </li>
  );
}

function placeSection(editor: EditorController, ids: string[]) {
  const items = ids.map((id) => editor.document.get(id)!).filter(Boolean);
  const bounds = worldBounds(items);
  if (!bounds) return;
  const { scale, translate } = editor.graph.view;
  const dx = editor.element.clientWidth / (2 * scale) - translate.x - bounds.x - bounds.width / 2;
  const dy = editor.element.clientHeight / (2 * scale) - translate.y - bounds.y - bounds.height / 2;
  for (const item of items) {
    if (isBox(item)) editor.document.patch(item.id, { x: item.x + dx, y: item.y + dy });
    else editor.document.patch(item.id, { points: offsetPoints(item.points, dx, dy) });
  }
}

function SaveLayoutForm({ onSave }: Readonly<{ onSave: (name: string) => void }>) {
  const [name, setName] = useState("");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave(name);
      }}
    >
      <label>
        Layout name
        <input
          aria-label="Layout name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </label>
      <button>Save selected layout</button>
    </form>
  );
}

function LibraryPanel({
  account,
  session,
  editor,
  close,
}: Readonly<Props & { close: () => void }>) {
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    void account
      .layouts()
      .then((value) => {
        if (active) setEntries(value);
      })
      .catch((e: unknown) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [account, refresh]);
  const run: Run = (action) => {
    setError("");
    void action()
      .then(() => setRefresh((value) => value + 1))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "The layout action failed.")
      );
  };
  const save = async (name: string) => {
    const ids = editor.selectionClosure();
    if (!ids.length) throw new Error("Select the objects to save as a layout.");
    await account.saveLayout(name, await session.files.canvas(ids));
  };
  const insert = async (id: string) => {
    const created = await session.files.insertSection(await account.loadLayout(id), (ids) =>
      placeSection(editor, ids)
    );
    editor.graph.setSelectionCells(
      created
        .map((item) => editor.graph.getDataModel().getCell(item))
        .filter((cell) => cell !== null)
    );
    close();
  };
  return (
    <div className="password-gate" role="dialog" aria-label="My layouts">
      <section>
        <h2>My layouts</h2>
        <p>Private to your account. Save selected objects and insert copies into any room.</p>
        {session.id.startsWith("locked-") && (
          <p>
            Saving creates a readable account copy outside this room&apos;s password protection.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        <SaveLayoutForm onSave={(name) => run(() => save(name))} />
        <ul>
          {entries.map((entry) => (
            <LibraryEntryControls
              key={entry.id}
              entry={entry}
              account={account}
              insert={insert}
              run={run}
            />
          ))}
        </ul>
        <button onClick={close}>Close layouts</button>
      </section>
    </div>
  );
}

export function ReusableSections(props: Readonly<Props>) {
  const [open, setOpen] = useState(false);
  if (props.account.status !== "in") return null;
  return (
    <>
      <button className="icon-button" onClick={() => setOpen(true)}>
        My layouts
      </button>
      {open && <LibraryPanel {...props} close={() => setOpen(false)} />}
    </>
  );
}
