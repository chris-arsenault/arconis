import { expect, it } from "vitest";
import type { Page } from "playwright";
import { createRoomId } from "../collaboration/room";
import { browser, errors, exported, objectCount, open, row } from "./browserHarness";

const VIEWPORT = { viewport: { width: 1440, height: 1000 } };

const NEAR = "#ff0000";
const FAR = "#0000ff";

/** The drawn shape filled with this colour; labels are too small to find when zoomed far out. */
const shape = (page: Page, fill: string) =>
  page.getByTestId("canvas").locator(`[fill="${fill}"]`).first();

async function centre(page: Page, fill: string) {
  const box = (await shape(page, fill).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Whether an object's middle is inside the canvas's window. */
async function inView(page: Page, fill: string) {
  const canvas = (await page.getByTestId("canvas").boundingBox())!;
  if ((await shape(page, fill).count()) === 0) return false;
  const box = await shape(page, fill).boundingBox();
  if (!box) return false;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  return (
    x > canvas.x && x < canvas.x + canvas.width && y > canvas.y && y < canvas.y + canvas.height
  );
}

const zoom = (page: Page) => page.getByTestId("zoom-level").textContent();

/** The zoom once a flight has finished: the same reading twice, a moment apart. */
async function settledZoom(page: Page) {
  let last = await zoom(page);
  await expect
    .poll(
      async () => {
        const before = last;
        await page.waitForTimeout(150);
        last = await zoom(page);
        return last === before;
      },
      { timeout: 5000 }
    )
    .toBe(true);
  return last;
}

it("peeks at the whole canvas while O is held and lands where the pointer was moved", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  await page.getByLabel("Import file").setInputFiles({
    name: "far.arconis",
    mimeType: "text/plain",
    buffer: Buffer.from(`arconis 1
node near "Near" at 0,0 size 160,90 fill ${NEAR}
node far "Far" at 6000,4000 size 160,90 fill ${FAR}`),
  });
  await shape(page, NEAR).waitFor();
  const canvas = page.getByTestId("canvas");

  // Zoom into Near: Far is far outside the window.
  const near = await centre(page, NEAR);
  await page.mouse.click(near.x, near.y);
  await canvas.press("z");
  await row(page, "Near").waitFor();
  await expect.poll(() => inView(page, FAR)).toBe(false);
  const close = await settledZoom(page);

  // Holding O shows everything.
  await page.keyboard.down("o");
  await expect.poll(() => inView(page, FAR)).toBe(true);
  expect(await inView(page, NEAR)).toBe(true);
  expect(await zoom(page)).not.toBe(close);

  // Releasing without pointing anywhere returns to the view held before.
  await page.keyboard.up("o");
  await expect.poll(() => zoom(page)).toBe(close);
  await expect.poll(() => inView(page, FAR)).toBe(false);
  expect(await inView(page, NEAR)).toBe(true);

  // Pointing at Far during the peek lands there at the same zoom.
  await page.keyboard.down("o");
  await expect.poll(() => inView(page, FAR)).toBe(true);
  await settledZoom(page);
  const far = await centre(page, FAR);
  await page.mouse.move(far.x, far.y, { steps: 5 });
  await page.keyboard.up("o");
  await expect.poll(() => zoom(page)).toBe(close);
  await expect.poll(() => inView(page, NEAR)).toBe(false);
  expect(await inView(page, FAR)).toBe(true);
  expect(errors).toEqual([]);
  await context.close();
});

it("keeps a placing tool in hand with Q until Escape", async () => {
  const context = await browser.newContext(VIEWPORT);
  const page = await open(context, createRoomId());
  const canvas = page.getByTestId("canvas");
  const rectangle = page.getByRole("button", { name: "Rectangle (R)", exact: true });

  // Ordinarily one click places one object and Select returns.
  await rectangle.click();
  await canvas.click({ position: { x: 300, y: 300 } });
  await expect.poll(() => objectCount(page)).toBe(1);
  expect(await rectangle.getAttribute("aria-pressed")).toBe("false");

  // With Q the tool stays: three clicks place three more.
  await canvas.press("q");
  await page.getByText("Tools stay in hand after placing").waitFor();
  await canvas.press("r");
  for (const x of [500, 700, 900]) await canvas.click({ position: { x, y: 300 } });
  await expect.poll(() => objectCount(page)).toBe(4);
  expect(await rectangle.getAttribute("aria-pressed")).toBe("true");

  // A note placed with the tool in hand does not open for typing.
  await canvas.press("n");
  await canvas.click({ position: { x: 500, y: 600 } });
  await canvas.click({ position: { x: 800, y: 600 } });
  await expect.poll(() => objectCount(page)).toBe(6);
  expect(await page.getByLabel("Edit canvas text", { exact: true }).count()).toBe(0);

  // Escape puts the tool away and ends keeping it.
  await canvas.press("Escape");
  await rectangle.click();
  await canvas.click({ position: { x: 1000, y: 700 } });
  await expect.poll(() => objectCount(page)).toBe(7);
  expect(await rectangle.getAttribute("aria-pressed")).toBe("false");
  expect((await exported(page)).objects.filter((item) => item.type === "note")).toHaveLength(2);
  expect(errors).toEqual([]);
  await context.close();
});
