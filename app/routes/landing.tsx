import LandingPage from "~/components/landing/pages/LandingPage";
import { createPageTitle } from "~/root";
import type { Route } from "./+types/landing";

export function meta({}: Route.MetaArgs) {
  return [{ title: createPageTitle() }];
}

export default function Landing() {
  return <LandingPage />;
}
