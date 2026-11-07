/** New accounts allowed each UTC day. */
export const SIGNUP_LIMIT_PER_DAY = 10;
export const SIGNUPS_FULL = "New accounts are full for today, so please try again tomorrow.";
export const SIGNUPS_UNAVAILABLE =
  "New accounts are unavailable right now, so please try again later.";

export interface SignupLimitDeps {
  now(): number;
  /** How many Arconis accounts were created at or after this time. */
  createdSince(time: number): Promise<number>;
}

/**
 * Decides one sign-up, returning what to tell the person when it is refused. A failed count refuses
 * too, so the limit holds even when it cannot be read.
 */
export async function signupRefusal(deps: SignupLimitDeps): Promise<string | null> {
  const now = new Date(deps.now());
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  try {
    return (await deps.createdSince(dayStart)) >= SIGNUP_LIMIT_PER_DAY ? SIGNUPS_FULL : null;
  } catch (error) {
    console.error(error);
    return SIGNUPS_UNAVAILABLE;
  }
}
