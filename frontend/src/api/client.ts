import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export const ACTIVITY_EVENT = "activity-event";

export const MENU_NAVIGATE = "menu-navigate";
export const MENU_REFRESH = "menu-refresh-ui";
export const MENU_GO_TODAY = "menu-go-today-ui";
export const MENU_EXPORT_DONE = "menu-export-done";
export const MENU_ERROR = "menu-error";
export const MENU_CHECK_UPDATE = "menu-check-update-ui";

export interface DailyStatistics {
  active: number;
  idle: number;
  copy: number;
  paste: number;
  screenshot: number;
  top_application: string | null;
}

export interface ActivityItem {
  id?: number;
  type: string;
  time: string;
  name?: string;
  window_title?: string;
  duration?: number;
  metadata?: Record<string, unknown>;
}

export interface ActionDateSummary {
  date: string;
  total: number;
  copy: number;
  paste: number;
  screenshot: number;
  top_location: string | null;
  latest_time: string | null;
  latest_app: string | null;
}

export interface TimelineSegment {
  application: string;
  start: string;
  end: string;
  duration: number;
}

export interface FullTimelineItem {
  kind: string;
  label: string;
  start: string;
  end?: string;
  duration?: number;
  metadata?: Record<string, unknown>;
}

export interface IdleSession {
  start: string;
  end: string;
  duration_seconds: number;
}

export interface IdleAnalysis {
  total_idle_minutes: number;
  session_count: number;
  longest_session_minutes: number;
  average_session_minutes: number;
  sessions: IdleSession[];
}

export interface ActionHourlyPoint {
  hour: number;
  copy: number;
  paste: number;
  screenshot: number;
}

export interface ApplicationUsage {
  application: string;
  duration: number;
}

export interface HourlyActivity {
  hour: number;
  activity: number;
}

export interface FocusWindow {
  start: string;
  end: string;
  intensity: number;
}

export interface ProductivityAnalysis {
  score: number;
  grade: string;
  active_ratio: number;
  avg_session_minutes: number;
  app_switches: number;
  focus_window: FocusWindow | null;
  recommendations: string[];
}

export interface DailyReportItem {
  date: string;
  weekday: string;
  weekday_short: string;
  active_minutes: number;
  idle_minutes: number;
  productivity_score: number;
  grade: string;
  focus_window: string | null;
}

export interface WeeklyReport {
  period_start: string;
  period_end: string;
  total_active_minutes: number;
  total_active_hours: number;
  avg_productivity_score: number;
  avg_daily_active_minutes: number;
  best_focus_day: DailyReportItem | null;
  most_productive_day: DailyReportItem | null;
  daily: DailyReportItem[];
  focus_pattern_summary: string;
  recommendations: string[];
}

export interface PermissionItem {
  id: string;
  name: string;
  granted: boolean;
  required: boolean;
  description: string;
  /** macOS: TCC 허용됐지만 실제 API 동작 여부 */
  functional?: boolean;
}

export interface PermissionStatus {
  platform: string;
  all_granted: boolean;
  permissions: PermissionItem[];
  app_label?: string;
  restart_recommended?: boolean;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  cpu_percent: number;
  memory_mb: number;
}

export interface PortInfo {
  port: number;
  protocol: string;
  address: string;
  process: string | null;
  pid: number | null;
  is_tracedesk: boolean;
}

export interface MemoryInfo {
  total_mb: number;
  used_mb: number;
  available_mb: number;
  used_percent: number;
}

export interface SystemSnapshot {
  timestamp: string;
  cpu_usage_percent: number;
  memory: MemoryInfo;
  tracedesk: ProcessInfo | null;
  top_processes: ProcessInfo[];
  ports: PortInfo[];
  port_count: number;
}

async function invokeCmd<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (shouldUsePreviewMock()) {
    return mockInvoke<T>(cmd, args);
  }
  return invoke<T>(cmd, args);
}

function shouldUsePreviewMock(): boolean {
  return Boolean(import.meta.env.DEV && typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window));
}

function previewDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function previewSettings(): AppSettings {
  return {
    autostart_enabled: true,
    retention_days: 90,
    last_archive_at: null,
    enable_accessibility: true,
    enable_input_monitoring: true,
    store_clipboard_preview: false,
    store_screenshot_preview: true,
    locale: "ko",
    theme: "dark",
    performance_mode: false,
    setup_completed: true,
    first_run_completed: true,
    llm_provider: "ollama",
    llm_model: "llama3.1",
    ollama_base_url: "http://localhost:11434",
    api_base_url: "",
    devpulse_root_dir: "../devPulse",
    devpulse_cron_enabled: false,
    devpulse_cron_expr: "0 9 * * *",
    devpulse_feeds: ["all", "new", "ask", "show", "top"],
    devpulse_topic_filters: ["AI agent", "MCP", "automation"],
    devpulse_batch_size: 5,
    devpulse_collect_limit: 0,
    devpulse_idle_poll_sec: 90,
    devpulse_backlog_pause_sec: 0,
    devpulse_bundle_size: 6,
    devpulse_sns_mode: "file",
    devpulse_mastodon_instance: "",
  };
}

