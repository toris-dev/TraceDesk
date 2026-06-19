import { useCallback, useEffect, useRef, useState } from "react";
import type { SystemSnapshot } from "../../api/client";
import { getSystemSnapshot } from "../../api/client";

/** CPU/memory only — matches backend light refresh cadence. */
const POLL_MS = 3_000;
const LIGHT_POLL_MS = 10_000;
export const HISTORY_LEN = 36;
export const LIGHT_HISTORY_LEN = 12;

export interface MetricHistoryPoint {
  t: string;
  cpu: number;
  mem: number;
}

function formatTickLabel() {
  return new Date().toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function useSystemMetrics(connected: boolean, paused = false, performanceMode = false) {
  const [snapshot, setSnapshot] = useState<SystemSnapshot | null>(null);
  const [history, setHistory] = useState<MetricHistoryPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef(false);
  const pausedRef = useRef(paused);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const load = useCallback(async () => {
    if (pausedRef.current || inflight.current) return;
    inflight.current = true;
    try {
      const data = await getSystemSnapshot();
      setSnapshot(data);
      setError(null);
      const label = formatTickLabel();
      setHistory((prev) =>
        [...prev, { t: label, cpu: data.cpu_usage_percent, mem: data.memory.used_percent }].slice(
          -(performanceMode ? LIGHT_HISTORY_LEN : HISTORY_LEN),
        ),
      );
    } catch {
      setError("시스템 데이터를 불러올 수 없습니다.");
    } finally {
      inflight.current = false;
    }
  }, [performanceMode]);

  useEffect(() => {
    if (!connected) return;

    let intervalId: ReturnType<typeof setInterval> | undefined;

    const start = () => {
      load();
      intervalId = setInterval(load, performanceMode ? LIGHT_POLL_MS : POLL_MS);
    };

    const stop = () => {
      if (intervalId !== undefined) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        stop();
        start();
      }
    };

    if (!document.hidden) {
      start();
    }

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [connected, load, performanceMode]);

  return { snapshot, history, error, reload: load };
}
