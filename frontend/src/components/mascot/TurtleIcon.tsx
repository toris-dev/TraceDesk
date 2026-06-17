import { mascotIconSrc } from "./mascotTypes";

const SIZE_MAP = {
  xs: "w-6 h-6 rounded-lg",
  sm: "w-8 h-8 rounded-xl",
  md: "w-10 h-10 rounded-xl",
  lg: "w-12 h-12 rounded-2xl",
  xl: "w-16 h-16 rounded-2xl",
} as const;

interface Props {
  size?: keyof typeof SIZE_MAP;
  className?: string;
  alt?: string;
}

/** Rounded squircle TraceDesk turtle app icon. */
export function TurtleIcon({ size = "md", className = "", alt = "TraceDesk" }: Props) {
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio : 1;
  return (
    <img
      src={mascotIconSrc(dpr)}
      alt={alt}
      className={`${SIZE_MAP[size]} object-cover shadow-sm shadow-cyan-500/10 border border-cyan-500/20 ${className}`}
      draggable={false}
    />
  );
}
