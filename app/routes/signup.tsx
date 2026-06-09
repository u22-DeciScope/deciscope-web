import SignupPage from "~/components/auth/pages/SignupPage";
import { createPageTitle } from "~/root";
import type { Route } from "./+types/signup";

export function meta({}: Route.MetaArgs) {
  return [{ title: createPageTitle("新規登録") }];
}

export default function Signup() {
  return <SignupPage />;
}
