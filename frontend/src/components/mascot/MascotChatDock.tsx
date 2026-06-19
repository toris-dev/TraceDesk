import { useCallback, useEffect, useRef, useState } from "react";
import type { LlmConfigView } from "../../api/client";
import { getLlmConfig, llmChat } from "../../api/client";
import { useI18n } from "../../i18n";
import type { MascotMood } from "./mascotTypes";
import { MASCOT_ICON_SRC, pickMessage } from "./mascotTypes";
import { TortoiseMascot } from "./TortoiseMascot";

const SIZE_KEY = "tracedesk-mascot-chat-size";
const MESSAGES_KEY = "tracedesk-mascot-chat-messages:v1";
const DEFAULT_W = 340;
const DEFAULT_H = 420;
const MIN_W = 280;
const MIN_H = 300;
const MAX_W = 560;
const VIEWPORT_GUTTER = 16;
const DOCK_BOTTOM_OFFSET = 20;

function maxWidth() {
  return Math.max(MIN_W, Math.min(MAX_W, window.innerWidth - VIEWPORT_GUTTER * 2));
}

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

interface Props {
  mood: MascotMood;
  greeting?: string;
  selectedDate: string;
  onOpenSettings: () => void;
}

function loadSize(): { w: number; h: number } {
  try {
    const raw = localStorage.getItem(SIZE_KEY);
    if (!raw) return { w: DEFAULT_W, h: DEFAULT_H };
    const parsed = JSON.parse(raw) as { w?: number; h?: number };
    return {
      w: clamp(parsed.w ?? DEFAULT_W, MIN_W, maxWidth()),
      h: clamp(parsed.h ?? DEFAULT_H, MIN_H, maxHeight()),
    };
  } catch {
    return { w: DEFAULT_W, h: DEFAULT_H };
  }
}

function maxHeight() {
  return Math.max(MIN_H, Math.min(Math.floor(window.innerHeight * 0.75), window.innerHeight - DOCK_BOTTOM_OFFSET - VIEWPORT_GUTTER * 2));
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function loadMessages(fallbackText: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(MESSAGES_KEY);
    if (!raw) return [{ role: "assistant", text: fallbackText }];
    const parsed = JSON.parse(raw) as ChatMessage[];
    const messages = Array.isArray(parsed)
      ? parsed.filter((m) => m?.role && typeof m.text === "string")
      : [];
    return messages.length > 0 ? messages : [{ role: "assistant", text: fallbackText }];
  } catch {
    return [{ role: "assistant", text: fallbackText }];
  }
}

