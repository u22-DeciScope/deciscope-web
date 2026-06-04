import { Link, useNavigate } from "react-router";
import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { Logo } from "~/components/Logo";
import { DsButton } from "~/components/DsButton";
import { onFirebaseUserChanged, signOutOfFirebase } from "~/lib/firebase";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [{ title: "ホーム | Deciscope" }];
}

const upcomingMeetings = [
  { id: "1", title: "Q2 製品ロードマップ検討", time: "10:00", duration: "60分", participants: 5, tag: "製品" },
  { id: "2", title: "週次スプリントレビュー", time: "14:00", duration: "30分", participants: 8, tag: "開発" },
];

const recentMeetings = [
  { id: "3", title: "デザインシステム方針決定", date: "昨日", decisions: 4, actions: 7, participants: 4 },
  { id: "4", title: "採用戦略ブレインストーミング", date: "5月21日", decisions: 2, actions: 3, participants: 6 },
  { id: "5", title: "予算計画 FY2026", date: "5月19日", decisions: 6, actions: 12, participants: 3 },
];

const navItems = [
  { label: "ホーム", active: true, icon: <IconHome /> },
  { label: "会議一覧", active: false, icon: <IconList /> },
  { label: "チーム", active: false, icon: <IconTeam /> },
  { label: "レポート", active: false, icon: <IconReport /> },
];