function previewActivityBundle(date = previewDate()): ActivityBundle {
  const events: ActivityItem[] = [
    {
      id: 12,
      type: "SCREENSHOT",
      time: `${date}T15:42:00+09:00`,
      name: "Screenshot",
      window_title: "Design QA board",
      metadata: { source: "preview", path: "Desktop/Screenshots/design-review.png" },
    },
    {
      id: 11,
      type: "PASTE",
      time: `${date}T15:28:00+09:00`,
      name: "Cursor",
      window_title: "AI chat session prompt",
      metadata: { clipboard_preview: "사용자의 복사/붙여넣기/캡처 패턴으로 어떤 사람인지 분석해줘" },
    },
    {
      id: 10,
      type: "COPY",
      time: `${date}T15:14:00+09:00`,
      name: "Arc",
      window_title: "Research notes",
      metadata: { clipboard_preview: "cybernetic activity intelligence dashboard interaction model" },
    },
    {
      id: 9,
      type: "WINDOW_FOCUS",
      time: `${date}T14:52:00+09:00`,
      name: "Figma",
      window_title: "TraceDesk redesign",
      duration: 1260,
    },
    {
      id: 8,
      type: "COPY",
      time: `${date}T14:39:00+09:00`,
      name: "Notion",
      window_title: "Product behavior notes",
      metadata: { clipboard_preview: "인터랙티브하게 채팅할 수 있도록 지원" },
    },
    {
      id: 7,
      type: "WINDOW_FOCUS",
      time: `${date}T13:46:00+09:00`,
      name: "Cursor",
      window_title: "TraceDesk source",
      duration: 3180,
    },
  ];

  return {
    stats: {
      active: 386,
      idle: 74,
      copy: 34,
      paste: 21,
      screenshot: 8,
      top_application: "Cursor",
    },
    applications: [
      { application: "Cursor", duration: 11880 },
      { application: "Figma", duration: 7740 },
      { application: "Arc", duration: 4920 },
      { application: "Notion", duration: 3540 },
      { application: "Terminal", duration: 2340 },
      { application: "Finder", duration: 960 },
    ],
    timeline: [
      { kind: "app", label: "Cursor", start: "09:12", end: "10:35", duration: 4980 },
      { kind: "app", label: "Arc", start: "10:35", end: "11:12", duration: 2220 },
      { kind: "idle", label: "Idle", start: "11:12", end: "11:31", duration: 1140 },
      { kind: "app", label: "Figma", start: "11:31", end: "12:48", duration: 4620 },
      { kind: "app", label: "Cursor", start: "13:46", end: "14:39", duration: 3180 },
      { kind: "app", label: "Notion", start: "14:39", end: "14:52", duration: 780 },
      { kind: "app", label: "Figma", start: "14:52", end: "15:13", duration: 1260 },
      { kind: "app", label: "Cursor", start: "15:13", end: "16:05", duration: 3120 },
    ],
    idle: {
      total_idle_minutes: 74,
      session_count: 5,
      longest_session_minutes: 28,
      average_session_minutes: 14.8,
      sessions: [
        { start: "11:12", end: "11:31", duration_seconds: 1140 },
        { start: "12:48", end: "13:09", duration_seconds: 1260 },
      ],
    },
    action_hourly: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      copy: [0, 0, 0, 0, 0, 0, 0, 1, 2, 5, 3, 2, 1, 4, 7, 6, 3, 0, 0, 0, 0, 0, 0, 0][hour],
      paste: [0, 0, 0, 0, 0, 0, 0, 0, 1, 3, 2, 1, 0, 3, 4, 5, 2, 0, 0, 0, 0, 0, 0, 0][hour],
      screenshot: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0][hour],
    })),
    hourly: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      activity: [0, 0, 0, 0, 0, 0, 0, 18, 42, 61, 57, 44, 22, 51, 68, 74, 39, 0, 0, 0, 0, 0, 0, 0][hour],
    })),
    events,
    productivity: {
      score: 82,
      grade: "A",
      active_ratio: 0.64,
      avg_session_minutes: 38,
      app_switches: 31,
      focus_window: { start: "13:46", end: "16:05", intensity: 88 },
      recommendations: ["AI 채팅 탭에서 오늘의 의사결정 패턴을 요약해 보세요."],
    },
    events_truncated: false,
  };
}

function previewWeeklyReport(): WeeklyReport {
  return {
    period_start: "2026-06-13",
    period_end: previewDate(),
    total_active_minutes: 1840,
    total_active_hours: 30.7,
    avg_productivity_score: 78,
    avg_daily_active_minutes: 263,
    best_focus_day: null,
    most_productive_day: null,
    daily: [],
    focus_pattern_summary: "오후 시간대에 디자인 검토와 구현 집중도가 높습니다.",
    recommendations: ["AI 채팅 세션을 업무 단위로 나누면 회고 품질이 좋아집니다."],
  };
}

