import { expect, it } from "vitest";
import { SIGNUPS_FULL } from "../accounts/signupLimit";
import { signUpFailure } from "./auth";

it("shows the sign-up limit's own words rather than Cognito's wrapping", () => {
  const wrapped = new Error(`PreSignUp failed with error ${SIGNUPS_FULL}.`);
  expect(signUpFailure(wrapped).message).toBe(`${SIGNUPS_FULL}.`);
});

it("leaves every other failure alone", () => {
  const taken = new Error("An account with the given email already exists.");
  expect(signUpFailure(taken)).toBe(taken);
});
