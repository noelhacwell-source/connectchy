"use client";

import {
  useMemo,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import {
  DEFAULT_LAYOUT,
  parseLayout,
  type LayoutSettings,
} from "@/lib/layout-settings";

const eventName = "connectchy:layout";
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(eventName, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(eventName, callback);
  };
}
export function useLayoutSettings(scope: string) {
  const key = "connectchy:layout:" + scope;
  const [error, setError] = useState("");
  const raw = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    () => null,
  );
  const layout = useMemo(() => {
    try {
      return parseLayout(JSON.parse(raw ?? "{}")) ?? DEFAULT_LAYOUT;
    } catch {
      return DEFAULT_LAYOUT;
    }
  }, [raw]);
  function update(patch: Partial<LayoutSettings>) {
    const next = parseLayout({ ...layout, ...patch });
    if (!next) {
      setError("Invalid layout settings.");
      return;
    }
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setError("");
      window.dispatchEvent(new Event(eventName));
    } catch {
      setError("This browser could not save the layout.");
    }
  }
  const style = {
    "--custom-sidebar-width": layout.sidebarWidth + "px",
    "--custom-agent-width": layout.agentPanelWidth + "px",
    "--custom-content-width": layout.contentWidth + "px",
    "--custom-video-columns": layout.videoColumns,
  } as CSSProperties;
  return { layout, update, style, error };
}
