import TeamsIntegrationPage from "~/components/teams/pages/TeamsIntegrationPage";
import { createPageTitle } from "~/root";
import type { Route } from "./+types/settings.integrations";

export function meta({}: Route.MetaArgs) {
  return [{ title: createPageTitle("Teams 連携") }];
}

export default function SettingsIntegrations() {
  return <TeamsIntegrationPage />;
}
