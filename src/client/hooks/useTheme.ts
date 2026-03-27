import { useSyncExternalStore } from "react";

type Theme = "dark" | "light";

function getSnapshot(): Theme {
  return (document.documentElement.getAttribute("data-theme") as Theme) ?? "light";
}

function subscribe(callback: () => void): () => void {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getSnapshot, () => "light");
}

/** ライトモードで視認性が悪い色をライト向けに調整 */
export function useThemedColor(darkColor: string, lightColor: string): string {
  const theme = useTheme();
  return theme === "light" ? lightColor : darkColor;
}
