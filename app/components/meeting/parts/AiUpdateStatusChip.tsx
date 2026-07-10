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
        className="flex min-w-0 shrink-0 items-center gap-1 text-[10px]"
        style={{ color: "var(--text-muted)" }}
      >
        <HiArrowPath className="h-3 w-3 shrink-0 animate-spin" style={{ color: "var(--brand)" }} />
        <span className="min-w-0 truncate">分析中</span>
      </span>
    );
  }

  if (meta.failed) {
    return (
      <span
        className="block min-w-0 max-w-full shrink-0 truncate text-[10px]"
        style={{ color: "var(--warning)" }}
      >
        更新失敗・再試行待ち
      </span>
    );
  }

  if (meta.lastEventAtMs === null) {
    return (
      <span
        className="flex min-w-0 shrink-0 items-center gap-1 text-[10px]"
        style={{ color: "var(--text-muted)" }}
      >
        {meta.hasNewSpeech && (
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-current" />
        )}
        {meta.hasNewSpeech ? (
          <span className="min-w-0 truncate">
            新しい発話を蓄積中
            <AnimatedEllipsis />
          </span>
        ) : (
          <span className="min-w-0 truncate">分析待機中</span>
        )}
      </span>
    );
  }

  const updatedLabel = formatChipTime(meta.lastCompletedAtMs ?? meta.lastEventAtMs);
  const remainingSeconds = Math.ceil(
    (meta.lastEventAtMs + meta.intervalSeconds * 1000 - nowMs) / 1000,
  );
  // 2行目(次回チェックまで/十分な新規発話を待機中)に出す文言。カウントダウンが
  // 尽きていて、かつ新規発話も無い場合のみ2行目を「待機中」表示に切り替える。
  const nextCheckLabel =
    remainingSeconds > 0
      ? `次回チェックまで 約${remainingSeconds}秒`
      : meta.hasNewSpeech
        ? null
        : "十分な新規発話を待機中";

  return (
    <span
      className="flex min-w-0 shrink-0 flex-col items-start gap-0.5 text-[10px] leading-tight"
      style={{ color: "var(--text-muted)" }}
    >
      <span className="flex min-w-0 max-w-full items-center gap-1">
        {meta.hasNewSpeech && (
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-current" />
        )}
        <span className="min-w-0 truncate">
          {updatedLabel}
          {meta.hasNewSpeech && (
            <>
              ・新しい発話を蓄積中
              <AnimatedEllipsis />
            </>
          )}
        </span>
      </span>
      {nextCheckLabel && <span className="min-w-0 max-w-full truncate">{nextCheckLabel}</span>}
    </span>
  );
}

// 「蓄積中」の末尾に添える、控えめに点滅する「…」。3つのドットが順にフェードする。
// prefers-reduced-motion: reduce 環境ではCSS側でアニメーションを止める(app.css参照)。
function AnimatedEllipsis() {
  return (
    <span aria-hidden="true" className="inline-flex">
      <span className="ds-ellipsis-dot">.</span>
      <span className="ds-ellipsis-dot">.</span>
      <span className="ds-ellipsis-dot">.</span>
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
