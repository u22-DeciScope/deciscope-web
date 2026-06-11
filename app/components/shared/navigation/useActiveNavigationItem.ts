import { useLocation } from "react-router";

import type { AppNavigationItemId } from "~/components/shared/navigation/navigationItems";
import { useAuthenticatedLayout } from "~/context/AuthenticatedLayoutContext";
import { workspacePath } from "~/routing/workspacePaths";

export function useActiveNavigationItem(): AppNavigationItemId {
  const { pathname } = useLocation();
  const { workspaceId } = useAuthenticatedLayout();

  if (pathname.startsWith(workspacePath(workspaceId, "/meetings/new"))) {
    return "new";
  }
  if (pathname.startsWith(workspacePath(workspaceId, "/meetings/upcoming"))) {
    return "upcoming";
  }
  if (pathname.startsWith(workspacePath(workspaceId, "/uploads"))) {
    return "uploads";
  }
  if (pathname.startsWith(workspacePath(workspaceId, "/settings/integrations"))) {
    return "integrations";
  }
  if (pathname.startsWith(workspacePath(workspaceId, "/settings/audit"))) {
    return "audit";
  }
  return "home";
}
