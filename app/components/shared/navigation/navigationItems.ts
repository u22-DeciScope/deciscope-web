import {
  HiArrowUpTray,
  HiCalendarDays,
  HiHome,
  HiPlusCircle,
  HiShieldCheck,
  HiVideoCamera,
  HiUsers,
} from "react-icons/hi2";
import type { IconType } from "react-icons";

export type AppNavigationItemId =
  | "home"
  | "new"
  | "upcoming"
  | "uploads"
  | "integrations"
  | "audit"
  | "workspace";

export type AppNavigationItem = {
  id: AppNavigationItemId;
  label: string;
  icon: IconType;
  path: string;
  // owner/admin のみに表示するメニュー。viewer には非表示にする
  // (frontend の表示制御であり、backend 側の認可は別途維持されている)。
  requiresManagement?: boolean;
};

export const appNavigationItems: AppNavigationItem[] = [
  { id: "home", label: "ホーム", icon: HiHome, path: "/meetings" },
  {
    id: "new",
    label: "会議作成",
    icon: HiPlusCircle,
    path: "/meetings/new",
    requiresManagement: true,
  },
  {
    id: "upcoming",
    label: "予定会議",
    icon: HiCalendarDays,
    path: "/meetings/upcoming",
    requiresManagement: true,
  },
  {
    id: "uploads",
    label: "ファイル処理",
    icon: HiArrowUpTray,
    path: "/uploads",
    requiresManagement: true,
  },
  {
    id: "integrations",
    label: "Teams 連携",
    icon: HiVideoCamera,
    path: "/settings/integrations",
    requiresManagement: true,
  },
  {
    id: "workspace",
    label: "Workspace設定",
    icon: HiUsers,
    path: "/settings/workspace",
    requiresManagement: true,
  },
  {
    id: "audit",
    label: "監査とプライバシー",
    icon: HiShieldCheck,
    path: "/settings/audit",
    requiresManagement: true,
  },
];

export function visibleNavigationItems(canManage: boolean) {
  return appNavigationItems.filter((item) => canManage || !item.requiresManagement);
}
