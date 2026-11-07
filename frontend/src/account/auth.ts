import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserAttribute,
  CognitoUserPool,
  type CognitoUserSession,
} from "amazon-cognito-identity-js";

export interface AccountConfig {
  cognitoUserPoolId: string;
  cognitoClientId: string;
  /** Where the accounts API is reached. */
  relayUrl: string;
  /** Test fixtures only: a stand-in for Cognito. */
  cognitoEndpoint?: string;
}

/** What the account needs from Cognito. Sign-in uses SRP, so the password never leaves the browser. */
export interface Auth {
  signUp(email: string, password: string): Promise<void>;
  confirm(email: string, code: string): Promise<void>;
  resendCode(email: string): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  /** A current token, refreshed if needed, or null when signed out. */
  token(): Promise<string | null>;
  email(): string | null;
  signOut(): void;
  forgotPassword(email: string): Promise<void>;
  resetPassword(email: string, code: string, password: string): Promise<void>;
  changePassword(current: string, next: string): Promise<void>;
}

function done(resolve: () => void, reject: (error: Error) => void) {
  return (error: Error | undefined | null) => {
    if (error) reject(error);
    else resolve();
  };
}

export function cognitoAuth(config: AccountConfig): Auth {
  const pool = new CognitoUserPool({
    UserPoolId: config.cognitoUserPoolId,
    ClientId: config.cognitoClientId,
    endpoint: config.cognitoEndpoint,
  });
  const user = (email: string) => new CognitoUser({ Username: email, Pool: pool });
  const session = (current: CognitoUser) =>
    new Promise<CognitoUserSession>((resolve, reject) =>
      current.getSession((error: Error | null, value: CognitoUserSession | null) => {
        if (value) resolve(value);
        else reject(error ?? new Error("Sign in again."));
      })
    );
  return {
    signUp: (email, password) =>
      new Promise((resolve, reject) => {
        const attribute = new CognitoUserAttribute({ Name: "email", Value: email });
        pool.signUp(email, password, [attribute], [], (error) => done(resolve, reject)(error));
      }),
    confirm: (email, code) =>
      new Promise((resolve, reject) =>
        user(email).confirmRegistration(code, true, (error: Error | null) =>
          done(resolve, reject)(error)
        )
      ),
    resendCode: (email) =>
      new Promise((resolve, reject) =>
        user(email).resendConfirmationCode((error) => done(resolve, reject)(error))
      ),
    signIn: (email, password) =>
      new Promise((resolve, reject) =>
        user(email).authenticateUser(
          new AuthenticationDetails({ Username: email, Password: password }),
          { onSuccess: () => resolve(), onFailure: reject }
        )
      ),
    token: async () => {
      const current = pool.getCurrentUser();
      if (!current) return null;
      try {
        return (await session(current)).getAccessToken().getJwtToken();
      } catch {
        return null;
      }
    },
    email: () => pool.getCurrentUser()?.getUsername() ?? null,
    signOut: () => pool.getCurrentUser()?.signOut(),
    forgotPassword: (email) =>
      new Promise((resolve, reject) =>
        user(email).forgotPassword({ onSuccess: () => resolve(), onFailure: reject })
      ),
    resetPassword: (email, code, password) =>
      new Promise((resolve, reject) =>
        user(email).confirmPassword(code, password, {
          onSuccess: () => resolve(),
          onFailure: reject,
        })
      ),
    changePassword: async (current, next) => {
      const account = pool.getCurrentUser();
      if (!account) throw new Error("Sign in again.");
      await session(account);
      await new Promise<void>((resolve, reject) =>
        account.changePassword(current, next, (error) => done(resolve, reject)(error))
      );
    },
  };
}
