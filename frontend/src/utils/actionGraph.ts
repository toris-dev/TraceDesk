import type { ActivityItem } from "../api/client";
import { clipboardCopyText } from "../api/client";
import { CYBER } from "../theme/cyberTokens";
import type { ActionFilter } from "./actionAnalytics";

const URL_RE = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

export type ActionNodeKind = "event" | "app" | "content" | "url";

export interface ActionRecord {
  id: number;
  type: "COPY" | "PASTE" | "SCREENSHOT";
  time: string;
  app: string | null;
  window: string | null;
  content: string | null;
  contentHash: string | null;
  urls: string[];
  /** Keyword / future RAG embedding source */
  searchBlob: string;
  raw: ActivityItem;
}

export interface ActionGraphNode {
  id: string;
  kind: ActionNodeKind;
  label: string;
  color: string;
  size: number;
  eventId?: number;
  eventType?: string;
  record?: ActionRecord;
  searchText: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface ActionGraphLink {
  source: string;
  target: string;
  kind: "in_app" | "has_content" | "flow" | "mentions";
}

export interface ActionGraph {
  nodes: ActionGraphNode[];
  links: ActionGraphLink[];
  records: ActionRecord[];
}

function hashText(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = (h * 33) ^ text.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

function extractUrls(text: string): string[] {
  const found = text.match(URL_RE);
  if (!found) return [];
  return [...new Set(found.map((u) => u.replace(/[.,;:!?)]+$/, "")))];
}

function contentFromEvent(ev: ActivityItem): { text: string | null; hash: string | null } {
  const preview = clipboardCopyText(ev.metadata);
  if (preview) {
    const normalized = preview.trim().replace(/\s+/g, " ");
    return { text: normalized, hash: hashText(normalized.slice(0, 400)) };
  }
  if (ev.metadata?.content_type === "image") {
    return { text: null, hash: "clipboard:image" };
  }
  if (ev.type === "SCREENSHOT") {
    const name =
      typeof ev.metadata?.filename === "string"
        ? ev.metadata.filename
        : typeof ev.metadata?.thumbnail_path === "string"
          ? ev.metadata.thumbnail_path.split("/").pop() ?? "screenshot"
          : "screenshot";
    return { text: name, hash: hashText(`shot:${name}`) };
  }
  const len = ev.metadata?.clipboard_length;
  if (typeof len === "number" && len > 0) {
    return { text: null, hash: `len:${len}` };
  }
  return { text: null, hash: null };
}

function labelContent(text: string): string {
  const line = text.split("\n")[0]?.trim() ?? text;
  if (line.length <= 42) return line;
  return `${line.slice(0, 40)}…`;
}

function eventColor(type: string): string {
  if (type === "COPY") return CYBER.green;
  if (type === "PASTE") return CYBER.amber;
  return CYBER.magenta;
}

export function buildActionRecords(events: ActivityItem[]): ActionRecord[] {
  return events
    .filter((e) => e.id != null && ["COPY", "PASTE", "SCREENSHOT"].includes(e.type))
    .map((ev) => {
      const { text, hash } = contentFromEvent(ev);
      const urls = text ? extractUrls(text) : [];
      const app = ev.name ?? null;
      const window = ev.window_title ?? null;
      const parts = [
        ev.type,
        ev.time,
        app,
        window,
        text,
        ...urls,
        typeof ev.metadata?.filename === "string" ? ev.metadata.filename : null,
      ].filter(Boolean) as string[];

      return {
        id: ev.id!,
        type: ev.type as ActionRecord["type"],
        time: ev.time,
        app,
        window,
        content: text,
        contentHash: hash,
        urls,
        searchBlob: parts.join(" ").toLowerCase(),
        raw: ev,
      };
    });
}

export function buildActionGraph(records: ActionRecord[]): ActionGraph {
  const nodes = new Map<string, ActionGraphNode>();
  const links: ActionGraphLink[] = [];
  const linkKey = new Set<string>();

  const addLink = (source: string, target: string, kind: ActionGraphLink["kind"]) => {
    const key = `${source}|${target}|${kind}`;
    if (linkKey.has(key)) return;
    linkKey.add(key);
    links.push({ source, target, kind });
  };

  const ensureNode = (
    id: string,
    partial: Omit<ActionGraphNode, "x" | "y" | "vx" | "vy">,
  ): ActionGraphNode => {
    const existing = nodes.get(id);
    if (existing) return existing;
    const angle = nodes.size * 0.9;
    const node: ActionGraphNode = {
      ...partial,
      x: Math.cos(angle) * 120,
      y: Math.sin(angle) * 120,
      vx: 0,
      vy: 0,
    };
    nodes.set(id, node);
    return node;
  };

  const lastCopyByHash = new Map<string, string>();

  for (const rec of records) {
    const eventNodeId = `ev:${rec.id}`;
    ensureNode(eventNodeId, {
      id: eventNodeId,
      kind: "event",
      label: rec.time,
      color: eventColor(rec.type),
      size: 5,
      eventId: rec.id,
      eventType: rec.type,
      record: rec,
      searchText: rec.searchBlob,
    });

    const appName = rec.app ?? "Unknown";
    const appId = `app:${hashText(appName)}`;
    ensureNode(appId, {
      id: appId,
      kind: "app",
      label: appName,
      color: CYBER.cyan,
      size: 10,
      searchText: appName.toLowerCase(),
    });
    addLink(eventNodeId, appId, "in_app");

    if (rec.contentHash) {
      const contentId = `content:${rec.contentHash}`;
      const contentLabel =
        rec.content != null
          ? labelContent(rec.content)
          : rec.type === "SCREENSHOT"
            ? "캡처"
            : "클립보드";
      ensureNode(contentId, {
        id: contentId,
        kind: "content",
        label: contentLabel,
        color: rec.type === "SCREENSHOT" ? CYBER.magenta : CYBER.violet,
        size: 8,
        searchText: (rec.content ?? contentLabel).toLowerCase(),
      });
      addLink(eventNodeId, contentId, "has_content");

      if (rec.type === "COPY") {
        lastCopyByHash.set(rec.contentHash, eventNodeId);
      } else if (rec.type === "PASTE") {
        const copyNode = lastCopyByHash.get(rec.contentHash);
        if (copyNode) addLink(copyNode, eventNodeId, "flow");
      }
    }

    for (const url of rec.urls) {
      const urlId = `url:${hashText(url)}`;
      ensureNode(urlId, {
        id: urlId,
        kind: "url",
        label: url.length > 36 ? `${url.slice(0, 34)}…` : url,
        color: CYBER.amber,
        size: 6,
        searchText: url.toLowerCase(),
      });
      addLink(eventNodeId, urlId, "mentions");
      if (rec.contentHash) {
        addLink(`content:${rec.contentHash}`, urlId, "mentions");
      }
    }
  }

  return {
    nodes: [...nodes.values()],
    links,
    records,
  };
}

export interface GraphSearchResult {
  matchedNodeIds: Set<string>;
  highlightLinkKeys: Set<string>;
  rankedRecords: ActionRecord[];
}

export function searchActionGraph(
  graph: ActionGraph,
  query: string,
  typeFilter: ActionFilter,
): GraphSearchResult {
  const terms = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  let records = graph.records;
  if (typeFilter !== "all") {
    records = records.filter((r) => r.type === typeFilter);
  }

  if (terms.length === 0) {
    return {
      matchedNodeIds: new Set(),
      highlightLinkKeys: new Set(),
      rankedRecords: [...records].reverse(),
    };
  }

  const scored: { rec: ActionRecord; score: number }[] = [];
  for (const rec of records) {
    let score = 0;
    for (const term of terms) {
      if (rec.searchBlob.includes(term)) score += 2;
      if (rec.app?.toLowerCase().includes(term)) score += 1;
      if (rec.window?.toLowerCase().includes(term)) score += 1;
      if (rec.content?.toLowerCase().includes(term)) score += 3;
      for (const url of rec.urls) {
        if (url.toLowerCase().includes(term)) score += 2;
      }
    }
    if (score > 0) scored.push({ rec, score });
  }
  scored.sort((a, b) => b.score - a.score || b.rec.time.localeCompare(a.rec.time));

  const matchedNodeIds = new Set<string>();
  const highlightLinkKeys = new Set<string>();

  for (const { rec } of scored) {
    matchedNodeIds.add(`ev:${rec.id}`);
    if (rec.app) matchedNodeIds.add(`app:${hashText(rec.app)}`);
    if (rec.contentHash) matchedNodeIds.add(`content:${rec.contentHash}`);
    for (const url of rec.urls) matchedNodeIds.add(`url:${hashText(url)}`);
  }

  for (const link of graph.links) {
    if (matchedNodeIds.has(link.source) && matchedNodeIds.has(link.target)) {
      highlightLinkKeys.add(`${link.source}|${link.target}|${link.kind}`);
    }
  }

  // Include neighbor nodes one hop for context
  for (const link of graph.links) {
    if (matchedNodeIds.has(link.source)) matchedNodeIds.add(link.target);
    if (matchedNodeIds.has(link.target)) matchedNodeIds.add(link.source);
  }

  return {
    matchedNodeIds,
    highlightLinkKeys,
    rankedRecords: scored.map((s) => s.rec),
  };
}

/** RAG-ready document chunks derived from action records */
export function actionRecordsToRagChunks(records: ActionRecord[]): { id: string; text: string }[] {
  return records.map((r) => ({
    id: `action-${r.id}`,
    text: [
      `[${r.type}] ${r.time}`,
      r.app ? `app: ${r.app}` : null,
      r.window ? `window: ${r.window}` : null,
      r.content ? `content: ${r.content}` : null,
      r.urls.length ? `urls: ${r.urls.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  }));
}
