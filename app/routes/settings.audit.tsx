import AuditPage from "~/components/audit/pages/AuditPage";
import { createPageTitle } from "~/root";
import type { Route } from "./+types/settings.audit";

export function meta({}: Route.MetaArgs) {
  return [{ title: createPageTitle("監査とプライバシー") }];
}

export default function SettingsAudit() {
  return <AuditPage />;
}
