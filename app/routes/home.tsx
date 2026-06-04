import HomePage from "~/components/home/pages/HomePage";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [{ title: "ホーム | Deciscope" }];
}

export default function Home() {
  return <HomePage />;
}
