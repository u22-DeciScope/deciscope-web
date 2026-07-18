type SegmenterLike = {
  segment(value: string): Iterable<{ segment: string }>;
};

type SegmenterConstructor = new (
  locales?: string | string[],
  options?: { granularity: "grapheme" },
) => SegmenterLike;

export function truncateCardTitle(value: string, maxGraphemes = 42): string {
  const Segmenter = (Intl as unknown as { Segmenter?: SegmenterConstructor }).Segmenter;
  const graphemes = Segmenter
    ? Array.from(
        new Segmenter("ja", { granularity: "grapheme" }).segment(value),
        (part) => part.segment,
      )
    : Array.from(value);
  if (graphemes.length <= maxGraphemes) {
    return value;
  }
  return `${graphemes.slice(0, maxGraphemes).join("")}……`;
}

export function AssistantCardTitle({ title }: { title: string }) {
  return (
    <h2
      className="line-clamp-2 text-[13px] font-bold leading-5"
      style={{ color: "var(--text-main)" }}
      title={title}
      aria-label={title}
      tabIndex={0}
    >
      {truncateCardTitle(title)}
    </h2>
  );
}
