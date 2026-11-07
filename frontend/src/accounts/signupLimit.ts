/** New accounts allowed each UTC day. */
export const SIGNUP_LIMIT_PER_DAY = 10;
export const SIGNUPS_FULL = "New accounts are full for today, so please try again tomorrow";
export const SIGNUPS_UNAVAILABLE =
  "New accounts are unavailable right now, so please try again later";
/** The only source a person can reach: administrators creating accounts are not limited. */
const SELF_SIGNUP = "PreSignUp_SignUp";

export interface SignupLimitDeps {
  now(): number;
  /** Claims one of the day's places, and answers whether one was left. */
  claim(day: string, limit: number): Promise<boolean>;
}

/**
 * Cognito's pre sign-up trigger. Throwing refuses the account, and Cognito hands the message to the
 * browser, so a failed count refuses too: the limit holds even when it cannot be read.
 */
export async function admitSignup<Event extends { triggerSource: string }>(
  event: Event,
  deps: SignupLimitDeps
) {
  if (event.triggerSource !== SELF_SIGNUP) return event;
  const day = new Date(deps.now()).toISOString().slice(0, 10);
  let admitted: boolean;
  try {
    admitted = await deps.claim(day, SIGNUP_LIMIT_PER_DAY);
  } catch (error) {
    console.error(error);
    throw new Error(SIGNUPS_UNAVAILABLE);
  }
  if (!admitted) throw new Error(SIGNUPS_FULL);
  return event;
}