async function mockInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const date = typeof args?.date === "string" ? args.date : previewDate();
  const bundle = previewActivityBundle(date);
  const okPermissions: PermissionStatus = {
    platform: "preview",
    all_granted: true,
    permissions: [],
  };

  const responses: Record<string, unknown> = {
    get_settings: previewSettings(),
    get_action_events: bundle.events.filter((event) =>
      event.type === "COPY" || event.type === "PASTE" || event.type === "SCREENSHOT",
    ),
    get_action_date_summaries: [
      {
        date: previewDate(),
        total: 63,
        copy: 34,
        paste: 21,
        screenshot: 8,
        top_location: "Cursor",
        latest_time: "15:42",
        latest_app: "Cursor",
      },
      {
        date: "2026-06-18",
        total: 48,
        copy: 25,
        paste: 18,
        screenshot: 5,
        top_location: "Figma",
        latest_time: "17:10",
        latest_app: "Figma",
      },
      {
        date: "2026-06-17",
        total: 37,
        copy: 18,
        paste: 14,
        screenshot: 5,
        top_location: "Arc",
        latest_time: "16:24",
        latest_app: "Arc",
      },
    ],
    get_available_dates: [
      { date: previewDate(), event_count: 63 },
      { date: "2026-06-18", event_count: 48 },
      { date: "2026-06-17", event_count: 37 },
    ],
    get_activity_bundle: bundle,
    get_weekly_report: previewWeeklyReport(),
    get_permissions_status: okPermissions,
    refresh_permissions: okPermissions,
    request_permissions: okPermissions,
    get_llm_config: {
      provider: "ollama",
      model: "llama3.1",
      ollama_base_url: "http://localhost:11434",
      api_base_url: "",
      has_api_key: false,
      connected: true,
    } satisfies LlmConfigView,
    llm_chat: {
      provider: "preview",
      model: "design-audit",
      answer:
        "한 줄 정체성: 시각 자료를 모아 빠르게 구조화하는 정보 조립형 실행가입니다.\n\n행동 패턴: 오후에 Cursor, Figma, 브라우저를 오가며 복사/붙여넣기와 캡처가 집중됩니다.\n\n강점: 맥락을 빠르게 연결하고 산출물 중심으로 움직입니다.\n\n주의할 점: 앱 전환이 많아 세션 단위 회고가 없으면 판단 근거가 흩어질 수 있습니다.\n\n내일의 제안: AI 채팅에서 작업 단위별로 새 세션을 만들고 캡처 근거를 함께 요약하세요.",
    } satisfies LlmChatResult,
    llm_list_models: [{ id: "llama3.1", name: "llama3.1" }],
    llm_test_connection: "ok",
    get_db_stats: {
      active_db_bytes: 4200000,
      active_db_mb: 4.2,
      event_count: 1240,
      oldest_event: "2026-06-01",
      retention_days: 90,
      archives: [],
      total_archive_bytes: 0,
      total_archive_mb: 0,
      last_archive_at: null,
    } satisfies DbStats,
    get_devpulse_config: {
      root_dir: "/Users/toris/projects/devPulse",
      root_ready: true,
      root_exists: true,
      setup_hint: "",
      cron_enabled: false,
      cron_expr: "0 9 * * *",
      feeds: ["all", "new", "ask", "show", "top"],
      topic_filters: ["AI agent", "MCP", "automation"],
      batch_size: 5,
      collect_limit: 0,
      idle_poll_sec: 90,
      backlog_pause_sec: 0,
      bundle_size: 6,
      sns_mode: "file",
      mastodon_instance: "",
      has_mastodon_token: false,
    } satisfies DevPulseConfigView,
    get_devpulse_status: {
      config: {
        root_dir: "/Users/toris/projects/devPulse",
        root_ready: true,
        root_exists: true,
        setup_hint: "",
        cron_enabled: false,
        cron_expr: "0 9 * * *",
        feeds: ["all", "new", "ask", "show", "top"],
        topic_filters: ["AI agent", "MCP", "automation"],
        batch_size: 5,
        collect_limit: 0,
        idle_poll_sec: 90,
        backlog_pause_sec: 0,
        bundle_size: 6,
        sns_mode: "file",
        mastodon_instance: "",
        has_mastodon_token: false,
      },
      runtime: {
        daemon_running: false,
        daemon_pid: null,
        run_in_flight: false,
        last_run_at: "2026-06-19T21:50:00+09:00",
        last_error: null,
      },
      dependencies: [
        {
          key: "python",
          label: "Python",
          target: "/Users/toris/projects/devPulse/.venv/bin/python",
          ready: true,
          detail: "ready",
        },
        {
          key: "database",
          label: "Postgres",
          target: "postgresql://devpulse:devpulse@localhost:5434/devpulse",
          ready: false,
          detail: "Connection refused",
        },
        {
          key: "minio",
          label: "MinIO",
          target: "http://localhost:9000",
          ready: false,
          detail: "Connection refused",
        },
        {
          key: "qdrant",
          label: "Qdrant",
          target: "http://localhost:6333",
          ready: false,
          detail: "Connection refused",
        },
        {
          key: "llm",
          label: "LLM / ollama",
          target: "http://localhost:11434",
          ready: true,
          detail: "ready",
        },
      ],
      payload: {
        progress: {
          daemon_status: "대기",
          run_number: 12,
          phase: "유휴",
          step: "신규 글 없음 · 번들 대기 없음",
          current_post_id: null,
          current_title: null,
          collected_this_run: 0,
          queue_size: 0,
          processed_this_run: 0,
          failed_this_run: 0,
          total_published: 18,
          total_collected: 3,
          total_failed: 1,
          updated_at: "2026-06-19T21:50:00+09:00",
          recent_logs: ["cycle #12 idle processed=0", "dashboard: http://127.0.0.1:8188"],
        },
        db: {
          counts: { published: 18, card_generated: 4, collected: 3, failed: 1 },
          bundle_pending: "4/6",
          bundle_total: 3,
          recent_bundles: [],
        },
        bundle: {
          current: 4,
          target: 6,
          percent: 66.7,
          ready: false,
          slots: [
            { index: 1, filled: true, post_id: "post-1", title: "Apple MLX updates", url: "/Users/toris/projects/devPulse/output/cards/post-1.jpg" },
            { index: 2, filled: true, post_id: "post-2", title: "OpenAI desktop agents", url: "/Users/toris/projects/devPulse/output/cards/post-2.jpg" },
            { index: 3, filled: true, post_id: "post-3", title: "Rust async runtime", url: "/Users/toris/projects/devPulse/output/cards/post-3.jpg" },
            { index: 4, filled: true, post_id: "post-4", title: "Design systems at scale", url: "/Users/toris/projects/devPulse/output/cards/post-4.jpg" },
            { index: 5, filled: false, post_id: "", title: "", url: null },
            { index: 6, filled: false, post_id: "", title: "", url: null },
          ],
          cards: [],
        },
        artifacts: {
          counts: { cards: 24, bundles: 3, bundles_raw: 3 },
          cards: [
            {
              post_id: "post-1",
              title: "Apple MLX updates",
              url: "/Users/toris/projects/devPulse/output/cards/post-1.jpg",
              size_kb: 244.1,
              created_at: "2026-06-19T21:40:00+09:00",
              kind: "standalone",
            },
          ],
          bundles: [
            {
              bundle_id: "bundle-20260619-01",
              post_ids: ["post-1", "post-2", "post-3", "post-4", "post-5", "post-6"],
              post_count: 6,
              platform: "file",
              published_at: "2026-06-19T21:10:00+09:00",
              created_at: "2026-06-19T21:10:00+09:00",
              caption: "AI infra weekly digest",
              caption_url: null,
              json_url: "/Users/toris/projects/devPulse/output/sns/bundle-20260619-01.json",
              video_url: "/Users/toris/projects/devPulse/output/bundles/bundle-20260619-01/bundle-20260619-01.mp4",
              card_count: 6,
              size_kb: 1822.2,
            },
          ],
        },
        logs: {
          tail: ["[21:49] idle", "[21:50] waiting next cycle"],
          log_file: "output/daemon.log",
        },
        sns: {
          configured: true,
          state_db: "/Users/toris/projects/devPulse/output/instagram/state.db",
          timezone: "Asia/Seoul",
          post_times: ["09:00", "14:00", "19:00"],
          reels_per_day: 3,
          stats: {
            total: 4,
            posted: 3,
            failed: 1,
          },
          daily_counts: [
            { day: "2026-06-19", kind: "reel", count: 2 },
            { day: "2026-06-18", kind: "reel", count: 1 },
          ],
          recent_posts: [
            {
              bundle_id: "bundle-20260619-01",
              kind: "reel",
              ig_media_id: "17890000000000001",
              posted_at: "2026-06-19T21:12:00+09:00",
              error: null,
              content_key: "posts:post-1,post-2,post-3,post-4,post-5,post-6",
            },
            {
              bundle_id: "bundle-20260618-02",
              kind: "reel",
              ig_media_id: null,
              posted_at: null,
              error: "media processing failed",
              content_key: "posts:post-7,post-8,post-9,post-10,post-11,post-12",
            },
          ],
        },
        generated_at: "2026-06-19T21:50:00+09:00",
      },
    } satisfies DevPulseStatusView,
    get_devpulse_infra_status: {
      docker_available: true,
      docker_daemon_ready: false,
      compose_dir: "/Users/toris/projects/devPulse/infra",
      services: [
        { name: "postgres", running: false },
        { name: "redis", running: false },
        { name: "minio", running: false },
        { name: "qdrant", running: false },
      ],
      detail: "Cannot connect to the Docker daemon",
    } satisfies DevPulseInfraStatusView,
  };

  if (cmd === "update_settings") return { ...previewSettings(), ...definedSettings(args) } as T;
  if (cmd === "complete_setup") return { settings: previewSettings(), permissions: okPermissions } as T;
  if (cmd === "export_activity") return { saved: true, path: "/tmp/tracedesk-preview.csv", row_count: 63 } as T;
  if (cmd === "set_llm_api_key" || cmd === "update_llm_settings") return responses.get_llm_config as T;
  if (cmd === "pick_devpulse_root_dir") {
    const root = (args?.rootDir as string | undefined) ?? "/Users/toris/projects/devPulse";
    return {
      ...(responses.get_devpulse_config as Record<string, unknown>),
      root_dir: root,
      root_ready: true,
      root_exists: true,
      setup_hint: "",
    } as T;
  }
  if (cmd === "update_devpulse_settings") {
    return { ...(responses.get_devpulse_config as Record<string, unknown>), ...(args ?? {}) } as T;
  }
  if (cmd === "get_devpulse_secrets_status" || cmd === "update_devpulse_secrets") {
    return { has_mastodon_token: Boolean(args?.mastodonAccessToken) } as T;
  }
  if (cmd === "get_devpulse_infra_status" || cmd === "start_devpulse_infra" || cmd === "stop_devpulse_infra") {
    return responses.get_devpulse_infra_status as T;
  }
  if (cmd === "run_devpulse_now") return { mode: args?.mode ?? "run", ok: true } as T;
  if (cmd === "start_devpulse_daemon" || cmd === "stop_devpulse_daemon") {
    return {
      daemon_running: cmd === "start_devpulse_daemon",
      daemon_pid: cmd === "start_devpulse_daemon" ? 4242 : null,
      run_in_flight: false,
      last_run_at: "2026-06-19T21:50:00+09:00",
      last_error: null,
    } as T;
  }
  if (cmd === "run_archive_now") {
    return {
      archived_months: [],
      deleted_events: 0,
      freed_bytes_estimate: 0,
      active_db_bytes_after: 4200000,
    } as T;
  }

  if (cmd in responses) return responses[cmd] as T;
  throw new Error(`Preview mock does not implement command: ${cmd}`);
}

