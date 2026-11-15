import { afterAll, beforeAll, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  browser,
  open,
  exported,
  row,
  errors,
  textEditor,
  fixture,
  baseUrl,
  drawnPictures,
} from "./browserHarness";
import { createRoomId } from "../collaboration/room";
import { preview, type PreviewServer } from "vite";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { AgentGateway } from "../relay/mcpHttp";
import { agentPictureStorage } from "../relay/agentPictures";
import { sha256 } from "../document/pictures";
import { parseRoom } from "../protocol/room";

const exec = promisify(execFile);
const bundle = resolve("dist/downloads/arconis-local.mjs");
let distribution: PreviewServer;
beforeAll(async () => {
  const env = { ...process.env, GITHUB_SHA: "local" };
  await exec("pnpm", ["exec", "vite", "build"], { env });
  await exec(process.execPath, ["build-cli.mjs"], { env });
  distribution = await preview({ preview: { port: 0, host: "127.0.0.1" } });
});

async function hostedAgent() {
  const storage = agentPictureStorage(baseUrl(), fixture.relay);
  const gateway = new AgentGateway(
    fixture.relay,
    { resource: "https://relay.example/mcp", issuer: "https://auth.example/" },
    () => Promise.resolve({ user: "local-test", clientId: "test", scopes: ["edit:rooms"] }),
    Date.now,
    { ...storage, read: (hash) => Promise.resolve(fixture.picture(hash)?.bytes ?? null) },
    baseUrl()
  );
  const server = createServer((request, response) => {
    void gateway.handle(request, response).then((handled) => {
      if (!handled) response.writeHead(404).end();
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const client = new Client({ name: "portable-room-journey", version: "1" });
  await client.connect(
    new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`),
      {
        requestInit: { headers: { authorization: "Bearer local-test" } },
      }
    )
  );
  return {
    client,
    close: async () => {
      await client.close();
      gateway.close();
      await new Promise<void>((done) => server.close(() => done()));
    },
  };
}

it("imports into a new hosted room, returns its link, and collaborates with two browser contexts", async () => {
  const first = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const second = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const bot = await hostedAgent();
  try {
    const bytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      "base64"
    );
    const { hex } = await sha256(bytes);
    const content = `arconis 1\nnode service "Seeded service" at 100,100 z 10\npicture photo hash ${hex} format image/png at 400,100 size 80,80 z 0\ndata ${hex} image/png "${bytes.toString("base64")}"\n`;
    const result = await bot.client.callTool({
      name: "import_document",
      arguments: { new_room: true, content },
    });
    expect(result.isError).toBe(false);
    const { session_id, room_url, instructions } = result.structuredContent as {
      session_id: string;
      room_url: string;
      instructions: string;
    };
    expect(instructions).toContain("Present room_url to the user now");
    expect(room_url.startsWith(baseUrl())).toBe(true);
    const a = await open(first, parseRoom(room_url)!);
    const b = await open(second, parseRoom(room_url)!);
    await row(a, "Seeded service").click();
    await expect.poll(() => drawnPictures(a)).toBe(1);
    const editor = await textEditor(a);
    await a.getByLabel("Object text", { exact: true }).fill("Human revised");
    await editor.getByRole("button", { name: "Done", exact: true }).click();
    await row(b, "Human revised").waitFor();
    await bot.client.callTool({ name: "read", arguments: { session_id, items: ["service"] } });
    expect(
      (
        await bot.client.callTool({
          name: "write",
          arguments: {
            session_id,
            statements: 'node worker "Agent added" at 700,100; service -> worker "calls"',
          },
        })
      ).isError
    ).toBe(false);
    await row(b, "Agent added").waitFor();
    const file = await bot.client.callTool({ name: "export_document", arguments: { session_id } });
    const portable = file.structuredContent as { content: string; next_offset: number | null };
    expect(portable.content).toContain("Human revised");
    expect(portable.content).toContain('node service "Human revised" z 10');
    expect(portable.content.indexOf("node service")).toBeLessThan(
      portable.content.indexOf("picture photo")
    );
    expect(portable.content).toContain(`data ${hex} image/png`);
    expect(portable.next_offset).toBeNull();
    await bot.client.callTool({ name: "close_room", arguments: { session_id } });
    expect((await exported(b)).objects.some((item) => item.name === "Human revised")).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await bot.close();
    await first.close();
    await second.close();
  }
});
afterAll(async () => {
  if (distribution)
    await new Promise<void>((done, reject) =>
      distribution.httpServer.close((error) => (error ? reject(error) : done()))
    );
});

it("downloads a standalone CLI without account setup and opens its output in two browsers", async () => {
  const first = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const second = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const guide = await first.newPage();
    await guide.goto(`${distribution.resolvedUrls!.local[0]}#cli`);
    await guide.getByRole("heading", { name: "Arconis CLI", exact: true }).waitFor();
    expect(await guide.getByText(/No MCP registration, Arconis account/).count()).toBe(1);
    const pending = guide.waitForEvent("download");
    await guide.getByRole("link", { name: "Download Arconis CLI", exact: true }).click();
    const downloaded = resolve("test-results/agent-interface-cli.mjs");
    await (await pending).saveAs(downloaded);
    expect(await readFile(downloaded, "utf8")).toBe(await readFile(bundle, "utf8"));
    expect((await exec(process.execPath, [downloaded, "--help"])).stdout).toContain("No MCP setup");
    const diagram = resolve(`test-results/agent-${createRoomId()}.arconis`);
    await exec(process.execPath, [
      downloaded,
      "--file",
      diagram,
      "--create",
      "write",
      "--statements",
      'node api "From CLI" at 100,100 z -4',
    ]);
    const room = createRoomId();
    const a = await open(first, room);
    const b = await open(second, room);
    await a.getByLabel("Import file").setInputFiles(diagram);
    await row(b, "From CLI").click();
    const editor = await textEditor(b);
    await b.getByLabel("Object text", { exact: true }).fill("Edited by human");
    await editor.getByRole("button", { name: "Done", exact: true }).click();
    await row(a, "Edited by human").waitFor();
    const copy = await exported(a);
    expect(copy.objects[0]?.name).toBe("Edited by human");
    expect(copy.objects[0]?.order).toBe(-4);
    await writeFile(diagram, copy.text);
    expect(
      (await exec(process.execPath, [downloaded, "--file", diagram, "read"])).stdout
    ).toContain("Edited by human");
    expect(errors).toEqual([]);
  } finally {
    await first.close();
    await second.close();
  }
});
