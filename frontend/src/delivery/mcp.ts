import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { accessTokenVerifier } from "../relay/accessTokens";
import { deliveryDiscoveryPath, deliveryScope, type DeliveryService } from "./hosted";
import { operations } from "./actions";
import { deliveryInstructions } from "./review";
import { uploadSchema } from "./hosted";

function response(value: unknown) {
  const data = JSON.stringify(value);
  const reply = {
    content: [{ type: "text" as const, text: data }],
    structuredContent: { data: value },
  };
  if (Buffer.byteLength(JSON.stringify(reply)) > 850_000)
    throw new Error("Select a smaller result or download the project files.");
  return reply;
}
function register(server: McpServer, service: DeliveryService, user: string) {
  server.registerTool(
    "list_projects",
    { description: "Find your Arconis Delivery projects." },
    async () => response(await service.list(user))
  );
  server.registerTool(
    "create_project",
    { description: "Create a standalone project.", inputSchema: { title: z.string().min(1) } },
    async ({ title }) => response(await service.create(user, title))
  );
  server.registerTool(
    "download_project",
    {
      description: "Get a signed link to the current portable project revision.",
      inputSchema: { project: z.string() },
    },
    async ({ project }) => response(await service.download(user, project))
  );
  server.registerTool(
    "batch_edit",
    {
      description:
        "Apply ordinary Delivery CLI edits together. Use the displayed titles or numbers. Do not include the command prefix. For example: work edit Districts --next 'Add interior parks'.",
      inputSchema: { project: z.string(), target: z.string(), edits: z.array(z.string()).min(1) },
    },
    async ({ project, target, edits }) =>
      response(await service.batch(user, project, target, edits))
  );
  server.registerTool(
    "begin_upload",
    {
      description:
        "Get a signed PUT link for attachment bytes. Supply byte count and base64 SHA-256. Send the given headers with the upload.",
      inputSchema: { project: z.string(), ...uploadSchema.shape },
    },
    async ({ project, size, checksum }) =>
      response(await service.stage(user, project, size, checksum))
  );
  server.registerTool(
    "attach_upload",
    {
      description: "Attach an uploaded screenshot to the exact result under review.",
      inputSchema: {
        project: z.string(),
        target: z.string(),
        path: z.string(),
        transfer: z.string(),
      },
    },
    async ({ project, ...input }) => response(await service.attach(user, project, input))
  );
  server.registerTool(
    "open_file",
    {
      description:
        "Download a diagram, design document, dataset or review artifact by project path.",
      inputSchema: { project: z.string(), target: z.string() },
    },
    async ({ project, target }) => response(await service.readFile(user, project, target))
  );
  registerOperations(server, service, user);
}
function registerOperations(server: McpServer, service: DeliveryService, user: string) {
  for (const [name, operation] of Object.entries(operations)) {
    if (!(operation.schema instanceof z.ZodObject)) continue;
    const schema = operation.schema.extend({ project: z.string() });
    server.registerTool(
      name,
      {
        description: operationDescriptions[name] ?? name.replaceAll("_", " "),
        inputSchema: schema,
        annotations: { readOnlyHint: operation.read },
      },
      async ({ project, ...args }) =>
        response(await service.call(user, z.string().parse(project), { operation: name, args }))
    );
  }
}
const operationDescriptions: Record<string, string> = {
  work_read:
    "Read one item with live ancestor guidance and current result. Use review=true for the guided design review.",
  work_add:
    "Create independent work under an existing item. Pass source references in from to link the work to its basis.",
  work_edit:
    "Change only supplied fields of the selected work item. Keep unrelated work and governing decisions.",
  result_add:
    "Record what changed and the design state it was based on. Follow with attach_upload for an image.",
  review_add: "Record accepted parts and remaining work against an exact result.",
  link_add:
    "Relate work, design sections, dataset row keys, diagram objects or results. Supply the purpose of the link.",
  link_list: "List relationships from either endpoint.",
  dataset_read: "Read the schema or filter and project rows by fields and key.",
  file_write: "Save a mutable design document, typed dataset, or portable Draw file in a project.",
};

export function deliveryMcp(
  service: DeliveryService,
  resource: string,
  issuer: string,
  verify = accessTokenVerifier({ resource, issuer })
) {
  const metadataUrl = new URL(deliveryDiscoveryPath, resource).href;
  const challenge = () =>
    Response.json(
      { error: "Sign in to Arconis Delivery." },
      { status: 401, headers: { "www-authenticate": `Bearer resource_metadata="${metadataUrl}"` } }
    );
  return async (request: Request) => {
    if (request.method === "GET" && new URL(request.url).pathname === deliveryDiscoveryPath)
      return Response.json({
        resource,
        authorization_servers: [issuer],
        scopes_supported: [deliveryScope, "offline_access"],
        bearer_methods_supported: ["header"],
        resource_name: "Arconis Delivery",
      });
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return challenge();
    const caller = await verify(authorization.slice(7));
    if (!caller) return challenge();
    if (!caller.scopes.includes(deliveryScope))
      return Response.json(
        { error: "The connector needs the edit:delivery scope." },
        { status: 403 }
      );
    return executeCall(request, service, caller.user);
  };
}

async function executeCall(request: Request, service: DeliveryService, user: string) {
  if (request.method === "GET")
    return new Response(null, { status: 405, headers: { allow: "POST" } });
  const server = new McpServer(
    { name: "Arconis Delivery", version: "1.0.0" },
    { instructions: deliveryInstructions }
  );
  register(server, service, user);
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  await server.connect(transport);
  try {
    const reply = await transport.handleRequest(request);
    return new Response(reply.body ? await reply.text() : null, {
      status: reply.status,
      headers: reply.headers,
    });
  } finally {
    await server.close();
  }
}
