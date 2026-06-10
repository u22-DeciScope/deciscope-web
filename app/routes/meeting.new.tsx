import MeetingNewPage from "~/components/meeting/pages/MeetingNewPage";
import { createPageTitle } from "~/root";
import type { Route } from "./+types/meeting.new";

export function meta({}: Route.MetaArgs) {
  return [{ title: createPageTitle("会議を作成") }];
}

export default function MeetingNew() {
  return <MeetingNewPage />;
}
