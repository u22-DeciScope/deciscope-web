import MeetingSummaryPage from "~/components/meeting/pages/MeetingSummaryPage";
import type { Route } from "./+types/meeting.$id.summary";

export function meta({}: Route.MetaArgs) {
  return [{ title: "会議サマリー | Deciscope" }];
}

export default function MeetingSummary() {
  return <MeetingSummaryPage />;
}
