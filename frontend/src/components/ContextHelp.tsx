import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HELP_DETAIL_ID, helpZone, type Help } from "../help/zone";

/**
 * Hover, keyboard focus and touch-and-hold feed two surfaces. Help, the name of a control and
 * one sentence about it, goes to the help zone at the foot of the left rail. Information about
 * content or people, marked `data-tip`, opens a small floating tooltip beside it.
 */
type Tip = { anchor: Element; text: string };

const TIP_ID = "context-tip";
const CONTROLS =
  "[data-hint], [data-hint-detail], button, a[href], input, select, textarea, label, summary, " +
  "[role=menuitem], [role=menuitemcheckbox], [role=menuitemradio], [role=tab], [role=radio], " +
  "[role=switch], [role=option], [role=slider]";

function nameOf(anchor: Element) {
  const labelled =
    anchor instanceof HTMLInputElement ||
    anchor instanceof HTMLSelectElement ||
    anchor instanceof HTMLTextAreaElement
      ? anchor.labels?.[0]?.textContent
      : null;
  return (
    anchor.getAttribute("data-hint") ||
    anchor.getAttribute("aria-label") ||
    labelled ||
    anchor.textContent ||
    ""
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/** A control's sentence, shared between a form field and its label so either one explains it. */
export function helpDetail(anchor: Element) {
  return (
    anchor.getAttribute("data-hint-detail") ||
    partnerOf(anchor)?.getAttribute("data-hint-detail") ||
    ""
  );
}

function partnerOf(anchor: Element): Element | null | undefined {
  if (anchor instanceof HTMLLabelElement) return anchor.control;
  const field =
    anchor instanceof HTMLInputElement ||
    anchor instanceof HTMLSelectElement ||
    anchor instanceof HTMLTextAreaElement;
  return field ? anchor.labels?.[0] : null;
}

/** The control under a target, skipping the help zone's own readout. */
export function helpAt(target: EventTarget | null): Help | null {
  const anchor = target instanceof Element ? target.closest(CONTROLS) : null;
  if (!anchor || anchor.closest(".help-zone-readout")) return null;
  const label = nameOf(anchor);
  const detail = helpDetail(anchor);
  return label || detail
    ? {
        anchor,
        label,
        detail,
        topic: anchor.closest("[data-help-topic]")?.getAttribute("data-help-topic") ?? "",
      }
    : null;
}

function tipAt(target: EventTarget | null): Tip | null {
  const anchor = target instanceof Element ? target.closest("[data-tip]") : null;
  const text = anchor?.getAttribute("data-tip");
  return anchor && text ? { anchor, text } : null;
}

const publish = (help: Help | null) => helpZone.publish(help);

/** Adds an id to an element's descriptions and returns how to take it away again. */
function describe(anchor: Element, id: string) {
  const ids = () => (anchor.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean);
  if (ids().includes(id)) return () => {};
  anchor.setAttribute("aria-describedby", [...ids(), id].join(" "));
  // Only this id comes off; descriptions the control gained meanwhile stay.
  return () => {
    const rest = ids().filter((other) => other !== id);
    if (rest.length) anchor.setAttribute("aria-describedby", rest.join(" "));
    else anchor.removeAttribute("aria-describedby");
  };
}

type HelpEvents = {
  anchor: Element | null;
  tip: boolean;
  pressed: boolean;
  touch: boolean;
  held: boolean;
  show(target: EventTarget | null, delay: number, held?: boolean): void;
  clear(): void;
  clearTip(): void;
  cancelTimer(): void;
};

/** A touch hold shows help without also activating the control on release. */
function pointerHelp(events: HelpEvents, signal: AbortSignal) {
  let origin = { x: 0, y: 0 };
  document.addEventListener(
    "pointerdown",
    (event) => {
      events.pressed = true;
      events.touch = event.pointerType === "touch";
      origin = { x: event.clientX, y: event.clientY };
      events.clearTip();
      if (events.touch) {
        events.clear();
        events.show(event.target, 450, true);
      }
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
        events.clearTip();
        return;
      }
      if (event.key !== "Escape" || !events.tip) return;
      events.clearTip();
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
  document.addEventListener("scroll", events.clearTip, { signal, capture: true });
  window.addEventListener("resize", events.clearTip, { signal });
}

/** Follows live changes to the help or information an element carries. */
function watch(nodes: (Element | null | undefined)[], onChange: () => void) {
  const observer = new MutationObserver(onChange);
  for (const node of new Set(nodes))
    if (node)
      observer.observe(node, {
        attributes: true,
        attributeFilter: ["data-hint", "data-hint-detail", "aria-label", "data-tip"],
      });
  return observer;
}

function bindHelp(setTip: (tip: Tip | null) => void) {
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let observer: MutationObserver | null = null;
  let undescribe = () => {};
  let tipAnchor: Element | null = null;
  const showHelp = (shown: Help | null | undefined) => {
    if (!shown) return;
    undescribe();
    const help = shown.anchor.isConnected ? helpAt(shown.anchor) : null;
    publish(help);
    undescribe =
      help?.detail && document.getElementById(HELP_DETAIL_ID)
        ? describe(shown.anchor, HELP_DETAIL_ID)
        : () => {};
  };
  const refresh = (help: Help | null) => {
    if (help && helpZone.snapshot()?.anchor === help.anchor) showHelp(help);
    if (events.tip && tipAnchor) setTip(tipAt(tipAnchor));
  };
  // Pointing and focusing update the zone at once; a touch hold waits for its delay.
  const reveal = (anchor: Element, help: Help | null, held: boolean) => {
    if (!anchor.isConnected) return;
    events.held = held;
    if (held) showHelp(help);
    if (!tipAnchor) return;
    events.tip = true;
    setTip(tipAt(tipAnchor));
  };
  const events: HelpEvents = {
    anchor: null,
    tip: false,
    pressed: false,
    touch: false,
    held: false,
    cancelTimer: () => clearTimeout(timer),
    clearTip: () => {
      events.tip = false;
      setTip(null);
    },
    clear: () => {
      clearTimeout(timer);
      observer?.disconnect();
      observer = null;
      undescribe();
      undescribe = () => {};
      events.anchor = null;
      tipAnchor = null;
      events.held = false;
      events.clearTip();
      publish(null);
    },
    show: (target, delay, held = false) => {
      const help = helpAt(target);
      const tip = tipAt(target);
      const anchor = help?.anchor ?? tip?.anchor;
      if (!anchor) return events.clear();
      if (events.anchor === anchor) return;
      events.clear();
      events.anchor = anchor;
      tipAnchor = tip ? tip.anchor : null;
      observer = watch([anchor, tipAnchor], () => refresh(help));
      if (!held) showHelp(help);
      timer = setTimeout(() => reveal(anchor, help, held), delay);
    },
  };
  pointerHelp(events, abort.signal);
  focusHelp(events, abort.signal);
  return () => {
    abort.abort();
    events.cancelTimer();
    observer?.disconnect();
    undescribe();
    publish(null);
  };
}

/**
 * Binds help for the whole workspace and shows information tooltips. Help itself appears in
 * the help zone, never in a floating popup.
 */
export function ContextHelp() {
  const [tip, setTip] = useState<Tip | null>(null);
  const popup = useRef<HTMLDivElement>(null);
  useEffect(() => bindHelp(setTip), []);
  useLayoutEffect(() => {
    if (!tip || !popup.current) return;
    const undescribe = describe(tip.anchor, TIP_ID);
    const anchor = tip.anchor.getBoundingClientRect();
    const box = popup.current.getBoundingClientRect();
    popup.current.style.left = `${Math.max(8, Math.min(anchor.left + anchor.width / 2 - box.width / 2, window.innerWidth - box.width - 8))}px`;
    popup.current.style.top = `${Math.max(8, Math.min(anchor.top > box.height + 16 ? anchor.top - box.height - 8 : anchor.bottom + 8, window.innerHeight - box.height - 8))}px`;
    return undescribe;
  }, [tip]);
  return (
    tip &&
    createPortal(
      <div ref={popup} id={TIP_ID} role="tooltip" className="context-tip">
        {tip.text}
      </div>,
      document.body
    )
  );
}
