import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { CANVAS_OPERATIONS, toolResult } from "../agents/operations";
import { AGENT_INSTRUCTIONS } from "../agents/instructions";
import { FileActions } from "./actions";

async function reply(work: () => Promise<unknown>) {
  try {
    return toolResult(await work());
  } catch (error) {
    return {
      content: [
        { type: "text" as const, text: error instanceof Error ? error.message : String(error) },
      ],
      isError: true,
    };
  }
}

export async function serveLocalMcp(actions: FileActions) {
  const server = new McpServer(
    { name: "arconis-local", version: "3.0.0" },
    {
      instructions: `${AGENT_INSTRUCTIONS}\nLocal file mode. open_file selects one .arconis file, unless --file already opened it. No account or network is required. Each successful mutation commits to the file. close_file releases its lock. The standard CLI is available without MCP registration.`,
    }
  );
  for (const tool of CANVAS_OPERATIONS)
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: {
          readOnlyHint: !tool.mutates,
          destructiveHint: tool.mutates,
          openWorldHint: false,
        },
      },
      (args: Record<string, unknown>) => reply(() => actions.call(tool.name, args))
    );
  server.registerTool(
    "open_file",
    {
      description:
        "Open a local .arconis file; optional create opens a new empty document. No MCP session id or account needed.",
      inputSchema: { path: z.string(), create: z.boolean().default(false) },
    },
    ({ path, create }) => reply(() => actions.open(path, create))
  );
  server.registerTool(
    "close_file",
    { description: "Close the local file session and release its lock.", inputSchema: {} },
    () =>
      reply(async () => {
        await actions.close();
        return "File closed.";
      })
  );
  server.server.onclose = () => {
    void actions.close();
  };
  process.stdin.once("end", () => {
    void server.close().finally(() => actions.close());
  });
  await server.connect(new StdioServerTransport());
}
