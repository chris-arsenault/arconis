/** A catalog entry. Documents store only `key`; markup always comes from the local icon sets. */
export interface IconEntry {
  key: string;
  title: string;
  search: string;
}
type IconNode = [string, Record<string, string | number | undefined>][];
type Renderer = (color: string) => string;

const DEFAULT_COLOR = "#283249";
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const renderers = new Map<string, Renderer>();
const catalog: IconEntry[] = [];
const listeners = new Set<() => void>();
let loading: Promise<void> | null = null;
let version = 0;

function attributes(values: Record<string, string | number | undefined>) {
  return Object.entries(values)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => `${name}="${String(value)}"`)
    .join(" ");
}

function lucideRenderer(node: IconNode): Renderer {
  const body = node.map(([tag, values]) => `<${tag} ${attributes(values)}/>`).join("");
  return (color) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

function words(name: string) {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

/** Loads the icon sets once. Peers' icon keys only resolve against what this adds. */
export function loadIcons() {
  loading ??= import("./iconData").then(({ brandIcons, lucideIcons }) => {
    Object.entries(lucideIcons).forEach(([name, node]) => {
      const key = `lucide:${name}`;
      renderers.set(key, lucideRenderer(node as unknown as IconNode));
      catalog.push({ key, title: words(name), search: words(name).toLowerCase() });
    });
    brandIcons.forEach((icon) => {
      const key = `brand:${icon.slug}`;
      const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#${icon.hex}"><path d="${icon.path}"/></svg>`;
      renderers.set(key, () => markup);
      catalog.push({ key, title: icon.title, search: icon.title.toLowerCase() });
    });
    version++;
    listeners.forEach((listener) => listener());
  });
  return loading;
}

export function subscribeIcons(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export const iconsVersion = () => version;

export function iconEntries() {
  return catalog;
}
export function iconEntry(key: string) {
  return catalog.find((entry) => entry.key === key);
}

/** Returns an image for a known icon key, or null for unknown keys and while loading. */
export function iconImage(key: unknown, color: unknown = DEFAULT_COLOR) {
  const render = typeof key === "string" ? renderers.get(key) : undefined;
  if (!render) return null;
  const safeColor = typeof color === "string" && HEX_COLOR.test(color) ? color : DEFAULT_COLOR;
  return `data:image/svg+xml,${encodeURIComponent(render(safeColor))}`;
}
