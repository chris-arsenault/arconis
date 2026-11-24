import { useMemo, useState } from "react";
import { projectWork, terminal, type Work } from "./work";
import { currentDocuments, type Project } from "./project";
import { ItemReview } from "./ItemReview";
import { DocumentReview } from "./DocumentReview";

export function boardAddress(address: string) {
  const args = new URLSearchParams(address.slice(1));
  return {
    project: args.get("delivery"),
    item: args.get("work"),
    file: args.get("file"),
    part: args.get("part") ?? "",
  };
}
export function boardLink(project: string, item: string, file?: string, part?: string) {
  const args = new URLSearchParams({ delivery: project, work: item });
  if (file) args.set("file", file);
  if (part) args.set("part", part);
  return "#" + args.toString();
}

function childMap(items: Work[]) {
  const result = new Map<string, Work[]>();
  for (const item of items) {
    const group = result.get(item.parent ?? "") ?? [];
    group.push(item);
    result.set(item.parent ?? "", group);
  }
  for (const group of result.values())
    group.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
  return result;
}
function visibleItems(items: Map<string, Work>, query: string, closed: boolean, selected: string) {
  const keep = new Set<string>();
  const search = query.trim().toLowerCase();
  for (const item of items.values()) {
    const visible =
      (closed || !terminal(item)) && (!search || item.title.toLowerCase().includes(search));
    if (!visible && item.id !== selected) continue;
    let parent: Work | undefined = item;
    while (parent && !keep.has(parent.id)) {
      keep.add(parent.id);
      parent = items.get(parent.parent ?? "");
    }
  }
  return [...items.values()].filter((item) => keep.has(item.id));
}

type TreeProps = {
  node: Work;
  childrenById: Map<string, Work[]>;
  project: string;
  selected: string;
  openAll: boolean;
};
function TreeRow({ node, childrenById, project, selected, openAll }: Readonly<TreeProps>) {
  const children = childrenById.get(node.id) ?? [];
  const [open, setOpen] = useState(true);
  const expanded = open || openAll;
  return (
    <li>
      <div className="delivery-tree-row">
        {children.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpen(!expanded)}
            aria-expanded={expanded}
            aria-label={`Toggle ${node.title}`}
          >
            {expanded ? "−" : "+"}
          </button>
        ) : (
          <span className="delivery-tree-indent" />
        )}
        <a
          href={boardLink(project, node.id)}
          aria-current={selected === node.id ? "page" : undefined}
        >
          <span>{node.title}</span>
          <span className={`delivery-status delivery-status--${node.status}`}>
            {node.status.replaceAll("_", " ")}
          </span>
        </a>
      </div>
      {expanded && children.length > 0 ? (
        <ul>
          {children.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              childrenById={childrenById}
              project={project}
              selected={selected}
              openAll={openAll}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function BoardProject({
  project,
  address,
}: Readonly<{ project: Project; address: string }>) {
  const selection = boardAddress(address);
  const { items } = useMemo(() => projectWork(project.work), [project]);
  const selected = items.get(selection.item ?? "") ?? items.get(project.root);
  const [query, setQuery] = useState("");
  const [closed, setClosed] = useState(false);
  const visible = useMemo(
    () => childMap(visibleItems(items, query, closed, selected?.id ?? "")),
    [items, query, closed, selected]
  );
  const documents = useMemo(() => currentDocuments(project), [project]);
  const document =
    documents.find((doc) => doc.document === selection.file) ??
    project.documents.find((doc) => doc.kind === "artifact" && doc.id === selection.file);
  const root = items.get(project.root);
  if (!root || !selected) return <p role="alert">Project work could not be read.</p>;
  return (
    <div className="delivery-layout">
      <aside aria-label="Project work" className="delivery-sidebar">
        <h1>{root.title}</h1>
        <label className="delivery-search">
          Find work
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label className="delivery-closed">
          <input type="checkbox" checked={closed} onChange={(e) => setClosed(e.target.checked)} />{" "}
          Show closed work
        </label>
        <ul className="delivery-tree">
          <TreeRow
            node={root}
            childrenById={visible}
            project={project.id}
            selected={selected.id}
            openAll={!!query}
          />
        </ul>
        {documents.length > 0 && (
          <details>
            <summary>Project files</summary>
            <ul className="delivery-files">
              {documents.map((doc) => (
                <li key={doc.document}>
                  <a href={boardLink(project.id, selected.id, doc.document)}>{doc.title}</a>
                </li>
              ))}
            </ul>
          </details>
        )}
      </aside>
      <div className="delivery-detail">
        {document ? (
          <DocumentReview project={project} item={selected} doc={document} part={selection.part} />
        ) : (
          <ItemReview item={selected} project={project} />
        )}
        {selection.file && !document ? (
          <p role="status">This linked file has been removed. Its reference remains in history.</p>
        ) : null}
      </div>
    </div>
  );
}
