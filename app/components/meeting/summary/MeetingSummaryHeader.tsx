import { Link } from "react-router";
import { HiArrowDownTray, HiChevronRight, HiShare } from "react-icons/hi2";
import { DsButton } from "~/components/DsButton";

type MeetingSummaryHeaderProps = {
  meetingsPath: string;
  title: string;
};

export function MeetingSummaryHeader({ meetingsPath, title }: MeetingSummaryHeaderProps) {
  return (
    <div
      className="ds-surface flex min-h-13 flex-wrap items-center gap-3 rounded-(--ds-radius-panel) px-4 py-3 md:h-13 md:px-5 md:py-0"
      style={{ boxShadow: "var(--ds-shadow)" }}
    >
      <Link to={meetingsPath} className="text-[12px]" style={{ color: "var(--text-muted)" }}>
        ホーム
      </Link>
      <HiChevronRight className="w-3 h-3 shrink-0" style={{ color: "var(--text-muted)" }} />
      <span className="text-[12px] font-medium truncate" style={{ color: "var(--text-main)" }}>
        {title}
      </span>

      <div className="ml-auto flex items-center gap-2">
        <DsButton variant="secondary">
          <HiShare className="w-3.5 h-3.5" />
          共有
        </DsButton>
        <DsButton variant="secondary">
          <HiArrowDownTray className="w-3.5 h-3.5" />
          エクスポート
        </DsButton>
      </div>
    </div>
  );
}
