import { stderr } from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";

const metadata = z.object({ issuer: z.url(), clientId: z.string().min(1), audience: z.url() });
const codeSchema = z.object({
  device_code: z.string().min(1),
  user_code: z.string().min(1),
  verification_uri: z.url(),
  expires_in: z.int().positive(),
  interval: z.int().positive().default(5),
});
const grant = "urn:ietf:params:oauth:grant-type:device_code";
const access = z.object({ access_token: z.string().min(1) });
const failure = z.object({ error: z.string() });

async function post(url: URL, body: Record<string, string>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  return { ok: response.ok, data: (await response.json()) as unknown };
}
async function awaitToken(config: z.infer<typeof metadata>, device: z.infer<typeof codeSchema>) {
  const expires = Date.now() + device.expires_in * 1000;
  let interval = device.interval * 1000;
  while (Date.now() + interval < expires) {
    await delay(interval);
    const reply = await post(new URL("oauth/token", config.issuer), {
      grant_type: grant,
      device_code: device.device_code,
      client_id: config.clientId,
    });
    if (reply.ok) return access.parse(reply.data).access_token;
    const error = failure.parse(reply.data).error;
    if (error === "slow_down") {
      interval += 5000;
      continue;
    }
    if (error !== "authorization_pending")
      throw new Error(`Arconis Delivery sign-in ended: ${error}.`);
  }
  throw new Error("Arconis Delivery sign-in expired. Run sync again.");
}

export async function cliToken(origin: string) {
  if (process.env.ARCONIS_DELIVERY_TOKEN) return process.env.ARCONIS_DELIVERY_TOKEN;
  const discovery = await fetch(new URL("/delivery/cli", origin));
  if (!discovery.ok) throw new Error("Could not discover Arconis Delivery sign-in.");
  const config = metadata.parse((await discovery.json()) as unknown);
  const reply = await post(new URL("oauth/device/code", config.issuer), {
    client_id: config.clientId,
    audience: config.audience,
    scope: "openid",
  });
  if (!reply.ok) throw new Error("Arconis Delivery could not start device sign-in.");
  const device = codeSchema.parse(reply.data);
  stderr.write(
    `Open ${device.verification_uri} in your browser and enter ${device.user_code} to sign in to Arconis Delivery.\n`
  );
  return awaitToken(config, device);
}
