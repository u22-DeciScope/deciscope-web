import { Link } from "react-router";
import { useState } from "react";
import { HiCheck } from "react-icons/hi2";
import { BrandLogo } from "~/components/BrandLogo";
import { DsButton } from "~/components/DsButton";
import { useTermsAgreement } from "~/hooks/useTermsAgreement";

export default function Terms() {
  const [agreed, setAgreed] = useState(false);
  const { acceptTerms } = useTermsAgreement();

  return (
    <div
      className="min-h-svh flex flex-col items-center justify-center p-4"
      style={{ background: "var(--ds-bg)" }}
    >
      {/* ロゴ */}
      <div className="mb-6">
        <BrandLogo size="lg" linkTo="/" />
      </div>

      {/* カード */}
      <div
        className="w-full max-w-140 ds-surface rounded-(--ds-radius-panel) overflow-hidden"
        style={{ boxShadow: "var(--ds-shadow)" }}
      >
        {/* ステッパー */}
        <div className="px-8 py-5 border-b" style={{ borderColor: "var(--ds-border)" }}>
          <div className="flex items-center gap-0">
            {/* Step 1: 完了 */}
            <div className="flex items-center gap-2">
              <div
                className="w-5.5 h-5.5 rounded-full flex items-center justify-center"
                style={{ background: "var(--brand)" }}
              >
                <HiCheck className="w-3 h-3 text-white" />
              </div>
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                アカウント情報
              </span>
            </div>

            <div className="flex-1 h-px mx-3" style={{ background: "var(--brand)" }} />

            {/* Step 2: 現在 */}
            <div className="flex items-center gap-2">
              <div
                className="w-5.5 h-5.5 rounded-full flex items-center justify-center"
                style={{ background: "var(--brand)" }}
              >
                <span className="text-[11px] font-bold text-white">2</span>
              </div>
              <span className="text-[11px] font-semibold" style={{ color: "var(--brand)" }}>
                利用規約
              </span>
            </div>

            <div className="flex-1 h-px mx-3" style={{ background: "var(--ds-border)" }} />

            {/* Step 3: 未来 */}
            <div className="flex items-center gap-2">
              <div
                className="w-5.5 h-5.5 rounded-full flex items-center justify-center"
                style={{ background: "var(--ds-border)" }}
              >
                <span className="text-[11px] font-bold" style={{ color: "var(--text-muted)" }}>
                  3
                </span>
              </div>
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                完了
              </span>
            </div>
          </div>
        </div>

        {/* 規約本文 */}
        <div
          className="h-72 overflow-y-auto px-8 py-6 text-[12px] leading-relaxed space-y-5 border-b"
          style={{ color: "var(--text-sub)", borderColor: "var(--ds-border)" }}
        >
          {[
            {
              title: "第1条（利用規約について）",
              body: "本利用規約（以下「本規約」）は、Deciscope（以下「本サービス」）の利用条件を定めるものです。登録ユーザーの皆さまには、本規約に従って本サービスをご利用いただきます。",
            },
            {
              title: "第2条（利用登録）",
              body: "登録希望者が所定の方法によって利用登録を申請し、運営者がこれを承認することによって、利用登録が完了するものとします。",
              items: [
                "利用登録の申請に際して虚偽の事項を届け出た場合",
                "本規約に違反したことがある者からの申請である場合",
                "その他、運営者が利用登録を相当でないと判断した場合",
              ],
            },
            {
              title: "第3条（個人情報の取り扱い）",
              body: "本サービスにおける利用者の個人情報の取り扱いについては、別途定めるプライバシーポリシーに従うものとします。",
            },
            {
              title: "第4条（禁止事項）",
              body: "ユーザーは、本サービスの利用にあたり、以下の行為をしてはなりません。",
              items: [
                "法令または公序良俗に違反する行為",
                "犯罪行為に関連する行為",
                "サーバーまたはネットワークの機能を破壊したり、妨害したりする行為",
                "不正アクセスをし、またはこれを試みる行為",
                "他のユーザーに成りすます行為",
              ],
            },
            {
              title: "第5条（本サービスの変更・中断・終了）",
              body: "運営者は、ユーザーへの事前の通知なく、本サービスの内容を変更したり、本サービスの提供を中断または終了することができるものとします。",
            },
            {
              title: "第6条（免責事項）",
              body: "運営者は、本サービスに関して、ユーザーと他のユーザーまたは第三者との間において生じた取引、連絡または紛争等について一切責任を負いません。",
            },
          ].map((section) => (
            <div key={section.title}>
              <h2
                className="text-[13px] font-semibold mb-1.5"
                style={{ color: "var(--text-main)" }}
              >
                {section.title}
              </h2>
              <p>{section.body}</p>
              {section.items && (
                <ul className="mt-2 space-y-1 pl-4 list-disc">
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>

        {/* アクションエリア */}
        <div className="px-8 py-6 space-y-4">
          <div
            className="flex items-start gap-3 p-4 rounded-(--ds-radius-control)"
            style={{ background: "var(--input-bg)", border: "1px solid var(--input-border)" }}
          >
            <input
              type="checkbox"
              id="agree"
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
              className="w-4 h-4 mt-0.5 shrink-0 rounded accent-[#2a8fd4]"
            />
            <label
              htmlFor="agree"
              className="text-[12px] select-none leading-relaxed"
              style={{ color: "var(--text-sub)" }}
            >
              上記の利用規約およびプライバシーポリシーを読み、内容に同意します。
            </label>
          </div>

          <div className="flex gap-3">
            <Link to="/signup" className="flex-1">
              <DsButton variant="secondary" fullWidth type="button">
                戻る
              </DsButton>
            </Link>
            <div className="flex-1">
              <DsButton fullWidth type="button" disabled={!agreed} onClick={acceptTerms}>
                同意してはじめる
              </DsButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
