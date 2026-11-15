import { build } from "esbuild";
import { env } from "node:process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const revision = env.GITHUB_SHA || "local";
if (!/^[a-zA-Z0-9_-]+$/.test(revision)) throw new Error("Invalid build revision.");
const outfile = `dist/downloads/arconis-${revision}.mjs`;
const result = await build({
  entryPoints: ["src/cli/main.ts"],
  bundle: true,
  minify: true,
  platform: "node",
  target: "node24",
  format: "esm",
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  outfile,
  metafile: true,
  write: false,
});

// Keep notices with the standalone download, including dependencies absent from the browser bundle.
const notices = [
  await readFile("../LICENSE", "utf8"),
  await readFile("public/third-party-icons.txt", "utf8"),
];
const roots = new Set();
for (const input of Object.keys(result.metafile.inputs)) {
  if (!input.includes("node_modules/")) continue;
  const root = await packageRoot(input);
  if (root) roots.add(root);
}
for (const root of [...roots].sort()) {
  const metadata = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const texts = [];
  for (const name of [
    "LICENSE",
    "LICENSE.txt",
    "LICENSE.md",
    "LICENSE-MIT",
    "COPYING",
    "license",
    "license.txt",
    "license.md",
  ])
    if (existsSync(join(root, name))) texts.push(await readFile(join(root, name), "utf8"));
  notices.push(
    `${metadata.name} ${metadata.version}\n${texts.join("\n") || metadata.license || "See package license"}`
  );
}
await mkdir(dirname(outfile), { recursive: true });
await writeFile(
  outfile,
  `${result.outputFiles[0].text}\n/* Third-party notices\n${notices.join("\n\n").replaceAll("*/", "* /")}\n*/\n`
);

async function packageRoot(input) {
  let path = dirname(resolve(input));
  while (path.includes("node_modules")) {
    const manifest = join(path, "package.json");
    if (existsSync(manifest) && JSON.parse(await readFile(manifest, "utf8")).name) return path;
    path = dirname(path);
  }
  return null;
}
