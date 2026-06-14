import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { MascotMood } from "./mascotTypes";
import { MASCOT_SRC, mascotSrcForMood, pickMessage } from "./mascotTypes";

interface Props {
  mood?: MascotMood;
  message?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  showBubble?: boolean;
  interactive?: boolean;
  className?: string;
}

const SIZE_MAP = {
  xs: "w-8 h-8",
  sm: "w-12 h-12",
  md: "w-20 h-20",
  lg: "w-28 h-28",
  xl: "w-36 h-36",
};

const MOOD_ANIM: Record<MascotMood, string> = {
  idle: "mascot-float",
  loading: "mascot-bounce",
  happy: "mascot-wiggle",
  thinking: "mascot-sway",
  confused: "mascot-shake",
  celebrate: "mascot-celebrate",
  sleeping: "mascot-sleep",
  typing: "mascot-type",
};

export function TortoiseMascot({
  mood = "idle",
  message,
  size = "md",
  showBubble = false,
  interactive = false,
  className = "",
}: Props) {
  const [bubble, setBubble] = useState(message ?? "");
  const [peek, setPeek] = useState(false);

  useEffect(() => {
    setBubble(message ?? (showBubble ? pickMessage(mood) : ""));
  }, [message, mood, showBubble]);

  const handleClick = useCallback(() => {
    if (!interactive) return;
    setPeek(true);
    setBubble(pickMessage(mood));
    window.setTimeout(() => setPeek(false), 600);
  }, [interactive, mood]);

  const isError = mood === "confused";
  const src = mascotSrcForMood(mood);

  return (
    <div
      className={`relative inline-flex flex-col items-center ${className}`}
      onClick={handleClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") handleClick();
            }
          : undefined
      }
    >
      {showBubble && bubble && (
        <div
          className={`absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full z-10 max-w-[200px] px-3 py-1.5 rounded-xl text-xs text-text bg-surface-elevated border border-border shadow-lg whitespace-nowrap mascot-bubble-in ${
            peek ? "scale-105" : ""
          }`}
        >
          {bubble}
          <span className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-2.5 h-2.5 bg-surface-elevated border-r border-b border-border rotate-45" />
        </div>
      )}

      <div
        className={`relative ${SIZE_MAP[size]} ${MOOD_ANIM[mood]} ${
          interactive ? "cursor-pointer hover:scale-105 transition-transform" : ""
        }`}
      >
        <img
          src={src}
          alt={isError ? "TraceDesk 오류" : "TraceDesk 거북이"}
          className={`w-full h-full object-contain ${
            isError
              ? "drop-shadow-[0_0_16px_rgba(239,68,68,0.35)]"
              : "drop-shadow-[0_0_12px_rgba(34,197,94,0.25)]"
          }`}
          draggable={false}
        />

        {/* mood별 글로우 — 에러 에셋은 이미지 자체 효과 사용 */}
        {!isError && (
          <span
            className={`absolute inset-0 rounded-full pointer-events-none mascot-glow mascot-glow-${mood}`}
            aria-hidden
          />
        )}

        {mood === "loading" && (
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1 h-1 rounded-full bg-accent mascot-dot"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </span>
        )}

        {mood === "sleeping" && (
          <span className="absolute -top-1 -right-1 text-sm mascot-z">💤</span>
        )}

        {mood === "celebrate" && (
          <span className="absolute -top-2 -right-2 text-base mascot-sparkle">✨</span>
        )}
      </div>
    </div>
  );
}

interface SceneProps {
  mood?: MascotMood;
  title: string;
  description?: string;
  size?: "md" | "lg" | "xl";
  action?: ReactNode;
}

export function MascotScene({
  mood = "idle",
  title,
  description,
  size = "lg",
  action,
}: SceneProps) {
  const isError = mood === "confused";
  return (
    <div
      className={`flex flex-col items-center justify-center text-center py-12 px-6 gap-4 ${
        isError ? "rounded-xl" : ""
      }`}
    >
      <TortoiseMascot mood={mood} size={isError ? "xl" : size} showBubble={!isError} interactive />
      <div>
        <p className={`font-semibold ${isError ? "text-danger-text" : "text-text"}`}>{title}</p>
        {description && (
          <p className={`text-sm mt-1 max-w-sm ${isError ? "text-danger-text/80" : "text-text-muted"}`}>
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

interface CompanionProps {
  mood: MascotMood;
  message?: string;
}

export function MascotCompanion({ mood, message }: CompanionProps) {
  const [open, setOpen] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) {
    return (
      <button
        type="button"
        onClick={() => {
          setDismissed(false);
          setOpen(true);
        }}
        className="fixed bottom-5 right-5 z-40 w-12 h-12 rounded-full border border-border bg-surface-elevated shadow-lg hover:scale-110 transition-transform overflow-hidden mascot-float"
        aria-label="거북이 도우미 열기"
      >
        <img src={MASCOT_SRC} alt="" className="w-full h-full object-contain p-1" />
      </button>
    );
  }

  return (
    <div
      className={`fixed bottom-5 right-5 z-40 transition-all duration-300 ${
        open ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0 pointer-events-none"
      }`}
    >
      <div className="rounded-2xl border border-border bg-surface-elevated/95 backdrop-blur shadow-xl p-3 max-w-[220px]">
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className="text-[10px] uppercase tracking-wider text-accent font-semibold">
            Trace
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-text-muted hover:text-text text-xs px-1"
              aria-label="접기"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="text-text-muted hover:text-text text-xs px-1"
              aria-label="닫기"
            >
              ×
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <TortoiseMascot mood={mood} size="sm" interactive showBubble={mood !== "confused"} />
          <p className="text-xs text-text-muted leading-relaxed">
            {message ?? pickMessage(mood)}
          </p>
        </div>
      </div>
    </div>
  );
}
