import { useEffect, useRef, type KeyboardEvent } from "react";
import type { CompletedActions } from "../document/actions";

/** Single-line canvas metadata publishes when its field is finished, just like a label edit. */
export function useCompletedField(actions: Pick<CompletedActions, "begin">) {
  const end = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      end.current?.();
      end.current = null;
    },
    [actions]
  );
  const finish = () => {
    end.current?.();
    end.current = null;
  };
  return {
    start: () => {
      end.current ??= actions.begin();
    },
    finish,
    keydown: (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.nativeEvent.isComposing || !["Enter", "Escape"].includes(event.key)) return;
      finish();
      event.currentTarget.blur();
    },
  };
}
