import type { BotStatusToast, BotStatusToastTone } from "~/hooks/useBotStatusToasts";

const toneStyle: Record<BotStatusToastTone, { bg: string; border: string; fg: string }> = {
  error: {
    bg: "color-mix(in srgb, var(--ai-risk-bg) 85%, transparent)",
    border: "var(--ai-risk-border)",
    fg: "var(--ai-risk-fg)",
  },
  warning: {
    bg: "color-mix(in srgb, var(--ai-point-bg) 85%, transparent)",
    border: "var(--ai-point-border)",
    fg: "var(--ai-point-fg)",
  },
  success: {
    bg: "color-mix(in srgb, color-mix(in srgb, var(--success) 16%, var(--ds-surface)) 85%, transparent)",
    border: "color-mix(in srgb, var(--success) 45%, transparent)",
    fg: "var(--success)",
  },
};

// Botの状態変化(音声認識停止/再接続中/退出/復旧)を知らせる画面中央上部のトースト。
// 既存の pageNotice(会議画面上部の帯)とは別枠で、複数件を積み上げて表示できる。
// 会議終了モーダル等と重なる場合があるため z-index は既存の z-50 を維持する。
export function BotStatusToasts({
  toasts,
  onDismiss,
}: {
  toasts: BotStatusToast[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed left-1/2 top-3 z-50 flex w-full max-w-[min(24rem,92vw)] -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((toast) => {
        const style = toneStyle[toast.tone];
        return (
          <div
            key={toast.id}
            role="status"
            className="pointer-events-auto flex w-full items-start gap-2 rounded-(--ds-radius-control) border px-3 py-2.5 text-[12px] leading-5 backdrop-blur-md"
            style={{
              background: style.bg,
              borderColor: style.border,
              color: style.fg,
              boxShadow: "var(--ds-shadow)",
            }}
          >
            <span className="min-w-0 flex-1 break-words">{toast.message}</span>
            <button
              type="button"
              className="shrink-0 text-[13px] leading-none opacity-70 hover:opacity-100"
              style={{ color: style.fg }}
              onClick={() => onDismiss(toast.id)}
              aria-label="通知を閉じる"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
