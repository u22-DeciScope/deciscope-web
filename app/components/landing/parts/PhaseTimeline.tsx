// 会議の時間軸をそのままページの構造に使う。左端の等幅ラベルは
// 会議開始を 00:00 とした相対時刻で、3つの節目が製品の3画面
// (事前コンテキスト / 会議中の作業画面 / 会議後の要約) に対応する。

type Phase = {
  mark: string;
  phase: string;
  title: string;
  body: string;
};

const phases: Phase[] = [
  {
    mark: "-05:00",
    phase: "会議前",
    title: "目的とアジェンダを先に渡す",
    body: "会議の目的、前提、議題を登録しておきます。AIはそれを基準に、いまどの議題を話しているかを追いかけます。",
  },
  {
    mark: "00:00",
    phase: "会議中",
    title: "Botが入室し、話が構造になる",
    body: "Teams会議のURLを貼るとBotが参加します。文字起こしと並行して議論ツリーが育ち、AIアシスタントが論点・リスク・確認したい点をカードで出します。",
  },
  {
    mark: "END",
    phase: "会議後",
    title: "決定とアクションが残る",
    body: "決定事項とTODOが、それを生んだ議論の枝と一緒に残ります。各ノードには発言のあった時点が記録されるので、あとから経緯をたどれます。",
  },
];

export function PhaseTimeline() {
  return (
    <ol className="mt-10 sm:mt-14">
      {phases.map((phase, index) => (
        <li
          key={phase.mark}
          className="grid grid-cols-[3.75rem_1px_1fr] gap-x-4 sm:grid-cols-[5rem_1px_1fr] sm:gap-x-7"
        >
          <span
            className="ds-landing-mono pt-0.5 text-right text-[11px] sm:text-[12px]"
            style={{ color: "var(--text-muted)" }}
          >
            {phase.mark}
          </span>

          {/* 目盛りの軸。最後の節目だけ、線を途中で止めて終端にする。 */}
          <span
            aria-hidden="true"
            className="relative"
            style={{ background: index === phases.length - 1 ? "transparent" : "var(--lp-rule)" }}
          >
            {index === phases.length - 1 && (
              <span
                className="absolute inset-x-0 top-0 h-6"
                style={{ background: "var(--lp-rule)" }}
              />
            )}
            <span
              className="absolute left-1/2 top-1.5 h-2 w-2 -translate-x-1/2 rounded-full"
              style={{ background: "var(--brand)" }}
            />
          </span>

          <div className="pb-10 sm:pb-14">
            <p className="text-[12px] font-bold" style={{ color: "var(--brand)" }}>
              {phase.phase}
            </p>
            <h3
              className="ds-landing-display mt-1 text-[18px] font-bold sm:text-[21px]"
              style={{ color: "var(--text-main)" }}
            >
              {phase.title}
            </h3>
            <p
              className="mt-2 max-w-2xl text-[13px] leading-7 sm:text-[14px]"
              style={{ color: "var(--text-sub)" }}
            >
              {phase.body}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
