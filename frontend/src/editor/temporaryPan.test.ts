import { expect, it } from "vitest";
import { TemporaryPan } from "./temporaryPan";
import type { EditorController, Tool } from "./controller";

it("restores placement payloads and connection sources after a repeated Space hold", () => {
  const editor = {
    tool: "icon" as Tool,
    armedIcon: { key: "aws:AWS-Lambda", title: "AWS Lambda" },
    armedScreen: null,
    connectionSource: "source",
    emit() {},
    setTool(this: EditorController, tool: Tool) {
      this.tool = tool;
      this.armedIcon = null;
      this.connectionSource = "";
    },
  } as unknown as EditorController;
  const pan = new TemporaryPan(editor);
  pan.start();
  pan.start();
  expect(editor.tool).toBe("pan");
  pan.release();
  expect(editor.tool).toBe("icon");
  expect(editor.armedIcon?.key).toBe("aws:AWS-Lambda");
  expect(editor.connectionSource).toBe("source");
  pan.start();
  editor.setTool("select");
  pan.release();
  expect(editor.tool).toBe("select");
});
