import { describe, expect, it } from "vitest";
import { ROOM, agent, person } from "./agentTestHarness";
import { BATCH_EXAMPLE } from "../language/reference";
import { performance } from "node:perf_hooks";

describe("checking the canvas", () => {
  it("discovers write and builds four original sections with slide viewports in one batch", async () => {
    const alice = await person();
    const bot = await agent();
    const { tools } = await bot.client.listTools();
    expect(tools.find((tool) => tool.name === "write")).toMatchObject({
      title: "Create and edit canvas objects",
      inputSchema: { required: ["session_id", "statements"] },
      annotations: { readOnlyHint: false },
    });
    for (const name of ["describe_canvas", "read", "write", "check_layout", "undo", "close_room"]) {
      const schema = tools.find((tool) => tool.name === name)!.inputSchema;
      expect(schema.required).toContain("session_id");
      expect(schema.properties?.session_id).toHaveProperty("description");
    }
    const guide = await bot.call("canvas_help", { topic: "example-batched-workspace" });
    expect(guide).toContain(BATCH_EXAMPLE);
    await bot.call("open_room", { room: ROOM });
    const started = performance.now();
    const result = await bot.call("write", { statements: BATCH_EXAMPLE });
    const elapsed = performance.now() - started;
    expect(result).toMatch(/^\/\/ Done:/);
    await expect.poll(() => alice.document.get("footer")?.name).toBe("made by chatgpt");
    const all = alice.document.list();
    expect(all.filter((item) => item.type === "slide")).toHaveLength(5);
    expect(all.filter((item) => item.name === "made by chatgpt")).toHaveLength(1);
    expect(alice.document.get("network")?.inside).toBe("");
    expect(alice.document.get("socket")?.inside).toBe("network");
    expect(await bot.call("check_layout")).toContain("Nothing to report");
    console.log(
      `Batched workspace: ${all.length} items, 1 write, ${elapsed.toFixed(1)} ms locally`
    );
  });

  it("reports overlaps and tight text without drawing", async () => {
    await person();
    const bot = await agent();
    await bot.call("open_room", { room: ROOM });
    await bot.call("write", {
      statements: `node a "A" at 0,0 size 160,90
node b "B" at 40,20 size 160,90
note n "A sentence long enough that it cannot possibly fit inside a box this small" at 400,0 size 120,40`,
    });
    const check = await bot.call("check_layout");
    expect(check).toContain("Layout check: 3 objects looked at");
    expect(check).toContain('a "A" and b "B"');
    expect(check).toContain("Text that may not fit");
    expect(await bot.call("check_layout", { items: ["n"] })).not.toContain("Overlaps");
  });
});
