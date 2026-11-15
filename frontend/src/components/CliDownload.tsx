declare const __BUILD_REVISION__: string;

/** Stable setup link carried by portable exports; the download follows the current site revision. */
export function CliDownload() {
  return (
    <main className="welcome cli-download">
      <section className="welcome-content">
        <h1>Arconis CLI</h1>
        <p>
          Read and edit local .arconis diagrams through ordinary shell commands. Requires Node.js 24
          or newer. No MCP registration, Arconis account, browser session or remote server is
          needed.
        </p>
        <p>
          <a href={`/downloads/arconis-${__BUILD_REVISION__}.mjs`} download="arconis.mjs">
            Download Arconis CLI
          </a>
        </p>
        <p>
          Save the download as <code>arconis.mjs</code>. Coding agents must explain the tool and ask
          their user for permission before downloading or running it.
        </p>
        <pre>
          <code>{`node /path/to/arconis.mjs --help
node /path/to/arconis.mjs --file diagram.arconis read
node /path/to/arconis.mjs --file diagram.arconis --create write --statements 'node api "API"'
node /path/to/arconis.mjs --file diagram.arconis write --statements-file change.canvas
node /path/to/arconis.mjs --file diagram.arconis export_document --output copy.arconis`}</code>
        </pre>
        <p>
          Each successful mutation updates the file directly. Local operations do not upload its
          contents. Use <code>session</code> for several actions with undo history; standalone
          commands have no previous process&apos;s undo history.
        </p>
        <h2>Optional local MCP</h2>
        <p>
          If you prefer MCP, configure your agent client to run{" "}
          <code>node /path/to/arconis.mjs mcp --file /path/to/diagram.arconis</code>. It uses the
          same actions as the CLI; this setup is optional.
        </p>
        <p>
          Download a newer copy to update. Build: <code>{__BUILD_REVISION__}</code>. Dependency and
          icon notices accompany the site in <a href="/licenses.txt">licenses</a> and{" "}
          <a href="/third-party-icons.txt">icon terms</a>.
        </p>
        <p>
          <a href="/">Open Arconis</a>
        </p>
      </section>
    </main>
  );
}
