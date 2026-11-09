import { CheckSquare, GitBranch, LockKeyhole, MessageSquare, Square, Tags } from "lucide-react";
import type { Rectangle } from "@maxgraph/core";
import type { EditorController } from "../editor/controller";
import { listComments, openThreadCounts } from "../document/comments";
import { referenceCounts, taskCounts } from "../document/relations";
import { type Item, typeLabel } from "../document/types";
import { MARKER_SIGNS } from "../editor/marks";
import { MARKER_LABELS } from "../editor/fieldCommands";
import { filterMatches, isEmptyFilter, toggled } from "../editor/filter";
import { showComments, showFilter } from "../editor/registry";
import "./objectMetadata.css";

type DetailCounts = {
  comments: number;
  references: number;
  tasks: { done: number; total: number } | null;
};

function metadataBounds(editor: EditorController, item: Item) {
  const cell = editor.graph.getDataModel().getCell(item.id);
  const state = cell ? editor.graph.view.getState(cell) : null;
  if (!state) return null;
  const bounds = cell!.isEdge()
    ? (state.text?.boundingBox ?? state)
    : (state.shape?.boundingBox ?? state);
  return outsideViewport(editor, bounds) ? null : bounds;
}

function outsideViewport(editor: EditorController, bounds: Rectangle) {
  return (
    bounds.x + bounds.width < 0 ||
    bounds.y + bounds.height < 0 ||
    bounds.x > editor.element.clientWidth ||
    bounds.y > editor.element.clientHeight ||
    Math.max(bounds.width, bounds.height) < 24
  );
}

function hasMetadata(item: Item, count: number) {
  return Boolean(count > 0 || item.marker || item.tags?.length || item.task || item.locked);
}

/** Metadata stays outside the label and keeps its screen size when the canvas zooms. */
export function ObjectMetadata({ editor }: Readonly<{ editor: EditorController }>) {
  if (editor.ui.dragging || editor.editId) return null;
  const comments = openThreadCounts(listComments(editor.document));
  const references = referenceCounts(editor.document.list());
  const tasks = taskCounts(editor.document.list());
  const bright = isEmptyFilter(editor.filter)
    ? null
    : filterMatches(editor.document.list(), editor.filter);
  return editor.document.list().map((item) => (
    <MetadataItem
      key={item.id}
      editor={editor}
      item={item}
      counts={{
        comments: comments.get(item.id) ?? 0,
        references: references.get(item.id) ?? 0,
        tasks: tasks.get(item.id) ?? null,
      }}
      dimmed={bright !== null && !bright.has(item.id)}
    />
  ));
}

function MetadataItem({
  editor,
  item,
  counts,
  dimmed,
}: Readonly<{ editor: EditorController; item: Item; counts: DetailCounts; dimmed: boolean }>) {
  if (!hasMetadata(item, counts.comments + counts.references + Number(counts.tasks !== null)))
    return null;
  const bounds = metadataBounds(editor, item);
  if (!bounds) return null;
  return (
    <div
      className={`object-metadata${dimmed ? " dimmed" : ""}`}
      data-testid="object-metadata"
      data-object-id={item.id}
      aria-label={`Details on ${item.name || typeLabel(item)}`}
      ref={(node) => {
        if (!node) return;
        positionMetadata(editor, node, bounds);
      }}
    >
      <MetadataBadges editor={editor} item={item} counts={counts} />
    </div>
  );
}

function positionMetadata(editor: EditorController, node: HTMLDivElement, bounds: Rectangle) {
  const width = editor.element.clientWidth;
  const height = editor.element.clientHeight;
  node.style.maxWidth = `${Math.min(width - 16, Math.max(96, Math.min(220, bounds.width)))}px`;
  const box = node.getBoundingClientRect();
  // Keep the strip beyond connected-copy and rotation handles, including when it flips above.
  const below = bounds.y + bounds.height + 32;
  const top = below + box.height <= height - 8 ? below : bounds.y - box.height - 44;
  node.style.left = `${Math.max(8, Math.min(bounds.x, width - box.width - 8))}px`;
  node.style.top = `${Math.max(8, Math.min(top, height - box.height - 8))}px`;
}

