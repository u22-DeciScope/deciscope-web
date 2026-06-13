import MeetingSummaryPage from "~/components/meeting/pages/MeetingSummaryPage";
import { createPageTitle } from "~/root";
import type { Route } from "./+types/meeting.$id.summary";

export function meta({}: Route.MetaArgs) {
  return [{ title: createPageTitle("会議サマリー") }];
}

export default function MeetingSummary() {
  return <MeetingSummaryPage />;
}
