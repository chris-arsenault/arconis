import { it, expect, beforeAll } from "vitest";
import { iconEntries, iconImage, loadIcons } from "./icons";
import { objectStyle } from "./styles";
import type { CanvasObject } from "../document/types";

beforeAll(loadIcons);

function icon(style: CanvasObject["style"]): CanvasObject {
  return {
    id: "a",
    kind: "icon",
    label: "",
    x: 0,
    y: 0,
    width: 64,
    height: 64,
    parent: "",
    source: "",
    target: "",
    points: "[]",
    order: 0,
    style,
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

it("never lets document style choose an image URL", () => {
  const hostile = objectStyle(icon({ icon: "lucide:Database", image: "https://evil.example/x" }));
  expect(hostile.image).toContain("data:image/svg+xml");
  expect(objectStyle(icon({ icon: "https://evil.example/x" })).image).toBeUndefined();
  const shape = objectStyle({ ...icon({ image: "https://evil.example/x" }), kind: "rectangle" });
  expect(shape.image).toBeUndefined();
});

it("offers both icon sets for search", () => {
  const titles = iconEntries().map((entry) => entry.title);
  expect(titles).toContain("Kubernetes");
  expect(titles).toContain("Hard Drive");
});
