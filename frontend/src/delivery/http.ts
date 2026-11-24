import { z } from "zod";
import { deliveryApiPath, DeliveryError, uploadSchema, type DeliveryService } from "./hosted";
import { commandSchema } from "./actions";

const requestBody = (text: string): unknown => JSON.parse(text || "{}") as unknown;
const projectInput = z.object({ title: z.string().min(1) });
const finishInput = z.object({ transfer: z.string() });

export async function deliveryRequest(
  service: DeliveryService,
  user: string,
  method: string,
  path: string,
  body: string
) {
  const segments = path.slice(deliveryApiPath.length).split("/").filter(Boolean);
  if (segments.length === 0) {
    if (method === "GET") return { projects: await service.list(user) };
    if (method === "POST") return service.create(user, projectInput.parse(requestBody(body)).title);
  }
  const [project, action] = segments;
  if (segments.length === 1 && method === "GET") return service.download(user, project);
  if (segments.length !== 2 || method !== "POST")
    throw new DeliveryError(404, "Unknown Delivery route.");
  return postOperation(service, user, project, action, requestBody(body));
}
function postOperation(
  service: DeliveryService,
  user: string,
  project: string,
  action: string,
  value: unknown
) {
  if (action === "stage") {
    const { size, checksum } = uploadSchema.parse(value);
    return service.stage(user, project, size, checksum);
  }
  if (action === "publish") return service.finish(user, project, finishInput.parse(value).transfer);
  if (action === "operation") return service.call(user, project, commandSchema.parse(value));
  throw new DeliveryError(404, "Unknown Delivery route.");
}
export function deliveryFailure(error: unknown) {
  if (error instanceof DeliveryError)
    return { status: error.status, body: { error: error.message } };
  if (error instanceof z.ZodError || error instanceof SyntaxError)
    return { status: 400, body: { error: "Invalid Delivery request." } };
  throw error;
}
