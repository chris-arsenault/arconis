import { expect, it } from "vitest";
import {
  agent,
  person,
  ROOM,
  tool,
  replaceGateway,
  relay,
  config,
  gateway,
  advanceTime,
} from "./agentTestHarness";
import { AgentGateway } from "./mcpHttp";
import { sha256, encodePicture } from "../document/pictures";
import { parseRoom } from "../protocol/room";
import { SESSION_IDLE_MS } from "./agentSessions";

it("imports with web semantics and undo, and exports portable encrypted pictures", async () => {
  const stored = new Map<string, Uint8Array>();
  replaceGateway(
    new AgentGateway(
      () => relay,
      config,
      () => Promise.resolve({ user: "user-alice", clientId: "agents", scopes: [] }),
      Date.now,
      {
        read: (hash) => Promise.resolve(stored.get(hash) ?? null),
        put: async (bytes) => {
          const { hex } = await sha256(bytes);
          stored.set(hex, bytes);
          return hex;
        },
      }
    )
  );
  const browser = await person();
  browser.document.create("node", 0, 0, { id: "a", name: "Existing" });
  const bot = await agent();
  await bot.call("open_room", { room: ROOM });
  const bytes = new Uint8Array([1, 2, 3]);
  const { hex } = await sha256(bytes);
  const data = encodePicture(hex, "image/png", bytes);
  const content = `arconis 1\nnode a "Imported" at 300,0\npicture photo hash ${hex} format image/png at 500,0\ndata ${hex} image/png "${data.data}"\n`;
  const imported = await tool("import_document", { session_id: bot.sessionId, content });
  expect(imported.isError).toBe(false);
  await expect.poll(() => browser.document.list().length).toBe(3);
  expect(browser.document.get("a")?.name).toBe("Existing");
  expect(browser.document.get("photo")?.picture?.stored).toBe(true);
  expect(browser.document.get("photo")?.picture?.hash).not.toBe(hex);
  const exported = await tool("export_document", { session_id: bot.sessionId });
  expect(exported.isError).toBe(false);
  const file = exported.structuredContent as { content: string; next_offset: number | null };
  expect(file.content).toContain(`data ${hex} image/png`);
  expect(file.next_offset).toBeNull();
  expect(file.content).toContain('node a "Existing"');
  await bot.call("undo");
  await expect.poll(() => browser.document.list().length).toBe(1);
  expect(browser.document.get("a")?.name).toBe("Existing");
});

it("stages large imports and exports one consistent snapshot across concurrent edits", async () => {
  const browser = await person();
  const bot = await agent();
  await bot.call("open_room", { room: ROOM });
  const content = `arconis 1\ntext text "${"x".repeat(80_000)}" at 0,0\n`;
  const first = await tool("import_document", {
    session_id: bot.sessionId,
    content: content.slice(0, 40_000),
    final: false,
  });
  expect(first.structuredContent).toMatchObject({ staged: true });
  expect(browser.document.list()).toHaveLength(0);
  await tool("import_document", {
    session_id: bot.sessionId,
    content: content.slice(40_000),
    append: true,
  });
  await expect.poll(() => browser.document.list().length).toBe(1);
  let chunk = (await tool("export_document", { session_id: bot.sessionId })).structuredContent as {
    content: string;
    next_offset: number | null;
  };
  const parts = [chunk.content];
  browser.document.patch("text", { name: "A concurrent edit" });
  while (chunk.next_offset !== null) {
    chunk = (
      await tool("export_document", { session_id: bot.sessionId, offset: chunk.next_offset })
    ).structuredContent as typeof chunk;
    parts.push(chunk.content);
  }
  expect(parts.join("")).toContain("x".repeat(80_000));
  expect(parts.join("")).not.toContain("A concurrent edit");
});

it("seeds a new room without a browser and returns a collaboration link and lifetime", async () => {
  const imported = await tool("import_document", {
    new_room: true,
    content: 'arconis 1\nnode a "Seeded" at 0,0\n',
  });
  expect(imported.isError).toBe(false);
  const opened = imported.structuredContent as {
    session_id: string;
    room_url: string;
    instructions: string;
    lifetime: string;
  };
  const room = parseRoom(opened.room_url)!;
  expect(room).toMatch(/^[a-f0-9]{48}$/);
  expect(opened.instructions).toContain("Present room_url to the user now");
  expect(opened.lifetime).toContain("not a durable saved copy");
  expect(relay.peopleIn(room)).toBe(0);
  expect(relay.agentRoomActive(room)).toBe(true);
  expect(
    (
      await tool("write", {
        session_id: opened.session_id,
        statements: 'node b "Before browser" at 300,0',
      })
    ).isError
  ).toBe(false);
  const joined = await tool("open_room", { room: opened.room_url });
  expect(joined.isError).toBe(false);
  expect(JSON.stringify(joined)).toContain("Before browser");
  await tool("close_room", { session_id: opened.session_id });
  expect(relay.agentRoomActive(room)).toBe(false);
});

it("releases seeded-room ownership on failed imports and session expiry", async () => {
  expect((await tool("import_document", { new_room: true, content: "node bad" })).isError).toBe(
    true
  );
  expect(gateway.sessionCount).toBe(0);
  const imported = await tool("import_document", {
    new_room: true,
    content: "arconis 1\nnode a\n",
  });
  const { room_url } = imported.structuredContent as { room_url: string };
  const room = parseRoom(room_url)!;
  expect(relay.agentRoomActive(room)).toBe(true);
  advanceTime(SESSION_IDLE_MS + 1);
  gateway.sweep();
  expect(gateway.sessionCount).toBe(0);
  expect(relay.agentRoomActive(room)).toBe(false);
});
