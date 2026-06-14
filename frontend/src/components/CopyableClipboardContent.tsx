import { useState } from "react";
import {
  clipboardContentSummary,
  clipboardCopyText,
  type ActivityItem,
} from "../api/client";
import { useI18n } from "../i18n";

interface Props {
  metadata?: ActivityItem["metadata"];
  className?: string;
  indent?: boolean;
}

export function CopyableClipboardContent({
  metadata,
  className = "",
  indent = true,
}: Props) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const display = clipboardContentSummary(metadata, t);
  const copyText = clipboardCopyText(metadata);

  if (!display) return null;

  const handleCopy = async () => {
    if (!copyText) return;
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard API unavailable */
    }
  };

  const indentClass = indent ? "pl-[3.75rem]" : "";

  return (
    <div className={`${indentClass} ${className}`.trim()}>
      <p className="text-[10px] uppercase tracking-wide text-text-muted mb-0.5">
        {t("actions.content")}
        {copyText && (
          <span className="normal-case tracking-normal ml-2 text-accent/80">
            · {copied ? t("actions.copied") : t("actions.clickToCopy")}
          </span>
        )}
      </p>
      {copyText ? (
        <button
          type="button"
          onClick={handleCopy}
          className="w-full text-left rounded-md border border-transparent px-2 py-1.5 -mx-2 text-[11px] text-text leading-snug break-all line-clamp-4 hover:bg-accent/10 hover:border-accent/30 active:bg-accent/15 transition-colors cursor-copy"
          title={copyText}
        >
          {display}
        </button>
      ) : (
        <p className="text-[11px] text-text-muted leading-snug break-all">{display}</p>
      )}
    </div>
  );
}
