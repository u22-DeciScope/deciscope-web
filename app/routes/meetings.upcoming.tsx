import UpcomingMeetingsPage from "~/components/teams/pages/UpcomingMeetingsPage";
import { createPageTitle } from "~/root";
import type { Route } from "./+types/meetings.upcoming";

export function meta({}: Route.MetaArgs) {
  return [{ title: createPageTitle("予定会議") }];
}

export default function MeetingsUpcoming() {
  return <UpcomingMeetingsPage />;
}
