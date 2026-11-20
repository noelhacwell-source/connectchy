"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Users } from "lucide-react";
import { installId } from "@/lib/install-id";

type Presence = { online: number; local: number; source: "github" | "local" | "empty"; published: boolean; updatedAt: string };

const number = new Intl.NumberFormat("en-US");

/**
 * Live "currently online" counter.
 *
 * Every running copy checks in here every 30 seconds; the server keeps that
 * install online for 90 seconds and asks GitHub for the public marker count. The
 * number therefore follows real running copies, going up when someone opens
 * Connectchy and down when they close it.
 */
export default function LiveCounter() {
  const [state, setState] = useState<Presence | null>(null);
  const [failed, setFailed] = useState(false);
  const [delta, setDelta] = useState<"up" | "down" | null>(null);
  const previous = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/presence", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const data = (await response.json()) as Presence;
      setState(data);
      setFailed(false);
      if (previous.current !== null && data.online !== previous.current) {
        setDelta(data.online > previous.current ? "up" : "down");
      }
      previous.current = data.online;
    } catch {
      setFailed(true);
    }
  }, []);

  // Check in so this copy is part of the public number, then keep it alive.
  useEffect(() => {
    let live = true;
    const beat = async () => {
      try {
        await fetch("/api/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ installId: installId(), version: "dashboard" }),
        });
      } catch {
        /* A missed beat just means this copy looks offline until the next one. */
      }
      if (live) await load();
    };
    const first = setTimeout(beat, 0);
    const timer = setInterval(beat, 30000);
    const poll = setInterval(() => {
      if (live) void load();
    }, 10000);
    const leave = () => {
      try {
        navigator.sendBeacon?.(
          `/api/presence?installId=${encodeURIComponent(installId())}`,
          new Blob([], { type: "application/json" }),
        );
      } catch {}
    };
    window.addEventListener("pagehide", leave);
    return () => {
      live = false;
      clearTimeout(first);
      clearInterval(timer);
      clearInterval(poll);
      window.removeEventListener("pagehide", leave);
    };
  }, [load]);

  useEffect(() => {
    if (!delta) return;
    const timer = setTimeout(() => setDelta(null), 1600);
    return () => clearTimeout(timer);
  }, [delta]);

  const online = state?.online ?? 0;
  const local = state?.local ?? 0;
  const label = failed || !state ? "—" : number.format(online);
  const showLocal = state && state.source === "local" && local > 0;
  return (
    <span
      className={"live-counter" + (failed ? " unavailable" : "") + (delta ? " " + delta : "")}
      role="status"
      aria-live="polite"
      title={
        failed
          ? "The live counter cannot reach its service right now."
          : state?.source === "github"
            ? `${number.format(online)} copies of Connectchy are running right now (public GitHub count), ${number.format(local)} on this dashboard.`
            : `${number.format(local)} copies are running right now on this dashboard (GitHub not configured).`
      }
    >
      <Users size={14} aria-hidden="true" />
      <strong key={online}>{label}</strong>
      <span>online</span>
      {showLocal && (
        <span className="local-tag">
          <Users size={11} aria-hidden="true" />
          <strong>{number.format(local)}</strong>
          <span>local</span>
        </span>
      )}
      <i className={"pulse" + (state?.source === "github" ? "" : " local")} aria-hidden="true" />
      {delta && <em className="change">{delta === "up" ? "+1" : "−1"}</em>}
    </span>
  );
}
