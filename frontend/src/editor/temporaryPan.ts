import type { EditorController } from "./controller";

type SuspendedTool = Pick<
  EditorController,
  "tool" | "armedIcon" | "armedScreen" | "connectionSource"
>;

/** Holding Space borrows the hand tool without forgetting the instrument that was in use. */
export class TemporaryPan {
  private previous: SuspendedTool | null = null;
  constructor(private editor: EditorController) {}
  start() {
    if (this.previous !== null) return;
    const { tool, armedIcon, armedScreen, connectionSource } = this.editor;
    this.previous = { tool, armedIcon, armedScreen, connectionSource };
    this.editor.setTool("pan");
  }
  release = () => {
    const previous = this.previous;
    this.previous = null;
    if (previous !== null && this.editor.tool === "pan") {
      this.editor.setTool(previous.tool);
      Object.assign(this.editor, previous);
      this.editor.emit();
    }
  };
}
