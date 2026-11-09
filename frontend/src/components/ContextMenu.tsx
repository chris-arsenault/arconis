import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { EditorController } from "../editor/controller";
import { chooseRingEntry, menuGroups, ringEntries, type MenuEntry } from "../editor/contextMenu";
import { closeMenu, commandContext, findCommand, runCommand } from "../editor/registry";
import { shortcutLabel } from "../editor/shortcuts";
import { RING_RADIUS } from "../editor/pointerButtons";

const WEDGE_COUNT = 8;
const INNER = 22;
const OUTER = RING_RADIUS + 30;

function wedgePath(index: number, count: number) {
  const span = (Math.PI * 2) / count;
  const start = index * span - span / 2 - Math.PI / 2;
  const end = start + span;
  const point = (radius: number, angle: number) =>
    `${(radius * Math.cos(angle)).toFixed(1)},${(radius * Math.sin(angle)).toFixed(1)}`;
  return [
    `M ${point(INNER, start)}`,
    `A ${INNER} ${INNER} 0 0 1 ${point(INNER, end)}`,
    `L ${point(OUTER, end)}`,
    `A ${OUTER} ${OUTER} 0 0 0 ${point(OUTER, start)}`,
    "Z",
  ].join(" ");
}

/** The ring: eight wedges around the press point, a stroke or a click on each runs it. */
function CommandRing({ editor }: Readonly<{ editor: EditorController }>) {
  const menu = editor.ui.menu!;
  const entries = ringEntries(commandContext(editor), menu.subRing);
  const count = Math.max(WEDGE_COUNT, entries.length);
  const size = OUTER * 2 + 4;
  return (
    <svg
      className="command-ring"
      data-testid="command-ring"
      width={size}
      height={size}
      viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}
    >
      {entries.map((entry, index) =>
        entry ? (
          <Wedge
            key={entry.id}
            entry={entry}
            index={index}
            count={count}
            active={menu.wedge === index}
            onChoose={() => chooseRingEntry(editor, entry)}
          />
        ) : (
          <g key={index} className="ring-wedge empty" role="menuitem" aria-disabled="true">
            <path d={wedgePath(index, count)} />
          </g>
        )
      )}
    </svg>
  );
}

function Wedge({
  entry,
  index,
  count,
  active,
  onChoose,
}: Readonly<{
  entry: MenuEntry;
  index: number;
  count: number;
  active: boolean;
  onChoose: () => void;
}>) {
  const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
  const label = { x: RING_RADIUS * Math.cos(angle), y: RING_RADIUS * Math.sin(angle) };
  const classes = ["ring-wedge", entry.more ? "more" : "", active ? "active" : ""];
  const text = entry.short ?? entry.label;
  return (
    <g className={classes.join(" ")} role="menuitem" aria-label={entry.label} onClick={onChoose}>
      <path d={wedgePath(index, count)} />
      <text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="middle">
        {text.length > 11 ? `${text.slice(0, 10)}…` : text}
      </text>
    </g>
  );
}

/** One command in the menu, with its shortcut. */
function MenuItem({ editor, entry }: Readonly<{ editor: EditorController; entry: MenuEntry }>) {
  const shortcut = findCommand(entry.id).shortcuts?.[0];
  return (
    <li role="none">
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          closeMenu(editor);
          runCommand(editor, entry.id);
        }}
      >
        <span>{entry.label}</span>
        {shortcut && <kbd>{shortcutLabel(shortcut)}</kbd>}
      </button>
    </li>
  );
}

/**
 * A submenu: a family of commands folded under one entry, unfolding in place on click or the
 * right arrow, so a long menu scrolls with it open.
 */
function Submenu({
  editor,
  entry,
  open,
  onOpen,
}: Readonly<{
  editor: EditorController;
  entry: MenuEntry;
  open: boolean;
  onOpen: (id: string | null) => void;
}>) {
  return (
    <li role="none" className="has-submenu">
      <button
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => onOpen(open ? null : entry.id)}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") onOpen(entry.id);
          if (event.key === "ArrowLeft") onOpen(null);
        }}
      >
        <span>{entry.label}</span>
        <ChevronRight size={13} aria-hidden="true" />
      </button>
      {open && (
        <ul className="context-submenu" role="menu" aria-label={entry.label}>
          {entry.submenu!.map((inner) => (
            <MenuItem key={inner.id} editor={editor} entry={inner} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Every applicable command, grouped by intent, with longer families folded into submenus. */
function MenuList({ editor }: Readonly<{ editor: EditorController }>) {
  const groups = menuGroups(commandContext(editor));
  const [submenu, setSubmenu] = useState<string | null>(null);
  return (
    <ul className="context-menu" role="menu" aria-label="Canvas menu">
      {groups.map((group, index) => (
        <li key={group[0].id} className={index ? "menu-group" : ""}>
          <ul>
            {group.map((entry) =>
              entry.submenu ? (
                <Submenu
                  key={entry.id}
                  editor={editor}
                  entry={entry}
                  open={submenu === entry.id}
                  onOpen={setSubmenu}
                />
              ) : (
                <MenuItem key={entry.id} editor={editor} entry={entry} />
              )
            )}
          </ul>
        </li>
      ))}
    </ul>
  );
}

/**
 * The right button's ring and menu, placed where it was pressed and kept inside the canvas area.
 * Escape, a click outside and the left button anywhere else close them.
 */
export function ContextMenu({ editor }: Readonly<{ editor: EditorController }>) {
  const menu = editor.ui.menu;
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!ref.current || !menu) return;
    const area = editor.element.getBoundingClientRect();
    const box = ref.current.getBoundingClientRect();
    const offsetX = menu.ring ? box.width / 2 : 0;
    const offsetY = menu.ring ? box.height / 2 : 0;
    const x = Math.max(8 + offsetX, Math.min(menu.at.x, area.width - box.width + offsetX - 8));
    const y = Math.max(8 + offsetY, Math.min(menu.at.y, area.height - box.height + offsetY - 8));
    Object.assign(ref.current.style, { left: `${x}px`, top: `${y}px` });
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu(editor);
    };
    const onDown = (event: PointerEvent) => {
      if (event.button === 2) return;
      if (!(event.target instanceof Node) || !ref.current?.contains(event.target))
        closeMenu(editor);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [editor]);
  if (!menu) return null;
  return (
    <div
      ref={ref}
      className={menu.ring ? "menu-anchor" : "menu-anchor menu-only"}
      data-testid="context-menu"
    >
      {menu.ring ? <CommandRing editor={editor} /> : <MenuList editor={editor} />}
    </div>
  );
}
