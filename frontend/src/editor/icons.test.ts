import { it, expect, beforeAll } from "vitest";
import { iconEntries, iconImage, loadAllVendors, loadIcons, searchIcons } from "./icons";
import { objectStyle } from "./styles";
import type { Item, Look } from "../document/types";

beforeAll(loadIcons);

function icon(key: string, look: Record<string, unknown> = {}): Item {
  return {
    id: "a",
    type: "node",
    stencil: "icon",
    icon: key,
    name: "",
    subtitle: "",
    x: 0,
    y: 0,
    width: 64,
    height: 64,
    inside: "",
    from: "",
    to: "",
    points: [],
    order: 0,
    style: "",
    look: look as Look,
    onLine: "",
  };
}

it("resolves only keys from the local icon sets", () => {
  expect(iconImage("lucide:Database")).toContain("data:image/svg+xml");
  expect(iconImage("brand:docker")).toContain("data:image/svg+xml");
  expect(iconImage("https://evil.example/x.svg")).toBeNull();
  expect(iconImage('<svg onload="alert(1)">')).toBeNull();
  expect(iconImage(42)).toBeNull();
});

it("accepts only hex colors in generated icon markup", () => {
  const hostile = decodeURIComponent(iconImage("lucide:Database", '"/><script>x</script>')!);
  expect(hostile).not.toContain("<script>");
  expect(decodeURIComponent(iconImage("lucide:Database", "#ff0000")!)).toContain("#ff0000");
});

it("never lets what a peer writes choose an image URL", () => {
  const hostile = objectStyle(icon("lucide:Database", { image: "https://evil.example/x" }));
  expect(hostile.image).toContain("data:image/svg+xml");
  expect(objectStyle(icon("https://evil.example/x")).image).toBeUndefined();
  const shape = objectStyle({
    ...icon("", { image: "https://evil.example/x", shape: "image" }),
    stencil: "rectangle",
  });
  expect(shape.image).toBeUndefined();
  expect(shape.shape).toBe("rectangle");
});

it("loads vendor sets containing no active content", async () => {
  await loadAllVendors();
  const entries = iconEntries();
  for (const prefix of ["aws:", "azure:", "gcp:"]) {
    const vendor = entries.filter((entry) => entry.key.startsWith(prefix));
    expect(vendor.length).toBeGreaterThan(100);
    for (const { key } of vendor) {
      const markup = decodeURIComponent(iconImage(key)!);
      expect(markup).not.toMatch(/<script|<foreignObject|\son[a-z]+\s*=|javascript:/i);
    }
  }
  expect(searchIcons("s3", 5).map((entry) => entry.title)).toContain(
    "Amazon Simple Storage Service"
  );
  expect(searchIcons("lambda", 5).map((entry) => entry.title)).toContain("AWS Lambda");
  // A whole-word match outranks a word that merely contains the search.
  const titles = searchIcons("s3", 60).map((entry) => entry.title);
  expect(titles.indexOf("Amazon Simple Storage Service")).toBeLessThan(titles.indexOf("Axis3 D"));
});

it("strips rotation from vendor icons whatever a peer writes", () => {
  const style = objectStyle(icon("aws:AWS-Lambda", { rotation: 45 }));
  expect(style.rotation).toBeUndefined();
  expect(style.aspect).toBe("fixed");
  expect(style.rotatable).toBe(false);
  expect(objectStyle(icon("lucide:Database", { rotation: 45 })).rotation).toBe(45);
});

it("offers both icon sets for search", () => {
  const titles = iconEntries().map((entry) => entry.title);
  expect(titles).toContain("Kubernetes");
  expect(titles).toContain("Hard Drive");
});
