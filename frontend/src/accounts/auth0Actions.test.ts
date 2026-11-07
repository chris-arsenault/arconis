import { expect, it, vi } from "vitest";
import { NOT_ACTIVATED, refuseLogin, refuseSignup } from "./auth0Actions";
import {
  arconisUsers,
  auth0Management,
  federatedUserId,
  type Auth0Management,
} from "./auth0Management";
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

it("finds the Auth0 user behind a federated pool user", () => {
  const identities = JSON.stringify([{ userId: "auth0|abc", providerName: "Auth0" }]);
  expect(federatedUserId([{ Name: "identities", Value: identities }])).toBe("auth0|abc");
  expect(federatedUserId([{ Name: "email", Value: "a@example.com" }])).toBeNull();
  expect(federatedUserId([{ Name: "identities", Value: "not json" }])).toBeNull();
});

it("counts, lists and deletes users through the Management API with one token", async () => {
  const calls: string[] = [];
  const pages = [
    { users: [{ user_id: "auth0|a", email_verified: true, created_at: "2026-11-01T00:00:00Z" }] },
    { users: [{ user_id: "auth0|b", created_at: "2026-11-02T00:00:00Z" }] },
  ];
  const request = vi.fn((url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${new URL(url).pathname}`);
    if (url.endsWith("/oauth/token"))
      return Promise.resolve(Response.json({ access_token: "t", expires_in: 86400 }));
    if (init?.method === "DELETE") return Promise.resolve(new Response(null, { status: 204 }));
    const page = Number(new URL(url).searchParams.get("page"));
    return Promise.resolve(Response.json({ ...(pages[page] ?? { users: [] }), total: 2 }));
  });
  const management = auth0Management(
    { domain: "tenant.example", clientId: "id", clientSecret: "secret" },
    request
  );
  const users = [];
  for await (const user of management.users(arconisUsers())) users.push(user);
  expect(users).toEqual([
    { id: "auth0|a", verified: true, created: Date.parse("2026-11-01T00:00:00Z") },
    { id: "auth0|b", verified: false, created: Date.parse("2026-11-02T00:00:00Z") },
  ]);
  await expect(management.count(arconisUsers())).resolves.toBe(2);
  await management.deleteUser("auth0|a");
  expect(calls.filter((call) => call.endsWith("/oauth/token"))).toHaveLength(1);
  expect(calls.at(-1)).toBe("DELETE /api/v2/users/auth0%7Ca");
});
