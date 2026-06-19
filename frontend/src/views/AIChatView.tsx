import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getLlmConfig, llmChat, type LlmConfigView } from "../api/client";
import { useI18n } from "../i18n";
import { formatDate } from "../utils/date";

const STORAGE_KEY = "tracedesk-ai-chat-sessions:v1";
const MAX_SESSIONS = 24;

type ChatRole = "user" | "assistant";

interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  createdAt: string;
}

interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

interface Props {
  selectedDate: string;
  availableDates: string[];
  onDateChange: (date: string) => void;
  onOpenSettings: () => void;
}

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultSession(): ChatSession {
  const now = nowIso();
  return {
    id: makeId("chat"),
    title: "New signal",
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

function loadSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [defaultSession()];
    const parsed = JSON.parse(raw) as ChatSession[];
    if (!Array.isArray(parsed) || parsed.length === 0) return [defaultSession()];
    return parsed
      .filter((session) => session && typeof session.id === "string")
      .map((session) => ({
        ...session,
        title: session.title || "Recovered signal",
        createdAt: session.createdAt || nowIso(),
        updatedAt: session.updatedAt || session.createdAt || nowIso(),
        messages: Array.isArray(session.messages) ? session.messages : [],
      }))
      .slice(0, MAX_SESSIONS);
  } catch {
    return [defaultSession()];
  }
}

function sessionTitle(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return "New signal";
  return compact.length > 42 ? `${compact.slice(0, 42)}...` : compact;
}

