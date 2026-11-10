import { useState, type RefObject, type ReactNode } from "react";
import { sourceAction, type SourceEdit, type TextAction } from "../text/commands";
import type { Appearance } from "../document/appearance";
import { markdownPlainText } from "../text/markdown";
import { MarkdownPreview } from "./MarkdownPreview";

/** Inline marks wrap the selected text, and pressing again on wrapped text unwraps it. */
const WRAP = "Wrap the selected text in this Markdown mark, or remove the mark around it.";
/** Line forms rewrite whole lines, replacing any list or heading mark already there. */
const LINES = "Turn each selected line into this kind of line, replacing its list or heading mark.";
const ACTIONS: { action: TextAction; label: string; text: string; detail: string }[] = [
  { action: "bold", label: "Markdown bold", text: "B", detail: WRAP },
  { action: "italic", label: "Markdown italic", text: "I", detail: WRAP },
  { action: "underline", label: "Markdown underline", text: "U", detail: WRAP },
  { action: "strike", label: "Markdown strike", text: "S", detail: WRAP },
  { action: "heading", label: "Markdown heading", text: "H", detail: LINES },
  { action: "bullet", label: "Bulleted list", text: "•", detail: LINES },
  { action: "number", label: "Numbered list", text: "1.", detail: LINES },
  {
    action: "link",
    label: "Insert text link",
    text: "Link",
    detail: "Make the selected text a web link with a placeholder address to replace.",
  },
  { action: "code", label: "Inline code", text: "<>", detail: WRAP },
];
const MORE_ACTIONS: { action: TextAction; label: string; detail: string }[] = [
  { action: "sup", label: "Superscript", detail: WRAP },
  { action: "sub", label: "Subscript", detail: WRAP },
  { action: "highlight", label: "Highlight text", detail: WRAP },
  { action: "math", label: "Inline equation", detail: WRAP },
  {
    action: "clear",
    label: "Clear inline formatting",
    detail: "Strip bold, italic, strike, code and HTML marks from the selected text.",
  },
];

export function MarkdownTools({
  source,
  appearance,
  onEdit,
  textarea,
  expanded,
  compact,
  objectLink,
}: Readonly<{
  source: string;
  appearance: Appearance;
  onEdit: (element: HTMLTextAreaElement, edit: SourceEdit) => void;
  textarea: RefObject<HTMLTextAreaElement | null>;
  expanded: boolean;
  compact: boolean;
  objectLink: ReactNode;
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
      <summary data-hint-detail="Show buttons that add Markdown formatting to the text.">
        Markdown tools
      </summary>
      <MarkdownActions act={act} objectLink={objectLink} />
      <details className="markdown-extra" open={compact ? undefined : true}>
        <summary
          hidden={!compact}
          data-hint-detail="Show code blocks, the rendered preview and the copy buttons."
        >
          Code, preview and copy
        </summary>
        <CodeActions
          act={act}
          language={language}
          onLanguage={setLanguage}
          preview={preview}
          onPreview={() => setPreview(!preview)}
        />
        <CopyActions source={source} copy={copy} />
        {preview && <MarkdownPreview appearance={appearance} source={source} copy={copy} />}
      </details>
      <span className="markdown-copy-status" role="status">
        {status}
      </span>
    </details>
  );
}

function CopyActions({
  source,
  copy,
}: Readonly<{ source: string; copy: (text: string) => Promise<void> }>) {
  return (
    <div className="markdown-toolbar">
      <button
        type="button"
        data-hint-detail="Copy the text with its Markdown marks to the clipboard."
        onClick={() => void copy(source)}
      >
        Copy Markdown
      </button>
      <button
        type="button"
        data-hint-detail="Copy the text without Markdown marks, as it reads on the canvas."
        onClick={() => void copy(markdownPlainText(source))}
      >
        Copy plain text
      </button>
    </div>
  );
}

type Act = (action: TextAction, language?: string) => void;

function MarkdownActions({ act, objectLink }: Readonly<{ act: Act; objectLink: ReactNode }>) {
  return (
    <div className="markdown-toolbar" role="toolbar" aria-label="Markdown formatting">
      {ACTIONS.map(({ action, label, text, detail }) => (
        <button
          key={action}
          type="button"
          aria-label={label}
          data-hint={label}
          data-hint-detail={detail}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => act(action)}
        >
          {text}
        </button>
      ))}
      {objectLink}
      <details className="markdown-more">
        <summary data-hint-detail="Show less common marks such as superscript and equations.">
          More
        </summary>
        <div>
          {MORE_ACTIONS.map(({ action, label, detail }) => (
            <button
              key={action}
              type="button"
              data-hint-detail={detail}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => act(action)}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            data-hint-detail="Put the selected text in a math block, drawn as an equation on its own line."
            onClick={() => act("fence", "math")}
          >
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
        data-hint-detail="Choose the language a new code block is highlighted as."
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
        data-hint-detail="Put the selected text in a code block in the chosen language."
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => act("fence")}
      >
        Code block
      </button>
      <button
        type="button"
        aria-pressed={preview}
        data-hint-detail="Show or hide the text rendered as it looks on the canvas."
        onClick={onPreview}
      >
        Preview
      </button>
    </div>
  );
}