function definedSettings(args?: Record<string, unknown>): Partial<AppSettings> {
  const next: Partial<AppSettings> = {
    autostart_enabled: typeof args?.autostartEnabled === "boolean" ? args.autostartEnabled : undefined,
    retention_days: typeof args?.retentionDays === "number" ? args.retentionDays : undefined,
    enable_accessibility: typeof args?.enableAccessibility === "boolean" ? args.enableAccessibility : undefined,
    enable_input_monitoring: typeof args?.enableInputMonitoring === "boolean" ? args.enableInputMonitoring : undefined,
    store_clipboard_preview: typeof args?.storeClipboardPreview === "boolean" ? args.storeClipboardPreview : undefined,
    store_screenshot_preview: typeof args?.storeScreenshotPreview === "boolean" ? args.storeScreenshotPreview : undefined,
    locale: typeof args?.locale === "string" ? args.locale : undefined,
    theme: typeof args?.theme === "string" ? args.theme : undefined,
    performance_mode: typeof args?.performanceMode === "boolean" ? args.performanceMode : undefined,
  };
  return Object.fromEntries(Object.entries(next).filter(([, value]) => value !== undefined)) as Partial<AppSettings>;
}

export function getActionEvents(date?: string) {
  return invokeCmd<ActivityItem[]>("get_action_events", { date: date ?? null });
}

