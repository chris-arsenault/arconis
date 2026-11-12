import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { COLORS } from "../document/types";
import type { EditorController } from "../editor/controller";
import { chooseRingEntry, menuGroups, ringEntries, type MenuEntry } from "../editor/contextMenu";
import { commandContext, findCommand, runCommand } from "../editor/registry";
import { closeMenu } from "../editor/ui";
import { shortcutLabel } from "../editor/shortcuts";
import {
  RING_RADIUS,
  RING_INNER,
  RING_OUTER,
  RING_COUNT,
  ringCentre,
} from "../editor/pointerButtons";

const point = (radius: number, angle: number) =>
  `${(radius * Math.cos(angle)).toFixed(1)},${(radius * Math.sin(angle)).toFixed(1)}`;

/** A band between two radii from one screen angle to another, clockwise. */
function bandPath(start: number, end: number, inner: number, outer: number) {
  return [
    `M ${point(inner, start)}`,
    `A ${inner} ${inner} 0 0 1 ${point(inner, end)}`,
    `L ${point(outer, end)}`,
    `A ${outer} ${outer} 0 0 0 ${point(outer, start)}`,
    "Z",
  ].join(" ");
}

function wedgeSpan(index: number, count: number) {
  const span = (Math.PI * 2) / count;
  const start = index * span - span / 2 - Math.PI / 2;
  return { start, end: start + span };
}

function wedgePath(index: number, count: number) {
  const { start, end } = wedgeSpan(index, count);
  return bandPath(start, end, RING_INNER, RING_OUTER);
}

/** A rim along a wedge's outer edge: the mark of a wedge that opens another ring. */
function rimPath(index: number, count: number) {
  const { start, end } = wedgeSpan(index, count);
  const inset = (end - start) / 4;
  return bandPath(start + inset, end - inset, RING_OUTER - 7, RING_OUTER - 4);
}

/**
 * The ring: eight wedges around the press point. A stroke or a click on a wedge runs it, and a
 * wedge with a rim opens another ring in its place.
 */
function CommandRing({ editor }: Readonly<{ editor: EditorController }>) {
  const menu = editor.ui.menu!;
  const entries = ringEntries(commandContext(editor), menu.subRing, menu.back);
  const count = RING_COUNT;
  const size = RING_OUTER * 2 + 4;
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
            onChoose={() => chooseRingEntry(editor, entry, index)}
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

/** How a wedge announces and marks itself: a mode is a radio, the ways out read as asides. */
function wedgeRole(entry: MenuEntry, active: boolean) {
  const classes = ["ring-wedge"];
  if (entry.kind === "more" || entry.kind === "back") classes.push("more");
  // A wedge that cannot be chosen now keeps its place and its name, greyed out.
  if (entry.disabled) classes.push("empty", "unavailable");
  else if (active) classes.push("active");
  if (entry.kind !== "mode")
    return {
      className: classes.join(" "),
      role: "menuitem",
      "aria-disabled": entry.disabled,
      "aria-haspopup": entry.kind === "ring" ? ("menu" as const) : undefined,
    };
  if (entry.current) classes.push("current");
  return { className: classes.join(" "), role: "menuitemradio", "aria-checked": entry.current };
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
  const text = entry.short;
  const colorIndex = entry.id.startsWith("colour.") ? Number(entry.id.slice(7)) : -1;
  const color = COLORS[colorIndex];
  const reset = entry.id === "colour.clear";
  const colorName = ["Yellow", "Rose", "Blue", "Green", "Purple", "White"][colorIndex];
  const short = text.length > 11 ? `${text.slice(0, 10)}…` : text;
  return (
    <g
      {...wedgeRole(entry, active)}
      tabIndex={0}
      aria-label={entry.label}
      data-hint={color ? `Fill ${colorName}` : entry.label}
      data-hint-detail={color || entry.help}
      onClick={onChoose}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onChoose();
        }
      }}
    >
      <path d={wedgePath(index, count)} />
      {entry.kind === "ring" && <path className="ring-rim" d={rimPath(index, count)} />}
      {color ? (
        <circle cx={label.x} cy={label.y} r={13} fill={color} stroke="#8991a6" />
      ) : (
        <text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="middle">
          {reset ? "Reset" : short}
        </text>
      )}
    </g>
  );
}

/** One command in the menu, with its shortcut. */
function MenuItem({ editor, entry }: Readonly<{ editor: EditorController; entry: MenuEntry }>) {
  const shortcut = findCommand(entry.id).shortcuts?.[0];
  const { disabled } = entry;
  return (
    <li role="none">
      <button
        type="button"
        role="menuitem"
        aria-disabled={disabled}
        data-hint={entry.label}
        data-hint-detail={entry.help}
        onClick={() => {
          if (disabled) return;
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
  entry: Extract<MenuEntry, { kind: "submenu" }>;
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
        aria-disabled={entry.disabled}
        data-hint={entry.label}
        data-hint-detail={entry.help}
        onClick={() => !entry.disabled && onOpen(open ? null : entry.id)}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" && !entry.disabled) onOpen(entry.id);
          if (event.key === "ArrowLeft") onOpen(null);
        }}
      >
        <span>{entry.label}</span>
        <ChevronRight size={13} aria-hidden="true" />
      </button>
      {open && (
        <ul className="context-submenu" role="menu" aria-label={entry.label}>
          {entry.submenu.map((inner) => (
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
              entry.kind === "submenu" ? (
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
    const centre = ringCentre(menu.at, area.width, area.height);
    const x = menu.ring ? centre.x : Math.max(8, Math.min(menu.at.x, area.width - box.width - 8));
    const y = menu.ring ? centre.y : Math.max(8, Math.min(menu.at.y, area.height - box.height - 8));
    Object.assign(ref.current.style, { left: `${x}px`, top: `${y}px` });
  });
  // The menu starts on its first command. The ring takes focus as a whole, so no wedge looks
  // chosen before the pointer or the arrow keys reach one.
  useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>(
      ".context-menu [role=menuitem]:not([aria-disabled=true])"
    );
    (first ?? ref.current)?.focus({ preventScroll: true });
  }, [menu?.ring, menu?.subRing]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu(editor);
        editor.element.focus({ preventScroll: true });
        return;
      }
      if (!["Tab", "ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      focusMenuEntry(ref.current, event);
    };
    const onDown = (event: PointerEvent) => {
      if (event.button === 2) return;
      if (!(event.target instanceof Node) || !ref.current?.contains(event.target))
        closeMenu(editor);
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [editor]);
  if (!menu) return null;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      className={menu.ring ? "menu-anchor" : "menu-anchor menu-only"}
      data-testid="context-menu"
    >
      {menu.ring ? <CommandRing editor={editor} /> : <MenuList editor={editor} />}
    </div>
  );
}

function focusMenuEntry(menu: HTMLDivElement | null, event: KeyboardEvent) {
  const entries = [
    ...(menu?.querySelectorAll<HTMLElement | SVGElement>(
      "[role=menuitem]:not([aria-disabled=true]), [role=menuitemradio]"
    ) ?? []),
  ];
  const current = entries.findIndex((entry) => entry === document.activeElement);
  const backwards = event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey);
  let index = (current + (backwards ? -1 : 1) + entries.length) % entries.length;
  if (event.key === "Home") index = 0;
  if (event.key === "End") index = entries.length - 1;
  entries[index]?.focus();
}
