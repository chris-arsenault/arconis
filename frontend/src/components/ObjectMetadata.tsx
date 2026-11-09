import { CheckSquare, GitBranch, LockKeyhole, MessageSquare, Square, Tags } from "lucide-react";
import { Rectangle, type CellState } from "@maxgraph/core";
import { useSyncExternalStore } from "react";
import type { EditorController } from "../editor/controller";
import { listComments, openThreadCounts } from "../document/comments";
import { referenceCounts, taskCounts } from "../document/relations";
import { type Item, typeLabel } from "../document/types";
import { MARKER_SIGNS } from "../editor/marks";
import { MARKER_LABELS } from "../editor/fieldCommands";
import { filterMatches, isEmptyFilter, toggled } from "../editor/filter";
import { showComments, showFilter } from "../editor/registry";
import {
  displayPreferences,
  indicatorVisible,
  type DisplayPreferences,
} from "../editor/displayPreferences";
import { ObjectMetadataLayer } from "./ObjectMetadataLayer";
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
  const bounds = cell!.isEdge() ? (state.text?.boundingBox ?? state) : vertexBounds(editor, state);
  return outsideViewport(editor, bounds) ? null : bounds;
}

function vertexBounds(editor: EditorController, state: CellState) {
  return paintedBounds(editor, state.shape?.node ?? null) ?? state.shape?.boundingBox ?? state;
}

/** Curved stencils need their painted extent, rather than the empty corners of their model box. */
function paintedBounds(editor: EditorController, node: Element | null) {
  if (!(node instanceof SVGGraphicsElement) || !node.isConnected) return null;
  const matrix = node.getScreenCTM();
  if (!matrix) return null;
  const box = node.getBBox();
  const points = [
    new DOMPoint(box.x, box.y),
    new DOMPoint(box.x + box.width, box.y),
    new DOMPoint(box.x, box.y + box.height),
    new DOMPoint(box.x + box.width, box.y + box.height),
  ].map((point) => point.matrixTransform(matrix));
  const area = editor.element.getBoundingClientRect();
  const left = Math.min(...points.map((point) => point.x));
  const top = Math.min(...points.map((point) => point.y));
  return new Rectangle(
    left - area.left - editor.graph.getPanDx(),
    top - area.top - editor.graph.getPanDy(),
    Math.max(...points.map((point) => point.x)) - left,
    Math.max(...points.map((point) => point.y)) - top
  );
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

/** Metadata stays outside the label and keeps its screen size when the canvas zooms. */
export function ObjectMetadata({ editor }: Readonly<{ editor: EditorController }>) {
  const preferences = useSyncExternalStore(
    displayPreferences.subscribe,
    displayPreferences.snapshot
  );
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
      preferences={preferences}
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
  preferences,
}: Readonly<{
  editor: EditorController;
  item: Item;
  counts: DetailCounts;
  dimmed: boolean;
  preferences: DisplayPreferences;
}>) {
  const cell = editor.graph.getDataModel().getCell(item.id);
  const selected = cell !== null && editor.graph.isCellSelected(cell);
  const visible = {
    comments: indicatorVisible(preferences.comments, selected),
    tags: indicatorVisible(preferences.tags, selected),
    markers: indicatorVisible(preferences.markers, selected),
    relationships: indicatorVisible(preferences.relationships, selected),
    status: indicatorVisible(preferences.status, selected),
  };
  if (!hasVisibleMetadata(item, counts, visible)) return null;
  const bounds = metadataBounds(editor, item);
  if (!bounds) return null;
  return (
    <ObjectMetadataLayer
      editor={editor}
      id={item.id}
      selected={selected}
      dimmed={dimmed}
      label={`Details on ${item.name || typeLabel(item)}`}
      bounds={bounds}
    >
      <MetadataBadges
        editor={editor}
        item={item}
        counts={counts}
        visible={visible}
        selected={selected}
      />
    </ObjectMetadataLayer>
  );
}

type Visible = Record<keyof DisplayPreferences, boolean>;

function hasVisibleMetadata(item: Item, counts: DetailCounts, visible: Visible) {
  return [
    visible.comments && counts.comments,
    visible.relationships && counts.references,
    visible.markers && item.marker,
    visible.tags && item.tags?.length,
    visible.status && (item.task || item.locked || counts.tasks),
  ].some(Boolean);
}

function MetadataBadges({
  editor,
  item,
  counts,
  visible,
  selected,
}: Readonly<{
  editor: EditorController;
  item: Item;
  counts: DetailCounts;
  visible: Visible;
  selected: boolean;
}>) {
  return (
    <>
      {visible.status && <StateBadges item={item} />}
      {visible.markers && item.marker && <MarkerBadge editor={editor} item={item} />}
      {visible.tags && <TagBadge editor={editor} item={item} selected={selected} />}
      {visible.relationships && (
        <RelationshipBadge
          editor={editor}
          item={item}
          count={counts.references}
          selected={selected}
        />
      )}
      {visible.status && <TaskSummary count={counts.tasks} />}
      {visible.comments && (
        <CommentBadge editor={editor} item={item} count={counts.comments} selected={selected} />
      )}
    </>
  );
}

function RelationshipBadge({
  editor,
  item,
  count,
  selected,
}: Readonly<{ editor: EditorController; item: Item; count: number; selected: boolean }>) {
  if (!count) return null;
  return (
    <button
      className="metadata-badge"
      aria-label={`Show ${count} relationships on ${item.name || typeLabel(item)}`}
      data-hint={`${count} relationships`}
      data-hint-detail="Select this object to reveal its relationship lines."
      onClick={() => editor.select(item.id)}
    >
      <GitBranch size={13} />
      {(selected || count > 1) && count}
    </button>
  );
}

function TaskSummary({ count }: Readonly<{ count: DetailCounts["tasks"] }>) {
  if (!count) return null;
  return (
    <span className="metadata-badge" data-hint={`${count.done} of ${count.total} tasks complete`}>
      <CheckSquare size={12} />
      {count.done}/{count.total}
    </span>
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
  selected,
}: Readonly<{ editor: EditorController; item: Item; count: number; selected: boolean }>) {
  if (!count) return null;
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
      {(selected || count > 1) && <span>{count}</span>}
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

function TagBadge({
  editor,
  item,
  selected,
}: Readonly<{ editor: EditorController; item: Item; selected: boolean }>) {
  const tags = item.tags ?? [];
  if (!tags.length) return null;
  const text = selected ? tags[0] : String(tags.length);
  const showText = selected || tags.length > 1;
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
        {showText && <span>{text}</span>}
      </button>
      {selected && tags.length > 1 && (
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