export function getActionDateSummaries(limit = 14) {
  return invokeCmd<ActionDateSummary[]>("get_action_date_summaries", { limit });
}

export interface LlmConfigView {
  provider: string;
  model: string;
  ollama_base_url: string;
  api_base_url: string;
  has_api_key: boolean;
  connected: boolean;
}

export interface LlmModelInfo {
  id: string;
  name: string;
}

export interface LlmChatResult {
  answer: string;
  model: string;
  provider: string;
}

export function getLlmConfig() {
  return invokeCmd<LlmConfigView>("get_llm_config");
}

export function updateLlmSettings(opts: {
  provider?: string;
  model?: string;
  ollamaBaseUrl?: string;
  apiBaseUrl?: string;
}) {
  return invokeCmd<LlmConfigView>("update_llm_settings", {
    provider: opts.provider ?? null,
    model: opts.model ?? null,
    ollamaBaseUrl: opts.ollamaBaseUrl ?? null,
    apiBaseUrl: opts.apiBaseUrl ?? null,
  });
}

export function setLlmApiKey(apiKey: string | null) {
  return invokeCmd<LlmConfigView>("set_llm_api_key", { apiKey });
}

export function llmListModels() {
  return invokeCmd<LlmModelInfo[]>("llm_list_models");
}

export function llmTestConnection() {
  return invokeCmd<string>("llm_test_connection");
}

export function llmAskActions(question: string, date?: string) {
  return invokeCmd<LlmChatResult>("llm_ask_actions", {
    question,
    date: date ?? null,
  });
}

export function llmChat(message: string, includeActivity: boolean, date?: string) {
  return invokeCmd<LlmChatResult>("llm_chat", {
    message,
    includeActivity,
    date: date ?? null,
  });
}

export function getActivityBundle(date?: string) {
  return invokeCmd<ActivityBundle>("get_activity_bundle", { date: date ?? null });
}

export interface ActivityBundle {
  stats: DailyStatistics;
  applications: ApplicationUsage[];
  timeline: FullTimelineItem[];
  idle: IdleAnalysis;
  action_hourly: ActionHourlyPoint[];
  hourly: HourlyActivity[];
  events: ActivityItem[];
  productivity: ProductivityAnalysis;
  events_truncated: boolean;
}

export function getDailyStatistics(date?: string) {
  return invokeCmd<DailyStatistics>("get_daily_statistics", { date: date ?? null });
}

export function getActivityToday(date?: string) {
  return invokeCmd<ActivityItem[]>("get_activity_today", { date: date ?? null });
}

export type ExportScope = "all" | "journal" | "actions";
export type ExportFormat = "json" | "csv";

export interface ExportResult {
  saved: boolean;
  path: string | null;
  row_count: number;
}

export function exportActivity(opts: {
  date?: string;
  scope: ExportScope;
  format: ExportFormat;
}) {
  return invokeCmd<ExportResult>("export_activity", {
    date: opts.date ?? null,
    scope: opts.scope,
    format: opts.format,
  });
}

export function getTimeline(date?: string) {
  return invokeCmd<{ segments: TimelineSegment[] }>("get_timeline", { date: date ?? null });
}

export function getTimelineFull(date?: string) {
  return invokeCmd<{ items: FullTimelineItem[] }>("get_timeline_full", { date: date ?? null });
}

export function getIdleAnalysis(date?: string) {
  return invokeCmd<IdleAnalysis>("get_idle_analysis", { date: date ?? null });
}

export function getActionHourly(date?: string) {
  return invokeCmd<{ hourly: ActionHourlyPoint[] }>("get_action_hourly", { date: date ?? null });
}

export function getApplications(date?: string) {
  return invokeCmd<{ applications: ApplicationUsage[] }>("get_applications", {
    date: date ?? null,
  });
}

export function getHourlyActivity(date?: string) {
  return invokeCmd<{ hourly: HourlyActivity[] }>("get_hourly_activity", { date: date ?? null });
}

