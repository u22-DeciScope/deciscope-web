import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("signup", "routes/signup.tsx"),
  route("terms", "routes/terms.tsx"),
  route("meeting/:id", "routes/meeting.$id.tsx"),
  route("meeting/:id/summary", "routes/meeting.$id.summary.tsx"),
] satisfies RouteConfig;