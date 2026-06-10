import { HiChartBarSquare, HiHome, HiListBullet, HiUserGroup } from "react-icons/hi2";
import type { IconType } from "react-icons";

export type AppNavigationItemId = "home" | "meetings" | "team" | "reports";

export type AppNavigationItem = {
  id: AppNavigationItemId;
  label: string;
  icon: IconType;
  path: string;
};

export const appNavigationItems: AppNavigationItem[] = [
  { id: "home", label: "ホーム", icon: HiHome, path: "/meetings" },
  { id: "meetings", label: "会議一覧", icon: HiListBullet, path: "/" },
  { id: "team", label: "チーム", icon: HiUserGroup, path: "/" },
  { id: "reports", label: "レポート", icon: HiChartBarSquare, path: "/" },
];
