export type MascotMood =
  | "idle"
  | "loading"
  | "happy"
  | "thinking"
  | "confused"
  | "celebrate"
  | "sleeping"
  | "typing";

export const MASCOT_SRC = `${import.meta.env.BASE_URL}mascot/turtle.png`;
export const MASCOT_ERROR_SRC = `${import.meta.env.BASE_URL}mascot/turtle-error.png`;
/** Rounded squircle app icon — optimized for UI (128/256px). */
export const MASCOT_ICON_SRC = `${import.meta.env.BASE_URL}mascot/turtle-icon-128.png`;
export const MASCOT_ICON_SRC_2X = `${import.meta.env.BASE_URL}mascot/turtle-icon-256.png`;
export const MASCOT_ICON_SVG = `${import.meta.env.BASE_URL}mascot/turtle-icon.svg`;

export function mascotSrcForMood(mood: MascotMood): string {
  return mood === "confused" ? MASCOT_ERROR_SRC : MASCOT_SRC;
}

/** App icon with border-radius — use in logo, favicon, compact slots. */
export function mascotIconSrc(pixelRatio = 1): string {
  return pixelRatio >= 2 ? MASCOT_ICON_SRC_2X : MASCOT_ICON_SRC;
}

export const MOOD_MESSAGES: Record<MascotMood, string[]> = {
  idle: ["오늘도 기록 중이에요!", "천천히, 꾸준히 🐢"],
  loading: ["데이터를 모으는 중...", "거북이도 열심히 달려요"],
  happy: ["좋은 하루네요!", "생산성 UP!"],
  thinking: ["흠... 패턴을 분석 중", "이 데이터, 흥미롭네요"],
  confused: ["어? 연결이 끊겼어요", "다시 시도해 볼게요"],
  celebrate: ["대단해요! 🎉", "오늘의 MVP!"],
  sleeping: ["기록된 활동이 없어요", "쉬는 날인가요?"],
  typing: ["키보드 두드리는 소리...", "집중 모드 ON"],
};

export function pickMessage(mood: MascotMood): string {
  const list = MOOD_MESSAGES[mood];
  return list[Math.floor(Math.random() * list.length)];
}

export function scoreToMood(score: number): MascotMood {
  if (score >= 85) return "celebrate";
  if (score >= 60) return "happy";
  if (score >= 40) return "thinking";
  return "idle";
}
