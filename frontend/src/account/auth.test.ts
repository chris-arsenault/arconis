import { expect, it } from "vitest";
import { signInFailure } from "./auth";

it("reads why a sign-in came back refused, in the words the sign-in service used", () => {
  const refused = new URLSearchParams({
    state: "s",
    error: "access_denied",
    error_description: "Activate your Arconis account from the email we sent, then sign in again.",
  });
  expect(signInFailure(refused)?.message).toBe(
    "Activate your Arconis account from the email we sent, then sign in again."
  );
  expect(signInFailure(new URLSearchParams({ error: "server_error" }))?.message).toBe(
    "server_error"
  );
});

it("finds nothing wrong with a sign-in that came back with a code", () => {
  expect(signInFailure(new URLSearchParams({ state: "s", code: "c" }))).toBeNull();
});
