import {
  HiChartBarSquare,
  HiHome,
  HiListBullet,
  HiUserGroup,
} from "react-icons/hi2";
import type { IconType } from "react-icons";

export type AppNavigationItemId = "home" | "meetings" | "team" | "reports";

export type AppNavigationItem = {
  id: AppNavigationItemId;
  label: string;
  icon: IconType;
};

export const appNavigationItems: AppNavigationItem[] = [
  { id: "home", label: "ホーム", icon: HiHome },
  { id: "meetings", label: "会議一覧", icon: HiListBullet },
  { id: "team", label: "チーム", icon: HiUserGroup },
  { id: "reports", label: "レポート", icon: HiChartBarSquare },
];
