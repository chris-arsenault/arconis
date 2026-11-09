import { useRef, useState } from "react";

/** One user action at a time, with an error the view can display beside its controls. */
export function useAsyncAction() {
  const [state, setState] = useState<{ busy: string | null; error: string | null }>({
    busy: null,
    error: null,
  });
  const running = useRef(false);
  const run = async (label: string, action: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setState({ busy: label, error: null });
    try {
      await action();
    } catch (failure) {
      setState({
        busy: null,
        error: failure instanceof Error ? failure.message : "The action failed. Please try again.",
      });
    } finally {
      running.current = false;
      setState((previous) => ({ ...previous, busy: null }));
    }
  };
  return { ...state, run };
}
