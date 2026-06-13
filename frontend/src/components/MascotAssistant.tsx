import { useMemo } from "react";
import type { MascotMood } from "./mascot";
import { MascotCompanion, pickMessage, scoreToMood } from "./mascot";

interface Props {
  loading: boolean;
  error: string | null;
  connected: boolean;
  hasActivity: boolean;
  productivityScore?: number;
  activeTab: "activity" | "system" | "settings";
  setupCompleted: boolean;
}

export function MascotAssistant({
  loading,
  error,
  connected,
  hasActivity,
  productivityScore,
  activeTab,
  setupCompleted,
}: Props) {
  const { mood, message } = useMemo(() => {
    if (!setupCompleted) {
      return { mood: "typing" as MascotMood, message: "처음 설정을 도와드릴게요!" };
    }
    if (loading) {
      return { mood: "loading" as MascotMood, message: pickMessage("loading") };
    }
    if (error || !connected) {
      return { mood: "confused" as MascotMood, message: "연결 상태를 확인 중이에요..." };
    }
    if (activeTab === "system") {
      return { mood: "thinking" as MascotMood, message: "시스템 상태를 살펴볼게요" };
    }
    if (activeTab === "settings") {
      return { mood: "idle" as MascotMood, message: "설정은 여기서 바꿀 수 있어요" };
    }
    if (!hasActivity) {
      return { mood: "sleeping" as MascotMood, message: pickMessage("sleeping") };
    }
    if (productivityScore != null) {
      const m = scoreToMood(productivityScore);
      return { mood: m, message: pickMessage(m) };
    }
    return { mood: "happy" as MascotMood, message: pickMessage("happy") };
  }, [loading, error, connected, hasActivity, productivityScore, activeTab, setupCompleted]);

  if (!setupCompleted) return null;

  return <MascotCompanion mood={mood} message={message} />;
}
