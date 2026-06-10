import { DsButton } from "~/components/DsButton";
import { AppModalFrame } from "~/components/shared/modal/AppModalFrame";

type ConfirmDialogProps = {
  cancelLabel?: string;
  confirmLabel?: string;
  description?: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
};

export function ConfirmDialog({
  cancelLabel = "キャンセル",
  confirmLabel = "OK",
  description,
  onCancel,
  onConfirm,
  title,
}: ConfirmDialogProps) {
  return (
    <AppModalFrame
      ariaLabelledBy="confirm-dialog-title"
      onClose={onCancel}
      className="w-full max-w-sm overflow-hidden rounded-(--ds-radius-dialog) border p-5 outline-none"
      style={{
        background: "var(--ds-surface-raised)",
        borderColor: "var(--ds-border)",
        boxShadow: "0 24px 80px rgba(15, 38, 56, 0.32)",
      }}
    >
      <h2 id="confirm-dialog-title" className="text-base font-bold" style={{ color: "var(--text-main)" }}>
        {title}
      </h2>
      {description ? (
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-sub)" }}>
          {description}
        </p>
      ) : null}

      <div className="mt-6 flex justify-end gap-2">
        <DsButton type="button" variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </DsButton>
        <DsButton type="button" onClick={onConfirm}>
          {confirmLabel}
        </DsButton>
      </div>
    </AppModalFrame>
  );
}
