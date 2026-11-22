import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import {
  WorkspaceConflict,
  WorkspaceStorage,
  type WorkspaceFetch,
} from "../account/workspaceStorage";
import type { SavedCopy } from "../account/workspaceFile";
import { LanguageError } from "../language/lexer";
import type { AccountReply, WorkspaceInvocation } from "../protocol/account";

type LoadedWorkspace = { copy: SavedCopy; revision: string };
export type WorkspaceAccount = Pick<WorkspaceStorage, "save"> & {
  idForRoom(roomId: string): Promise<string | null>;
  open(id: string): Promise<LoadedWorkspace>;
};
export type AgentWorkspaceStorage = (user: string) => WorkspaceAccount;

export function accountWorkspaceStorage(
  invoke: (payload: WorkspaceInvocation) => Promise<unknown>,
  request: WorkspaceFetch = (url, init) => fetch(url, { ...init, redirect: "error" })
): AgentWorkspaceStorage {
  return (user) => {
    const api = async (
      method: WorkspaceInvocation["method"],
      path: string,
      body: WorkspaceInvocation["body"] = null
    ) => {
      const reply = (await invoke({
        arconisWorkspace: true,
        user,
        method,
        path,
        body,
      })) as AccountReply;
      if (reply.status === 200) return reply.body;
      if (reply.status === 404)
        throw new LanguageError("This workspace is unavailable to your Arconis account.");
      if ("code" in reply.body && reply.body.code === "workspace_conflict")
        throw new WorkspaceConflict(reply.body.error);
      throw new LanguageError(reply.body.error);
    };
    const storage = new WorkspaceStorage(api, request);
    return {
      idForRoom: async (roomId) => {
        const result = await api("GET", "workspaces");
        if (!("workspaces" in result)) throw new Error("Expected a workspace list.");
        return result.workspaces.find((entry) => entry.roomId === roomId)?.id ?? null;
      },
      open: async (id) => storage.load(`workspaces/${id}`),
      save: storage.save.bind(storage),
    };
  };
}

/** The workspace API receives the user from the token verified at the relay. */
export function lambdaWorkspaceStorage(functionName: string) {
  const lambda = new LambdaClient({});
  return accountWorkspaceStorage(async (payload) => {
    const result = await lambda.send(
      new InvokeCommand({ FunctionName: functionName, Payload: JSON.stringify(payload) })
    );
    if (result.FunctionError || !result.Payload) throw new Error("Workspace invocation failed.");
    return JSON.parse(Buffer.from(result.Payload).toString("utf8")) as unknown;
  });
}
