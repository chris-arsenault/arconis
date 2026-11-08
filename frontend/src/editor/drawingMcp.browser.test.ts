import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { AgentGateway } from "../relay/mcpHttp";
import { createRoomId } from "../collaboration/room";
import { readCopy } from "../document/pngCopy";
import { browser, errors, exported, fixture, open, row } from "./browserHarness";
import type { Page } from "playwright";

async function connectAgent() {
  const gateway = new AgentGateway(
    fixture.relay,
    { resource: "https://relay.example/mcp", issuer: "https://auth.example/" },
    async (token) =>
      token === "local-test" ? { user: "artist", clientId: "test", scopes: ["edit:rooms"] } : null
  );
  const server = createServer((request, response) => {
    void gateway.handle(request, response).then((handled) => {
      if (!handled) response.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const client = new Client({ name: "Drawing journey", version: "1" });
  await client.connect(
    new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`),
      { requestInit: { headers: { authorization: "Bearer local-test" } } }
    )
  );
  return {
    client,
    close: async () => {
      await client.close();
      gateway.close();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

it("authors editable drawings through actual MCP tools, renders gradient PNGs and preserves human edits on agent Undo", async () => {
  const room = createRoomId();
  const page = await open(
    await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    room
  );
  const peer = await open(await browser.newContext(), room);
  const agent = await connectAgent();
  const call = async (name: string, args: Record<string, unknown> = {}) =>
    JSON.stringify(await agent.client.callTool({ name, arguments: args }));
  try {
    expect(agent.client.getInstructions()).toContain("canvas_help");
    expect(await call("canvas_help")).toContain("drawings-and-markup");
    expect(await call("canvas_help", { topic: "drawings-and-markup" })).toContain("ink freehand");
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
    await agent.close();
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
