import { expect, it, vi } from "vitest";
import { NOT_ACTIVATED, refuseLogin, refuseSignup } from "./auth0Actions";
import { arconisUsers, auth0Management, type Auth0Management } from "./auth0Management";
import { SIGNUPS_FULL, SIGNUP_LIMIT_PER_DAY } from "./signupLimit";

const MIDDAY = Date.UTC(2026, 10, 7, 12);
const arconis = { connection: { name: "arconis" } };
const other = { connection: { name: "another-product" } };

function counting(total: number) {
  const count = vi.fn(() => Promise.resolve(total));
  return { count, management: { count } as unknown as Auth0Management };
}

it("holds Arconis sign-ups to the day's limit, counted from the UTC day's start", async () => {
  const full = counting(SIGNUP_LIMIT_PER_DAY);
  await expect(refuseSignup(arconis, full.management, MIDDAY)).resolves.toBe(SIGNUPS_FULL);
  expect(full.count).toHaveBeenCalledWith(arconisUsers(Date.UTC(2026, 10, 7)));
  const open = counting(SIGNUP_LIMIT_PER_DAY - 1);
  await expect(refuseSignup(arconis, open.management, MIDDAY)).resolves.toBeNull();
});

it("leaves other products' sign-ups and logins alone", async () => {
  const { count, management } = counting(SIGNUP_LIMIT_PER_DAY);
  await expect(refuseSignup(other, management, MIDDAY)).resolves.toBeNull();
  expect(count).not.toHaveBeenCalled();
  expect(refuseLogin({ ...other, user: {} })).toBeNull();
});

it("signs an Arconis account in only once its email is verified", () => {
  expect(refuseLogin({ ...arconis, user: { email_verified: false } })).toBe(NOT_ACTIVATED);
  expect(refuseLogin({ ...arconis, user: {} })).toBe(NOT_ACTIVATED);
  expect(refuseLogin({ ...arconis, user: { email_verified: true } })).toBeNull();
});

it("counts and deletes users through the Management API with one token", async () => {
  const calls: string[] = [];
  const request = vi.fn((url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${new URL(url).pathname}`);
    if (url.endsWith("/oauth/token"))
      return Promise.resolve(Response.json({ access_token: "t", expires_in: 86400 }));
    if (init?.method === "DELETE") return Promise.resolve(new Response(null, { status: 204 }));
    return Promise.resolve(Response.json({ users: [], total: 2 }));
  });
  const management = auth0Management(
    { domain: "tenant.example", clientId: "id", clientSecret: "secret" },
    request
  );
  await expect(management.count(arconisUsers(MIDDAY))).resolves.toBe(2);
  await management.deleteUser("auth0|a");
  expect(calls.filter((call) => call.endsWith("/oauth/token"))).toHaveLength(1);
  expect(calls.at(-1)).toBe("DELETE /api/v2/users/auth0%7Ca");
});
