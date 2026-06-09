import { useRef, type KeyboardEvent, type PointerEvent } from "react";

type ResizeHandleProps = {
  max: number;
  min: number;
  onChange: (value: number) => void;
  onReset: () => void;
  value: number;
};

type DragStart = {
  pointerX: number;
  value: number;
};

export function ResizeHandle({
  max,
  min,
  onChange,
  onReset,
  value,
}: ResizeHandleProps) {
  const dragStart = useRef<DragStart | null>(null);

  function updateValue(nextValue: number) {
    onChange(Math.min(max, Math.max(min, nextValue)));
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    dragStart.current = { pointerX: event.clientX, value };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragStart.current) {
      return;
    }
    updateValue(dragStart.current.value + event.clientX - dragStart.current.pointerX);
  }

  function handlePointerEnd(event: PointerEvent<HTMLDivElement>) {
    dragStart.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      updateValue(value - 10);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      updateValue(value + 10);
    } else if (event.key === "Home") {
      event.preventDefault();
      updateValue(min);
    } else if (event.key === "End") {
      event.preventDefault();
      updateValue(max);
    }
  }

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label="サイドバーの幅を変更"
      aria-orientation="vertical"
      aria-valuemax={max}
      aria-valuemin={min}
      aria-valuenow={value}
      className="group relative w-2 shrink-0 cursor-col-resize touch-none outline-none"
      onDoubleClick={onReset}
      onKeyDown={handleKeyDown}
      onPointerCancel={handlePointerEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
    >
      <span className="absolute inset-y-2 left-1/2 w-px -translate-x-1/2 rounded-full bg-(--ds-border) transition-colors group-hover:bg-(--brand) group-focus-visible:bg-(--brand)" />
    </div>
  );
}
