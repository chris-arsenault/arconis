import { expect, it } from "vitest";
import { ROOM, agent, person } from "./agentTestHarness";
import { layerCommands } from "../document/layerCommands";

it("lets an agent find the layers, put an addition in its own layer and undo only its own work", async () => {
  const alice = await person();
  const bot = await agent();
  expect(await bot.call("canvas_help", { topic: "layers" })).toContain("in-layer <id>");
  await bot.call("open_room", { room: ROOM });
  expect(await bot.call("describe_canvas")).toContain(
    '// Layers, bottom to top, beneath markup: base "Workspace" (0)'
  );

  const result = await bot.call("write", {
    statements: 'layer review "Review notes"\nnote n1 "Check the retry policy" in-layer review',
  });
  expect(result).toMatch(/^\/\/ Done:/);
  await expect.poll(() => alice.document.get("n1")?.layer).toBe("review");
  expect(alice.document.layerList().map((layer) => layer.name)).toEqual([
    "Workspace",
    "Review notes",
  ]);
  expect(await bot.call("describe_canvas")).toContain('review "Review notes" (1)');
  expect(await bot.call("read")).toContain('layer review "Review notes"');

  // A person's own layer survives the agent undoing its write.
  const mine = layerCommands.create(alice.document, "Mine");
  await expect.poll(async () => await bot.call("describe_canvas")).toContain('"Mine" (0)');
  await bot.call("undo");
  await expect.poll(() => alice.document.get("n1")).toBeNull();
  expect(alice.document.layerList().map((layer) => layer.id)).toEqual(["base", mine]);
});
