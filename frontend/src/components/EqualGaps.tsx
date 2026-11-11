import { useEffect, useState } from "react";
import type { EditorController } from "../editor/controller";
import type { EqualGap } from "../document/equalGaps";
import { equalGapsOf } from "../editor/equalGaps";
import { formatDistance } from "../document/units";
import "./equalGaps.css";

/** Half the length of the tick that closes each end of a gap mark, in screen pixels. */
const TICK = 4;

/** While a move holds equal spacing, each of the equal gaps is marked with its size. */
export function EqualGaps({ editor }: Readonly<{ editor: EditorController }>) {
  const [gaps, setGaps] = useState<EqualGap[]>([]);
  useEffect(() => {
    const listener = {
      mouseDown: () => {},
      mouseMove: () => setGaps(equalGapsOf(editor.graph)),
      mouseUp: () => setGaps([]),
    };
    editor.graph.addMouseListener(listener);
    return () => editor.graph.removeMouseListener(listener);
  }, [editor]);
  if (!gaps.length) return null;
  const { scale, translate } = editor.graph.view;
  const screen = (x: number, y: number) => ({
    x: (x + translate.x) * scale,
    y: (y + translate.y) * scale,
  });
  return (
    <div className="equal-gaps" aria-hidden="true" data-testid="equal-gaps">
      <svg>
        {gaps.map((gap) => {
          const from = screen(gap.x1, gap.y1);
          const to = screen(gap.x2, gap.y2);
          // Ticks run across the mark: upright for a gap along a row, level for one down a column.
          const [tx, ty] = gap.y1 === gap.y2 ? [0, TICK] : [TICK, 0];
          return (
            <g key={`${gap.x1},${gap.y1},${gap.x2},${gap.y2}`}>
              <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
              <line x1={from.x - tx} y1={from.y - ty} x2={from.x + tx} y2={from.y + ty} />
              <line x1={to.x - tx} y1={to.y - ty} x2={to.x + tx} y2={to.y + ty} />
            </g>
          );
        })}
      </svg>
      {gaps.map((gap) => {
        const middle = screen((gap.x1 + gap.x2) / 2, (gap.y1 + gap.y2) / 2);
        return (
          <span
            key={`${gap.x1},${gap.y1},${gap.x2},${gap.y2}`}
            className="equal-gap-label"
            ref={(element) => {
              if (!element) return;
              element.style.left = `${middle.x}px`;
              element.style.top = `${middle.y}px`;
            }}
          >
            {formatDistance(gap.size * editor.grid.factor, editor.grid.unit, true)}
          </span>
        );
      })}
    </div>
  );
}
