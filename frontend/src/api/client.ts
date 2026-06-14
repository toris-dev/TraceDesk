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
  return invoke<T>(cmd, args);
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
  weekly: WeeklyReport;
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
  setup_completed: boolean;
  first_run_completed: boolean;
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
