import { type RouteConfig, index, route } from "@react-router/dev/routes";
import { WORKSPACE_ROUTE_PATH, WORKSPACE_ROUTE_SEGMENT } from "./routing/workspacePaths";

export default [
  index("routes/landing.tsx"),
  route("login", "routes/login.tsx"),
  route("signup", "routes/signup.tsx"),
  route("terms", "routes/terms.tsx"),
  route("workspaces", "routes/workspaces.tsx"),
  route("workspaces/new", "routes/workspaces.new.tsx"),
  route("invitations/accept", "routes/invitations.accept.tsx"),
  route(WORKSPACE_ROUTE_SEGMENT, "routes/workspace-resolver.tsx"),
  route(WORKSPACE_ROUTE_PATH, "routes/workspace-layout.tsx", [
    index("routes/workspace.tsx"),
    route("meetings", "routes/home.tsx"),
    route("meetings/new", "routes/meeting.new.tsx"),
    route("meetings/upcoming", "routes/meetings.upcoming.tsx"),
    route("meetings/history", "routes/meetings.history.tsx"),
    route("meetings/:id", "routes/meeting.$id.tsx"),
    route("meetings/:id/summary", "routes/meeting.$id.summary.tsx"),
    route("settings/workspace", "routes/settings.workspace.tsx"),
  ]),
] satisfies RouteConfig;
