import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { describeAt, type Strings } from "#ui/i18n.ts";
import { Icon } from "#ui/icons.tsx";
import { useFloating } from "#ui/shell/float.ts";
import type { Locate, PageState, ZoomState } from "#ui/viewers/types.ts";

/* ---------------------------------------------------------------- Menu */

/** ZCode dropdown: closes on Escape and on any pointer press outside it. */
export function Menu({
  className,
  onClose,
  children,
  label,
}: {
  className: string;
  onClose(): void;
  children: ReactNode;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      const target = event.target as Element;
      if (!ref.current?.contains(target) && !target.closest?.("[data-menu-trigger]")) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    ref.current?.querySelector<HTMLElement>("[role^=menuitem]")?.focus();
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);
  const move = (event: ReactKeyboardEvent) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = [...(ref.current?.querySelectorAll<HTMLElement>("[role^=menuitem]") ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);
    items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  };
  return (
    <div ref={ref} className={`menu ${className}`} role="menu" aria-label={label} onKeyDown={move}>
      {children}
    </div>
  );
}

export function MenuItem({
  icon,
  checked,
  children,
  hint,
  onSelect,
}: {
  icon?: ReactNode;
  checked?: boolean;
  children: ReactNode;
  hint?: ReactNode;
  onSelect(): void;
}) {
  return (
    <button
      type="button"
      role={checked === undefined ? "menuitem" : "menuitemradio"}
      aria-checked={checked}
      className="mi"
      onClick={onSelect}
    >
      <span className="mi-icon">{checked ? <Icon name="check" size={16} /> : icon}</span>
      <span className="mi-label">{children}</span>
      {hint ? <span className="mi-hint">{hint}</span> : null}
    </button>
  );
}

/* ---------------------------------------------------------------- Find */

export function FindBar({
  t,
  query,
  total,
  index,
  onQuery,
  onStep,
  onClose,
}: {
  t: Strings;
  query: string;
  total: number | null;
  index: number;
  onQuery(query: string): void;
  onStep(direction: 1 | -1): void;
  onClose(): void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  const count =
    !query.trim() || total === null ? "" : total ? t.findCount(index + 1, total) : t.noResults;
  return (
    <div className="docbar findbar" role="search">
      <label className="findfield">
        <Icon name="search" className="muted" />
        <input
          ref={input}
          className="find-input"
          type="text"
          aria-label={t.find}
          placeholder={t.findPlaceholder}
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onStep(event.shiftKey ? -1 : 1);
            } else if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              onClose();
            }
          }}
        />
        <span className="count" aria-live="polite">
          {count}
        </span>
      </label>
      <button
        type="button"
        className="btn icon dim"
        title={t.previousMatch}
        aria-label={t.previousMatch}
        disabled={!total}
        onClick={() => onStep(-1)}
      >
        <Icon name="chevron-up" />
      </button>
      <button
        type="button"
        className="btn icon dim"
        title={t.nextMatch}
        aria-label={t.nextMatch}
        disabled={!total}
        onClick={() => onStep(1)}
      >
        <Icon name="chevron-down" />
      </button>
      <button
        type="button"
        className="btn icon dim"
        title={t.closeFind}
        aria-label={t.closeFind}
        onClick={onClose}
      >
        <Icon name="x" />
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- Page / zoom pill */

const IDLE_MS = 1500;

/**
 * Floating page and zoom control. Shown while scrolling, while the pointer is near the bottom edge,
 * while focused or hovered; fades out after 1.5 s of stillness.
 */
