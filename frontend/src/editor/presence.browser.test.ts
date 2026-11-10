import { it, expect } from "vitest";
import { createRoomId } from "../collaboration/room";
import { browser, errors, open, add, row, selectionLabel } from "./browserHarness";

it("follows a participant, answers a call to look, shows chat and lasers, and opens item links", async () => {
  const first = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const second = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const room = createRoomId();
  const a = await open(first, room);
  await add(a, "Rectangle (R)", "Landmark", 300, 200);
  const b = await open(second, room);
  await row(b, "Landmark").waitFor();
  const zoomA = a.getByTestId("zoom-level");
  const zoomB = b.getByTestId("zoom-level");

  // B follows A: when A changes zoom, B's view changes with it, until B moves on their own.
  await b.getByRole("button", { name: "Participants", exact: true }).click();
  await b.getByRole("button", { name: "Follow Guest", exact: true }).click();
  await b.getByTestId("following").waitFor();
  await a.getByTestId("canvas").click({ position: { x: 40, y: 40 } });
  await a.getByTestId("canvas").press("Shift+Digit1");
  await expect.poll(() => zoomA.textContent()).not.toBe("1×");
  await expect.poll(() => zoomB.textContent()).toBe(await zoomA.textContent());
  await b.getByTestId("canvas").click({ position: { x: 40, y: 40 } });
  await expect.poll(() => b.getByTestId("following").count()).toBe(0);

  // A calls everyone over; B sees the banner and can follow from it.
  await a.getByRole("button", { name: "Participants", exact: true }).click();
  await a.getByRole("button", { name: "Bring everyone to me", exact: true }).click();
  await b.getByTestId("spotlight").waitFor();
  await b.getByRole("button", { name: "Follow", exact: true }).click();
  await b.getByTestId("following").waitFor();
  await b.getByTestId("canvas").click({ position: { x: 40, y: 40 } });

  // Cursor chat and the laser reach the other side and write nothing to the document.
  await a.getByTestId("canvas").hover({ position: { x: 500, y: 500 } });
  await a.getByTestId("canvas").press("Slash");
  await a.getByLabel("Say something beside your cursor", { exact: true }).fill("over here");
  await expect.poll(() => b.getByTestId("peer-chat").textContent()).toBe("over here");
  await a.getByLabel("Say something beside your cursor", { exact: true }).press("Escape");
  await a.keyboard.down("k");
  for (let step = 0; step < 6; step++)
    await a.getByTestId("canvas").hover({ position: { x: 500 + step * 20, y: 500 + step * 10 } });
  await b.getByTestId("laser").waitFor();
  await a.keyboard.up("k");
  await expect.poll(() => b.getByTestId("laser").count(), { timeout: 5000 }).toBe(0);

  // A link to an object opens the room at it.
  await row(a, "Landmark").click();
  await a.getByTestId("canvas").press("ControlOrMeta+k");
  await a.getByLabel("Search commands", { exact: true }).fill("Copy a link");
  await a.getByLabel("Search commands", { exact: true }).press("Enter");
  await expect.poll(() => a.getByTestId("sync-status").textContent()).toContain("Link copied");
  const third = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const landmark = (await (await import("./browserHarness")).exported(a)).objects.find(
    (item) => item.name === "Landmark"
  )!;
  const c = await open(third, `${room}&item=${landmark.id}`);
  await row(c, "Landmark").waitFor();
  await expect.poll(() => selectionLabel(c)).toBe("Rectangle");
  expect(errors).toEqual([]);
  await first.close();
  await second.close();
  await third.close();
});
