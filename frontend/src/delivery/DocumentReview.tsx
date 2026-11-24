import { describeLink, fragmentExists, markdownSection } from "./references";
import { readDataset, rowKey } from "./dataset";
import { projectWork, type Work } from "./work";
import type { DocumentVersion, Project } from "./project";
import { boardLink } from "./BoardProject";
import { References } from "./ItemReview";
import { DiagramPreview } from "./DiagramPreview";

const imageTypes: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};
function FileBody({ doc, part }: Readonly<{ doc: DocumentVersion; part: string }>) {
  const body = doc.body ?? "";
  if (!fragmentExists(doc, part))
    return <p>This linked target is unavailable. The current file can still be downloaded.</p>;
  if (doc.kind === "dataset") {
    const data = readDataset(body);
    const rows = part ? data.items.filter((row) => rowKey(data, row) === part) : data.items;
    return <DatasetTable fields={Object.keys(data.schema.fields)} rows={rows} />;
  }
  if (doc.kind === "artifact") return <EvidenceImage doc={doc} body={body} />;
  if (doc.kind === "diagram")
    return <DiagramSource key={doc.id} body={body} part={part} title={doc.title} />;
  return <pre>{part ? markdownSection(body, part) : body}</pre>;
}
function DiagramSource({
  body,
  part,
  title,
}: Readonly<{ body: string; part: string; title: string }>) {
  const relevant = body.split("\n").filter((line) => line.split(/\s+/).includes(part));
  return (
    <>
      <p>
        Diagram object <strong>{part}</strong>
      </p>
      <DiagramPreview key={part} body={body} part={part} title={title} />
      <details>
        <summary>Draw source</summary>
        <pre>{part ? relevant.join("\n") : body}</pre>
      </details>
    </>
  );
}
function DatasetTable({
  fields,
  rows,
}: Readonly<{ fields: string[]; rows: Record<string, unknown>[] }>) {
  return (
    <div className="delivery-table">
      <table>
        <thead>
          <tr>
            {fields.map((name) => (
              <th key={name} scope="col">
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {fields.map((name) => (
                <td key={name}>
                  {typeof row[name] === "string" ? row[name] : JSON.stringify(row[name])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function DocumentReview({
  project,
  item,
  doc,
  part,
}: Readonly<{
  project: Project;
  item: Work;
  doc: DocumentVersion;
  part: string;
}>) {
  const target = doc.kind === "artifact" ? `asset:${doc.id}` : `file:${doc.document}`;
  const links = [...projectWork(project.work).links.values()]
    .filter((link) =>
      [link.from, link.to].some(
        (endpoint) => endpoint === target || endpoint.startsWith(target + "#")
      )
    )
    .map((link) => describeLink(project, link));
  const body = doc.body ?? "";
  const download =
    doc.format === "base64"
      ? `data:application/octet-stream;base64,${body}`
      : `data:application/octet-stream,${encodeURIComponent(body)}`;
  return (
    <article>
      <a href={boardLink(project.id, item.id)}>Back to {item.title}</a>
      <header className="delivery-item-header">
        <h2>{doc.title}</h2>
        <a href={download} download={doc.path.split("/").at(-1)}>
          Download
        </a>
      </header>
      <FileBody doc={doc} part={part} />
      <References project={project} item={item} links={links} anchor={doc.document} />
    </article>
  );
}
function EvidenceImage({ doc, body }: Readonly<{ doc: DocumentVersion; body: string }>) {
  const mime = imageTypes[doc.path.split(".").at(-1)?.toLowerCase() ?? ""];
  return mime ? (
    <img className="delivery-evidence" src={`data:${mime};base64,${body}`} alt={doc.title} />
  ) : (
    <p>Download the artifact to inspect it.</p>
  );
}
