import { useLocation } from "react-router";

import type { AppNavigationItemId } from "~/components/shared/navigation/navigationItems";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";
import { workspacePath } from "~/lib/workspace";

export function useActiveNavigationItem(): AppNavigationItemId {
  const { pathname } = useLocation();
  const { workspaceId } = useAuthenticatedLayout();
  const meetingsPath = workspacePath(workspaceId, "/meetings");

  if (pathname.startsWith(`${meetingsPath}/`)) {
    return "meetings";
  }
  if (pathname.startsWith(workspacePath(workspaceId, "/team"))) {
    return "team";
  }
  if (pathname.startsWith(workspacePath(workspaceId, "/reports"))) {
    return "reports";
  }
  return "home";
}
