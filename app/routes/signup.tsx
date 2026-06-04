import SignupPage from "~/components/auth/pages/SignupPage";
import type { Route } from "./+types/signup";

export function meta({}: Route.MetaArgs) {
  return [{ title: "新規登録 | Deciscope" }];
}

export default function Signup() {
  return <SignupPage />;
}