function formatClock(value: string, locale: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function conversationPrompt(messages: ChatMessage[], nextText: string) {
  const recent = messages.slice(-10);
  if (recent.length === 0) return nextText;

  const transcript = recent
    .map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.text}`)
    .join("\n");

  return [
    "Use the recent chat transcript as conversation context. Answer the newest user message directly.",
    "",
    "Recent chat:",
    transcript,
    "",
    `Newest user message: ${nextText}`,
  ].join("\n");
}

export function AIChatView({ selectedDate, availableDates, onDateChange, onOpenSettings }: Props) {
  const { locale, t } = useI18n();
  const [sessions, setSessions] = useState<ChatSession[]>(loadSessions);
  const [activeId, setActiveId] = useState(() => sessions[0]?.id ?? defaultSession().id);
  const [config, setConfig] = useState<LlmConfigView | null>(null);
  const [input, setInput] = useState("");
  const [includeActivity, setIncludeActivity] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeId) ?? sessions[0],
    [activeId, sessions],
  );
  const connected = Boolean(config?.connected && config.model);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
  }, [sessions]);

  useEffect(() => {
    getLlmConfig()
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [activeSession?.messages.length, loading]);

  const updateActiveSession = useCallback((fn: (session: ChatSession) => ChatSession) => {
    setSessions((prev) => {
      const next = prev.map((session) => (session.id === activeId ? fn(session) : session));
      return next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    });
  }, [activeId]);

  const createSession = useCallback(() => {
    const next = defaultSession();
    setSessions((prev) => [next, ...prev].slice(0, MAX_SESSIONS));
    setActiveId(next.id);
    setInput("");
    setError(null);
  }, []);

  const deleteSession = useCallback((sessionId: string) => {
    const remaining = sessions.filter((session) => session.id !== sessionId);
    const next = remaining.length > 0 ? remaining : [defaultSession()];
    setSessions(next);
    if (sessionId === activeId) {
      setActiveId(next[0].id);
    }
    setError(null);
  }, [activeId, sessions]);

  const clearActiveSession = useCallback(() => {
    const timestamp = nowIso();
    updateActiveSession((session) => ({
      ...session,
      title: "New signal",
      updatedAt: timestamp,
      messages: [],
    }));
    setError(null);
  }, [updateActiveSession]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading || !activeSession || !connected) return;
    const timestamp = nowIso();
    const userMessage: ChatMessage = {
      id: makeId("msg"),
      role: "user",
      text,
      createdAt: timestamp,
    };

    setInput("");
    setError(null);
    updateActiveSession((session) => ({
      ...session,
      title: session.messages.length === 0 ? sessionTitle(text) : session.title,
      updatedAt: timestamp,
      messages: [...session.messages, userMessage],
    }));
    setLoading(true);

    try {
      const result = await llmChat(
        conversationPrompt(activeSession.messages, text),
        includeActivity,
        selectedDate,
      );
      const replyTime = nowIso();
      const assistantMessage: ChatMessage = {
        id: makeId("msg"),
        role: "assistant",
        text: result.answer,
        createdAt: replyTime,
      };
      updateActiveSession((session) => ({
        ...session,
        updatedAt: replyTime,
        messages: [...session.messages, assistantMessage],
      }));
    } catch (e) {
      const message = typeof e === "string" ? e : String(e);
      const replyTime = nowIso();
      setError(message);
      updateActiveSession((session) => ({
        ...session,
        updatedAt: replyTime,
        messages: [
          ...session.messages,
          { id: makeId("msg"), role: "assistant", text: message, createdAt: replyTime },
        ],
      }));
    } finally {
      setLoading(false);
    }
  }, [activeSession, connected, includeActivity, input, loading, selectedDate, updateActiveSession]);

  return (
    <div className="ai-chat-page">
      <aside className="ai-chat-sessions">
        <div className="ai-chat-sidebar-head">
          <div>
            <span>{t("llm.chatSessions")}</span>
            <strong>{sessions.length}</strong>
          </div>
          <button type="button" onClick={createSession}>
            {t("llm.newSession")}
          </button>
        </div>
        <button
          type="button"
          onClick={clearActiveSession}
          disabled={!activeSession?.messages.length}
          className="ai-chat-clear-session"
        >
          {t("llm.clearSession")}
        </button>

        <div className="ai-chat-session-list">
          {sessions.map((session) => {
            const active = session.id === activeSession?.id;
            return (
              <div
                key={session.id}
                className={`ai-chat-session ${active ? "ai-chat-session-active" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => setActiveId(session.id)}
                  aria-current={active ? "true" : undefined}
                >
                  <strong>{session.title}</strong>
                  <span>
                    {session.messages.length} msg · {formatClock(session.updatedAt, locale)}
                  </span>
                </button>
                <button
                  type="button"
                  className="ai-chat-delete-session"
                  onClick={() => deleteSession(session.id)}
                  aria-label={t("llm.deleteSession")}
                  title={t("llm.deleteSession")}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      <section className="ai-chat-console">
        <header className="ai-chat-header">
          <div>
            <p>AI.CHAT / RAG.CONSOLE</p>
            <h2>{t("llm.chatWorkspaceTitle")}</h2>
            <span>{t("llm.chatWorkspaceDesc", { date: formatDate(selectedDate, locale, true) })}</span>
          </div>
          <div className="ai-chat-header-tools">
            <label>
              <span>{t("llm.contextDate")}</span>
              <select value={selectedDate} onChange={(e) => onDateChange(e.target.value)}>
                <option value={selectedDate}>{formatDate(selectedDate, locale, true)}</option>
                {availableDates
                  .filter((date) => date !== selectedDate)
                  .map((date) => (
                    <option key={date} value={date}>
                      {formatDate(date, locale, true)}
                    </option>
                  ))}
              </select>
            </label>
            <div className="ai-chat-status">
              <span className={connected ? "ai-chat-led-on" : "ai-chat-led-off"} />
              {connected ? t("llm.statusConnected") : t("llm.statusDisconnected")}
            </div>
          </div>
        </header>

        {!connected && (
          <div className="ai-chat-warning">
            <span>{t("llm.chatNotConnected")}</span>
            <button type="button" onClick={onOpenSettings}>
              {t("llm.openSettings")}
            </button>
          </div>
        )}

        <div ref={scrollRef} className="ai-chat-stream">
          {activeSession?.messages.length ? (
            activeSession.messages.map((message) => (
              <article key={message.id} className={`ai-chat-message ai-chat-message-${message.role}`}>
                <div className="ai-chat-message-meta">
                  <span>{message.role === "user" ? "YOU" : "TRACE AI"}</span>
                  <time>{formatClock(message.createdAt, locale)}</time>
                </div>
                <p>{message.text}</p>
              </article>
            ))
          ) : (
            <div className="ai-chat-empty">
              <strong>{t("llm.emptySessionTitle")}</strong>
              <p>{t("llm.emptySessionDesc")}</p>
            </div>
          )}
          {loading && <div className="ai-chat-thinking">{t("llm.asking")}</div>}
        </div>

        <footer className="ai-chat-composer">
          <label>
            <input
              type="checkbox"
              checked={includeActivity}
              onChange={(e) => setIncludeActivity(e.target.checked)}
            />
            <span>{t("llm.includeActivity")}</span>
          </label>
          <div className="ai-chat-input-row">
            <textarea
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
              aria-label={t("llm.chatPlaceholder")}
              rows={3}
            />
            <button type="button" onClick={() => void send()} disabled={loading || !input.trim() || !connected}>
              {t("llm.chatSend")}
            </button>
          </div>
          {error && <p className="ai-chat-error">{error}</p>}
        </footer>
      </section>
    </div>
  );
}
