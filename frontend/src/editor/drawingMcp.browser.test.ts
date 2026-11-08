import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { AgentSession } from "../relay/agentSession";
import { createMcpServer } from "../relay/mcp";
import { createRoomId } from "../collaboration/room";
import { readCopy } from "../document/pngCopy";
import { browser, errors, exported, fixture, open, row } from "./browserHarness";
import type { Page } from "playwright";

it("authors editable drawings through actual MCP tools, renders gradient PNGs and preserves human edits on agent Undo", async () => {
  const room = createRoomId();
  const page = await open(
    await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    room
  );
  const peer = await open(await browser.newContext(), room);
  const session = new AgentSession(fixture.relay, "Artist");
  const server = createMcpServer(session);
  const client = new Client({ name: "Drawing journey", version: "1" });
  const [local, remote] = InMemoryTransport.createLinkedPair();
  await server.connect(remote);
  await client.connect(local);
  const call = async (name: string, args: Record<string, unknown> = {}) =>
    JSON.stringify(await client.callTool({ name, arguments: args }));
  try {
    await call("open_room", { room });
    expect(
      await call("write", {
        statements: `
      sketch s "Agent Drawing" at 200,100 size 350,250 {
        drawing p ink rectangle points 230,130 480,130 480,280 230,280 230,130 closed fill #ff0000 gradient #0000ff gradient-angle 0
      }
      drawing annotation markup points 10,10 80,80 line #00aa00
    `,
      })
    ).toContain("Done");
    await expect.poll(async () => (await exported(peer)).objects.length).toBe(3);
    await row(page, "Agent Drawing").click();
    await page.getByLabel("Object text", { exact: true }).fill("Human Drawing");
    await page.getByLabel("Object text", { exact: true }).press("Control+Enter");
    expect(await call("read", { items: ["p"] })).toContain("gradient #0000ff");
    expect(await call("write", { statements: "edit p line #ffcc00 line-width 6" })).toContain(
      "Done"
    );
    await expect
      .poll(
        async () => (await exported(page)).objects.find((item) => item.id === "p")?.look.lineWidth
      )
      .toBe(6);
    await call("undo");
    await expect
      .poll(
        async () => (await exported(peer)).objects.find((item) => item.id === "p")?.look.lineWidth
      )
      .toBeUndefined();
    expect((await exported(page)).objects.find((item) => item.id === "s")?.name).toBe(
      "Human Drawing"
    );
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export PNG", exact: true }).click();
    const png = await readFile((await (await pending).path())!);
    expect(await readCopy(new Uint8Array(png))).toContain("gradient #0000ff");
    const colors = await gradientPixels(page, png);
    expect(colors.red).toBeGreaterThan(100);
    expect(colors.blue).toBeGreaterThan(100);
    expect(errors).toEqual([]);
  } finally {
    await client.close();
    await server.close();
    session.leave();
  }
});

function gradientPixels(page: Page, png: Buffer) {
  return page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let red = 0,
      blue = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] > 150 && pixels[i + 2] < 100) red++;
      if (pixels[i + 2] > 150 && pixels[i] < 100) blue++;
    }
    return { red, blue };
  }, png.toString("base64"));
}
