// 監査ログ・データ保持設定のフロントエンド用モックAPI。
// 実際の監査証跡はバックエンドで記録される想定。それまでは localStorage に状態を持ち、
// バックエンドと同じ非同期インターフェースで振る舞う。

export type AuditEventType =
  | "bot_invited"
  | "bot_cancelled"
  | "recording_started"
  | "recording_stopped"
  | "analysis_completed"
  | "retention_updated"
  | "data_deleted";

export type AuditLogEntryDto = {
  id: string;
  event_type: AuditEventType;
  meeting_subject?: string;
  actor_name: string;
  occurred_at: string;
  detail?: string;
};

/** 保持期間(日数)。0 は無期限を表す。 */
export type RetentionDays = 0 | 30 | 90 | 180 | 365;

export type RetentionSettingsDto = {
  retention_days: RetentionDays;
  updated_at?: string;
  updated_by?: string;
};

export const RETENTION_OPTIONS: { value: RetentionDays; label: string }[] = [
  { value: 30, label: "30日" },
  { value: 90, label: "90日" },
  { value: 180, label: "180日" },
  { value: 365, label: "1年" },
  { value: 0, label: "無期限" },
];

type AuditMockState = {
  retention: RetentionSettingsDto;
  extraEntries: AuditLogEntryDto[];
};

const STORAGE_KEY = "deciscope.audit.mock.v1";
const MOCK_LATENCY_MS = 350;

const defaultRetention: RetentionSettingsDto = {
  retention_days: 90,
};

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function loadState(): AuditMockState {
  if (typeof window === "undefined") {
    return { retention: defaultRetention, extraEntries: [] };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { retention: defaultRetention, extraEntries: [] };
    }
    const parsed = JSON.parse(raw) as Partial<AuditMockState>;
    return {
      retention: parsed.retention ?? defaultRetention,
      extraEntries: parsed.extraEntries ?? [],
    };
  } catch {
    return { retention: defaultRetention, extraEntries: [] };
  }
}

function saveState(state: AuditMockState) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export async function getRetentionSettings(): Promise<RetentionSettingsDto> {
  await delay(MOCK_LATENCY_MS);
  return loadState().retention;
}

export async function updateRetentionSettings(
  retentionDays: RetentionDays,
): Promise<RetentionSettingsDto> {
  await delay(MOCK_LATENCY_MS);
  const state = loadState();
  const label =
    RETENTION_OPTIONS.find((option) => option.value === retentionDays)?.label ??
    `${retentionDays}日`;
  state.retention = {
    retention_days: retentionDays,
    updated_at: new Date().toISOString(),
    updated_by: "デモ ユーザー",
  };
  state.extraEntries.push({
    id: `audit_retention_${Date.now()}`,
    event_type: "retention_updated",
    actor_name: "デモ ユーザー",
    occurred_at: new Date().toISOString(),
    detail: `データ保持期間を「${label}」に変更しました。`,
  });
  saveState(state);
  return state.retention;
}

export async function listAuditLogEntries(): Promise<{ entries: AuditLogEntryDto[] }> {
  await delay(MOCK_LATENCY_MS);
  const state = loadState();
  const entries = [...buildMockAuditEntries(), ...state.extraEntries].sort(
    (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
  );
  return { entries };
}

// 現在時刻を基準に過去数日分のデモ監査ログを生成する。
function buildMockAuditEntries(): AuditLogEntryDto[] {
  const now = new Date();
  const ago = (dayOffset: number, hour: number, minute = 0) => {
    const date = new Date(now);
    date.setDate(date.getDate() - dayOffset);
    date.setHours(hour, minute, 0, 0);
    return date.toISOString();
  };
  const entry = (
    id: string,
    eventType: AuditEventType,
    actorName: string,
    occurredAt: string,
    meetingSubject?: string,
    detail?: string,
  ): AuditLogEntryDto => ({
    id,
    event_type: eventType,
    actor_name: actorName,
    occurred_at: occurredAt,
    meeting_subject: meetingSubject,
    detail,
  });

  return [
    entry(
      "audit_demo_01",
      "bot_invited",
      "鈴木 美咲",
      ago(3, 9, 50),
      "スプリントレビュー",
      "予定会議から Bot の参加を予約しました。",
    ),
    entry(
      "audit_demo_02",
      "recording_started",
      "システム (Bot)",
      ago(3, 10, 0),
      "スプリントレビュー",
      "主催者が入室を許可し、録音を開始しました。",
    ),
    entry(
      "audit_demo_03",
      "recording_stopped",
      "システム (Bot)",
      ago(3, 11, 2),
      "スプリントレビュー",
      "会議終了に伴い録音を終了しました。",
    ),
    entry(
      "audit_demo_04",
      "analysis_completed",
      "システム",
      ago(3, 11, 10),
      "スプリントレビュー",
      "文字起こしと決定事項の抽出が完了しました。",
    ),
    entry(
      "audit_demo_05",
      "bot_invited",
      "佐藤 健",
      ago(1, 17, 20),
      "デイリースタンドアップ",
      "会議リンクから Bot を招待しました。",
    ),
    entry(
      "audit_demo_06",
      "bot_cancelled",
      "佐藤 健",
      ago(1, 17, 25),
      "デイリースタンドアップ",
      "Bot の参加予約を取り消しました。",
    ),
    entry(
      "audit_demo_07",
      "data_deleted",
      "システム",
      ago(0, 4, 0),
      undefined,
      "保持期間を超過した会議データ 2 件を自動削除しました。",
    ),
  ];
}
