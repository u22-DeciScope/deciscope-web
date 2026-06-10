import type { InputHTMLAttributes, ReactNode } from "react";

interface DsInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  extra?: ReactNode;
}

export function DsInput({ label, extra, className = "", ...props }: DsInputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {(label || extra) && (
        <div className="flex items-center justify-between">
          {label && (
            <label className="text-[12px] font-semibold" style={{ color: "var(--text-sub)" }}>
              {label}
            </label>
          )}
          {extra}
        </div>
      )}
      <input
        className={`w-full rounded-[9px] px-3 py-2.5 text-[13px] outline-none transition ${className}`}
        style={{
          background: "var(--input-bg)",
          border: "1px solid var(--input-border)",
          color: "var(--text-main)",
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "var(--brand)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "var(--input-border)";
        }}
        {...props}
      />
    </div>
  );
}
