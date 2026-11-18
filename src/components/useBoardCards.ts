"use client";
import { useCallback, useEffect, useState } from "react";
import { postJson, requestJson } from "@/lib/workspace-client";
export function useBoardCards(token: string, tab: "catalog" | "insights") {
  const url = "/api/agent/" + token + "/cards?tab=" + tab,
    [hidden, setHidden] = useState<string[]>([]),
    [removed, setRemoved] = useState(false),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    const result = await requestJson<{ hidden: string[] }>(url);
    setHidden(result.hidden);
  }, [url]);
  useEffect(() => {
    let live = true;
    const poll = () =>
      requestJson<{ hidden: string[] }>(url)
        .then((result) => {
          if (live) setHidden(result.hidden);
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    void poll();
    const timer = setInterval(poll, 15000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [url]);
  async function toggle(key: string | string[] | null) {
    try {
      await postJson(url, { action: removed ? "restore" : "hide", ...(key === null ? { all: true } : Array.isArray(key) ? { keys: key } : { key }) });
      await load();
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update card.");
    }
  }
  return {
    removed,
    setRemoved,
    shown: (key: string) => hidden.includes(key) === removed,
    toggle,
    error,
  };
}
