import type { Event, PostLoginAPI } from "@auth0/actions/post-login/v3";

/**
 * Handler that will be called during the execution of a PostLogin flow. Actions run for the whole
 * Ahara tenant, so it acts only on Arconis's connection: an Arconis account signs in only once its
 * email is verified.
 *
 * @param {Event} event - Details about the user and the context in which they are logging in.
 * @param {PostLoginAPI} api - Interface whose methods can be used to change the behavior of the login.
 */
exports.onExecutePostLogin = async (event: Event, api: PostLoginAPI) => {
  if (event.connection.name !== "arconis") return;
  if (!event.user.email_verified) {
    api.access.deny("Activate your Arconis account from the email we sent, then sign in again.");
  }
};
