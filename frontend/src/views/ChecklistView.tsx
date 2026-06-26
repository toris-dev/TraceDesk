import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getChecklistItems,
  saveChecklistItems,
  showChecklistWindow,
  type ChecklistItem,
} from "../api/client";

const CHECKLIST_EVENT = "checklist-updated";
const QUICK_TASKS = [
  "Pulse 저장 경로 확인",
  "오늘 devPulse 실행 결과 확인",
  "카드/영상/SNS 산출물 점검",
];

function makeItem(title: string): ChecklistItem {
  return {
    id: `todo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    done: false,
    created_at: new Date().toISOString(),
  };
}

function ratio(items: ChecklistItem[]) {
  if (items.length === 0) return 0;
  return Math.round((items.filter((item) => item.done).length / items.length) * 100);
}

export function ChecklistView({ popup = false }: { popup?: boolean }) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getChecklistItems();
      setItems(next);
      setError(null);
    } catch (e) {
      setError(typeof e === "string" ? e : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<ChecklistItem[]>(CHECKLIST_EVENT, (event) => {
      setItems(event.payload ?? []);
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});
    return () => unlisten?.();
  }, []);

  const commit = useCallback(async (next: ChecklistItem[]) => {
    setItems(next);
    setSaving(true);
    try {
      const saved = await saveChecklistItems(next);
      setItems(saved);
      setError(null);
    } catch (e) {
      setError(typeof e === "string" ? e : String(e));
    } finally {
      setSaving(false);
    }
  }, []);

  const completed = useMemo(() => items.filter((item) => item.done).length, [items]);
  const completion = ratio(items);

  const addItem = useCallback(async () => {
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    await commit([makeItem(title), ...items]);
  }, [commit, draft, items]);

  return (
    <div className={popup ? "checklist-popup-shell" : "checklist-page"}>
      <section className={`td-panel ${popup ? "checklist-popup-panel" : "checklist-hero"}`}>
        <div className="checklist-hero-head">
          <div>
            <p className="td-label">{popup ? "TRACE PINNED CHECKLIST" : "TRACE OPS CHECKLIST"}</p>
            <h2 className="checklist-title">{popup ? "오늘 작업" : "오늘 작업 큐"}</h2>
            <p className="checklist-subtitle">
              {popup
                ? "다른 앱 위에 고정된 상태로 오늘 처리할 작업을 하나씩 끝낼 수 있습니다."
                : "Pulse 실행과 디자인 수정 중 필요한 작업을 고정된 투두 보드로 관리합니다."}
            </p>
          </div>
          {!popup && (
            <button
              type="button"
              onClick={() => void showChecklistWindow()}
              className="checklist-open-popup"
            >
              팝업 고정 열기
            </button>
          )}
        </div>

        <div className="checklist-stats">
          <div>
            <span>Open</span>
            <strong>{items.length - completed}</strong>
          </div>
          <div>
            <span>Done</span>
            <strong>{completed}</strong>
          </div>
          <div>
            <span>Sync</span>
            <strong>{saving ? "Saving" : "Live"}</strong>
          </div>
          <div>
            <span>Focus</span>
            <strong>{completion}%</strong>
          </div>
        </div>

        <div className="checklist-progress">
          <div className="checklist-progress-bar" style={{ width: `${completion}%` }} />
        </div>
      </section>

      <section className="td-panel checklist-board">
        <div className="checklist-input-row">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void addItem();
              }
            }}
            className="checklist-input"
            placeholder="새 작업 추가"
          />
          <button type="button" onClick={() => void addItem()} className="checklist-add-button">
            추가
          </button>
        </div>

        {error && <div className="checklist-error">{error}</div>}

        {loading ? (
          <div className="checklist-empty">불러오는 중…</div>
        ) : items.length === 0 ? (
          <div className="checklist-empty checklist-empty-rich">
            <strong>아직 등록된 작업이 없습니다.</strong>
            <span>아래 빠른 작업을 누르거나 직접 입력하면 팝업과 메인 화면에 바로 동기화됩니다.</span>
            <div className="checklist-quick-actions">
              {QUICK_TASKS.map((task) => (
                <button
                  type="button"
                  key={task}
                  onClick={() => void commit([makeItem(task), ...items])}
                  className="checklist-quick-button"
                >
                  {task}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="checklist-list">
            {items.map((item, index) => (
              <div key={item.id} className={`checklist-row ${item.done ? "is-done" : ""}`}>
                <button
                  type="button"
                  aria-pressed={item.done}
                  className="checklist-toggle"
                  onClick={() =>
                    void commit(
                      items.map((current) =>
                        current.id === item.id ? { ...current, done: !current.done } : current,
                      ),
                    )
                  }
                >
                  <span />
                </button>
                <div className="checklist-copy">
                  <strong>{item.title}</strong>
                  <p>{item.done ? "완료됨" : `Queue ${String(index + 1).padStart(2, "0")}`}</p>
                </div>
                <button
                  type="button"
                  className="checklist-remove"
                  onClick={() => void commit(items.filter((current) => current.id !== item.id))}
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
