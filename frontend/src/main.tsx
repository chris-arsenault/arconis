import { createRoot } from "react-dom/client";
import { App } from "./App";
import "@maxgraph/core/css/common.css";
import "./styles.css";
import "./text/fonts.css";
import "katex/dist/katex.min.css";
import "./text/markdown.css";
import "./text/editor.css";

declare const __BUILD_REVISION__: string;
document.documentElement.dataset.revision = __BUILD_REVISION__;
createRoot(document.getElementById("root")!).render(<App />);
