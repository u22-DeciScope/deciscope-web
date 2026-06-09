import MeetingPage from "~/components/meeting/pages/MeetingPage";
import { createPageTitle } from "~/root";
import type { Route } from "./+types/meeting.$id";

export function meta({}: Route.MetaArgs) {
  return [{ title: createPageTitle("会議中") }];
}

export default function Meeting() {
  return <MeetingPage />;
}
