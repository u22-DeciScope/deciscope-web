import UploadPage from "~/components/uploads/pages/UploadPage";
import { createPageTitle } from "~/root";
import type { Route } from "./+types/uploads";

export function meta({}: Route.MetaArgs) {
  return [{ title: createPageTitle("ファイル処理") }];
}

export default function Upload() {
  return <UploadPage />;
}
