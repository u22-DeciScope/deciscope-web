import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { HiBell, HiCog6Tooth, HiLanguage, HiMoon, HiUserCircle, HiXMark } from "react-icons/hi2";

import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";

type AppSettingsModalProps = {
  onClose: () => void;
};

const settingsSections = [
  { id: "general", label: "一般", icon: HiCog6Tooth },
  { id: "account", label: "アカウント", icon: HiUserCircle },
  { id: "notifications", label: "通知", icon: HiBell },
  { id: "language", label: "言語", icon: HiLanguage },
];

export function AppSettingsModal({ onClose }: AppSettingsModalProps) {
  const { user } = useAuthenticatedLayout();
  const dialog = useRef<HTMLDivElement>(null);
  const displayName = user.displayName ?? "ゲスト";

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/45 p-3 backdrop-blur-[2px] md:p-8"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
        className="grid h-[min(760px,calc(100dvh-1.5rem))] w-full max-w-5xl overflow-hidden rounded-(--ds-radius-dialog) border outline-none md:grid-cols-[220px_minmax(0,1fr)]"
        style={{
          background: "var(--ds-surface-raised)",
          borderColor: "var(--ds-border)",
          boxShadow: "0 24px 80px rgba(15, 38, 56, 0.32)",
        }}
      >
        <aside
          className="hidden border-r p-4 md:block"
          style={{ background: "var(--ds-surface-muted)", borderColor: "var(--ds-border)" }}
        >
          <p
            className="px-3 pb-3 pt-1 text-xs font-semibold"
            style={{ color: "var(--text-muted)" }}
          >
            設定
          </p>
          <nav className="space-y-1">
            {settingsSections.map((section, index) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-(--ds-radius-control) px-3 py-2.5 text-left text-sm font-medium"
                  style={{
                    background: index === 0 ? "var(--brand-light)" : "transparent",
                    color: index === 0 ? "var(--brand)" : "var(--text-sub)",
                  }}
                >
                  <Icon className="h-5 w-5" />
                  {section.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="min-w-0 overflow-y-auto">
          <header
            className="sticky top-0 z-10 flex items-center justify-between border-b px-5 py-4 md:px-8"
            style={{ background: "var(--ds-surface-raised)", borderColor: "var(--ds-border)" }}
          >
            <div>
              <p className="text-xs md:hidden" style={{ color: "var(--text-muted)" }}>
                設定
              </p>
              <h2
                id="settings-title"
                className="text-lg font-bold"
                style={{ color: "var(--text-main)" }}
              >
                一般設定
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="設定を閉じる"
              className="rounded-(--ds-radius-control) p-2 transition hover:bg-(--ds-surface-muted)"
              style={{ color: "var(--text-sub)" }}
            >
              <HiXMark className="h-6 w-6" />
            </button>
          </header>

          <div className="space-y-8 p-5 md:p-8">
            <SettingsGroup title="プロフィール">
              <SettingsRow label="表示名">
                <span>{displayName}</span>
              </SettingsRow>
              <SettingsRow label="メールアドレス">
                <span>{user.email ?? "未設定"}</span>
              </SettingsRow>
            </SettingsGroup>

            <SettingsGroup title="アプリ設定">
              <SettingsRow label="外観" icon={HiMoon}>
                <span>システム設定に合わせる</span>
              </SettingsRow>
              <SettingsRow label="言語" icon={HiLanguage}>
                <span>日本語</span>
              </SettingsRow>
              <SettingsRow label="通知" icon={HiBell}>
                <span>すべて有効</span>
              </SettingsRow>
            </SettingsGroup>

            <div
              className="rounded-(--ds-radius-panel) border p-4 text-sm leading-relaxed"
              style={{
                background: "var(--ds-surface-muted)",
                borderColor: "var(--ds-border)",
                color: "var(--text-sub)",
              }}
            >
              設定内容は仮置きです。今後、各項目の保存処理を追加します。
            </div>
          </div>
        </section>
      </div>
    </div>,
    document.body,
  );
}

type SettingsGroupProps = {
  children: React.ReactNode;
  title: string;
};

function SettingsGroup({ children, title }: SettingsGroupProps) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-bold" style={{ color: "var(--text-main)" }}>
        {title}
      </h3>
      <div
        className="overflow-hidden rounded-(--ds-radius-panel) border"
        style={{ borderColor: "var(--ds-border)" }}
      >
        {children}
      </div>
    </section>
  );
}

type SettingsRowProps = {
  children: React.ReactNode;
  icon?: typeof HiMoon;
  label: string;
};

function SettingsRow({ children, icon: Icon, label }: SettingsRowProps) {
  return (
    <div
      className="flex flex-col gap-2 border-b px-4 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
      style={{ borderColor: "var(--ds-border)" }}
    >
      <div
        className="flex items-center gap-2 text-sm font-medium"
        style={{ color: "var(--text-main)" }}
      >
        {Icon && <Icon className="h-4 w-4" style={{ color: "var(--text-muted)" }} />}
        {label}
      </div>
      <div className="text-sm" style={{ color: "var(--text-sub)" }}>
        {children}
      </div>
    </div>
  );
}
