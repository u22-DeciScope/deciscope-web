import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/landing.tsx"),
  route("login", "routes/login.tsx"),
  route("signup", "routes/signup.tsx"),
  route("terms", "routes/terms.tsx"),
  route("w/:workspaceId", "routes/workspace-layout.tsx", [
    index("routes/workspace.tsx"),
    route("meetings", "routes/home.tsx"),
    route("meetings/new", "routes/meeting.new.tsx"),
    route("meetings/upcoming", "routes/meetings.upcoming.tsx"),
    route("meetings/:id", "routes/meeting.$id.tsx"),
    route("meetings/:id/summary", "routes/meeting.$id.summary.tsx"),
    route("uploads", "routes/uploads.tsx"),
    route("settings/integrations", "routes/settings.integrations.tsx"),
    route("settings/audit", "routes/settings.audit.tsx"),
  ]),
] satisfies RouteConfig;
