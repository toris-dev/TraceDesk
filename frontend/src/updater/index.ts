import { check, type DownloadEvent } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "installing"
  | "up-to-date"
  | "error";

export interface UpdateProgress {
  downloaded: number;
  total?: number;
}

export interface UpdateCheckResult {
  phase: UpdatePhase;
  version?: string;
  notes?: string;
  date?: string;
  progress?: UpdateProgress;
  error?: string;
}

function formatUpdaterError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function checkForAppUpdate(): Promise<UpdateCheckResult> {
  try {
    const update = await check();
    if (!update) {
      return { phase: "up-to-date" };
    }
    return {
      phase: "available",
      version: update.version,
      notes: update.body ?? undefined,
      date: update.date ?? undefined,
    };
  } catch (error) {
    return { phase: "error", error: formatUpdaterError(error) };
  }
}

export async function downloadAndInstallUpdate(
  onProgress?: (progress: UpdateProgress) => void,
): Promise<UpdateCheckResult> {
  try {
    const update = await check();
    if (!update) {
      return { phase: "up-to-date" };
    }

    let downloaded = 0;
    let total: number | undefined;

    await update.downloadAndInstall((event: DownloadEvent) => {
      switch (event.event) {
        case "Started":
          total = event.data.contentLength ?? undefined;
          downloaded = 0;
          onProgress?.({ downloaded, total });
          break;
        case "Progress":
          downloaded += event.data.chunkLength;
          onProgress?.({ downloaded, total });
          break;
        case "Finished":
          onProgress?.({ downloaded, total });
          break;
      }
    });

    await relaunch();
    return { phase: "installing", version: update.version };
  } catch (error) {
    return { phase: "error", error: formatUpdaterError(error) };
  }
}
