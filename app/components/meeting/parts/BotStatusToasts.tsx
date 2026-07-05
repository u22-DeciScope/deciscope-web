import type { BotStatusToast, BotStatusToastTone } from "~/hooks/useBotStatusToasts";

const toneStyle: Record<BotStatusToastTone, { bg: string; border: string; fg: string }> = {
  error: { bg: "var(--ai-risk-bg)", border: "var(--ai-risk-border)", fg: "var(--ai-risk-fg)" },
  warning: { bg: "var(--ai-point-bg)", border: "var(--ai-point-border)", fg: "var(--ai-point-fg)" },
  success: {
    bg: "color-mix(in srgb, var(--success) 16%, var(--ds-surface))",
    border: "color-mix(in srgb, var(--success) 45%, transparent)",
    fg: "var(--success)",
  },
};

// Botの状態変化(音声認識停止/再接続中/退出/復旧)を知らせる右上トースト。
// 既存の pageNotice(会議画面上部の帯)とは別枠で、複数件を積み上げて表示できる。
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
    <div className="pointer-events-none fixed right-3 top-3 z-50 flex w-full max-w-xs flex-col gap-2">
      {toasts.map((toast) => {
        const style = toneStyle[toast.tone];
        return (
          <div
            key={toast.id}
            role="status"
            className="pointer-events-auto flex items-start gap-2 rounded-(--ds-radius-control) border px-3 py-2.5 text-[12px] leading-5"
            style={{
              background: style.bg,
              borderColor: style.border,
              color: style.fg,
              boxShadow: "var(--ds-shadow)",
            }}
          >
            <span className="flex-1">{toast.message}</span>
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
