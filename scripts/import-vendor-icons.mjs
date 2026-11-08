#!/usr/bin/env node
// Builds the lazily loaded vendor icon sets from each vendor's official download.
//
//   node scripts/import-vendor-icons.mjs <aws-dir> <azure-dir> <gcp-dir>
//
// Each directory is an extracted package. Rerun this when a vendor publishes a new release.
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUTPUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../frontend/src/assets/icons/vendorIcons",
);
const UNSAFE =
  /<script|<foreignObject|<iframe|\son[a-z]+\s*=|javascript:|(?:href|src)\s*=\s*["'](?!#|data:image)/i;

// Well-known short names that the official titles do not contain.
const AWS_ALIASES = {
  "Amazon Simple Storage Service": "s3",
  "Amazon Relational Database Service": "rds",
  "Amazon Virtual Private Cloud": "vpc",
  "Amazon Simple Queue Service": "sqs",
  "Amazon Simple Notification Service": "sns",
  "Amazon Elastic Container Service": "ecs",
  "Amazon Elastic Kubernetes Service": "eks",
  "Amazon Elastic Block Store": "ebs",
  "Elastic Load Balancing": "elb alb nlb",
  "AWS Identity and Access Management": "iam",
};

function svgFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    if (name === "__MACOSX") return [];
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return svgFiles(path);
    return name.toLowerCase().endsWith(".svg") ? [path] : [];
  });
}

function clean(svg) {
  const markup = svg
    .replace(/<\?xml[\s\S]*?\?>/g, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/>\s+</g, "><")
    .trim();
  if (!markup.startsWith("<svg") || UNSAFE.test(markup))
    throw new Error("unsafe or invalid SVG");
  return markup;
}

function words(text) {
  return text.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

function build(vendor, files, describe) {
  const seen = new Map();
  for (const file of files) {
    const entry = describe(file);
    if (!entry) continue;
    const key = `${vendor}:${entry.id}`;
    // Packages can repeat a product across folders; the first copy found wins.
    if (seen.has(entry.title.toLowerCase())) continue;
    let svg;
    try {
      svg = clean(readFileSync(file, "utf8"));
    } catch (error) {
      console.warn(`skipped ${file}: ${error.message}`);
      continue;
    }
    seen.set(entry.title.toLowerCase(), {
      key,
      title: entry.title,
      search: entry.search ?? "",
      svg,
    });
  }
  const icons = [...seen.values()].sort((a, b) =>
    a.title.localeCompare(b.title),
  );
  writeFileSync(join(OUTPUT, `${vendor}.json`), JSON.stringify(icons));
  console.log(`${vendor}: ${icons.length} icons`);
}

function describeAws(file) {
  const match = basename(file).match(/^Arch_(.+)_48\.svg$/);
  if (!match) return null;
  const title = words(match[1]);
  return { id: match[1], title, search: AWS_ALIASES[title] };
}

function describeAzure(file) {
  const match = basename(file).match(/^\d+-icon-service-(.+)\.svg$/);
  if (!match) return null;
  return { id: match[1], title: words(match[1]) };
}

function describeGcp(file) {
  const name = basename(file, ".svg");
  // The core product icons come in several sizes and colorways; the color one is canonical.
  if (/-512-color/.test(name) || !/\d/.test(name)) {
    const id = name.replace(/-512-color(-rgb)?$/, "");
    const title = words(id).replace(/\b[a-z]/g, (letter) =>
      letter.toUpperCase(),
    );
    return { id, title };
  }
  return null;
}

const [aws, azure, gcp] = process.argv.slice(2);
if (!aws || !azure || !gcp) {
  console.error(
    "usage: import-vendor-icons.mjs <aws-dir> <azure-dir> <gcp-dir>",
  );
  process.exit(64);
}
mkdirSync(OUTPUT, { recursive: true });
build("aws", svgFiles(aws), describeAws);
build("azure", svgFiles(azure), describeAzure);
build("gcp", svgFiles(gcp), describeGcp);
