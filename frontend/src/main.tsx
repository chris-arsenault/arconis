import { createRoot } from "react-dom/client";
import { lazy, Suspense, useSyncExternalStore } from "react";
import { App } from "./App";
import "@maxgraph/core/css/common.css";
import "./styles.css";
import "./text/fonts.css";
import "katex/dist/katex.min.css";
import "./text/markdown.css";
import "./text/editor.css";

declare const __BUILD_REVISION__: string;
document.documentElement.dataset.revision = __BUILD_REVISION__;
const DeliveryBoard = lazy(() =>
  import("./delivery/Board").then((mod) => ({ default: mod.DeliveryBoard }))
);
const address = () => location.hash;
const subscribeAddress = (change: () => void) => {
  window.addEventListener("hashchange", change);
  return () => window.removeEventListener("hashchange", change);
};
function Entry() {
  const hash = useSyncExternalStore(subscribeAddress, address);
  if (!/^#delivery(?:=|&|$)/.test(hash)) return <App />;
  return (
    <Suspense fallback={<p role="status">Loading Delivery…</p>}>
      <DeliveryBoard address={hash} />
    </Suspense>
  );
}
createRoot(document.getElementById("root")!).render(<Entry />);