export function getProductivityAnalysis(date?: string) {
  return invokeCmd<ProductivityAnalysis>("get_productivity_analysis", { date: date ?? null });
}

export function getWeeklyReport(endDate?: string) {
  return invokeCmd<WeeklyReport>("get_weekly_report", { date: endDate ?? null });
}

export function getPermissionsStatus() {
  return invokeCmd<PermissionStatus>("get_permissions_status");
}

export function requestPermissions() {
  return invokeCmd<PermissionStatus>("request_permissions");
}

export function refreshPermissions() {
  return invokeCmd<PermissionStatus>("refresh_permissions");
}

export function openPermissionSettings(id: string) {
  return invokeCmd<void>("open_permission_settings", { id });
}

export function getSystemSnapshot() {
  return invokeCmd<SystemSnapshot>("get_system_snapshot");
}

export function killPortProcess(pid: number) {
  return invokeCmd<void>("kill_port_process", { pid });
}

export interface AppSettings {
  autostart_enabled: boolean;
  retention_days: number;
  last_archive_at: string | null;
  enable_accessibility: boolean;
  enable_input_monitoring: boolean;
  store_clipboard_preview: boolean;
  store_screenshot_preview: boolean;
  locale: string;
  theme: string;
  performance_mode: boolean;
  setup_completed: boolean;
  first_run_completed: boolean;
  llm_provider: string;
  llm_model: string;
  ollama_base_url: string;
  api_base_url: string;
  devpulse_root_dir: string;
  devpulse_cron_enabled: boolean;
  devpulse_cron_expr: string;
  devpulse_feeds: string[];
  devpulse_topic_filters: string[];
  devpulse_batch_size: number;
  devpulse_collect_limit: number;
  devpulse_idle_poll_sec: number;
  devpulse_backlog_pause_sec: number;
  devpulse_bundle_size: number;
  devpulse_sns_mode: string;
  devpulse_mastodon_instance: string;
}

export interface ArchiveInfo {
  period: string;
  filename: string;
  compressed_bytes: number;
  event_count: number;
}

export interface DbStats {
  active_db_bytes: number;
  active_db_mb: number;
  event_count: number;
  oldest_event: string | null;
  retention_days: number;
  archives: ArchiveInfo[];
  total_archive_bytes: number;
  total_archive_mb: number;
  last_archive_at: string | null;
}

export interface ArchiveResult {
  archived_months: string[];
  deleted_events: number;
  freed_bytes_estimate: number;
  active_db_bytes_after: number;
}

export function getSettings() {
  return invokeCmd<AppSettings>("get_settings");
}

export function updateSettings(opts: {
  autostartEnabled?: boolean;
  retentionDays?: number;
  enableAccessibility?: boolean;
  enableInputMonitoring?: boolean;
  storeClipboardPreview?: boolean;
  storeScreenshotPreview?: boolean;
  locale?: string;
  theme?: string;
  performanceMode?: boolean;
}) {
  return invokeCmd<AppSettings>("update_settings", {
    autostartEnabled: opts.autostartEnabled ?? null,
    retentionDays: opts.retentionDays ?? null,
    enableAccessibility: opts.enableAccessibility ?? null,
    enableInputMonitoring: opts.enableInputMonitoring ?? null,
    storeClipboardPreview: opts.storeClipboardPreview ?? null,
    storeScreenshotPreview: opts.storeScreenshotPreview ?? null,
    locale: opts.locale ?? null,
    theme: opts.theme ?? null,
    performanceMode: opts.performanceMode ?? null,
  });
}

export interface SetupResult {
  settings: AppSettings;
  permissions: PermissionStatus;
}

export function completeSetup(opts: {
  autostartEnabled: boolean;
  enableAccessibility: boolean;
  enableInputMonitoring: boolean;
  locale?: string;
}) {
  return invokeCmd<SetupResult>("complete_setup", {
    autostartEnabled: opts.autostartEnabled,
    enableAccessibility: opts.enableAccessibility,
    enableInputMonitoring: opts.enableInputMonitoring,
    locale: opts.locale ?? null,
  });
}

export function getDbStats() {
  return invokeCmd<DbStats>("get_db_stats");
}

export function runArchiveNow() {
  return invokeCmd<ArchiveResult>("run_archive_now");
}

export interface DevPulseConfigView {
  root_dir: string;
  root_ready: boolean;
  root_exists: boolean;
  setup_hint: string;
  cron_enabled: boolean;
  cron_expr: string;
  feeds: string[];
  topic_filters: string[];
  batch_size: number;
  collect_limit: number;
  idle_poll_sec: number;
  backlog_pause_sec: number;
  bundle_size: number;
  sns_mode: string;
  mastodon_instance: string;
  has_mastodon_token: boolean;
}

export interface DevPulseSecretsStatusView {
  has_mastodon_token: boolean;
}

export interface DevPulseRuntimeView {
  daemon_running: boolean;
  daemon_pid: number | null;
  run_in_flight: boolean;
  last_run_at: string | null;
  last_error: string | null;
}

export interface DevPulseDependencyView {
  key: string;
  label: string;
  target: string;
  ready: boolean;
  detail: string;
}

export interface DevPulseInfraServiceView {
  name: string;
  running: boolean;
}

export interface DevPulseInfraStatusView {
  docker_available: boolean;
  docker_daemon_ready: boolean;
  compose_dir: string;
  services: DevPulseInfraServiceView[];
  detail: string;
}

export interface DevPulseCardArtifact {
  post_id: string;
  title: string;
  url: string;
  size_kb: number;
  created_at: string;
  kind: string;
}

