import PublicSampleMeetingPage from "~/components/landing/pages/PublicSampleMeetingPage";
import { createPageTitle } from "~/root";
import type { Route } from "./+types/sample-meeting";

export const links: Route.LinksFunction = () => [
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&family=JetBrains+Mono:wght@400;500&display=swap",
  },
];

export function meta({}: Route.MetaArgs) {
  return [
    { title: createPageTitle("会議履歴サンプル") },
    {
      name: "description",
      content:
        "ログイン不要で、Deciscopeの文字起こし・議論ツリー・AI分析・最終要約を確認できる公開サンプルです。",
    },
  ];
}

export default function SampleMeetingRoute() {
  return <PublicSampleMeetingPage />;
}
