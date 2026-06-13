import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

type AppModalFrameProps = {
  ariaLabelledBy: string;
  children: ReactNode;
  className: string;
  onClose: () => void;
  style?: React.CSSProperties;
};

export function AppModalFrame({
  ariaLabelledBy,
  children,
  className,
  onClose,
  style,
}: AppModalFrameProps) {
  const dialog = useRef<HTMLDivElement>(null);

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
        aria-labelledby={ariaLabelledBy}
        tabIndex={-1}
        className={className}
        style={style}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
