import { Link } from "react-router";
import { HiLightBulb } from "react-icons/hi2";
import { DsButton } from "~/components/DsButton";
import type {
  MeetingActionSummary,
  MeetingDecisionSummary,
  MeetingPriority,
  MeetingSummaryViewModel,
} from "./meetingSummaryTypes";

const priorityDot: Record<MeetingPriority, string> = {
  high: "var(--priority-high)",
  medium: "var(--priority-medium)",
  low: "var(--priority-low)",
};

const priorityLabel: Record<MeetingPriority, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

const levelBar: Record<MeetingPriority, string> = {
  high: "var(--priority-high)",
  medium: "var(--priority-medium)",
  low: "var(--ds-border)",
};

type MeetingSummaryMainProps = {
  meetingsPath: string;
  summary: MeetingSummaryViewModel;
};

export function MeetingSummaryMain({ meetingsPath, summary }: MeetingSummaryMainProps) {
  return (
    <div className="flex h-full min-w-0 flex-col gap-2 md:overflow-y-auto">
      <MeetingInfoCard summary={summary} />
      <AiSummaryCard summary={summary.aiSummary} />
      <DecisionList decisions={summary.decisions} />
      <ActionList actions={summary.actions} />
      <SummaryFooter meetingsPath={meetingsPath} />
    </div>
  );
}

function MeetingInfoCard({ summary }: { summary: MeetingSummaryViewModel }) {
  return (
    <div
      className="ds-surface rounded-(--ds-radius-panel) px-6 py-5 shrink-0"
      style={{ boxShadow: "var(--ds-shadow)" }}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span
              className="text-[11px] font-medium px-2.5 py-0.5 rounded-full"
              style={{
                background: "var(--badge-decision-bg)",
                color: "var(--badge-decision-fg)",
              }}
            >
              {summary.statusLabel}
            </span>
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              {summary.dateRange}
            </span>
          </div>
          <h1 className="text-[18px] font-bold" style={{ color: "var(--text-main)" }}>
            {summary.title}
          </h1>
        </div>
        <div className="text-right">
          <p className="text-[22px] font-bold" style={{ color: "var(--brand)" }}>
            {summary.duration}
          </p>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            会議時間
          </p>
        </div>
      </div>
    </div>
  );
}

function AiSummaryCard({ summary }: { summary: string }) {
  return (
    <div
      className="rounded-(--ds-radius-panel) px-6 py-5 shrink-0"
      style={{
        background: "var(--ai-quest-bg)",
        border: "1px solid var(--ai-quest-border)",
        boxShadow: "var(--ds-shadow)",
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-6 h-6 rounded-(--ds-radius-control) flex items-center justify-center"
          style={{ background: "var(--brand)" }}
        >
          <HiLightBulb className="w-3.5 h-3.5 text-white" />
        </div>
        <p className="text-[13px] font-semibold" style={{ color: "var(--ai-quest-fg)" }}>
          AI サマリー
        </p>
      </div>
      <p className="text-[12px] leading-relaxed" style={{ color: "var(--ai-quest-fg)" }}>
        {summary}
      </p>
    </div>
  );
}

function DecisionList({ decisions }: { decisions: MeetingDecisionSummary[] }) {
  return (
    <SummarySection title="決定事項" count={decisions.length} badge="decision">
      <div className="divide-y" style={{ borderColor: "var(--ds-border)" }}>
        {decisions.map((decision) => (
          <div key={decision.id} className="flex items-start gap-3 px-5 py-4">
            <div
              className="w-1 self-stretch rounded-full mt-1 shrink-0"
              style={{ background: levelBar[decision.level] }}
            />
            <div className="flex-1 min-w-0">
              <p
                className="text-[13px] font-medium leading-relaxed"
                style={{ color: "var(--text-main)" }}
              >
                {decision.text}
              </p>
              <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
                {decision.votes}
              </p>
            </div>
          </div>
        ))}
      </div>
    </SummarySection>
  );
}

function ActionList({ actions }: { actions: MeetingActionSummary[] }) {
  return (
    <SummarySection title="アクションアイテム" count={actions.length} badge="action">
      <div className="divide-y" style={{ borderColor: "var(--ds-border)" }}>
        {actions.map((action) => (
          <div key={action.id} className="flex items-center gap-3 px-5 py-3">
            <input
              type="checkbox"
              checked={action.done}
              readOnly
              className="w-4 h-4 shrink-0 rounded accent-[#2a8fd4]"
            />
            <div className="flex-1 min-w-0">
              <p className="text-[13px]" style={{ color: "var(--text-main)" }}>
                {action.text}
              </p>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {action.owner}
                </span>
                <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  期限: {action.due}
                </span>
              </div>
            </div>
            <div
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: priorityDot[action.priority] }}
              title={priorityLabel[action.priority]}
            />
          </div>
        ))}
      </div>
    </SummarySection>
  );
}

function SummarySection({
  badge,
  children,
  count,
  title,
}: {
  badge: "action" | "decision";
  children: React.ReactNode;
  count: number;
  title: string;
}) {
  const badgeStyles =
    badge === "decision"
      ? { background: "var(--badge-decision-bg)", color: "var(--badge-decision-fg)" }
      : { background: "var(--badge-action-bg)", color: "var(--badge-action-fg)" };

  return (
    <div
      className="ds-surface rounded-(--ds-radius-panel) overflow-hidden"
      style={{ boxShadow: "var(--ds-shadow)" }}
    >
      <div
        className="flex items-center h-10 px-5 border-b"
        style={{ borderColor: "var(--ds-border)" }}
      >
        <span
          className="w-2 h-2 rounded-full mr-2 shrink-0"
          style={{ background: "var(--brand)" }}
        />
        <span className="text-[13px] font-semibold" style={{ color: "var(--text-main)" }}>
          {title}
        </span>
        <span
          className="ml-2 text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center"
          style={badgeStyles}
        >
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}

function SummaryFooter({ meetingsPath }: { meetingsPath: string }) {
  return (
    <div className="flex gap-3 pb-1 shrink-0">
      <Link to={meetingsPath} className="flex-1">
        <DsButton variant="secondary" fullWidth>
          ホームに戻る
        </DsButton>
      </Link>
      <div className="flex-1">
        <DsButton fullWidth>フォローアップ会議を設定</DsButton>
      </div>
    </div>
  );
}
