import { useState, type RefObject } from "react";
import { sourceAction, type SourceEdit, type TextAction } from "../text/commands";
import type { Appearance } from "../document/appearance";
import { markdownPlainText } from "../text/markdown";
import { MarkdownPreview } from "./MarkdownPreview";

const ACTIONS: { action: TextAction; label: string; text: string }[] = [
  { action: "bold", label: "Markdown bold", text: "B" },
  { action: "italic", label: "Markdown italic", text: "I" },
  { action: "underline", label: "Markdown underline", text: "U" },
  { action: "strike", label: "Markdown strike", text: "S" },
  { action: "heading", label: "Markdown heading", text: "H" },
  { action: "bullet", label: "Bulleted list", text: "•" },
  { action: "number", label: "Numbered list", text: "1." },
  { action: "link", label: "Insert text link", text: "Link" },
  { action: "code", label: "Inline code", text: "<>" },
];
const MORE_ACTIONS: { action: TextAction; label: string }[] = [
  { action: "sup", label: "Superscript" },
  { action: "sub", label: "Subscript" },
  { action: "highlight", label: "Highlight text" },
  { action: "math", label: "Inline equation" },
  { action: "clear", label: "Clear inline formatting" },
];

export function MarkdownTools({
  source,
  appearance,
  onEdit,
  textarea,
  expanded,
  compact,
}: Readonly<{
  source: string;
  appearance: Appearance;
  onEdit: (element: HTMLTextAreaElement, edit: SourceEdit) => void;
  textarea: RefObject<HTMLTextAreaElement | null>;
  expanded: boolean;
  compact: boolean;
}>) {
  const [preview, setPreview] = useState(false);
  const [language, setLanguage] = useState("typescript");
  const [status, setStatus] = useState("");
  const act = (action: TextAction, codeLanguage = language) => {
    const element = textarea.current;
    if (!element) return;
    const edit = sourceAction(
      element.value,
      element.selectionStart,
      element.selectionEnd,
      action,
      codeLanguage
    );
    onEdit(element, edit);
  };
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied");
    } catch {
      setStatus("Clipboard unavailable; select and copy the source text.");
    }
  };
  return (
    <details className="markdown-tools" data-text-tools="true" open={expanded || undefined}>
      <summary>Markdown tools</summary>
      <MarkdownActions act={act} />
      <details className="markdown-extra" open={compact ? undefined : true}>
        <summary hidden={!compact}>Code, preview and copy</summary>
        <CodeActions
          act={act}
          language={language}
          onLanguage={setLanguage}
          preview={preview}
          onPreview={() => setPreview(!preview)}
        />
        <div className="markdown-toolbar">
          <button type="button" onClick={() => void copy(source)}>
            Copy Markdown
          </button>
          <button type="button" onClick={() => void copy(markdownPlainText(source))}>
            Copy plain text
          </button>
        </div>
        {preview && <MarkdownPreview appearance={appearance} source={source} copy={copy} />}
      </details>
      <span className="markdown-copy-status" role="status">
        {status}
      </span>
    </details>
  );
}

type Act = (action: TextAction, language?: string) => void;

function MarkdownActions({ act }: Readonly<{ act: Act }>) {
  return (
    <div className="markdown-toolbar" role="toolbar" aria-label="Markdown formatting">
      {ACTIONS.map(({ action, label, text }) => (
        <button
          key={action}
          type="button"
          aria-label={label}
          data-hint={label}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => act(action)}
        >
          {text}
        </button>
      ))}
      <details className="markdown-more">
        <summary>More</summary>
        <div>
          {MORE_ACTIONS.map(({ action, label }) => (
            <button
              key={action}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => act(action)}
            >
              {label}
            </button>
          ))}
          <button type="button" onClick={() => act("fence", "math")}>
            Display equation
          </button>
        </div>
      </details>
    </div>
  );
}

function CodeActions({
  act,
  language,
  onLanguage,
  preview,
  onPreview,
}: Readonly<{
  act: Act;
  language: string;
  onLanguage: (language: string) => void;
  preview: boolean;
  onPreview: () => void;
}>) {
  return (
    <div className="markdown-toolbar">
      <select
        aria-label="Code language"
        value={language}
        onChange={(event) => onLanguage(event.target.value)}
      >
        {[
          "typescript",
          "javascript",
          "python",
          "java",
          "c",
          "cpp",
          "csharp",
          "go",
          "rust",
          "ruby",
          "sql",
          "bash",
          "json",
          "yaml",
          "html",
          "css",
          "plaintext",
        ].map((name) => (
          <option key={name}>{name}</option>
        ))}
      </select>
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => act("fence")}
      >
        Code block
      </button>
      <button type="button" aria-pressed={preview} onClick={onPreview}>
        Preview
      </button>
    </div>
  );
}