export function MascotChatDock({ mood, greeting, selectedDate, onOpenSettings }: Props) {
  const { t } = useI18n();
  const greetingText = greeting ?? pickMessage(mood);
  const [dismissed, setDismissed] = useState(false);
  const [size, setSize] = useState(loadSize);
  const [config, setConfig] = useState<LlmConfigView | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadMessages(greetingText));
  const [input, setInput] = useState("");
  const [includeActivity, setIncludeActivity] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(
    null,
  );

  useEffect(() => {
    getLlmConfig()
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  useEffect(() => {
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages.slice(-80)));
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    localStorage.setItem(SIZE_KEY, JSON.stringify(size));
  }, [size]);

  useEffect(() => {
    const syncToViewport = () => {
      setSize((prev) => ({
        w: clamp(prev.w, MIN_W, maxWidth()),
        h: clamp(prev.h, MIN_H, maxHeight()),
      }));
    };

    syncToViewport();
    window.addEventListener("resize", syncToViewport);
    return () => window.removeEventListener("resize", syncToViewport);
  }, []);

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      resizeRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startW: size.w,
        startH: size.h,
      };
      const onMove = (ev: PointerEvent) => {
        const r = resizeRef.current;
        if (!r) return;
        setSize({
          w: clamp(r.startW + (r.startX - ev.clientX), MIN_W, maxWidth()),
          h: clamp(r.startH + (r.startY - ev.clientY), MIN_H, maxHeight()),
        });
      };
      const onUp = () => {
        resizeRef.current = null;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [size.w, size.h],
  );

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setError(null);
    setMessages((prev) => [...prev, { role: "user", text }]);
    setLoading(true);

    try {
      const result = await llmChat(text, includeActivity, selectedDate);
      setMessages((prev) => [...prev, { role: "assistant", text: result.answer }]);
    } catch (e) {
      const msg = typeof e === "string" ? e : String(e);
      setError(msg);
      setMessages((prev) => [...prev, { role: "assistant", text: msg }]);
    } finally {
      setLoading(false);
    }
  };

  if (dismissed) {
    return (
      <button
        type="button"
        onClick={() => setDismissed(false)}
        className="fixed right-4 bottom-4 md:right-5 md:bottom-5 z-40 w-12 h-12 rounded-2xl border border-cyan-500/25 bg-surface-elevated shadow-lg hover:scale-110 transition-transform overflow-hidden mascot-float"
        aria-label={t("llm.chatOpen")}
      >
        <img src={MASCOT_ICON_SRC} alt="" className="w-full h-full object-cover" />
      </button>
    );
  }

  const connected = config?.connected && !!config.model;

  return (
    <div
      className="fixed right-4 bottom-4 md:right-5 md:bottom-5 z-40 flex max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] flex-col td-panel backdrop-blur shadow-xl overflow-hidden"
      style={{ width: size.w, height: size.h }}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/60 shrink-0">
        <button
          type="button"
          onPointerDown={onResizePointerDown}
          className="text-text-muted hover:text-accent cursor-nwse-resize text-xs px-1 select-none touch-none"
          title={t("llm.resizeHint")}
          aria-label={t("llm.resizeHint")}
        >
          ↖
        </button>
        <span className="text-[10px] uppercase tracking-wider text-accent font-semibold">
          Trace
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="text-text-muted hover:text-text text-xs px-1"
            aria-label={t("llm.chatClose")}
          >
            ×
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40 shrink-0">
        <TortoiseMascot mood={mood} size="sm" interactive showBubble={mood !== "confused"} />
        <p className="text-xs text-text-muted leading-relaxed flex-1 min-w-0">{greetingText}</p>
      </div>

      {!connected && (
        <div className="px-3 py-2 bg-warning/10 border-b border-warning/20 shrink-0">
          <p className="text-[11px] text-text-muted">{t("llm.chatNotConnected")}</p>
          <button
            type="button"
            onClick={onOpenSettings}
            className="text-[11px] text-accent hover:underline mt-0.5"
          >
            {t("llm.openSettings")}
          </button>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-0">
        {messages.slice(1).map((m, i) => (
          <div
            key={`${m.role}-${i}`}
            className={`text-xs leading-relaxed rounded-lg px-2.5 py-1.5 max-w-[92%] mascot-chat-message ${
              m.role === "user"
                ? "ml-auto bg-accent/15 text-text border border-accent/25"
                : "mr-auto bg-surface text-text-muted border border-border/60"
            }`}
          >
            {m.text}
          </div>
        ))}
        {loading && (
          <p className="text-[11px] text-text-muted font-data animate-pulse">{t("llm.asking")}</p>
        )}
      </div>

      <div className="px-3 py-2 border-t border-border/60 space-y-2 shrink-0">
        <label className="flex items-center gap-2 text-[11px] text-text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={includeActivity}
            onChange={(e) => setIncludeActivity(e.target.checked)}
            className="rounded border-border"
          />
          {t("llm.includeActivity")}
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={t("llm.chatPlaceholder")}
            disabled={loading}
            className="flex-1 min-w-0 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-data disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={loading || !input.trim()}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-accent text-accent-foreground text-xs hover:bg-accent/90 disabled:opacity-50"
          >
            {t("llm.chatSend")}
          </button>
        </div>
        {error && !loading && (
          <p className="text-[10px] text-danger-text font-data truncate" title={error}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
