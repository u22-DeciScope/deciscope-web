import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/landing.tsx"),
  route("login", "routes/login.tsx"),
  route("signup", "routes/signup.tsx"),
  route("terms", "routes/terms.tsx"),
  route("w/:workspaceId", "routes/workspace.tsx"),
  route("w/:workspaceId/meetings", "routes/home.tsx"),
  route("w/:workspaceId/meetings/:id", "routes/meeting.$id.tsx"),
  route("w/:workspaceId/meetings/:id/summary", "routes/meeting.$id.summary.tsx"),
] satisfies RouteConfig;
