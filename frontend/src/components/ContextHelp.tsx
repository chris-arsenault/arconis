import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Hint = { anchor: Element; label: string; detail: string };
type HelpEvents = {
  anchor: Element | null;
  shown: boolean;
  pressed: boolean;
  touch: boolean;
  held: boolean;
  show(target: EventTarget | null, delay: number, held?: boolean): void;
  clear(): void;
  cancelTimer(): void;
};
const ID = "context-help";

function hintAt(target: EventTarget | null): Hint | null {
  const anchor =
    target instanceof Element
      ? target.closest("[data-hint], button[aria-label], [role=menuitem][aria-label]")
      : null;
  const label = anchor?.getAttribute("data-hint") || anchor?.getAttribute("aria-label");
  return anchor && label
    ? { anchor, label, detail: anchor.getAttribute("data-hint-detail") || "" }
    : null;
}

/** A touch hold opens help without also activating the control on release. */
function pointerHelp(events: HelpEvents, signal: AbortSignal) {
  let origin = { x: 0, y: 0 };
  document.addEventListener(
    "pointerdown",
    (event) => {
      events.clear();
      events.pressed = true;
      events.touch = event.pointerType === "touch";
      origin = { x: event.clientX, y: event.clientY };
      if (events.touch) events.show(event.target, 450, true);
    },
    { signal, capture: true }
  );
  document.addEventListener(
    "pointermove",
    (event) => {
      if (!events.pressed || !events.touch) return;
      if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 8) events.clear();
    },
    { signal, capture: true }
  );
  document.addEventListener(
    "pointerup",
    () => {
      events.pressed = false;
      if (events.held) events.cancelTimer();
      else if (events.touch) events.clear();
    },
    { signal, capture: true }
  );
  document.addEventListener(
    "pointercancel",
    () => {
      events.pressed = false;
      events.clear();
    },
    { signal, capture: true }
  );
  document.addEventListener(
    "click",
    (event) => {
      if (!events.held) return;
      const heldControl = event.target instanceof Node && events.anchor?.contains(event.target);
      events.held = false;
      if (!heldControl) return;
      event.preventDefault();
      event.stopPropagation();
    },
    { signal, capture: true }
  );
}

function focusHelp(events: HelpEvents, signal: AbortSignal) {
  document.addEventListener(
    "pointerover",
    (event) => {
      if (event.pointerType !== "touch" && !events.pressed) events.show(event.target, 180);
    },
    { signal }
  );
  document.addEventListener(
    "pointerout",
    (event) => {
      if (event.pointerType === "touch") return;
      if (!(event.relatedTarget instanceof Node) || !events.anchor?.contains(event.relatedTarget))
        events.clear();
    },
    { signal }
  );
  document.addEventListener(
    "focusin",
    (event) => {
      if (!events.touch && !events.pressed) events.show(event.target, 0);
    },
    { signal }
  );
  document.addEventListener(
    "focusout",
    () => {
      if (!events.touch) events.clear();
    },
    { signal }
  );
  document.addEventListener(
    "keydown",
    (event) => {
      events.touch = false;
      events.held = false;
      if (event.key === "Enter" || event.key === " ") {
        events.clear();
        return;
      }
      if (event.key !== "Escape" || !events.shown) return;
      events.clear();
      // Menus, dialogs and drafts keep their own Escape behavior.
      const scope =
        event.target instanceof Element &&
        event.target.closest("input, textarea, select, dialog, [role=dialog], [role=menu]");
      if (scope) return;
      event.preventDefault();
      event.stopPropagation();
    },
    { signal, capture: true }
  );
  document.addEventListener("scroll", events.clear, { signal, capture: true });
  window.addEventListener("resize", events.clear, { signal });
}

function bindHelp(setHint: (hint: Hint | null) => void) {
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const events: HelpEvents = {
    anchor: null,
    shown: false,
    pressed: false,
    touch: false,
    held: false,
    cancelTimer: () => clearTimeout(timer),
    clear: () => {
      clearTimeout(timer);
      events.anchor = null;
      events.shown = false;
      events.held = false;
      setHint(null);
    },
    show: (target, delay, held = false) => {
      const hint = hintAt(target);
      if (hint && events.anchor?.isSameNode(hint.anchor)) return;
      events.clear();
      if (!hint) return;
      events.anchor = hint.anchor;
      timer = setTimeout(() => {
        if (!hint.anchor.isConnected) return;
        events.shown = true;
        events.held = held;
        setHint(hint);
      }, delay);
    },
  };
  pointerHelp(events, abort.signal);
  focusHelp(events, abort.signal);
  return () => {
    abort.abort();
    events.cancelTimer();
  };
}

/** One lightweight help surface for hover, keyboard focus and touch-and-hold. */
export function ContextHelp() {
  const [hint, setHint] = useState<Hint | null>(null);
  const popup = useRef<HTMLDivElement>(null);
  useEffect(() => bindHelp(setHint), []);
  const anchor = hint?.anchor;
  useEffect(() => {
    if (!anchor) return;
    const observer = new MutationObserver(() => setHint(hintAt(anchor)));
    observer.observe(anchor, {
      attributes: true,
      attributeFilter: ["data-hint", "data-hint-detail", "aria-label"],
    });
    return () => observer.disconnect();
  }, [anchor]);
  useLayoutEffect(() => {
    if (!hint || !popup.current) return;
    const previous = hint.anchor.getAttribute("aria-describedby");
    hint.anchor.setAttribute("aria-describedby", [previous, ID].filter(Boolean).join(" "));
    const anchor = hint.anchor.getBoundingClientRect();
    const box = popup.current.getBoundingClientRect();
    popup.current.style.left = `${Math.max(8, Math.min(anchor.left + anchor.width / 2 - box.width / 2, window.innerWidth - box.width - 8))}px`;
    popup.current.style.top = `${Math.max(8, Math.min(anchor.top > box.height + 16 ? anchor.top - box.height - 8 : anchor.bottom + 8, window.innerHeight - box.height - 8))}px`;
    return () => {
      if (previous) hint.anchor.setAttribute("aria-describedby", previous);
      else hint.anchor.removeAttribute("aria-describedby");
    };
  }, [hint]);
  return (
    hint &&
    createPortal(
      <div ref={popup} id={ID} role="tooltip" className="context-help">
        <strong>{hint.label}</strong>
        {hint.detail && <span>{hint.detail}</span>}
      </div>,
      document.body
    )
  );
}
