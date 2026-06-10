import { HiArrowUpTray, HiHome, HiPlusCircle } from "react-icons/hi2";
import type { IconType } from "react-icons";

export type AppNavigationItemId = "home" | "new" | "uploads";

export type AppNavigationItem = {
  id: AppNavigationItemId;
  label: string;
  icon: IconType;
  path: string;
};

export const appNavigationItems: AppNavigationItem[] = [
  { id: "home", label: "ホーム", icon: HiHome, path: "/meetings" },
  { id: "new", label: "会議作成", icon: HiPlusCircle, path: "/meetings/new" },
  { id: "uploads", label: "ファイル処理", icon: HiArrowUpTray, path: "/uploads" },
];
