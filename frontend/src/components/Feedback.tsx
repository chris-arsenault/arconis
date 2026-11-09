import { useEffect, useRef, useState } from "react";
import { MessageSquare, X } from "lucide-react";
import type { RoomSession } from "../collaboration/room";
import type { EditorController } from "../editor/controller";
import type { AccountStore } from "../account/accountStore";
import { MAX_FEEDBACK_LENGTH } from "../protocol/feedback";
import { feedbackContext } from "../feedback/context";
import { submitFeedback } from "../feedback/submit";
import { renderPng } from "../editor/pngExport";
import { pictureScope } from "../editor/layerView";
import { useAsyncAction } from "./useAsyncAction";
import "./feedback.css";

interface Props {
  session: RoomSession;
  editor: EditorController;
  name: string;
  account: AccountStore | null;
}

export function Feedback(props: Readonly<Props>) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  return (
    <>
      <button
        ref={trigger}
        className="feedback-button"
        aria-label="Feedback"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <MessageSquare size={16} /> <span>Feedback</span>
      </button>
      {open && <FeedbackDialog context={props} onClose={close} />}
    </>
  );
}

async function canvasScreenshot({ session, editor }: Props) {
  const ids = pictureScope(session.document, editor.layers, []);
  if (!ids)
    throw new Error(
      "Every layer with content is hidden. Uncheck the screenshot option to send feedback without one."
    );
  const png = await session.files.png(
    ids,
    () => renderPng(editor.graph, ids, session.document.list(), true),
    true
  );
  if (!png)
    throw new Error(
      "The canvas is empty. Uncheck the screenshot option to send feedback without one."
    );
  return new Uint8Array(png);
}

async function sendFeedback(context: Props, message: string, screenshot: boolean) {
  const metadata = feedbackContext(context.session, context.editor, context.name, context.account);
  const png = screenshot ? await canvasScreenshot(context) : null;
  await submitFeedback(message, metadata, png);
}

function FeedbackDialog({ context, onClose }: Readonly<{ context: Props; onClose: () => void }>) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [message, setMessage] = useState("");
  const [includeScreenshot, setIncludeScreenshot] = useState(false);
  const [sent, setSent] = useState(false);
  const { busy, error, run } = useAsyncAction();
  const close = () => dialog.current?.close();
  useEffect(() => {
    const node = dialog.current!;
    const stop = (event: KeyboardEvent) => event.stopPropagation();
    node.addEventListener("keydown", stop);
    node.showModal();
    return () => node.removeEventListener("keydown", stop);
  }, []);
  const send = () =>
    run("Sending…", async () => {
      await sendFeedback(context, message, includeScreenshot);
      setSent(true);
    });
  return (
    <dialog
      ref={dialog}
      className="feedback-dialog"
      aria-labelledby="feedback-title"
      onClose={onClose}
      onCancel={(event) => {
        if (busy) event.preventDefault();
      }}
    >
      <header>
        <h2 id="feedback-title">Send feedback</h2>
        <button
          className="icon-action"
          aria-label="Close feedback"
          disabled={Boolean(busy)}
          onClick={close}
        >
          <X size={18} />
        </button>
      </header>
      {sent ? (
        <div className="feedback-content" role="status">
          <p>Your feedback was sent. Thank you for helping improve Arconis.</p>
          <button onClick={close}>Done</button>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <FeedbackFields
            message={message}
            onMessage={setMessage}
            screenshot={includeScreenshot}
            onScreenshot={setIncludeScreenshot}
            busy={Boolean(busy)}
            error={error}
          />
          <footer>
            <button type="button" disabled={Boolean(busy)} onClick={close}>
              Cancel
            </button>
            <button type="submit" disabled={Boolean(busy) || !message.trim()}>
              {busy ?? "Send feedback"}
            </button>
          </footer>
        </form>
      )}
    </dialog>
  );
}

function FeedbackFields({
  message,
  onMessage,
  screenshot,
  onScreenshot,
  busy,
  error,
}: Readonly<{
  message: string;
  onMessage: (value: string) => void;
  screenshot: boolean;
  onScreenshot: (value: boolean) => void;
  busy: boolean;
  error: string | null;
}>) {
  return (
    <div className="feedback-content">
      {error && (
        <p className="feedback-error" role="alert">
          {error}
        </p>
      )}
      <label htmlFor="feedback-message">What could be easier?</label>
      <p id="feedback-prompt">Tell us what you were trying to do and what got in your way.</p>
      <textarea
        id="feedback-message"
        aria-describedby="feedback-prompt"
        value={message}
        onChange={(event) => onMessage(event.target.value)}
        required
        maxLength={MAX_FEEDBACK_LENGTH}
        disabled={busy}
        rows={6}
      />
      <label className="feedback-screenshot">
        <input
          type="checkbox"
          checked={screenshot}
          onChange={(event) => onScreenshot(event.target.checked)}
          disabled={busy}
          aria-describedby="feedback-screenshot-note"
        />
        Include a screenshot of the canvas
      </label>
      <p id="feedback-screenshot-note">
        The standard PNG export includes the visible canvas, markup and an editable copy. It is
        readable without a room password.
      </p>
      <p>
        Feedback is stored privately with your display name, available sign-in details, browser, app
        version and canvas diagnostics.
      </p>
    </div>
  );
}
