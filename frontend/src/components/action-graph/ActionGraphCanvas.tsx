import { useCallback, useEffect, useRef, useState } from "react";
import type { ActionGraph, ActionGraphLink, ActionGraphNode } from "../../utils/actionGraph";

interface Props {
  graph: ActionGraph;
  matchedNodeIds: Set<string>;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  width: number;
  height: number;
}

const KIND_ALPHA: Record<string, number> = {
  app: 1,
  content: 0.92,
  url: 0.85,
  event: 0.78,
};

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 3;

function linkEndpoints(
  link: ActionGraphLink,
  nodeById: Map<string, ActionGraphNode>,
): [ActionGraphNode, ActionGraphNode] | null {
  const a = nodeById.get(link.source);
  const b = nodeById.get(link.target);
  if (!a || !b) return null;
  return [a, b];
}

function runSimulation(
  nodes: ActionGraphNode[],
  links: ActionGraphLink[],
  width: number,
  height: number,
  alpha: number,
) {
  const cx = width / 2;
  const cy = height / 2;
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  for (const node of nodes) {
    node.vx += (cx - node.x) * 0.002 * alpha;
    node.vy += (cy - node.y) * 0.002 * alpha;
  }

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const minDist = (a.size + b.size) * 8;
      if (dist < minDist) dist = minDist;
      const force = (420 * alpha) / dist;
      dx = (dx / dist) * force;
      dy = (dy / dist) * force;
      a.vx += dx;
      a.vy += dy;
      b.vx -= dx;
      b.vy -= dy;
    }
  }

  for (const link of links) {
    const pair = linkEndpoints(link, nodeById);
    if (!pair) continue;
    const [a, b] = pair;
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const strength = link.kind === "flow" ? 0.08 : link.kind === "in_app" ? 0.04 : 0.05;
    const force = dist * strength * alpha;
    dx = (dx / dist) * force;
    dy = (dy / dist) * force;
    a.vx += dx;
    a.vy += dy;
    b.vx -= dx;
    b.vy -= dy;
  }

  for (const node of nodes) {
    node.vx *= 0.86;
    node.vy *= 0.86;
    node.x += node.vx;
    node.y += node.vy;
    node.x = Math.max(24, Math.min(width - 24, node.x));
    node.y = Math.max(24, Math.min(height - 24, node.y));
  }
}