export interface DevPulseBundleArtifact {
  bundle_id: string;
  post_ids: string[];
  post_count: number;
  platform: string;
  published_at: string;
  created_at: string;
  caption: string;
  caption_url: string | null;
  json_url: string | null;
  video_url: string | null;
  card_count: number;
  size_kb: number;
  duplicate_count?: number;
  duplicate_bundle_ids?: string[];
}

export interface DevPulseDbBundle {
  id: string;
  post_ids: string[];
  video_key: string | null;
  created_at: string;
}

export interface DevPulseSnsDailyCount {
  day: string;
  kind: string;
  count: number;
}

export interface DevPulseSnsPostRecord {
  bundle_id: string;
  kind: string;
  ig_media_id?: string | null;
  posted_at?: string | null;
  error?: string | null;
  content_key?: string | null;
}

export interface DevPulseStatusView {
  config: DevPulseConfigView;
  runtime: DevPulseRuntimeView;
  dependencies: DevPulseDependencyView[];
  payload: {
    progress?: {
      daemon_status?: string;
      run_number?: number;
      phase?: string;
      step?: string;
      current_post_id?: string | null;
      current_title?: string | null;
      collected_this_run?: number;
      queue_size?: number;
      processed_this_run?: number;
      failed_this_run?: number;
      total_published?: number;
      total_collected?: number;
      total_failed?: number;
      updated_at?: string;
      recent_logs?: string[];
    };
    db?: {
      counts?: Record<string, number | string>;
      bundle_pending?: string;
      bundle_total?: number;
      recent_bundles?: DevPulseDbBundle[];
    };
    bundle?: {
      current?: number;
      target?: number;
      percent?: number;
      ready?: boolean;
      cards?: Array<Record<string, unknown>>;
      slots?: Array<{
        index: number;
        filled: boolean;
        post_id: string;
        title: string;
        url: string | null;
      }>;
    };
    artifacts?: {
      counts?: {
        cards?: number;
        bundles?: number;
        bundles_raw?: number;
      };
      cards?: DevPulseCardArtifact[];
      bundles?: DevPulseBundleArtifact[];
    };
    logs?: {
      tail?: string[];
      log_file?: string;
    };
    sns?: {
      configured?: boolean;
      state_db?: string;
      timezone?: string;
      post_times?: string[];
      reels_per_day?: number;
      stats?: {
        total?: number;
        posted?: number;
        failed?: number;
      };
      daily_counts?: DevPulseSnsDailyCount[];
      recent_posts?: DevPulseSnsPostRecord[];
      error?: string;
    };
    generated_at?: string;
  };
}

export function getDevPulseConfig() {
  return invokeCmd<DevPulseConfigView>("get_devpulse_config");
}

export function updateDevPulseSettings(opts: {
  rootDir?: string;
  cronEnabled?: boolean;
  cronExpr?: string;
  feeds?: string[];
  topicFilters?: string[];
  batchSize?: number;
  collectLimit?: number;
  idlePollSec?: number;
  backlogPauseSec?: number;
  bundleSize?: number;
  snsMode?: string;
  mastodonInstance?: string;
}) {
  return invokeCmd<DevPulseConfigView>("update_devpulse_settings", {
    rootDir: opts.rootDir ?? null,
    cronEnabled: opts.cronEnabled ?? null,
    cronExpr: opts.cronExpr ?? null,
    feeds: opts.feeds ?? null,
    topicFilters: opts.topicFilters ?? null,
    batchSize: opts.batchSize ?? null,
    collectLimit: opts.collectLimit ?? null,
    idlePollSec: opts.idlePollSec ?? null,
    backlogPauseSec: opts.backlogPauseSec ?? null,
    bundleSize: opts.bundleSize ?? null,
    snsMode: opts.snsMode ?? null,
    mastodonInstance: opts.mastodonInstance ?? null,
  });
}

export function getDevPulseSecretsStatus() {
  return invokeCmd<DevPulseSecretsStatusView>("get_devpulse_secrets_status");
}

export function updateDevPulseSecrets(opts: { mastodonAccessToken?: string | null }) {
  return invokeCmd<DevPulseSecretsStatusView>("update_devpulse_secrets", {
    mastodonAccessToken: opts.mastodonAccessToken ?? null,
  });
}

export function pickDevPulseRootDir() {
  return invokeCmd<DevPulseConfigView>("pick_devpulse_root_dir");
}

export function getDevPulseStatus() {
  return invokeCmd<DevPulseStatusView>("get_devpulse_status");
}

export function getDevPulseInfraStatus() {
  return invokeCmd<DevPulseInfraStatusView>("get_devpulse_infra_status");
}

export function startDevPulseInfra() {
  return invokeCmd<DevPulseInfraStatusView>("start_devpulse_infra");
}

export function stopDevPulseInfra() {
  return invokeCmd<DevPulseInfraStatusView>("stop_devpulse_infra");
}

export function runDevPulseNow(mode: "run" | "collect" | "bundle" | "cleanup" = "run") {
  return invokeCmd<Record<string, unknown>>("run_devpulse_now", { mode });
}

export function startDevPulseDaemon() {
  return invokeCmd<DevPulseRuntimeView>("start_devpulse_daemon");
}

export function stopDevPulseDaemon() {
  return invokeCmd<DevPulseRuntimeView>("stop_devpulse_daemon");
}

