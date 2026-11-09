import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { AgentGateway } from "../relay/mcpHttp";
import { createRoomId } from "../collaboration/room";
import { readCopy } from "../document/pngCopy";
import { BATCH_EXAMPLE } from "../language/reference";
import { browser, errors, exported, exportPng, fixture, open, row } from "./browserHarness";
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
  let client = new Client({ name: "Drawing journey", version: "1" });
  const transport = () =>
    new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`),
      { requestInit: { headers: { authorization: "Bearer local-test" } } }
    );
  await client.connect(transport());
  let sessionId = "";
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const roomTool = [
      "describe_canvas",
      "read",
      "write",
      "undo",
      "close_room",
      "check_layout",
    ].includes(name);
    const result = await client.callTool({
      name,
      arguments: roomTool ? { session_id: sessionId, ...args } : args,
    });
    if (name === "open_room" && !result.isError)
      sessionId = (result.structuredContent as { session_id: string }).session_id;
    return JSON.stringify(result);
  };
  return {
    get client() {
      return client;
    },
    call,
    reconnect: async () => {
      await client.close();
      client = new Client({ name: "Drawing journey resumed", version: "1" });
      await client.connect(transport());
    },
    close: async () => {
      if (sessionId) await call("close_room");
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
  const call = agent.call;
  try {
    expect(agent.client.getInstructions()).toContain("canvas_help");
    expect(await call("canvas_help")).toContain("drawings-and-markup");
    expect(await call("canvas_help", { topic: "drawings-and-markup" })).toContain("ink freehand");
    await call("open_room", { room });
    await agent.reconnect();
    expect(await call("describe_canvas")).toContain("Outline");
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
    expect(await call("check_layout")).toContain("Layout check: 3 objects looked at");
    await row(page, "Agent Drawing").click();
    await page.getByLabel("Object text", { exact: true }).fill("Human Drawing");
    await page.getByLabel("Object text", { exact: true }).press("Control+Enter");
    await agent.reconnect();
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
    await exportPng(page);
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

it("uses collective Drawing transforms through MCP and rejects connected markup transitions atomically", async () => {
  const room = createRoomId();
  const page = await open(await browser.newContext(), room);
  const peer = await open(await browser.newContext(), room);
  const agent = await connectAgent();
  const call = agent.call;
  try {
    await call("open_room", { room });
    expect(
      await call("write", {
        statements: `sketch s at 0,0 size 100,100 {
      drawing p points 10,10 90,90 closed fill #ff0000 gradient #0000ff gradient-angle 20
    }
    drawing legacy points 300,300 400,400
    note n "Human note" at 500,300
    legacy -> n as wire`,
      })
    ).toContain("Done");
    await expect.poll(async () => (await exported(peer)).objects.length).toBe(5);
    const original = (await exported(page)).text;
    expect(await call("write", { statements: "edit legacy markup" })).toContain(
      "Remove connector wire"
    );
    expect((await exported(peer)).text).toBe(original);
    expect(
      await call("write", { statements: "edit s size 200,100 rotate 90 at 200,300" })
    ).toContain("Done");
    await expect
      .poll(async () => (await exported(peer)).objects.find((item) => item.id === "p")?.points)
      .toEqual([
        [340, 270],
        [260, 430],
      ]);
    expect((await exported(peer)).objects.find((item) => item.id === "p")?.look.gradientAngle).toBe(
      110
    );
    await call("undo");
    await expect.poll(async () => (await exported(peer)).text).toBe(original);
    expect(errors).toEqual([]);
  } finally {
    await agent.close();
  }
});

it("builds the batched workspace in two browsers and preserves a person's slide move and deletion", async () => {
  const room = createRoomId();
  const page = await open(
    await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    room
  );
  const peer = await open(await browser.newContext(), room);
  const agent = await connectAgent();
  try {
    await agent.call("open_room", { room });
    expect(await agent.call("write", { statements: BATCH_EXAMPLE })).toContain("29 created");
    await expect.poll(async () => (await exported(peer)).objects.length).toBe(29);
    const deck = page.getByTestId("deck");
    await deck.getByRole("button", { name: "1 · Network", exact: true }).click();
    const canvas = page.getByTestId("canvas");
    await canvas.press("Control+ArrowRight");
    await expect
      .poll(
        async () => (await exported(peer)).objects.find((item) => item.id === "network_view")?.x
      )
      .not.toBe(40);
    const moved = (await exported(peer)).objects.find((item) => item.id === "network_view")!;
    expect(await agent.call("write", { statements: "edit network_view at 40,40" })).toContain(
      "Nothing was changed"
    );
    await canvas.press("Delete");
    await expect
      .poll(async () => (await exported(peer)).objects.some((item) => item.id === "network_view"))
      .toBe(false);
    expect(
      await agent.call("write", { statements: 'note followup "Next review" at 2900,1050' })
    ).toContain("removed network_view");
    const after = (await exported(peer)).objects;
    expect(after.find((item) => item.id === "network")).toMatchObject({ x: 80, inside: "" });
    expect(after.some((item) => item.id === "network_view")).toBe(false);
    expect(after.filter((item) => item.id === "footer")).toHaveLength(1);
    expect(moved.x).toBeGreaterThan(40);
    expect(await agent.call("check_layout")).toContain("Nothing to report");
    expect(errors).toEqual([]);
  } finally {
    await agent.close();
    await page.context().close();
    await peer.context().close();
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
