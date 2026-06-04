import LoginPage from "~/components/auth/pages/LoginPage";
import type { Route } from "./+types/login";

export function meta({}: Route.MetaArgs) {
  return [{ title: "ログイン | Deciscope" }];
}

export default function Login() {
  return <LoginPage />;
}
