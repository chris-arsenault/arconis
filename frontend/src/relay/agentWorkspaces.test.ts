import { expect, it } from "vitest";
import { AccountsApi } from "../accounts/api";
import { memoryAccountTable } from "../accounts/memoryTable";
import { sha256 } from "../document/pictures";
import { accountWorkspaceStorage } from "./agentWorkspaceStorage";
import { config, relay, replaceGateway, tool } from "./agentTestHarness";
import { AgentGateway } from "./mcpHttp";
import { createEnvelope, defaultRoomKey } from "../collaboration/roomKey";

function accounts() {
  const table = memoryAccountTable();
  const blobs = new Map<string, Uint8Array>();
  const urlFor = (user: string, id: string) => `https://bucket.test/${user}/${id}`;
  const api = new AccountsApi(table, {
    objectInfo: async (user, id) => {
      const bytes = blobs.get(urlFor(user, id));
      return bytes ? { size: bytes.length, checksum: (await sha256(bytes)).base64 } : null;
    },
    signUpload: (user, id) => Promise.resolve(urlFor(user, id)),
    signDownload: (user, id) => Promise.resolve(urlFor(user, id)),
    deleteObject: (user, id) => {
      blobs.delete(urlFor(user, id));
      return Promise.resolve();
    },
    now: Date.now,
    newRevision: () => crypto.randomUUID(),
  });
  return accountWorkspaceStorage(
    (payload) => api.handleWorkspaceInvocation(payload),
    async (url, request) => {
      if (request?.method === "PUT") {
        blobs.set(url, new Uint8Array(await (request.body as Blob).arrayBuffer()));
        return new Response();
      }
      const bytes = blobs.get(url);
      return bytes ? new Response(new Uint8Array(bytes)) : new Response(null, { status: 404 });
    }
  );
}

function workspaceGateway(storage: ReturnType<typeof accounts>) {
  replaceGateway(
    new AgentGateway(
      () => relay,
      config,
      (token) =>
        Promise.resolve({
          user: token === "read-only" ? "alice" : token,
          clientId: "agent",
          scopes: token === "read-only" ? [] : ["edit:rooms"],
        }),
      Date.now,
      null,
      "https://arconis.test",
      storage
    )
  );
}

it("saves and reopens a linked diagram after relay session loss with no browser", async () => {
  const storage = accounts();
  workspaceGateway(storage);
  const link =
    "https://sulion.test/?plan=11111111-1111-4111-8111-111111111111&phase=22222222-2222-4222-8222-222222222222";
  const created = await tool("import_document", {
    new_room: true,
    content: `arconis 1\nnode streets "Street network" at 0,0 link "${link}"\n`,
  });
  expect(created.isError).toBe(false);
  const session_id = created.structuredContent?.session_id;
  const [saved, concurrent] = await Promise.all([
    tool("save_workspace", { session_id }),
    tool("save_workspace", { session_id }),
  ]);
  expect(saved.isError).toBe(false);
  expect(concurrent.isError).toBe(false);
  const { workspace_id, room_id } = saved.structuredContent as {
    workspace_id: string;
    room_id: string;
  };
  expect(concurrent.structuredContent?.workspace_id).toBe(workspace_id);
  expect(saved.structuredContent?.room_url).toBe(`https://arconis.test/#room=${room_id}`);
  workspaceGateway(storage);
  expect(relay.peopleIn(room_id)).toBe(0);
  expect((await tool("open_workspace", { workspace_id }, "bob")).isError).toBe(true);
  expect((await tool("open_workspace", { workspace_id }, "read-only")).isError).toBe(true);
  const opened = await tool("open_workspace", { workspace_id });
  expect(opened.isError).toBe(false);
  const reopenedSession = opened.structuredContent?.session_id;
  const read = await tool("export_document", { session_id: reopenedSession });
  expect(read.structuredContent?.content).toContain(link);
  expect(
    (
      await tool("write", {
        session_id: reopenedSession,
        statements: 'node drains "Drains" at 200,0',
      })
    ).isError
  ).toBe(false);
  const updated = await tool("save_workspace", { session_id: reopenedSession });
  expect(updated.structuredContent?.workspace_id).toBe(workspace_id);
  workspaceGateway(storage);
  const reopened = await tool("open_workspace", { room: saved.structuredContent?.room_url });
  expect(reopened.structuredContent?.workspace_id).toBe(workspace_id);
  expect(reopened.structuredContent?.canvas).toContain("Drains");
});

it("refuses a password-protected copy even if its address uses an ordinary room code", async () => {
  const storage = accounts();
  workspaceGateway(storage);
  const roomId = "a".repeat(48);
  const key = await defaultRoomKey(roomId);
  const workspace_id = crypto.randomUUID();
  await storage("alice").save(
    workspace_id,
    "Protected diagram",
    {
      roomId,
      envelope: await createEnvelope("fixture password", key, 2),
      sealed: new Uint8Array([1, 2, 3]),
    },
    ""
  );
  const denied = await tool("open_workspace", { workspace_id });
  expect(denied.isError).toBe(true);
  expect(JSON.stringify(denied.content)).toContain("Password workspaces");
  expect(relay.agentRoomActive(roomId)).toBe(false);
});
