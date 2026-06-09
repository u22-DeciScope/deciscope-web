import LoginPage from "~/components/auth/pages/LoginPage";
import { createPageTitle } from "~/root";
import type { Route } from "./+types/login";

export function meta({}: Route.MetaArgs) {
  return [{ title: createPageTitle("ログイン") }];
}

export default function Login() {
  return <LoginPage />;
}
