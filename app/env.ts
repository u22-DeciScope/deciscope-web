declare global {
  interface Window {
    ENV: Record<string, string | undefined>;
  }
}

export function getEnv(key: string): string | undefined {
  if (typeof window !== "undefined") {
    return window.ENV?.[key];
  }
  return process.env[key];
}
