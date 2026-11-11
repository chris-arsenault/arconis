/** One slide of an exported deck: its name and its drawing as SVG markup. */
export interface PageSlide {
  name: string;
  svg: string;
}

/** The slides' size in canvas units, which a printed page takes. */
export interface PageSize {
  width: number;
  height: number;
}

const escape = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/**
 * The page's own styles. They never set a colour or font the slides could inherit, so a label
 * draws as it does on the canvas. A slide that is not shown is not laid out at all, because the
 * canvas marks its shapes visible whatever holds them.
 */
const pageCss = ({ width, height }: PageSize) => `
html, body { height: 100%; margin: 0; background: #16181f; }
main { position: fixed; inset: 0 0 48px; }
.slide { position: absolute; inset: 12px; display: none; }
.slide.shown { display: block; }
.slide > svg { display: block; width: 100%; height: 100%; }
.shared { position: absolute; width: 0; height: 0; }
nav { position: fixed; inset: auto 0 0; height: 48px; display: flex; align-items: center;
  justify-content: center; gap: 12px; color: #e6e8f0; font: 14px system-ui, sans-serif; }
nav button { min-width: 40px; height: 32px; padding: 0 10px; border: 1px solid #454a5c; border-radius: 6px;
  background: #23262f; color: inherit; font: inherit; cursor: pointer; }
nav button:disabled { opacity: 0.4; cursor: default; }
#count { min-width: 64px; text-align: center; font-variant-numeric: tabular-nums; }
@page { size: ${width}px ${height}px; margin: 0; }
@media print {
  html, body { height: auto; background: #ffffff; }
  main { position: static; }
  .slide { position: static; display: block; width: 100vw; height: 100vh; break-after: page; }
  nav { display: none; }
}`;

/** Moves through the slides by key, button and swipe, and keeps the place in the address. */
const PAGE_SCRIPT = `
const slides = [...document.querySelectorAll(".slide")];
const count = document.getElementById("count");
const back = document.getElementById("back");
const next = document.getElementById("next");
let at = 0;
function show(index) {
  at = Math.max(0, Math.min(slides.length - 1, index));
  slides.forEach((slide, i) => {
    slide.classList.toggle("shown", i === at);
    slide.setAttribute("aria-hidden", String(i !== at));
  });
  count.textContent = at + 1 + " / " + slides.length;
  back.disabled = at === 0;
  next.disabled = at === slides.length - 1;
  if (location.hash !== "#" + (at + 1)) location.replace("#" + (at + 1));
}
const fromAddress = () => show((Number.parseInt(location.hash.slice(1), 10) || 1) - 1);
const full = () =>
  document.fullscreenElement
    ? document.exitFullscreen()
    : document.documentElement.requestFullscreen().catch(() => undefined);
const keys = {
  ArrowRight: () => show(at + 1), PageDown: () => show(at + 1), " ": () => show(at + 1),
  ArrowLeft: () => show(at - 1), PageUp: () => show(at - 1),
  Home: () => show(0), End: () => show(slides.length - 1), f: full,
};
addEventListener("keydown", (event) => {
  const act = keys[event.key];
  if (!act || event.ctrlKey || event.metaKey || event.altKey) return;
  event.preventDefault();
  act();
});
back.addEventListener("click", () => show(at - 1));
next.addEventListener("click", () => show(at + 1));
document.getElementById("full").addEventListener("click", full);
let touch = null;
addEventListener("touchstart", (event) => { touch = event.touches.length === 1 ? event.touches[0].clientX : null; });
addEventListener("touchend", (event) => {
  if (touch === null) return;
  const moved = event.changedTouches[0].clientX - touch;
  if (Math.abs(moved) > 50) show(at + (moved < 0 ? 1 : -1));
  touch = null;
});
addEventListener("hashchange", fromAddress);
fromAddress();`;

/** What an exported deck's page is made from. */
export interface DeckPage {
  title: string;
  slides: PageSlide[];
  /** The text styles the slides share. */
  css: string;
  /** SVG markup for the gradients and clips the slides draw from, kept where it is always laid out. */
  definitions: string;
  size: PageSize;
}

/**
 * A deck as one HTML document that needs nothing else: every slide's drawing, what they share,
 * and a script to move through them. `css`, `definitions` and each slide's `svg` are trusted
 * markup the export drew; titles and names are text.
 */
export function deckPage({ title, slides, css, definitions, size }: DeckPage) {
  const sections = slides.map(
    ({ name, svg }, index) =>
      `<section class="slide${index ? "" : " shown"}" aria-label="${escape(
        name ? `Slide ${index + 1}: ${name}` : `Slide ${index + 1}`
      )}">${svg}</section>`
  );
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escape(title)}</title>`,
    `<style>${css}\n${pageCss(size)}</style>`,
    "</head>",
    "<body>",
    definitions,
    `<main>${sections.join("\n")}</main>`,
    "<nav>",
    '<button id="back" aria-label="Previous slide">&#8249;</button>',
    '<span id="count" aria-live="polite"></span>',
    '<button id="next" aria-label="Next slide">&#8250;</button>',
    '<button id="full">Full screen</button>',
    "</nav>",
    `<script>${PAGE_SCRIPT}</script>`,
    "</body>",
    "</html>",
  ].join("\n");
}
