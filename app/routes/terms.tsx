import TermsPage from "~/components/auth/pages/TermsPage";
import { createPageTitle } from "~/root";
import type { Route } from "./+types/terms";

export function meta({}: Route.MetaArgs) {
  return [{ title: createPageTitle("利用規約") }];
}

export default function Terms() {
  return <TermsPage />;
}
