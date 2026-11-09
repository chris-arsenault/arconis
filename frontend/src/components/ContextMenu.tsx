import { useEffect, useLayoutEffect, useRef } from "react";
import type { EditorController } from "../editor/controller";
import { menuGroups, ringEntries, type MenuEntry } from "../editor/contextMenu";
import {
  closeMenu,
  commandContext,
  findCommand,
  openSubRing,
  runCommand,
} from "../editor/registry";
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
  const choose = (entry: MenuEntry | null) => {
    if (!entry) return;
    if (entry.opens) {
      openSubRing(editor, entry.id);
      return;
    }
    closeMenu(editor);
    runCommand(editor, entry.id);
  };
  const size = OUTER * 2 + 4;
  return (
    <svg
      className="command-ring"
      data-testid="command-ring"
      width={size}
      height={size}
      viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}
    >
      {entries.map((entry, index) => {
        const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
        const label = { x: RING_RADIUS * Math.cos(angle), y: RING_RADIUS * Math.sin(angle) };
        return (
          <g
            key={entry?.id ?? index}
            className={[
              "ring-wedge",
              entry ? "" : "empty",
              menu.wedge === index ? "active" : "",
            ].join(" ")}
            role="menuitem"
            aria-label={entry?.label ?? ""}
            aria-disabled={!entry}
            onClick={() => choose(entry)}
          >
            <path d={wedgePath(index, count)} />
            {entry && (
              <text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="middle">
                {entry.label.length > 14 ? `${entry.label.slice(0, 13)}…` : entry.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Every applicable command, grouped, with its shortcut. */
function MenuList({ editor }: Readonly<{ editor: EditorController }>) {
  const context = commandContext(editor);
  const groups = menuGroups(context);
  return (
    <ul className="context-menu" role="menu" aria-label="Canvas menu">
      {groups.map((group, index) => (
        <li key={group[0].id} className={index ? "menu-group" : ""}>
          <ul>
            {group.map((entry) => {
              const shortcut = findCommand(entry.id).shortcuts?.[0];
              return (
                <li key={entry.id} role="none">
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
            })}
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
