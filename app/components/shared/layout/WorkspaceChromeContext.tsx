import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";

import type { WorkspaceHeaderConfig } from "~/components/shared/layout/WorkspaceHeader";

export type WorkspaceChromeConfig = {
  header: WorkspaceHeaderConfig;
  rightSidebar?: ReactNode;
  rightSidebarClassName?: string;
};

const defaultChrome: WorkspaceChromeConfig = {
  header: {
    title: "Deciscope",
  },
};

// chrome値(表示側が購読)と登録関数(登録側が購読)を別Contextに分離する。
//
// 以前は登録側hook(useWorkspaceChrome)も chrome 値を含むContextを購読していた。
// その構造では、登録effectのsetChromeでContextが変わると登録元コンポーネント
// 自身が再レンダーされ、configが毎レンダー新しい参照の場合に
// 「setup(setState)→再レンダー→cleanup(setState)→setup(setState)→…」の
// 自励ループになり Maximum update depth exceeded でクラッシュする。
// 登録側は安定な登録関数だけを購読することで、このループを構造的に断つ。
const WorkspaceChromeStateContext = createContext<WorkspaceChromeConfig | null>(null);
const WorkspaceChromeApplyContext = createContext<
  ((config: WorkspaceChromeConfig) => () => void) | null
>(null);

const useChromeEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function WorkspaceChromeProvider({ children }: { children: ReactNode }) {
  const [chrome, setChrome] = useState<WorkspaceChromeConfig>(defaultChrome);

  // applyChromeは登録者のconfigを適用し、「所有権チェック付き」の解除関数を返す。
  //  - 適用: 同一参照の再適用は現在値を返してbailoutし、再レンダーを起こさない。
  //  - 解除: 現在のchromeが自分の登録したconfigのままである場合にのみdefaultへ
  //    戻す。別ページ/新しいeffectが既に登録済みなら何もしない(古いcleanupが
  //    新しい設定を上書きしない。Strict Modeのsetup→cleanup→setupでも安全)。
  const applyChrome = useCallback((config: WorkspaceChromeConfig) => {
    setChrome((current) => (current === config ? current : config));
    return () => {
      setChrome((current) => (current === config ? defaultChrome : current));
    };
  }, []);

  return (
    <WorkspaceChromeApplyContext.Provider value={applyChrome}>
      <WorkspaceChromeStateContext.Provider value={chrome}>
        {children}
      </WorkspaceChromeStateContext.Provider>
    </WorkspaceChromeApplyContext.Provider>
  );
}

export function useWorkspaceChrome(config: WorkspaceChromeConfig) {
  const applyChrome = useContext(WorkspaceChromeApplyContext);
  if (!applyChrome) {
    throw new Error("useWorkspaceChrome must be used within WorkspaceChromeProvider");
  }

  useChromeEffect(() => applyChrome(config), [applyChrome, config]);
}

// 表示側(WorkspacePageLayoutなど)が現在のchromeを読むためのhook。
export function useWorkspaceChromeContext() {
  const chrome = useContext(WorkspaceChromeStateContext);
  if (!chrome) {
    throw new Error("useWorkspaceChrome must be used within WorkspaceChromeProvider");
  }
  return { chrome };
}
