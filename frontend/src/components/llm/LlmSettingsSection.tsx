import { useCallback, useEffect, useState } from "react";
import type { LlmConfigView, LlmModelInfo } from "../../api/client";
import {
  getLlmConfig,
  llmListModels,
  llmTestConnection,
  setLlmApiKey,
  updateLlmSettings,
} from "../../api/client";
import { useI18n } from "../../i18n";

type Provider = "ollama" | "lmstudio" | "mlxlm" | "openai";

function providerLabel(t: (key: string) => string, p: Provider): string {
  switch (p) {
    case "ollama":
      return t("llm.providerOllama");
    case "lmstudio":
      return t("llm.providerLmStudio");
    case "mlxlm":
      return t("llm.providerMlxLm");
    case "openai":
      return t("llm.providerApi");
  }
}

export function LlmSettingsSection() {
  const { t } = useI18n();
  const [config, setConfig] = useState<LlmConfigView | null>(null);
  const [models, setModels] = useState<LlmModelInfo[]>([]);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const c = await getLlmConfig();
      setConfig(c);
      if (!c.connected) {
        try {
          const list = await llmListModels();
          setModels(list);
          if (list.length > 0 && !c.model) {
            const next = await updateLlmSettings({ model: list[0].id });
            setConfig(next);
          }
        } catch {
          /* 모델 목록은 연결 시도 전 선택 사항 */
        }
      }
    } catch {
      setConfig(null);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refreshModels = useCallback(async () => {
    if (!config) return;
    setLoading(true);
    setError(null);
    try {
      const list = await llmListModels();
      setModels(list);
      if (list.length > 0 && !config.model) {
        const next = await updateLlmSettings({ model: list[0].id });
        setConfig(next);
      }
    } catch (e) {
      setError(typeof e === "string" ? e : String(e));
      setModels([]);
    } finally {
      setLoading(false);
    }
  }, [config]);

  const saveProvider = async (provider: Provider) => {
    setLoading(true);
    setError(null);
    setTestResult(null);
    try {
      const next = await updateLlmSettings({ provider });
      setConfig(next);
      setModels([]);
    } finally {
      setLoading(false);
    }
  };

  const saveField = async (patch: Parameters<typeof updateLlmSettings>[0]) => {
    setLoading(true);
    setError(null);
    setTestResult(null);
    try {
      setConfig(await updateLlmSettings(patch));
    } finally {
      setLoading(false);
    }
  };

  const saveApiKey = async () => {
    setLoading(true);
    setError(null);
    setTestResult(null);
    try {
      setConfig(await setLlmApiKey(apiKeyInput.trim() || null));
      setApiKeyInput("");
    } finally {
      setLoading(false);
    }
  };

  const connect = async () => {
    setLoading(true);
    setError(null);
    setTestResult(null);
    try {
      if (!config?.model) {
        await refreshModels();
      }
      const result = await llmTestConnection();
      setTestResult(result);
      setConfig(await getLlmConfig());
    } catch (e) {
      setError(typeof e === "string" ? e : String(e));
      setConfig(await getLlmConfig().catch(() => null));
    } finally {
      setLoading(false);
    }
  };

  if (!config) return null;

  const isOllama = config.provider === "ollama";
  const isLmStudio = config.provider === "lmstudio";
  const isMlxLm = config.provider === "mlxlm";
  const isLocalOpenAi = isLmStudio || isMlxLm;
  const isOpenAi = config.provider === "openai";
  const needsApiKey = isOpenAi && !config.has_api_key;
  const canConnect = (isMlxLm || !!config.model) && !needsApiKey;

  const serverUrlLabel = isLmStudio
    ? t("llm.lmStudioUrl")
    : isMlxLm
      ? t("llm.mlxLmUrl")
      : t("llm.apiBaseUrl");
  const serverUrlHint = isLmStudio
    ? t("llm.lmStudioHint")
    : isMlxLm
      ? t("llm.mlxLmHint")
      : t("llm.apiBaseHint");
  const serverUrlPlaceholder = isLmStudio
    ? "http://127.0.0.1:1234/v1"
    : isMlxLm
      ? "http://127.0.0.1:8080/v1"
      : "https://api.openai.com/v1";
  const noKeyHint = isLmStudio ? t("llm.lmStudioNoKey") : isMlxLm ? t("llm.mlxLmNoKey") : null;

  return (
    <section className="rounded-xl border border-border bg-surface-elevated p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-medium text-text">{t("llm.settingsTitle")}</h3>
          <p className="text-xs text-text-muted mt-1">{t("llm.settingsDesc")}</p>
        </div>
        <span
          className={`text-[11px] font-data px-2.5 py-1 rounded-full border ${
            config.connected
              ? "border-success/40 bg-success/10 text-success-text"
              : "border-border bg-surface text-text-muted"
          }`}
        >
          {config.connected ? t("llm.statusConnected") : t("llm.statusDisconnected")}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["ollama", "lmstudio", "mlxlm", "openai"] as const).map((p) => (
          <button
            key={p}
            type="button"
            disabled={loading}
            onClick={() => saveProvider(p)}
            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              config.provider === p
                ? "bg-accent text-accent-foreground border-accent"
                : "border-border hover:bg-surface"
            }`}
          >
            {providerLabel(t, p)}
          </button>
        ))}
      </div>

      {isOllama ? (
        <label className="block text-sm space-y-1">
          <span className="text-text-muted">{t("llm.ollamaUrl")}</span>
          <input
            type="url"
            defaultValue={config.ollama_base_url}
            disabled={loading}
            onBlur={(e) => {
              if (e.target.value !== config.ollama_base_url) {
                saveField({ ollamaBaseUrl: e.target.value });
              }
            }}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-data"
          />
        </label>
      ) : (
        <>
          <label className="block text-sm space-y-1">
            <span className="text-text-muted">{serverUrlLabel}</span>
            <input
              type="url"
              defaultValue={config.api_base_url}
              disabled={loading}
              onBlur={(e) => {
                if (e.target.value !== config.api_base_url) {
                  saveField({ apiBaseUrl: e.target.value });
                }
              }}
              placeholder={serverUrlPlaceholder}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-data"
            />
          </label>
          <p className="text-[11px] text-text-muted">{serverUrlHint}</p>
          {!isLocalOpenAi && (
            <label className="block text-sm space-y-1">
              <span className="text-text-muted">{t("llm.apiKey")}</span>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={config.has_api_key ? t("llm.apiKeySet") : "sk-…"}
                  className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-data"
                />
                <button
                  type="button"
                  disabled={loading}
                  onClick={saveApiKey}
                  className="shrink-0 px-3 py-2 rounded-lg border border-border text-sm hover:bg-surface"
                >
                  {t("llm.saveKey")}
                </button>
              </div>
            </label>
          )}
          {noKeyHint && (
            <p className="text-[11px] text-text-muted">{noKeyHint}</p>
          )}
        </>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <button
          type="button"
          disabled={loading}
          onClick={() => void refreshModels()}
          className="text-sm px-3 py-2 rounded-lg border border-border hover:bg-surface disabled:opacity-50"
        >
          {loading ? "…" : t("llm.loadModels")}
        </button>
        <label className="flex-1 min-w-[200px] text-sm space-y-1">
          <span className="text-text-muted">{t("llm.model")}</span>
          {models.length > 0 ? (
            <select
              value={config.model}
              disabled={loading}
              onChange={(e) => saveField({ model: e.target.value })}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-data"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={config.model}
              disabled={loading}
              onChange={(e) => setConfig({ ...config, model: e.target.value })}
              onBlur={() => saveField({ model: config.model })}
              placeholder={
                isOllama
                  ? "llama3.2"
                  : isMlxLm
                    ? t("llm.mlxLmModelOptional")
                    : isLocalOpenAi
                      ? "local-model"
                      : "gpt-4o-mini"
              }
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-data"
            />
          )}
        </label>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <button
          type="button"
          disabled={loading || !canConnect}
          onClick={() => void connect()}
          className="text-sm px-4 py-2 rounded-lg bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
        >
          {loading ? t("llm.connecting") : t("llm.connect")}
        </button>
        {!canConnect && (
          <p className="text-[11px] text-text-muted">
            {needsApiKey ? t("llm.needApiKey") : t("llm.needModel")}
          </p>
        )}
      </div>

      {testResult && (
        <p className="text-xs text-success-text font-data rounded-lg border border-success/30 bg-success/10 px-3 py-2">
          {testResult}
        </p>
      )}
      {error && (
        <p className="text-xs text-danger-text font-data rounded-lg border border-danger/30 bg-danger/10 px-3 py-2">
          {error}
        </p>
      )}
    </section>
  );
}
