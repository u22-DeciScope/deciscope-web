import MeetingHistoryPage from "~/components/home/pages/MeetingHistoryPage";
import { createPageTitle } from "~/root";
import type { Route } from "./+types/meetings.history";

export function meta({}: Route.MetaArgs) {
  return [{ title: createPageTitle("会議履歴") }];
}

export default function MeetingsHistory() {
  return <MeetingHistoryPage />;
}
