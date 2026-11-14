import { useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { ChevronRight } from "lucide-react";
import type { EditorController } from "../editor/controller";
import { menuGroups, type MenuEntry } from "../editor/contextMenu";
import { commandContext, findCommand, runCommand } from "../editor/registry";
import { closeMenu } from "../editor/ui";
import { shortcutLabel } from "../editor/shortcuts";

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
 * One level of flyout commands. It flips at the window edge and supports pointer and arrow keys.
 */
function Submenu({
  editor,
  entry,
  open,
  onOpen,
  compact,
}: Readonly<{
  editor: EditorController;
  entry: Extract<MenuEntry, { kind: "submenu" }>;
  open: boolean;
  onOpen: (id: string | null) => void;
  compact: boolean;
}>) {
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  const focusOnOpen = useRef(false);
  useLayoutEffect(() => {
    if (open) positionSubmenu(trigger.current, menu.current, focusOnOpen.current);
  }, [open]);
  const reveal = (focus: boolean) => {
    if (entry.disabled) return;
    focusOnOpen.current = focus;
    onOpen(entry.id);
    if (focus)
      menu.current
        ?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')
        ?.focus();
  };
  return (
    <li
      role="none"
      className="has-submenu"
      onKeyDown={(event) => {
        if (!open || !["ArrowLeft", "Escape"].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        onOpen(null);
        trigger.current?.focus();
      }}
    >
      <button
        ref={trigger}
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-disabled={entry.disabled}
        data-hint={entry.label}
        data-hint-detail={entry.help}
        onPointerEnter={() => {
          if (!compact) reveal(false);
        }}
        onClick={() => reveal(true)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowRight" || entry.disabled) return;
          event.preventDefault();
          event.stopPropagation();
          reveal(true);
        }}
      >
        <span>{entry.label}</span>
        <ChevronRight size={13} aria-hidden="true" />
      </button>
      {open && !compact && (
        <ul ref={menu} className="context-submenu" role="menu" aria-label={entry.label}>
          {entry.submenu.map((inner) => (
            <MenuItem key={inner.id} editor={editor} entry={inner} />
          ))}
        </ul>
      )}
    </li>
  );
}

function positionSubmenu(
  trigger: HTMLButtonElement | null,
  menu: HTMLUListElement | null,
  focus: boolean
) {
  if (!menu || !trigger) return;
  const anchor = trigger.getBoundingClientRect();
  const frame = trigger.closest(".context-menu")?.getBoundingClientRect() ?? anchor;
  const { top, bottom } = trigger.closest(".canvas-area")?.getBoundingClientRect() ?? {
    top: 0,
    bottom: window.innerHeight,
  };
  menu.style.maxHeight = `${bottom - top - 16}px`;
  menu.style.maxWidth = `${Math.max(frame.left - 12, window.innerWidth - frame.right - 12)}px`;
  const box = menu.getBoundingClientRect();
  const right = frame.right + 4;
  const x = right + box.width <= window.innerWidth - 8 ? right : frame.left - box.width - 4;
  const y = Math.max(top + 8, Math.min(anchor.top, bottom - box.height - 8));
  Object.assign(menu.style, { left: `${Math.max(8, x)}px`, top: `${y}px` });
  if (focus)
    menu.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus();
}

/** Every applicable command, grouped by intent, with longer families folded into submenus. */
export function MenuList({ editor }: Readonly<{ editor: EditorController }>) {
  const groups = menuGroups(commandContext(editor));
  const [submenu, setSubmenu] = useState<string | null>(null);
  const compact = useSyncExternalStore(
    subscribeCompactMenu,
    () => window.matchMedia("(max-width: 650px)").matches
  );
  const active = compact
    ? groups.flat().find((entry) => entry.id === submenu && entry.kind === "submenu")
    : null;
  const ref = useRef<HTMLUListElement>(null);
  const previous = useRef<string | null>(null);
  const activeLabel = active?.label ?? null;
  useLayoutEffect(() => {
    if (activeLabel) {
      previous.current = activeLabel;
      ref.current?.querySelector<HTMLElement>('button:not([aria-disabled="true"])')?.focus();
    } else if (previous.current) {
      ref.current
        ?.querySelector<HTMLElement>(`[data-hint="${CSS.escape(previous.current)}"]`)
        ?.focus();
      previous.current = null;
    }
  }, [activeLabel]);
  if (active?.kind === "submenu")
    return <SubmenuPage editor={editor} entry={active} ref={ref} onBack={() => setSubmenu(null)} />;
  return (
    <ul ref={ref} className="context-menu" role="menu" aria-label="Canvas menu">
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
                  compact={compact}
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

function subscribeCompactMenu(update: () => void) {
  const media = window.matchMedia("(max-width: 650px)");
  media.addEventListener("change", update);
  return () => media.removeEventListener("change", update);
}

function SubmenuPage({
  editor,
  entry,
  ref,
  onBack,
}: Readonly<{
  editor: EditorController;
  entry: Extract<MenuEntry, { kind: "submenu" }>;
  ref: RefObject<HTMLUListElement | null>;
  onBack: () => void;
}>) {
  return (
    <ul
      ref={ref}
      className="context-menu context-submenu-page"
      role="menu"
      aria-label={entry.label}
      onKeyDown={(event) => {
        if (!["Escape", "ArrowLeft"].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        onBack();
      }}
    >
      <li role="none">
        <button role="menuitem" data-hint-detail="Return to the main canvas menu." onClick={onBack}>
          ← Back
        </button>
      </li>
      <li role="none" className="context-menu-title">
        {entry.label}
      </li>
      {entry.submenu.map((inner) => (
        <MenuItem key={inner.id} editor={editor} entry={inner} />
      ))}
    </ul>
  );
}
