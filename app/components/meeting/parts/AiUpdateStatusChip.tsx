import { useEffect, useState } from "react";
import { HiArrowPath } from "react-icons/hi2";

import type { LiveAnalysisMeta } from "~/hooks/useMeetingTranscriptSession";

type AiUpdateStatusChipProps = {
  meta: LiveAnalysisMeta;
};

// AIアシスタント/議論ツリー共通の更新状態チップ。
// 1秒間隔のカウントダウンtickerはこのコンポーネント内部に閉じており、
// 親やページ全体を毎秒再レンダしない。
export function AiUpdateStatusChip({ meta }: AiUpdateStatusChipProps) {
  const needsTicker = !meta.generating && !meta.failed && meta.lastEventAtMs !== null;
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!needsTicker) {
      return;
    }
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [needsTicker]);

  if (meta.generating) {
    return (
      <span
        className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[10px]"
        style={{ color: "var(--text-muted)" }}
      >
        <HiArrowPath className="h-3 w-3 animate-spin" style={{ color: "var(--brand)" }} />
        AI分析中…
      </span>
    );
  }

  if (meta.failed) {
    return (
      <span className="shrink-0 whitespace-nowrap text-[10px]" style={{ color: "var(--warning)" }}>
        更新失敗・自動再試行します
      </span>
    );
  }

  if (meta.lastEventAtMs === null) {
    return (
      <span
        className="shrink-0 whitespace-nowrap text-[10px]"
        style={{ color: "var(--text-muted)" }}
      >
        AI分析待機中
      </span>
    );
  }

  const updatedLabel = formatChipTime(meta.lastCompletedAtMs ?? meta.lastEventAtMs);
  const remainingSeconds = Math.ceil(
    (meta.lastEventAtMs + meta.intervalSeconds * 1000 - nowMs) / 1000,
  );
  const nextLabel =
    remainingSeconds > 0
      ? `次の更新まで 約${remainingSeconds}秒`
      : meta.hasNewSpeech
        ? "まもなく更新"
        : "新しい発話待ち";

  return (
    <span className="shrink-0 whitespace-nowrap text-[10px]" style={{ color: "var(--text-muted)" }}>
      {updatedLabel ? `${updatedLabel} 更新・` : ""}
      {nextLabel}
    </span>
  );
}

function formatChipTime(timestampMs: number | null) {
  if (timestampMs === null || !Number.isFinite(timestampMs)) {
    return "";
  }
  return new Date(timestampMs).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
