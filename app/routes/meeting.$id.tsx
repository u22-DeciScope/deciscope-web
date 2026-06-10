import MeetingPage from "~/components/meeting/pages/MeetingPage";
import type { Route } from "./+types/meeting.$id";

export function meta({}: Route.MetaArgs) {
  return [{ title: "会議中 | Deciscope" }];
}

export default function Meeting() {
  return <MeetingPage />;
}