export function PagePill({
  t,
  frame,
  page,
  zoom,
  onPage,
  onZoom,
  onFit,
}: {
  t: Strings;
  frame: RefObject<HTMLElement | null>;
  page: PageState;
  zoom: ZoomState | null;
  onPage(page: number): void;
  onZoom(direction: 1 | -1): void;
  onFit(): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [draft, setDraft] = useState<string | null>(null);
  const hold = useRef(false);
  useEffect(() => {
    const container = frame.current;
    if (!container) return;
    let timer = 0;
    const idle = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!hold.current && !ref.current?.contains(document.activeElement)) setVisible(false);
      }, IDLE_MS);
    };
    const wake = () => {
      setVisible(true);
      idle();
    };
    const near = (event: PointerEvent) => {
      const bounds = container.getBoundingClientRect();
      if (event.clientY > bounds.bottom - 80) wake();
    };
    container.addEventListener("scroll", wake, { capture: true, passive: true });
    container.addEventListener("pointermove", near, { passive: true });
    idle();
    return () => {
      clearTimeout(timer);
      container.removeEventListener("scroll", wake, { capture: true });
      container.removeEventListener("pointermove", near);
    };
  }, [frame]);
  const go = () => {
    const value = Number(draft);
    setDraft(null);
    if (Number.isInteger(value) && value >= 1) onPage(Math.min(value, page.count));
  };
  return (
    <div
      ref={ref}
      className={`pill${visible ? "" : " faded"}`}
      onPointerEnter={() => {
        hold.current = true;
        setVisible(true);
      }}
      onPointerLeave={() => {
        hold.current = false;
      }}
      onFocus={() => setVisible(true)}
    >
      <button
        type="button"
        className="btn icon sm dim"
        title={t.previousPage}
        aria-label={t.previousPage}
        disabled={page.current <= 1}
        onClick={() => onPage(page.current - 1)}
      >
        <Icon name="chevron-up" />
      </button>
      <span className="pg">
        <input
          className="pgin"
          aria-label={t.pageNumber}
          inputMode="numeric"
          style={{ width: `${Math.max(2, String(page.count).length) + 1.6}ch` }}
          value={draft ?? String(page.current)}
          onFocus={(event) => {
            setDraft(String(page.current));
            event.target.select();
          }}
          onChange={(event) => setDraft(event.target.value.replace(/\D/g, ""))}
          onBlur={() => setDraft(null)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              go();
              event.currentTarget.blur();
            } else if (event.key === "Escape") {
              event.stopPropagation();
              setDraft(null);
              event.currentTarget.blur();
            }
          }}
        />
        <span>{t.ofPages(page.count)}</span>
      </span>
      <button
        type="button"
        className="btn icon sm dim"
        title={t.nextPage}
        aria-label={t.nextPage}
        disabled={page.current >= page.count}
        onClick={() => onPage(page.current + 1)}
      >
        <Icon name="chevron-down" />
      </button>
      {zoom ? (
        <>
          <span className="vsep" />
          <button
            type="button"
            className="btn icon sm dim"
            title={t.zoomOut}
            aria-label={t.zoomOut}
            disabled={zoom.mode !== "width" && zoom.percent <= 25}
            onClick={() => onZoom(-1)}
          >
            <Icon name="minus" />
          </button>
          <button type="button" className="zoom" title={t.fitWidth} onClick={onFit}>
            {zoom.mode === "width" ? t.fit : `${zoom.percent}%`}
          </button>
          <button
            type="button"
            className="btn icon sm dim"
            title={t.zoomIn}
            aria-label={t.zoomIn}
            disabled={zoom.mode !== "width" && zoom.percent >= 400}
            onClick={() => onZoom(1)}
          >
            <Icon name="plus" />
          </button>
        </>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- Selection bar and Ask */

export type BarMode = "bar" | "ask" | "added";

/**
 * One line of the AI-edit draft: the ranges it applies to plus what the user wants done with them.
 * The draft lives in the shell, not here: the bar is keyed by the selection, so selecting the next
 * range remounts it and any state kept here would go with it.
 */
export interface AskLine {
  /** Full anchors, as they go into the message. */
  readonly at: readonly string[];
  /** The same ranges as bare locators: what the viewer paints to keep them visible. */
  readonly ranges: readonly string[];
  readonly labels: readonly string[];
  readonly question: string;
  /** Quoted content of the first range, as it goes into the message. */
  readonly quote?: string;
}

/** Keep the document's text selection when a press lands on the bar. */
const keepSelection = (event: ReactMouseEvent) => {
  if (!(event.target as Element).closest("textarea")) event.preventDefault();
};

export function SelectionBar({
  t,
  frame,
  locate,
  text,
  label,
  quote,
  short,
  mode,
  canAsk,
  copied,
  multi,
  draft,
  question,
  onQuestion: setQuestion,
  onAdd,
  onAsk,
  onCopy,
  onCancelAsk,
  onAddLine,
  onRemoveLine,
  onSendAll,
}: {
  t: Strings;
  frame: RefObject<HTMLElement | null>;
  locate: Locate;
  /** A text selection (offers Copy) rather than a block, page or cell range (shows its label). */
  text: boolean;
  /** Every range the action applies to, or the single current one. */
  label: string;
  quote: string;
  /** Use the short "Add" label (spreadsheets, where the range label takes the room). */
  short: boolean;
  mode: BarMode;
  canAsk: boolean;
  copied: boolean;
  /** More than one range is selected (or the viewer can add more), so the hint shows. */
  multi: boolean;
  /** Lines already added to the AI-edit draft, oldest first. */
  draft: readonly AskLine[];
  /**
   * What is typed in the AI-edit box. Held by the shell, not here: the bar is keyed by the
   * selection, so selecting the next range remounts it mid-sentence.
   */
  question: string;
  onQuestion(text: string): void;
  onAdd(): void;
  onAsk(): void;
  onCopy(): void;
  onCancelAsk(): void;
  /** Add the typed request as a new draft line. Nothing is sent. */
  onAddLine(question: string): void;
  onRemoveLine(index: number): void;
  /** Send every draft line (plus `pending`, when the box still has text) as one message. */
  onSendAll(pending: string): Promise<boolean>;
}) {
  const asking = mode === "ask";
  const ref = useFloating<HTMLDivElement>(frame, locate, {
    side: asking ? "bottom" : "top",
    dock: true,
  });
  const [sending, setSending] = useState(false);
  /**
   * Enter adds a line instead of sending: the user builds up one request per range and sends them
   * together, so the box keeps what is typed and the panel stays open.
   */
  const addLine = () => {
    const value = question.trim();
    if (!value) return;
    onAddLine(value);
    setQuestion("");
  };
  const sendAll = async () => {
    if (sending || (!question.trim() && !draft.length)) return;
    setSending(true);
    const ok = await onSendAll(question.trim());
    setSending(false);
    if (ok) setQuestion("");
  };
  if (asking)
    return (
      <div
        ref={ref}
        className="pop ask"
        role="dialog"
        aria-label={t.ask}
        onMouseDown={keepSelection}
      >
        <div className="ctx">
          <span className="where">{label}</span>
          {quote ? <span className="q">“{quote}”</span> : null}
        </div>
        <div className="draft" aria-label={t.askRanges}>
          {draft.length ? (
            draft.map((line, index) => (
              <div className="line" key={`${index}:${line.at.join(",")}`}>
                <span className="where">{line.labels.join(", ")}</span>
                <span className="q">{line.question}</span>
                <button
                  type="button"
                  className="btn icon dim"
                  title={t.askRemoveLine}
                  aria-label={t.askRemoveLine}
                  onClick={() => onRemoveLine(index)}
                >
                  <Icon name="x" />
                </button>
              </div>
            ))
          ) : (
            <div className="empty">{t.askDraftEmpty}</div>
          )}
        </div>
        <textarea
          autoFocus
          className="textarea"
          rows={2}
          aria-label={t.askPlaceholder}
          placeholder={t.askPlaceholder}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            // ⌘/Ctrl+↵ sends everything that is waiting, so the user never has to select one more
            // range just to reach the send button.
            if (
              event.key === "Enter" &&
              (event.metaKey || event.ctrlKey) &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              void sendAll();
            } else if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              addLine();
            } else if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              onCancelAsk();
            }
          }}
        />
        <div className="row">
          <span className="hint">
            <kbd>↵</kbd> {t.askLineKey}
            <span className="sep">·</span>
            <kbd>⌘/Ctrl+↵</kbd> {t.askSendKey}
          </span>
          <button type="button" className="btn sm" onClick={onCancelAsk}>
            {t.cancel}
          </button>
          <button
            type="button"
            className="btn sm"
            disabled={!question.trim()}
            onClick={addLine}
          >
            {t.askAddLine}
          </button>
          <button
            type="button"
            className="btn sm primary"
            disabled={(!question.trim() && !draft.length) || sending}
            onClick={() => void sendAll()}
          >
            {t.askSendAll(draft.length + (question.trim() ? 1 : 0))}
          </button>
        </div>
      </div>
    );
  return (
    <div
      ref={ref}
      className="pop bar"
      role="toolbar"
      aria-label={label}
      onMouseDown={keepSelection}
    >
      {!text ? (
        <>
          <span className="where">{label}</span>
          <span className="vsep" />
        </>
      ) : null}
      <button
        type="button"
        className="btn lg"
        title={t.addToChatHint}
        onClick={onAdd}
        disabled={mode === "added"}
      >
        {mode === "added" ? (
          <>
            <Icon name="check" size={16} className="ok" />
            {t.added}
          </>
        ) : (
          <>
            <Icon name="message-square-plus" size={16} />
            {short ? t.addShort : t.addToChat}
          </>
        )}
      </button>
      {canAsk ? (
        <button type="button" className="btn lg" onClick={onAsk}>
          <Icon name="message-circle-question" size={16} />
          {t.ask}
        </button>
      ) : null}
      {text ? (
        <>
          <span className="vsep" />
          <button
            type="button"
            className="btn icon lg dim"
            title={copied ? t.copied : t.copy}
            aria-label={copied ? t.copied : t.copy}
            onClick={onCopy}
          >
            <Icon name={copied ? "check" : "copy"} />
          </button>
        </>
      ) : null}
      {multi && !text ? (
        <>
          <span className="vsep" />
          <span className="hint">{t.askMultiHint}</span>
        </>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- Agent callout */

export function AgentCallout({
  t,
  frame,
  locate,
  note,
  index,
  total,
  onNext,
  onClose,
}: {
  t: Strings;
  frame: RefObject<HTMLElement | null>;
  locate: Locate | null;
  note: string | null;
  index: number;
  total: number;
  onNext(): void;
  onClose(): void;
}) {
  const ref = useFloating<HTMLDivElement>(frame, locate, { side: "bottom", offset: 6, dock: true });
  return (
    <div ref={ref} className="callout" role="note">
      <div className="body">
        <div className="who">
          <span className="dot" />
          {total > 1 ? t.agentOf(index + 1, total) : t.agent}
        </div>
        {note ? <div className="text">{note}</div> : null}
      </div>
      {total > 1 ? (
        <button
          type="button"
          className="btn icon sm dim"
          title={t.nextTarget}
          aria-label={t.nextTarget}
          onClick={onNext}
        >
          <Icon name="chevron-down" />
        </button>
      ) : null}
      <button
        type="button"
        className="btn icon sm dim"
        title={t.close}
        aria-label={t.close}
        onClick={onClose}
      >
        <Icon name="x" />
      </button>
    </div>
  );
}

export function OffscreenChip({
  text,
  down,
  raised,
  onClick,
}: {
  text: string;
  down: boolean;
  raised: boolean;
  onClick(): void;
}) {
  return (
    <button type="button" className={`chip offscreen${raised ? " raised" : ""}`} onClick={onClick}>
      <span className="dot" />
      {text}
      <Icon name={down ? "arrow-down" : "arrow-up"} size={12} />
    </button>
  );
}

/** "1 more on page 4" for targets outside the view. */
export function offscreenText(t: Strings, ats: string[]): string {
  return t.moreOn(ats.length, describeAt(ats[0], t, true));
}
