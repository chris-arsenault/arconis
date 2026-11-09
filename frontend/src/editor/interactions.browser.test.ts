import { it, expect } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import { browser, errors, open, add, row, exported, objectCount } from "./browserHarness";

async function peerText(
  page: Page,
  value: string,
  mode: "keystrokes" | "replacement",
  prefix = false
) {
  const input = page.getByLabel("Object text", { exact: true });
  if (mode === "replacement") await input.fill(value);
  else {
    const before = await input.inputValue();
    await input.press(prefix ? "ControlOrMeta+Home" : "ControlOrMeta+End");
    await input.pressSequentially(
      prefix ? value.slice(0, value.length - before.length) : value.slice(before.length)
    );
  }
  await input.press("ControlOrMeta+Enter");
}

it("cancels an unfinished connector before starting another relationship", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await open(context, createRoomId());
  await add(page, "Rectangle (R)", "Source A", 220, 170);
  await add(page, "Rectangle (R)", "Target B", 500, 170);
  await add(page, "Sticky note (N)", "Source C", 220, 450);
  const canvas = page.getByTestId("canvas");
  const connector = page.getByRole("button", {
    name: "Connector: click two objects (C)",
    exact: true,
  });
  await connector.click();
  await canvas.click({ position: { x: 230, y: 180 } });
  await canvas.press("Escape");
  await connector.click();
  await canvas.click({ position: { x: 230, y: 460 } });
  expect(await objectCount(page)).toBe(3);
  await canvas.click({ position: { x: 510, y: 180 } });
  await expect.poll(() => objectCount(page)).toBe(4);
  const saved = await exported(page);
  const edge = saved.objects.find((item) => item.type === "line")!;
  expect(saved.objects.find((item) => item.id === edge.from)?.name).toBe("Source C");
  expect(saved.objects.find((item) => item.id === edge.to)?.name).toBe("Target B");
  expect(errors).toEqual([]);
  await context.close();
});

it.each(["keystrokes", "replacement"] as const)(
  "preserves active text selections and inline geometry through peer edits (%s)",
  async (mode) => {
    const first = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const second = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const room = createRoomId();
    const a = await open(first, room);
    await add(a, "Sticky note (N)", "abcdef", 220, 170);
    const b = await open(second, room);
    await row(b, "abcdef").waitFor();
    await row(b, "abcdef").click();
    await row(a, "abcdef").dblclick();
    const inline = a.getByLabel("Edit canvas text", { exact: true });
    await inline.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(2, 2));
    await peerText(b, "abcdef!", mode);
    await expect.poll(() => inline.inputValue()).toBe("abcdef!");
    expect(await inline.evaluate((element: HTMLTextAreaElement) => element.selectionStart)).toBe(2);
    await inline.pressSequentially("X");
    await b.getByLabel("Object x", { exact: true }).fill("450");
    await b.getByLabel("Object y", { exact: true }).fill("400");
    await b.getByLabel("Object width", { exact: true }).fill("300");
    await b.getByLabel("Object width", { exact: true }).press("Tab");
    await expect.poll(() => inline.evaluate((element) => element.style.left)).toBe("510px");
    await expect.poll(() => inline.evaluate((element) => element.style.top)).toBe("460px");
    await expect.poll(() => inline.evaluate((element) => element.style.width)).toBe("300px");
    expect(await inline.evaluate((element) => element === document.activeElement)).toBe(true);
    await inline.press("Escape");
    await expect
      .poll(() => b.getByLabel("Object text", { exact: true }).inputValue())
      .toBe("abXcdef!");
    const inspector = a.getByLabel("Object text", { exact: true });
    await inspector.focus();
    await inspector.evaluate((element: HTMLTextAreaElement) =>
      element.setSelectionRange(2, 4, "backward")
    );
    await peerText(b, "QabXcdef!", mode, true);
    await expect.poll(() => inspector.inputValue()).toBe("QabXcdef!");
    expect(
      await inspector.evaluate((element: HTMLTextAreaElement) => [
        element.selectionStart,
        element.selectionEnd,
        element.selectionDirection,
      ])
    ).toEqual([3, 5, "backward"]);
    expect(errors).toEqual([]);
    await first.close();
    await second.close();
  }
);

it.each(["keystrokes", "replacement"] as const)(
  "keeps composition text and concurrent peer edits in the same label (%s)",
  async (mode) => {
    const first = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const second = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const room = createRoomId();
    const a = await open(first, room);
    await add(a, "Sticky note (N)", "ab", 220, 170);
    const b = await open(second, room);
    await row(b, "ab").waitFor();
    await row(b, "ab").click();
    await row(a, "ab").dblclick();
    const inline = a.getByLabel("Edit canvas text", { exact: true });
    await inline.evaluate((element: HTMLTextAreaElement) => {
      element.setSelectionRange(1, 1);
      element.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
      element.value = "a漢b";
      element.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          isComposing: true,
          inputType: "insertCompositionText",
          data: "漢",
        })
      );
    });
    await peerText(b, "ab!", mode);
    await row(a, "ab!").waitFor();
    expect(await inline.inputValue()).toBe("a漢b");
    await inline.evaluate((element) =>
      element.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "漢" }))
    );
    await expect.poll(() => inline.inputValue()).toBe("a漢b!");
    await inline.press("ControlOrMeta+z");
    await expect.poll(() => inline.inputValue()).toBe("ab!");
    await inline.press("ControlOrMeta+Shift+z");
    await expect.poll(() => inline.inputValue()).toBe("a漢b!");
    await inline.press("Escape");
    await expect
      .poll(() => b.getByLabel("Object text", { exact: true }).inputValue())
      .toBe("a漢b!");
    expect(errors).toEqual([]);
    await first.close();
    await second.close();
  }
);
