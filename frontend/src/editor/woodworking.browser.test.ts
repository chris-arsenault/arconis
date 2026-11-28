import { expect, it } from "vitest";
import { createRoomId } from "../collaboration/room";
import { browser, exported, more, open, railPanel } from "./browserHarness";

it("places catalog lumber, edits the shared cut and places an end view with real controls", async () => {
  const room = createRoomId(),
    page = await open(await browser.newContext({ viewport: { width: 1600, height: 1000 } }), room);
  const peer = await open(
    await browser.newContext({ viewport: { width: 1600, height: 1000 } }),
    room
  );
  await railPanel(page, "Shapes");
  await page.getByLabel("Woodworking mode", { exact: true }).check();
  const canvas = page.getByTestId("canvas");
  const stencil = page.getByRole("button", { name: "Lumber 2x4", exact: true });
  await stencil.click();
  await canvas.click({ position: { x: 230, y: 190 } });
  const length = page.getByRole("textbox", { name: "Value of Cut length", exact: true });
  await length.fill("36 in");
  await length.press("Enter");
  await page.getByRole("button", { name: "Place another view" }).click();
  await canvas.click({ position: { x: 230, y: 350 } });
  await page.getByRole("combobox", { name: "Projection", exact: true }).selectOption("end");
  const dimensions = async () =>
    (await exported(peer)).objects
      .filter((i) => i.wood)
      .map((i) => [i.wood!.part, i.width, i.height]);
  const values = await dimensions();
  expect(values).toHaveLength(2);
  expect(values[0][0]).toBe(values[1][0]);
  expect(values.map((v) => v.slice(1))).toEqual([
    [432, 42],
    [42, 18],
  ]);
  await length.fill("32 in");
  await length.press("Enter");
  await expect.poll(dimensions).toEqual([
    [values[0][0], 384, 42],
    [values[0][0], 42, 18],
  ]);
  await canvas.click({ position: { x: 340, y: 210 } });
  await page
    .getByRole("combobox", { name: "Nominal lumber size", exact: true })
    .selectOption("2x6");
  await expect.poll(dimensions).toEqual([
    [values[0][0], 384, 66],
    [values[0][0], 66, 18],
  ]);
});

it("links existing views and places distinct screws with their own hole assignments", async () => {
  const room = createRoomId();
  const page = await open(
    await browser.newContext({ viewport: { width: 1600, height: 1000 } }),
    room
  );
  const peer = await open(await browser.newContext(), room);
  await railPanel(page, "Shapes");
  await page.getByLabel("Woodworking mode", { exact: true }).check();
  const canvas = page.getByTestId("canvas");
  const place = async (label: string, x: number, y: number) => {
    await page.getByRole("button", { name: label, exact: true }).click();
    await canvas.click({ position: { x, y } });
  };
  await place("Lumber 2x4", 160, 150);
  await place("Lumber 2x4", 160, 320);
  await place("Lumber 2x4", 450, 150);
  const boards = (await exported(peer)).objects;
  const [first, second, detail] = boards;
  expect(new Set(boards.map((b) => b.wood!.part)).size).toBe(3);
  await page.getByLabel("Same as another view").selectOption(first.id);
  await page.getByRole("button", { name: "Link same physical part" }).click();
  await expect
    .poll(async () => (await exported(peer)).objects.find((b) => b.id === detail.id)?.wood?.part)
    .toBe(first.wood!.part);
  const height = page.getByLabel("Object height", { exact: true });
  await height.fill("9 in");
  await height.press("Enter");
  expect((await exported(peer)).objects.find((b) => b.id === detail.id)?.height).toBe(42);
  const pair = async () => {
    await canvas.press("Escape");
    await canvas.click({ position: { x: 190, y: 168 } });
    await canvas.click({ position: { x: 190, y: 337 }, modifiers: ["Shift"] });
  };
  await pair();
  await place("Wood screw #7", 355, 230);
  const shopField = async (label: string, value: string) => {
    const field = page.getByRole("textbox", { name: "Value of " + label, exact: true });
    await field.fill(value);
    await field.press("Enter");
  };
  await shopField("Fastener length", "2 in");
  await shopField("Clearance hole", "3/16 in");
  await shopField("Pilot hole", "1/8 in");
  await page.getByLabel("Screw gauge", { exact: true }).selectOption("#12");
  await place("Place another view", 470, 345);
  const firstFile = await exported(peer);
  expect(firstFile.text.match(/^part \S+ screw /gm)).toHaveLength(1);
  expect(firstFile.objects.filter((v) => v.name === "#12")).toHaveLength(2);
  expect(firstFile.text).toContain('gauge "#12"');
  expect(firstFile.text).toContain('clearance "3/16 in"');
  expect(firstFile.text).toContain('pilot "1/8 in"');
  expect(firstFile.text).toContain('through "' + first.wood!.part + '"');
  expect(firstFile.text).toContain('into "' + second.wood!.part + '"');
  await place("Wood screw #7", 390, 230);
  await page.getByText("Shop details", { exact: true }).click();
  await shopField("Distance from end", "2 in");
  const file = (await exported(peer)).text;
  expect(file.match(/^part \S+ screw /gm)).toHaveLength(2);
  expect(file.match(/^part \S+ joint /gm)).toHaveLength(1);
  expect(file).toContain('offset "2 in"');
  await pair();
  await more(page, "Duplicate");
  const copies = (await exported(peer)).text;
  const joints = copies.split("\n").filter((line) => /^part \S+ joint /.test(line));
  expect(joints).toHaveLength(2);
  expect(
    joints.filter((joint) => joint.includes('through "' + first.wood!.part + '"'))
  ).toHaveLength(1);
  expect(copies.match(/^part \S+ screw /gm)).toHaveLength(4);
});
