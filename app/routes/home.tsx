import HomePage from "~/components/home/pages/HomePage";
import { createPageTitle } from "~/root";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [{ title: createPageTitle("ホーム") }];
}

export default function Home() {
  return <HomePage />;
}
