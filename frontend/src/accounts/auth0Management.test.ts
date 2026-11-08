import { expect, it, vi } from "vitest";
import { auth0Management } from "./auth0Management";

it("deletes a user through the Management API", async () => {
  const calls: string[] = [];
  const request = vi.fn((url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${new URL(url).pathname}`);
    if (url.endsWith("/oauth/token"))
      return Promise.resolve(Response.json({ access_token: "t", expires_in: 86400 }));
    return Promise.resolve(new Response(null, { status: 204 }));
  });
  const management = auth0Management(
    { domain: "tenant.example", clientId: "id", clientSecret: "secret" },
    request
  );
  await management.deleteUser("auth0|a");
  expect(calls).toEqual(["POST /oauth/token", "DELETE /api/v2/users/auth0%7Ca"]);
});
