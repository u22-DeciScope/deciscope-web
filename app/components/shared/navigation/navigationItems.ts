import {
  HiArrowUpTray,
  HiCalendarDays,
  HiHome,
  HiPlusCircle,
  HiShieldCheck,
  HiVideoCamera,
} from "react-icons/hi2";
import type { IconType } from "react-icons";

export type AppNavigationItemId =
  | "home"
  | "new"
  | "upcoming"
  | "uploads"
  | "integrations"
  | "audit";

export type AppNavigationItem = {
  id: AppNavigationItemId;
  label: string;
  icon: IconType;
  path: string;
};

export const appNavigationItems: AppNavigationItem[] = [
  { id: "home", label: "ホーム", icon: HiHome, path: "/meetings" },
  { id: "new", label: "会議作成", icon: HiPlusCircle, path: "/meetings/new" },
  { id: "upcoming", label: "予定会議", icon: HiCalendarDays, path: "/meetings/upcoming" },
  { id: "uploads", label: "ファイル処理", icon: HiArrowUpTray, path: "/uploads" },
  { id: "integrations", label: "Teams 連携", icon: HiVideoCamera, path: "/settings/integrations" },
  { id: "audit", label: "監査とプライバシー", icon: HiShieldCheck, path: "/settings/audit" },
];
