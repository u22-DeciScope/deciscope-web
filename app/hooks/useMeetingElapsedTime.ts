import { useEffect, useMemo, useState } from "react";

export function useMeetingElapsedTime(startAt: string, endAt: string, isEnded: boolean) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    setNowMs(Date.now());
    if (!startAt || isEnded) {
      return;
    }

    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isEnded, startAt]);

  return useMemo(() => {
    const startMs = parseTimestampMs(startAt);
    if (startMs === null) {
      return null;
    }
    const endMs = parseTimestampMs(endAt) ?? nowMs;
    return formatElapsedDuration(Math.max(0, endMs - startMs));
  }, [endAt, nowMs, startAt]);
}

function parseTimestampMs(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function formatElapsedDuration(durationMs: number) {
  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const paddedSeconds = String(seconds).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${paddedSeconds}`;
  }
  return `${minutes}:${paddedSeconds}`;
}