function MetadataBadges({
  editor,
  item,
  counts,
}: Readonly<{ editor: EditorController; item: Item; counts: DetailCounts }>) {
  return (
    <>
      <StateBadges item={item} />
      {item.marker && <MarkerBadge editor={editor} item={item} />}
      {item.tags?.length ? <TagBadge editor={editor} item={item} /> : null}
      {counts.references > 0 && (
        <button
          className="metadata-badge"
          aria-label={`Show ${counts.references} relationships on ${item.name || typeLabel(item)}`}
          data-hint={`${counts.references} relationships`}
          data-hint-detail="Select this object to reveal its relationship lines."
          onClick={() => editor.select(item.id)}
        >
          <GitBranch size={13} />
          {counts.references}
        </button>
      )}
      {counts.tasks && (
        <span
          className="metadata-badge"
          data-hint={`${counts.tasks.done} of ${counts.tasks.total} tasks complete`}
        >
          <CheckSquare size={12} />
          {counts.tasks.done}/{counts.tasks.total}
        </span>
      )}
      {counts.comments > 0 && <CommentBadge editor={editor} item={item} count={counts.comments} />}
    </>
  );
}

function StateBadges({ item }: Readonly<{ item: Item }>) {
  return (
    <>
      {item.locked && (
        <span className="metadata-badge" data-hint="Locked object">
          <LockKeyhole size={12} />
        </span>
      )}
      {item.task && (
        <span
          className="metadata-badge"
          data-hint={item.task === "done" ? "Task complete" : "Open task"}
        >
          {item.task === "done" ? <CheckSquare size={13} /> : <Square size={13} />}
        </span>
      )}
    </>
  );
}

function CommentBadge({
  editor,
  item,
  count,
}: Readonly<{ editor: EditorController; item: Item; count: number }>) {
  const label = `${count} open ${count === 1 ? "comment" : "comments"}`;
  return (
    <button
      className="metadata-badge metadata-comments"
      aria-label={`${label} on ${item.name || typeLabel(item)}`}
      data-hint={label}
      data-hint-detail="Read the discussion or add a reply."
      onClick={() => showComments(editor, item.id)}
    >
      <MessageSquare size={13} />
      <span>{count}</span>
    </button>
  );
}

function MarkerBadge({ editor, item }: Readonly<{ editor: EditorController; item: Item }>) {
  const marker = item.marker!;
  return (
    <button
      className={`metadata-badge metadata-marker marker-${marker}`}
      aria-label={`Highlight ${MARKER_LABELS[marker]}`}
      aria-pressed={editor.filter.markers.includes(marker)}
      data-hint={MARKER_LABELS[marker]}
      data-hint-detail="Highlight objects with this marker."
      onClick={() => {
        editor.setFilter(toggled(editor.filter, "markers", marker));
        showFilter(editor, true);
      }}
    >
      {MARKER_SIGNS[marker]}
    </button>
  );
}

function TagBadge({ editor, item }: Readonly<{ editor: EditorController; item: Item }>) {
  const tags = item.tags!;
  return (
    <>
      <button
        className="metadata-badge metadata-tags"
        aria-label={`Highlight tag ${tags[0]}`}
        aria-pressed={editor.filter.tags.includes(tags[0])}
        data-hint={tags.map((tag) => `#${tag}`).join(" ")}
        data-hint-detail="Highlight objects by tag."
        onClick={() => {
          editor.setFilter(toggled(editor.filter, "tags", tags[0]));
          showFilter(editor, true);
        }}
      >
        <Tags size={12} />
        <span>{tags[0]}</span>
      </button>
      {tags.length > 1 && (
        <button
          className="metadata-badge"
          aria-label={`View all tags on ${item.name || typeLabel(item)}`}
          data-hint={tags.map((tag) => `#${tag}`).join(" ")}
          data-hint-detail="Choose tags to highlight in Find and filter."
          onClick={() => showFilter(editor, true)}
        >
          +{tags.length - 1}
        </button>
      )}
    </>
  );
}
