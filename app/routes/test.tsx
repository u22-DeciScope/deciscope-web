import TranscriptTestPage from "~/components/test/TranscriptTestPage";
import { createPageTitle } from "~/root";
import type { Route } from "./+types/test";

export function meta({}: Route.MetaArgs) {
  return [{ title: createPageTitle("WebSocket Test") }];
}

export default function TestRoute() {
  return <TranscriptTestPage />;
}
