import { useCallback, useState } from "react";
import type { LlmChatResult } from "../../api/client";
import { llmAskActions } from "../../api/client";
import { useI18n } from "../../i18n";

const SUGGESTIONS_KO = [
  "오늘 무엇을 많이 복사했어?",
  "어떤 앱에서 캡처를 많이 했어?",
  "검색하거나 붙여넣은 URL이 있어?",
  "복사 후 붙여넣기 흐름을 요약해줘",
];

const SUGGESTIONS_EN = [
  "What did I copy the most today?",
  "Which app had the most screenshots?",
  "Any URLs I pasted?",
  "Summarize copy→paste flows",
];

interface Props {
  selectedDate: string;
}

export function ActionAskPanel({ selectedDate }: Props) {
  const { t, locale } = useI18n();
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LlmChatResult | null>(null);

  const suggestions = locale === "en" ? SUGGESTIONS_EN : SUGGESTIONS_KO;

  const ask = useCallback(
    async (q: string) => {
      const text = q.trim();
      if (!text) return;
      setLoading(true);
      setError(null);
      setQuestion(text);
      try {
        const res = await llmAskActions(text, selectedDate);
        setResult(res);
      } catch (e) {
        setError(typeof e === "string" ? e : String(e));
        setResult(null);
      } finally {
        setLoading(false);
      }
    },
    [selectedDate],
  );

  return (
    <section className="td-panel p-5 space-y-4">
      <div>
        <h3 className="font-display font-semibold tracking-wide text-[var(--cyber-cyan)]">
          {t("llm.askTitle")}
        </h3>
        <p className="text-xs text-text-muted mt-1">{t("llm.askDesc")}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            disabled={loading}
            onClick={() => ask(s)}
            className="text-xs rounded-full border border-border px-3 py-1.5 text-text-muted hover:border-[var(--cyber-cyan)] hover:text-[var(--cyber-cyan)] transition-colors disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !loading && ask(question)}
          placeholder={t("llm.askPlaceholder")}
          className="flex-1 rounded-lg border border-border bg-surface/50 px-3 py-2.5 text-sm font-data focus:border-[var(--cyber-cyan)] focus:outline-none"
          disabled={loading}
        />
        <button
          type="button"
          disabled={loading || !question.trim()}
          onClick={() => ask(question)}
          className="shrink-0 rounded-lg bg-[var(--cyber-cyan)] text-[var(--td-accent-foreground)] px-4 py-2.5 text-sm font-display tracking-wide disabled:opacity-50"
        >
          {loading ? t("llm.asking") : t("llm.ask")}
        </button>
      </div>

      {error && (
        <p className="text-sm text-danger-text rounded-lg border border-danger/30 bg-danger/10 px-3 py-2">
          {error}
        </p>
      )}

      {result && (
        <div className="rounded-lg border border-[var(--cyber-cyan)]/30 bg-[var(--cyber-cyan-dim)]/40 p-4">
          <p className="text-[10px] font-data text-text-muted mb-2">
            {result.provider} · {result.model}
          </p>
          <div className="text-sm text-text leading-relaxed whitespace-pre-wrap font-data">
            {result.answer}
          </div>
        </div>
      )}
    </section>
  );
}