export default function Home() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);

  const today = new Date().toLocaleDateString("ja-JP", {
    year: "numeric", month: "long", day: "numeric", weekday: "long",
  });

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    onFirebaseUserChanged((u) => setUser(u))
      .then((cleanup) => { unsubscribe = cleanup; })
      .catch(() => {});
    return () => { unsubscribe?.(); };
  }, []);

  async function handleLogout() {
    await signOutOfFirebase();
    navigate("/login");
  }

  const displayName = user?.displayName ?? "ゲスト";
  const displayEmail = user?.email ?? "";
  const avatarLetter = displayName.charAt(0);

  return (
    <div className="h-screen flex overflow-hidden p-[9px] gap-[8px]" style={{ background: "var(--ds-bg)" }}>

      {/* ===== LEFT SIDEBAR ===== */}
      <div className="relative w-[220px] shrink-0 flex flex-col">
        <div className="absolute inset-0 bg-white rounded-[14px]" style={{ boxShadow: "var(--ds-shadow)" }} />

        {/* ロゴ行 */}
        <div className="relative z-10 flex items-center h-[50px] px-4 shrink-0 border-b" style={{ borderColor: "var(--ds-border)" }}>
          <Logo size="sm" linkTo="/" />
        </div>

        {/* ナビゲーション */}
        <nav className="relative z-10 flex-1 px-3 py-4 flex flex-col gap-1 overflow-y-auto">
          {navItems.map((item) => (
            <button
              key={item.label}
              type="button"
              className="flex items-center gap-3 w-full px-3 py-[9px] rounded-[9px] text-[13px] font-medium text-left transition hover:opacity-80"
              style={
                item.active
                  ? { background: "var(--brand-light)", color: "var(--brand)" }
                  : { background: "transparent", color: "var(--text-sub)" }
              }
            >
              <span className="shrink-0 w-4 h-4">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* ユーザー行 */}
        <div className="relative z-10 border-t" style={{ borderColor: "var(--ds-border)" }}>
          <div className="flex items-center gap-2.5 px-4 py-3">
            {user?.photoURL ? (
              <img src={user.photoURL} alt="" className="w-7 h-7 rounded-full shrink-0 object-cover" />
            ) : (
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                style={{ background: "var(--brand)" }}
              >
                {avatarLetter}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold truncate" style={{ color: "var(--text-main)" }}>{displayName}</p>
              <p className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>{displayEmail}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="shrink-0 p-1 rounded-[6px] transition hover:opacity-70"
              title="ログアウト"
              style={{ color: "var(--text-muted)" }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ===== RIGHT CONTENT ===== */}
      <div className="flex-1 flex flex-col gap-[8px] min-w-0">

        {/* トップバー */}
        <div
          className="h-[52px] bg-white rounded-[14px] flex items-center justify-between px-6 shrink-0"
          style={{ boxShadow: "var(--ds-shadow)" }}
        >
          <div>
            <p className="text-[15px] font-bold" style={{ color: "var(--text-main)" }}>
              おはようございます、{user?.displayName?.split(" ")[0] ?? "ゲスト"}さん
            </p>
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{today}</p>
          </div>
          <Link to="/meeting/new">
            <DsButton>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              会議を開始
            </DsButton>
          </Link>
        </div>

        {/* スクロール可能なコンテンツ */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-[8px] min-h-0">

          {/* サマリー統計 */}
          <div className="grid grid-cols-3 gap-[8px]">
            {[
              { label: "今日の会議", value: "2", unit: "件", color: "var(--brand)" },
              { label: "今週の決定事項", value: "12", unit: "件", color: "#22c55e" },
              { label: "未完了アクション", value: "5", unit: "件", color: "#f59e0b" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-white rounded-[14px] px-5 py-4"
                style={{ boxShadow: "var(--ds-shadow)" }}
              >
                <p className="text-[11px] mb-2" style={{ color: "var(--text-muted)" }}>{stat.label}</p>
                <div className="flex items-end gap-1">
                  <span className="text-[26px] font-bold leading-none" style={{ color: stat.color }}>{stat.value}</span>
                  <span className="text-[12px] mb-0.5" style={{ color: "var(--text-sub)" }}>{stat.unit}</span>
                </div>
              </div>
            ))}
          </div>

          {/* 今日の予定 */}
          <div className="bg-white rounded-[14px] overflow-hidden" style={{ boxShadow: "var(--ds-shadow)" }}>
            <div className="flex items-center h-[40px] px-5 border-b" style={{ borderColor: "var(--ds-border)" }}>
              <span className="w-[8px] h-[8px] rounded-full mr-2 shrink-0" style={{ background: "var(--brand)" }} />
              <span className="text-[13px] font-semibold" style={{ color: "var(--text-main)" }}>今日の予定</span>
            </div>
            <div className="divide-y" style={{ borderColor: "var(--ds-border)" }}>
              {upcomingMeetings.map((meeting) => (
                <div key={meeting.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="text-center min-w-[48px]">
                    <p className="text-[14px] font-bold" style={{ color: "var(--text-main)" }}>{meeting.time}</p>
                    <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{meeting.duration}</p>
                  </div>
                  <div className="w-px h-8" style={{ background: "var(--ds-border)" }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                        style={{ background: "var(--tag-topic-bg)", color: "var(--tag-topic-fg)" }}
                      >
                        {meeting.tag}
                      </span>
                    </div>
                    <p className="text-[13px] font-medium truncate" style={{ color: "var(--text-main)" }}>{meeting.title}</p>
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{meeting.participants}名参加予定</p>
                  </div>
                  <Link to={`/meeting/${meeting.id}`}>
                    <DsButton variant="secondary">参加する</DsButton>
                  </Link>
                </div>
              ))}
            </div>
          </div>

          {/* 最近の会議 */}
          <div className="bg-white rounded-[14px] overflow-hidden" style={{ boxShadow: "var(--ds-shadow)" }}>
            <div className="flex items-center justify-between h-[40px] px-5 border-b" style={{ borderColor: "var(--ds-border)" }}>
              <div className="flex items-center">
                <span className="w-[8px] h-[8px] rounded-full mr-2 shrink-0" style={{ background: "var(--brand)" }} />
                <span className="text-[13px] font-semibold" style={{ color: "var(--text-main)" }}>最近の会議</span>
              </div>
              <button type="button" className="text-[11px] font-medium" style={{ color: "var(--brand)" }}>
                すべて見る
              </button>
            </div>
            <div>
              {recentMeetings.map((meeting, i) => (
                <Link
                  key={meeting.id}
                  to={`/meeting/${meeting.id}/summary`}
                  className="flex items-center gap-4 px-5 py-3 transition hover:opacity-80"
                  style={i < recentMeetings.length - 1 ? { borderBottom: "1px solid var(--ds-border)" } : {}}
                >
                  <div
                    className="w-8 h-8 rounded-[9px] flex items-center justify-center shrink-0"
                    style={{ background: "var(--input-bg)" }}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} style={{ color: "var(--text-muted)" }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium truncate" style={{ color: "var(--text-main)" }}>{meeting.title}</p>
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{meeting.date} · {meeting.participants}名</p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-center">
                      <p className="text-[13px] font-semibold" style={{ color: "var(--text-main)" }}>{meeting.decisions}</p>
                      <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>決定</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[13px] font-semibold" style={{ color: "var(--text-main)" }}>{meeting.actions}</p>
                      <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>アクション</p>
                    </div>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "var(--text-muted)" }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

function IconHome() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

function IconList() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  );
}

function IconTeam() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function IconReport() {
  return (
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}
