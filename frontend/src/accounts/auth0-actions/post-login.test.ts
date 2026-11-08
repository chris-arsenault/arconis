import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import { getDefaultArguments, loadAction } from "@auth0/actions/post-login/v3/test";

/** The Action compiled with this directory's tsconfig, as `pnpm build:auth0-actions` compiles it. */
function compiled() {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const config = ts.getParsedCommandLineOfConfigFile(
    join(here, "tsconfig.json"),
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
      },
    }
  )!;
  const source = readFileSync(join(here, "post-login.ts"), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { ...config.options, module: ts.ModuleKind.CommonJS },
  });
  const file = join(mkdtempSync(join(tmpdir(), "post-login-")), "post-login.js");
  writeFileSync(file, outputText);
  return file;
}

/** Runs the Action through Auth0's own loader, which applies the same handler check as the tenant. */
async function login(connection: string, emailVerified: boolean) {
  const action = await loadAction(compiled());
  const [event, api] = getDefaultArguments();
  event.connection.name = connection;
  event.user.email_verified = emailVerified;
  const deny = vi.spyOn(api.access, "deny");
  await action.execute("onExecutePostLogin", event, api);
  return deny;
}

it("refuses an Arconis account until its email is verified", async () => {
  expect(await login("arconis", false)).toHaveBeenCalledWith(
    expect.stringContaining("Activate your Arconis account")
  );
  expect(await login("arconis", true)).not.toHaveBeenCalled();
});

it("leaves other products' logins alone", async () => {
  expect(await login("another-product", false)).not.toHaveBeenCalled();
});