export function ActionGraphCanvas({
  graph,
  matchedNodeIds,
  selectedNodeId,
  onSelectNode,
  width,
  height,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({
    nodes: [] as ActionGraphNode[],
    links: [] as ActionGraphLink[],
    zoom: 1,
    panX: 0,
    panY: 0,
    simAlpha: 1,
    draggingNode: null as ActionGraphNode | null,
    panning: false,
    lastX: 0,
    lastY: 0,
  });
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [zoomLabel, setZoomLabel] = useState(100);

  useEffect(() => {
    stateRef.current.nodes = graph.nodes.map((n) => ({ ...n }));
    stateRef.current.links = graph.links;
    stateRef.current.zoom = 1;
    stateRef.current.panX = 0;
    stateRef.current.panY = 0;
    stateRef.current.simAlpha = 1;
    setZoomLabel(100);
  }, [graph]);

  const screenToWorld = useCallback(
    (sx: number, sy: number) => {
      const s = stateRef.current;
      return {
        x: (sx - width / 2 - s.panX) / s.zoom + width / 2,
        y: (sy - height / 2 - s.panY) / s.zoom + height / 2,
      };
    },
    [width, height],
  );

  const pickNode = useCallback(
    (sx: number, sy: number): ActionGraphNode | null => {
      const { x, y } = screenToWorld(sx, sy);
      const nodes = stateRef.current.nodes;
      let best: ActionGraphNode | null = null;
      let bestDist = Infinity;
      for (const node of nodes) {
        const r = node.size * 2.2;
        const d = (node.x - x) ** 2 + (node.y - y) ** 2;
        if (d < r * r && d < bestDist) {
          bestDist = d;
          best = node;
        }
      }
      return best;
    },
    [screenToWorld],
  );

  const setZoomAt = useCallback(
    (nextZoom: number, sx = width / 2, sy = height / 2) => {
      const s = stateRef.current;
      const before = {
        x: (sx - width / 2 - s.panX) / s.zoom + width / 2,
        y: (sy - height / 2 - s.panY) / s.zoom + height / 2,
      };
      s.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
      s.panX = sx - width / 2 - (before.x - width / 2) * s.zoom;
      s.panY = sy - height / 2 - (before.y - height / 2) * s.zoom;
      s.simAlpha = Math.min(1, s.simAlpha + 0.12);
      setZoomLabel(Math.round(s.zoom * 100));
    },
    [width, height],
  );

  const resetView = useCallback(() => {
    const s = stateRef.current;
    s.zoom = 1;
    s.panX = 0;
    s.panY = 0;
    s.simAlpha = 0.8;
    setZoomLabel(100);
  }, []);

  const panBy = useCallback((dx: number, dy: number) => {
    const s = stateRef.current;
    s.panX += dx;
    s.panY += dy;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width < 10 || height < 10) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame = 0;

    const draw = () => {
      const s = stateRef.current;
      if (s.simAlpha > 0.02) {
        runSimulation(s.nodes, s.links, width, height, s.simAlpha);
        s.simAlpha *= 0.992;
      }

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "rgb(5 8 13 / 0.35)";
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      ctx.translate(width / 2 + s.panX, height / 2 + s.panY);
      ctx.scale(s.zoom, s.zoom);
      ctx.translate(-width / 2, -height / 2);

      const hasFilter = matchedNodeIds.size > 0;
      const nodeById = new Map(s.nodes.map((n) => [n.id, n]));
      const activeIds = new Set<string>();
      const focusId = selectedNodeId ?? hoverId;
      if (focusId) {
        activeIds.add(focusId);
        for (const link of s.links) {
          if (link.source === focusId) activeIds.add(link.target);
          if (link.target === focusId) activeIds.add(link.source);
        }
      }

      for (const link of s.links) {
        const pair = linkEndpoints(link, nodeById);
        if (!pair) continue;
        const [a, b] = pair;
        const highlighted =
          hasFilter && matchedNodeIds.has(a.id) && matchedNodeIds.has(b.id);
        const focused = activeIds.size > 0 && activeIds.has(a.id) && activeIds.has(b.id);
        const dim = (hasFilter && !highlighted) || (activeIds.size > 0 && !focused);

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.setLineDash(link.kind === "flow" ? [4, 4] : []);
        ctx.strokeStyle = dim
          ? "rgb(0 229 255 / 0.06)"
          : link.kind === "flow"
            ? "rgb(0 255 136 / 0.45)"
            : "rgb(0 229 255 / 0.22)";
        ctx.lineWidth = focused ? 1.8 : 1;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      for (const node of s.nodes) {
        const inSearch = !hasFilter || matchedNodeIds.has(node.id);
        const inFocus = activeIds.size === 0 || activeIds.has(node.id);
        const dim = !inSearch || !inFocus;
        const alphaNode = dim ? 0.18 : (KIND_ALPHA[node.kind] ?? 0.8);
        const r = node.size * (node.id === selectedNodeId ? 2.6 : 2.2);

        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = node.color;
        ctx.globalAlpha = alphaNode;
        ctx.fill();
        ctx.globalAlpha = 1;
        if (!dim) {
          ctx.shadowColor = node.color;
          ctx.shadowBlur = node.id === selectedNodeId ? 14 : 6;
          ctx.strokeStyle = node.id === selectedNodeId ? "#fff" : node.color;
          ctx.lineWidth = node.id === selectedNodeId ? 2 : 0.5;
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      }

      for (const node of s.nodes) {
        if (node.kind === "app" || node.kind === "content") {
          const show =
            (!hasFilter || matchedNodeIds.has(node.id)) &&
            (activeIds.size === 0 || activeIds.has(node.id));
          if (!show) continue;
          ctx.font = `${node.kind === "app" ? 11 : 10}px "JetBrains Mono", monospace`;
          ctx.fillStyle = "rgb(224 247 250 / 0.85)";
          ctx.textAlign = "center";
          ctx.fillText(node.label, node.x, node.y - node.size * 2.8);
        }
      }

      ctx.restore();
      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [graph, width, height, matchedNodeIds, selectedNodeId, hoverId]);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const s = stateRef.current;
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const factor = Math.exp(-e.deltaY * 0.0012);
    setZoomAt(s.zoom * factor, sx, sy);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const node = pickNode(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    const s = stateRef.current;
    s.lastX = e.clientX;
    s.lastY = e.clientY;
    if (node) {
      s.draggingNode = node;
      onSelectNode(node.id);
    } else {
      s.panning = true;
      onSelectNode(null);
    }
    (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const s = stateRef.current;
    const dx = e.clientX - s.lastX;
    const dy = e.clientY - s.lastY;
    s.lastX = e.clientX;
    s.lastY = e.clientY;

    if (s.draggingNode) {
      s.draggingNode.x += dx / s.zoom;
      s.draggingNode.y += dy / s.zoom;
      s.draggingNode.vx = 0;
      s.draggingNode.vy = 0;
      s.simAlpha = 0.5;
    } else if (s.panning) {
      s.panX += dx;
      s.panY += dy;
    } else {
      const node = pickNode(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
      setHoverId(node?.id ?? null);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    stateRef.current.draggingNode = null;
    stateRef.current.panning = false;
    if ((e.currentTarget as HTMLCanvasElement).hasPointerCapture(e.pointerId)) {
      (e.currentTarget as HTMLCanvasElement).releasePointerCapture(e.pointerId);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    const key = e.key.toLowerCase();
    if (key === "+" || key === "=") {
      e.preventDefault();
      setZoomAt(stateRef.current.zoom * 1.15);
      return;
    }
    if (key === "-" || key === "_") {
      e.preventDefault();
      setZoomAt(stateRef.current.zoom / 1.15);
      return;
    }
    if (key === "0" || key === "home") {
      e.preventDefault();
      resetView();
      return;
    }

    const step = e.shiftKey ? 56 : 28;
    if (key === "arrowleft") {
      e.preventDefault();
      panBy(step, 0);
    } else if (key === "arrowright") {
      e.preventDefault();
      panBy(-step, 0);
    } else if (key === "arrowup") {
      e.preventDefault();
      panBy(0, step);
    } else if (key === "arrowdown") {
      e.preventDefault();
      panBy(0, -step);
    }
  };

  return (
    <div className="graph-canvas-shell">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        tabIndex={0}
        role="img"
        aria-label="Copy, paste, and screenshot activity graph. Use plus or minus to zoom, arrow keys to pan, and zero to reset."
        className="graph-canvas-surface cursor-grab active:cursor-grabbing"
        style={{ touchAction: "none", overscrollBehavior: "contain" }}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setHoverId(null)}
      />
      <div className="graph-zoom-hud" aria-label="Graph zoom controls">
        <div className="graph-zoom-hud-label">ZOOM</div>
        <button
          type="button"
          onClick={() => setZoomAt(stateRef.current.zoom / 1.2)}
          className="graph-zoom-button"
          aria-label="Zoom out"
          title="Zoom out"
        >
          -
        </button>
        <button
          type="button"
          onClick={resetView}
          className="graph-zoom-readout"
          aria-label={`Reset graph view, current zoom ${zoomLabel}%`}
          title="Reset view"
        >
          {zoomLabel}%
        </button>
        <button
          type="button"
          onClick={() => setZoomAt(stateRef.current.zoom * 1.2)}
          className="graph-zoom-button"
          aria-label="Zoom in"
          title="Zoom in"
        >
          +
        </button>
      </div>
      <div className="graph-canvas-hint">
        <span>DRAG</span>
        <span>WHEEL ZOOM</span>
        <span>+ / - / 0</span>
        <span>CLICK NODE</span>
      </div>
    </div>
  );
}