export function toAssetUrl(path: string | null | undefined) {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("asset:")) {
    return path;
  }
  return convertFileSrc(path);
}

export interface AvailableDate {
  date: string;
  event_count: number;
}

export function getAvailableDates() {
  return invokeCmd<AvailableDate[]>("get_available_dates");
}

export function formatMemoryGb(mb: number, wholeIfNear = false): string {
  const gb = mb / 1024;
  if (gb >= 1) {
    if (wholeIfNear && Math.abs(gb - Math.round(gb)) < 0.05) {
      return `${Math.round(gb)}GB`;
    }
    return `${gb.toFixed(2)}GB`;
  }
  return `${Math.round(mb)}MB`;
}

export function formatMemoryUsage(usedMb: number, totalMb: number): string {
  return `${formatMemoryGb(usedMb)} / ${formatMemoryGb(totalMb, true)}`;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function formatSeconds(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function eventTypeLabel(type: string, t?: (key: string) => string): string {
  if (t) {
    const translated = t(`events.${type}`);
    if (translated !== `events.${type}`) return translated;
  }
  const labels: Record<string, string> = {
    SYSTEM_START: "시스템 시작",
    SYSTEM_SHUTDOWN: "시스템 종료",
    WINDOW_FOCUS: "앱 전환",
    COPY: "복사",
    PASTE: "붙여넣기",
    SCREENSHOT: "스크린샷",
    IDLE_START: "유휴 시작",
    IDLE_END: "유휴 종료",
  };
  return labels[type] ?? type;
}

export function subscribeActivityEvents(
  handler: (item: ActivityItem) => void,
): Promise<UnlistenFn> {
  return listen<ActivityItem>(ACTIVITY_EVENT, (event) => handler(event.payload));
}

export function subscribeMenuEvents(handlers: {
  onNavigate?: (page: string) => void;
  onRefresh?: () => void;
  onGoToday?: () => void;
  onExportDone?: (result: ExportResult) => void;
  onError?: (message: string) => void;
  onCheckUpdate?: () => void;
}): Promise<UnlistenFn> {
  const unsubs: UnlistenFn[] = [];

  return Promise.all([
    handlers.onNavigate
      ? listen<string>(MENU_NAVIGATE, (e) => handlers.onNavigate!(e.payload))
      : Promise.resolve(() => {}),
    handlers.onRefresh
      ? listen(MENU_REFRESH, () => handlers.onRefresh!())
      : Promise.resolve(() => {}),
    handlers.onGoToday
      ? listen(MENU_GO_TODAY, () => handlers.onGoToday!())
      : Promise.resolve(() => {}),
    handlers.onExportDone
      ? listen<ExportResult>(MENU_EXPORT_DONE, (e) => handlers.onExportDone!(e.payload))
      : Promise.resolve(() => {}),
    handlers.onError
      ? listen<string>(MENU_ERROR, (e) => handlers.onError!(e.payload))
      : Promise.resolve(() => {}),
    handlers.onCheckUpdate
      ? listen(MENU_CHECK_UPDATE, () => handlers.onCheckUpdate!())
      : Promise.resolve(() => {}),
  ]).then((fns) => {
    unsubs.push(...fns);
    return () => {
      for (const fn of unsubs) fn();
    };
  });
}

export function clipboardCopyText(metadata?: Record<string, unknown>): string | null {
  if (!metadata || typeof metadata.clipboard_preview !== "string") return null;
  const text = metadata.clipboard_preview;
  return text.length > 0 ? text : null;
}

export function clipboardPreviewText(
  metadata?: Record<string, unknown>,
  imageLabel = "(클립보드 이미지)",
): string | null {
  if (!metadata) return null;
  if (typeof metadata.clipboard_preview === "string") {
    const text = metadata.clipboard_preview;
    return metadata.clipboard_truncated ? `${text}…` : text;
  }
  if (metadata.content_type === "image") return imageLabel;
  return null;
}

export function clipboardContentSummary(
  metadata: Record<string, unknown> | undefined,
  t: (key: string, params?: Record<string, string | number>) => string,
): string | null {
  const preview = clipboardPreviewText(metadata, t("actions.clipboardImage"));
  if (preview) return preview;

  if (!metadata) return null;
  const length = metadata.clipboard_length;
  if (metadata.content_type === "text" && typeof length === "number" && length > 0) {
    return t("actions.textLengthOnly", { count: length });
  }
  if (metadata.content_type === "image") {
    return t("actions.clipboardImage");
  }
  if (metadata.content_type === "empty") {
    return t("actions.clipboardEmpty");
  }
  return null;
}

export function screenshotThumbnailSrc(
  metadata?: Record<string, unknown>,
): string | null {
  if (!metadata || typeof metadata.thumbnail_path !== "string") return null;
  try {
    return convertFileSrc(metadata.thumbnail_path);
  } catch {
    return null;
  }
}

export function upsertActivityEvent(
  prev: ActivityItem[],
  item: ActivityItem,
): { events: ActivityItem[]; isNew: boolean } {
  if (item.id != null) {
    const idx = prev.findIndex((ev) => ev.id === item.id);
    if (idx >= 0) {
      const next = [...prev];
      next[idx] = item;
      return { events: next, isNew: false };
    }
  }

  const key = item.id ?? `${item.type}-${item.time}`;
  if (prev.some((ev) => (ev.id ?? `${ev.type}-${ev.time}`) === key)) {
    return { events: prev, isNew: false };
  }

  return { events: [item, ...prev].slice(0, 20), isNew: true };
}
