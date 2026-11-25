import { z } from "zod";
import { fileActions } from "./fileActions";
import { workActions } from "./workActions";
import type { Actor, Project } from "./project";
import { deliveryInstructions } from "./review";

type Operation = {
  schema: z.ZodType;
  read: boolean;
  run: (project: Project, actor: Actor, params: never) => unknown;
};

export const operations: Record<string, Operation> = {
  ...workActions,
  ...fileActions,
  help: {
    schema: z.object({}),
    read: true,
    run: () => ({
      instructions: deliveryInstructions,
      operations: [...Object.keys(operations), "file_search"],
    }),
  },
};

export const commandSchema = z.strictObject({
  operation: z.string(),
  args: z.record(z.string(), z.unknown()).default({}),
});
export type Command = z.input<typeof commandSchema>;
export function runDelivery(project: Project, actor: Actor, command: Command): unknown {
  const action = Object.hasOwn(operations, command.operation)
    ? operations[command.operation]
    : null;
  if (!action) throw new Error(`Unknown Delivery action: ${command.operation}`);
  return action.run(project, actor, action.schema.parse(command.args ?? {}) as never);
}
