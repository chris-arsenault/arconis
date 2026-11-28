import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { AgentGateway } from "../relay/mcpHttp";
import { createRoomId } from "../collaboration/room";
import { readCopy } from "../document/pngCopy";
import { BOOKSHELF } from "../language/woodworkingExample";
import { BATCH_EXAMPLE } from "../language/reference";
import {
  browser,
  railPanel,
  dockPanel,
  errors,
  exported,
  exportPng,
  fixture,
  open,
  row,
} from "./browserHarness";
import type { Page } from "playwright";

async function connectAgent() {
  const gateway = new AgentGateway(
    fixture.relay,
    { resource: "https://relay.example/mcp", issuer: "https://auth.example/" },
    (token) =>
      Promise.resolve(
        token === "local-test" ? { user: "artist", clientId: "test", scopes: ["edit:rooms"] } : null
      )
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
      frame s "Agent Drawing" at 200,100 size 350,250 scale-contents {
        drawing p ink rectangle points 230,130 480,130 480,280 230,280 230,130 closed fill #ff0000 gradient #0000ff gradient-angle 0
      }
      drawing annotation markup points 10,10 80,80 line #00aa00
    `,
      })
    ).toContain("Done");
    await expect.poll(async () => (await exported(peer)).objects.length).toBe(3);
    expect(await call("check_layout")).toContain("Layout check: 3 objects looked at");
    await row(page, "Agent Drawing").click();
    await page.keyboard.press("Enter");
    await page.getByLabel("Edit canvas text", { exact: true }).fill("Human Drawing");
    await page.getByLabel("Edit canvas text", { exact: true }).press("Control+Enter");
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
    const png = await readFile(await (await pending).path());
    expect(await readCopy(new Uint8Array(png))).toContain("gradient #0000ff");
    const colors = await gradientPixels(page, png);
    expect(colors.red).toBeGreaterThan(100);
    expect(colors.blue).toBeGreaterThan(100);
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
    await dockPanel(page, "Slides");
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

it("shows an agent's addition in its own layer, which a person can hide in their view", async () => {
  const room = createRoomId();
  const page = await open(
    await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    room
  );
  const agent = await connectAgent();
  try {
    expect(agent.client.getInstructions()).toContain("declare its own layer");
    await agent.call("open_room", { room });
    expect(
      await agent.call("write", {
        statements:
          'node api "Orders API"\nlayer review "Review notes"\nnote n1 "Retry?" in-layer review',
      })
    ).toContain("Done:");
    await dockPanel(page, "Layers");
    const names = page.locator('[data-testid="layer"] .layer-name');
    await expect.poll(() => names.allTextContents()).toEqual(["Review notes", "Workspace"]);
    await expect.poll(() => row(page, "Retry?").count()).toBe(1);
    await page.getByRole("button", { name: "Hide Review notes", exact: true }).click();
    await expect.poll(() => row(page, "Retry?").count()).toBe(0);
    expect(await row(page, "Orders API").count()).toBe(1);
    expect(errors).toEqual([]);
  } finally {
    await agent.close();
    await page.context().close();
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

it("authors a bookshelf through MCP and exchanges fitted cuts and joint revisions with the browser", async () => {
  const room = createRoomId();
  const page = await open(
    await browser.newContext({ viewport: { width: 1600, height: 1000 } }),
    room
  );
  const peer = await open(await browser.newContext(), room);
  const agent = await connectAgent();
  try {
    const call = agent.call;
    expect(await call("canvas_help", { topic: "woodworking" })).toContain("same-as");
    expect(await call("list_stencils", { query: "#7" })).toContain("0.151");
    await call("open_room", { room });
    expect(await call("describe_canvas")).toContain("No items yet");
    expect(await call("write", { statements: BOOKSHELF })).toContain("Done");
    checkBookshelfEvidence(await call("read", { items: ["rail_end"] }));
    await expect
      .poll(async () => (await exported(peer)).objects.find((v) => v.id === "rail_view")?.width)
      .toBe(492);
    // Select the top's narrow edge in the front elevation.
    await page.getByTestId("canvas").click({ position: { x: 240, y: 124 } });
    const length = page.getByRole("textbox", { name: "Value of Cut length", exact: true });
    await length.fill("50 in");
    await length.press("Enter");
    await expect.poll(() => call("read", { items: ["part:rail"] })).toContain("43 in × 3.5 in");
    expect(
      await call("write", {
        statements:
          'part left_post board inset "1/2 in"\npart corner joint bearing "rail end on upright face"\npart fixing screw pilot "5/32 in" offset "42 3/4 in"',
      })
    ).toContain("Done");
    await railPanel(page, "Shapes");
    const list = page.locator(".wood-library .wood-cut-list");
    await list.locator(":scope > summary").click();
    await list.locator("li summary").filter({ hasText: "1 × 42.5 in" }).click();
    await expect.poll(() => list.innerText()).toContain("50 in − 3.5 in − 0.5 in − 3.5 in");
    const physical = await call("read", { items: ["screw_detail"] });
    for (const fact of ["outside rail", "rail end on upright face", "5/32 in", "3/16 in"])
      expect(physical).toContain(fact);
    expect(
      await call("write", { statements: 'part fixing screw length "3 in" diameter "1 in"' })
    ).toContain("Nothing was changed");
    const file = await exported(peer);
    const screw = file.text.split("\n").find((s) => s.startsWith("part fixing screw"))!;
    expect(screw).toContain('gauge "#12"');
    expect(screw).toContain('pilot "5/32 in"');
    expect(screw).not.toContain('length "3 in"');
    expect(file.objects.filter((v) => v.wood?.part === "fixing")).toHaveLength(2);
    expect(
      await call("write", {
        statements: [
          'part detail_board board stock "2x4"',
          'node detail_member "Assembly detail" depicts detail_board end at 1100,200',
          "same-as detail_member rail_end",
          'part right_joint joint through "rail" into "right_post"',
          'part shelf_load load offset "42 3/4 in"',
        ].join("\n"),
      })
    ).toContain("Done");
    const detail = await call("read", { items: ["detail_member"] });
    expect(detail).toContain("right_joint: bearing contact unspecified");
    expect(detail).toContain("corner: bearing contact rail end on upright face");
    expect(detail).toContain("detail_member depicts rail end");
    await page.getByTestId("canvas").click({ position: { x: 280, y: 240 } });
    await expect
      .poll(() => page.locator(".wood-inspector").innerText())
      .toContain("42 3/4 in from end A is outside rail");
    expect(errors).toEqual([]);
  } finally {
    await agent.close();
    await page.context().close();
    await peer.context().close();
  }
});

function checkBookshelfEvidence(evidence: string) {
  for (const fact of [
    "41 in × 3.5 in",
    "Specify length on left_post",
    "3/16 in",
    "1/8 in",
    "shelf_load load",
    "floor support",
    "corner: bearing contact unspecified",
    "screw_detail depicts fixing",
    "screw_callout depicts fixing",
  ])
    expect(evidence).toContain(fact);
}

it("authors a bracket assembly through MCP and reads a washer detail from a browser peer", async () => {
  const room = createRoomId();
  const page = await open(await browser.newContext(), room);
  const agent = await connectAgent();
  try {
    expect(await agent.call("list_stencils", { query: "washers" })).toContain("Fender washer");
    await agent.call("open_room", { room });
    expect(
      await agent.call("write", {
        statements: [
          "woodworking on",
          'part shelf panel thickness "3/4 in"',
          'part upright board stock "2x4"',
          'part corner joint type "Dado" through "shelf" into "upright"',
          'part brace bracket joint "corner" type "Angle bracket"',
          'part mount bolt bracket "brace" diameter "1/4 in"',
          'part plate washer fastener "mount" type "Fender washer" side "under head"',
          'node detail "Bolt stack" depicts plate edge at 160,160',
        ].join("\n"),
      })
    ).toContain("Done");
    await expect.poll(async () => (await exported(page)).text).toContain('fastener "mount"');
    const read = JSON.parse(await agent.call("read", { items: ["detail"] })) as {
      content: { text: string }[];
    };
    expect(read.content[0].text).toContain("Hardware · Fender washer · qty 1");
    expect(read.content[0].text).toContain('into "upright"');
  } finally {
    await agent.close();
    await page.context().close();
  }
});
