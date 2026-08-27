import LandingPage from "~/components/landing/pages/LandingPage";
import { createPageTitle } from "~/root";
import type { Route } from "./+types/landing";

export const links: Route.LinksFunction = () => [
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&family=JetBrains+Mono:wght@400;500&display=swap",
  },
];

export function meta({}: Route.MetaArgs) {
  return [
    { title: createPageTitle() },
    {
      name: "description",
      content:
        "DeciscopeはTeams会議に参加して発言を文字起こしし、その場で議論ツリーへ組み立てます。論点・リスク・決定事項が枝としてつながり、決まったことと、そう決めた理由が同じ場所に残ります。",
    },
  ];
}

export default function Landing() {
  return <LandingPage />;
}
