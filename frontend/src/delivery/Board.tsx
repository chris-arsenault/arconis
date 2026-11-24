import { useEffect, useMemo, useState } from "react";
import { oidcAuth, type AccountConfig } from "../account/auth";
import { DeliveryClient } from "./client";
import type { Head } from "./hosted";
import type { Project } from "./project";
import { BoardProject, boardAddress } from "./BoardProject";
import "./board.css";

type BoardState =
  | { kind: "loading" }
  | { kind: "signed_out" }
  | { kind: "error"; message: string }
  | { kind: "projects"; projects: Head[] }
  | { kind: "project"; project: Project };

function configuredAccount() {
  const config = window.__APP_CONFIG__ as Partial<AccountConfig> | undefined;
  if (!config?.authAuthority || !config.authClientId || !config.relayUrl) return null;
  const auth = oidcAuth(config as AccountConfig);
  const api = new DeliveryClient(config.relayUrl, async () => (await auth.token()) ?? "");
  return { auth, api };
}

export function DeliveryBoard({ address }: Readonly<{ address: string }>) {
  const services = useMemo(() => configuredAccount(), []);
  useEffect(() => {
    const title = document.title;
    document.title = "Arconis Delivery";
    return () => {
      document.title = title;
    };
  }, []);
  const projectId = boardAddress(address).project;
  const [state, setState] = useState<BoardState>({ kind: "loading" });
  useEffect(() => {
    let enabled = true;
    if (!services) return;
    const update = (value: BoardState) => {
      if (enabled) setState(value);
    };
    const load = async () => {
      await services.auth.completeSignIn();
      if (!(await services.auth.token())) {
        update({ kind: "signed_out" });
        return;
      }
      if (projectId) {
        update({ kind: "project", project: await services.api.read(projectId) });
        return;
      }
      update({ kind: "projects", projects: await services.api.list() });
    };
    void load().catch((error: unknown) =>
      update({ kind: "error", message: error instanceof Error ? error.message : String(error) })
    );
    return () => {
      enabled = false;
    };
  }, [services, projectId]);
  return (
    <main className="delivery-board">
      <header className="delivery-header">
        <a href="#delivery">
          Arconis <strong>Delivery</strong>
        </a>
        <a href="/">Draw</a>
      </header>
      {!services && (
        <p className="delivery-message">
          Arconis Delivery accounts are unavailable in this environment.
        </p>
      )}
      {services && (
        <BoardContent state={state} address={address} signIn={() => void services.auth.signIn()} />
      )}
    </main>
  );
}
function BoardContent({
  state,
  address,
  signIn,
}: Readonly<{
  state: BoardState;
  address: string;
  signIn: () => void;
}>) {
  switch (state.kind) {
    case "loading":
      return (
        <p className="delivery-message" role="status">
          Loading Delivery…
        </p>
      );
    case "signed_out":
      return (
        <div className="delivery-message">
          <h1>Arconis Delivery</h1>
          <button onClick={signIn}>Sign in</button>
        </div>
      );
    case "error":
      return (
        <p className="delivery-message" role="alert">
          {state.message}
        </p>
      );
    case "projects":
      return (
        <section className="delivery-projects">
          <h1>Projects</h1>
          {state.projects.length === 0 ? (
            <p>Connect the Delivery MCP or sync a local project to see it here.</p>
          ) : null}
          <ul>
            {state.projects.map((project) => (
              <li key={project.project}>
                <a href={`#delivery=${project.project}`}>{project.title}</a>
              </li>
            ))}
          </ul>
        </section>
      );
    case "project":
      return <BoardProject project={state.project} address={address} />;
  }
}
