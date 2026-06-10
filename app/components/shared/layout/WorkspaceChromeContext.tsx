import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { WorkspaceHeaderConfig } from "~/components/shared/layout/WorkspaceHeader";

export type WorkspaceChromeConfig = {
  header: WorkspaceHeaderConfig;
  rightSidebar?: ReactNode;
  rightSidebarClassName?: string;
};

type WorkspaceChromeContextValue = {
  chrome: WorkspaceChromeConfig;
  resetChrome: () => void;
  setChrome: (chrome: WorkspaceChromeConfig) => void;
};

const defaultChrome: WorkspaceChromeConfig = {
  header: {
    title: "Deciscope",
  },
};

const WorkspaceChromeContext = createContext<WorkspaceChromeContextValue | null>(null);
const useChromeEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function WorkspaceChromeProvider({ children }: { children: ReactNode }) {
  const [chrome, setChrome] = useState<WorkspaceChromeConfig>(defaultChrome);
  const resetChrome = useCallback(() => setChrome(defaultChrome), []);

  const value = useMemo(
    () => ({
      chrome,
      resetChrome,
      setChrome,
    }),
    [chrome, resetChrome],
  );

  return (
    <WorkspaceChromeContext.Provider value={value}>{children}</WorkspaceChromeContext.Provider>
  );
}

export function useWorkspaceChrome(config: WorkspaceChromeConfig) {
  const context = useWorkspaceChromeContext();

  useChromeEffect(() => {
    context.setChrome(config);
    return context.resetChrome;
  }, [config, context.resetChrome, context.setChrome]);
}

export function useWorkspaceChromeContext() {
  const context = useContext(WorkspaceChromeContext);
  if (!context) {
    throw new Error("useWorkspaceChrome must be used within WorkspaceChromeProvider");
  }
  return context;
}
