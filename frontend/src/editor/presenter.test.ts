import { describe, expect, it } from "vitest";
import { CanvasDocument } from "../document/canvasDocument";
import type { Item } from "../document/types";
import { Presenter, type Stage } from "./presenter";

function setup() {
  const document = new CanvasDocument();
  const shown: string[] = [];
  let cleared = 0;
  const stage: Stage = {
    document,
    show: (slide: Item) => shown.push(slide.id),
    clear: () => cleared++,
    project: () => {},
    emit: () => {},
  };
  const slide = (id: string, number: number, deck = "pitch") =>
    document.insert(document.build("slide", 0, 0, { id, deck, slide: number }));
  return { document, stage, shown, cleared: () => cleared, slide };
}

describe("a presentation", () => {
  it("walks a deck in number order and stays within it", () => {
    const { stage, shown, cleared, slide } = setup();
    slide("b", 2);
    slide("a", 1);
    slide("c", 3);
    slide("other", 1, "agenda");
    const presenter = new Presenter(stage);
    expect(presenter.active).toBe(false);
    presenter.start("pitch");
    expect(presenter.active).toBe(true);
    expect(cleared()).toBe(1);
    expect(presenter.slide()?.id).toBe("a");
    expect([presenter.index(), presenter.slides().length]).toEqual([1, 3]);
    presenter.go(1);
    presenter.go(1);
    presenter.go(1);
    expect(presenter.slide()?.id).toBe("c");
    presenter.go(-1);
    expect(presenter.slide()?.id).toBe("b");
    presenter.refit();
    expect(shown).toEqual(["b", "c", "b", "b"]);
    presenter.stop();
    expect(presenter.active).toBe(false);
    expect(presenter.slide()).toBeNull();
  });

  it("starts at a chosen slide, follows peers' changes and falls back when a slide goes", () => {
    const { document, stage, slide } = setup();
    slide("a", 1);
    slide("b", 2);
    slide("c", 3);
    const presenter = new Presenter(stage);
    presenter.start("pitch", "b");
    expect(presenter.index()).toBe(2);
    // A peer renumbers: the shown slide keeps its identity and its counter follows.
    document.patch("b", { slide: 9 });
    expect([presenter.slide()?.id, presenter.index()]).toEqual(["b", 3]);
    // A peer adds a slide: it joins the walk.
    slide("d", 4);
    expect(presenter.slides().map((item) => item.id)).toEqual(["a", "c", "d", "b"]);
    // The shown slide is deleted: the slide now at its place shows.
    presenter.go(-1);
    expect(presenter.slide()?.id).toBe("d");
    document.remove(["d"]);
    expect(presenter.slide()?.id).toBe("b");
    document.remove(["a", "b", "c"]);
    expect(presenter.slide()).toBeNull();
    expect(presenter.index()).toBe(0);
  });
});
