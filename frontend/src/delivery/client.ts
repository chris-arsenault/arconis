import { z } from "zod";
import { canonical, headSchema, manifestSchema, type Project } from "./project";

type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;
const basic = (input: string | URL, init?: RequestInit) => fetch(input, init);
const grant = z.object({
  transfer: z.string(),
  url: z.url(),
  headers: z.record(z.string(), z.string()),
});
const download = headSchema.extend({ url: z.url() });

async function checked(reply: Response) {
  if (reply.ok) return reply;
  const value: unknown = await reply.json().catch(() => null);
  const message =
    value && typeof value === "object" && "error" in value && typeof value.error === "string"
      ? value.error
      : `Delivery request returned HTTP ${reply.status}.`;
  throw new Error(message);
}
export class DeliveryClient {
  constructor(
    readonly origin: string,
    private token: () => Promise<string>,
    private request: Fetcher = basic
  ) {}

  async json(path: string, payload?: object) {
    const token = await this.token();
    if (!token) throw new Error("Sign in to Arconis Delivery.");
    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
    const reply = await checked(
      await this.request(
        new URL(path, this.origin),
        payload === undefined
          ? { headers }
          : { method: "POST", headers, body: JSON.stringify(payload) }
      )
    );
    return (await reply.json()) as unknown;
  }
  async list() {
    return z.object({ projects: z.array(headSchema) }).parse(await this.json("/api/delivery"))
      .projects;
  }
  private async snapshot(url: string) {
    return manifestSchema.parse((await (await checked(await this.request(url))).json()) as unknown);
  }
  async read(project: string) {
    const route = "/api/delivery/" + encodeURIComponent(project);
    const meta = download.parse(await this.json(route));
    return this.snapshot(meta.url);
  }
  async sync(project: Project) {
    const route = "/api/delivery/" + encodeURIComponent(project.id);
    const body = canonical(project);
    const bytes = new TextEncoder().encode(body);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const checksum = btoa(String.fromCharCode(...digest));
    const ticket = grant.parse(
      await this.json(route + "/stage", { size: bytes.byteLength, checksum })
    );
    await checked(
      await this.request(ticket.url, { method: "PUT", headers: ticket.headers, body: bytes })
    );
    const meta = download.parse(await this.json(route + "/publish", { transfer: ticket.transfer }));
    return this.snapshot(meta.url);
  }
}
