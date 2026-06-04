import TermsPage from "~/components/auth/pages/TermsPage";
import type { Route } from "./+types/terms";

export function meta({}: Route.MetaArgs) {
  return [{ title: "利用規約 | Deciscope" }];
}

export default function Terms() {
  return <TermsPage />;
}
