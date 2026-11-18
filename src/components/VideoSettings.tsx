"use client";

import { useState } from "react";
import {
  MAX_CONFIGURABLE_MB,
  DEFAULT_VIDEO_LIMIT_MB,
} from "@/lib/video-limits";
import { requestJson } from "@/lib/workspace-client";
import { Button, Notice } from "./ui";

export default function VideoSettings({
  token,
  limitMb,
  saved,
}: {
  token: string;
  limitMb: number | null;
  saved: (limit: number | null) => void;
}) {
  const [limit, setLimit] = useState(String(limitMb ?? DEFAULT_VIDEO_LIMIT_MB));
  const [unlimited, setUnlimited] = useState(limitMb === null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function save() {
    setError("");
    setMessage("");
    const amount = Number(limit);
    if (
      !unlimited &&
      (!/^\d+$/.test(limit.trim()) ||
        !Number.isSafeInteger(amount) ||
        amount < 1 ||
        amount > MAX_CONFIGURABLE_MB)
    ) {
      setError("Enter a positive whole number in MB.");
      return;
    }
    setBusy(true);
    try {
      const response = await requestJson<{ limitMb: number | null }>(
        `/api/agent/${token}/video-settings`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limitMb: unlimited ? null : amount }),
        },
      );
      saved(response.limitMb);
      setMessage(
        response.limitMb === null
          ? "Video limit set to Unlimited."
          : `Video limit set to ${response.limitMb} MB.`,
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save upload settings.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="customize-layout">
      <header>
        <h2>Video uploads</h2>
        <p>
          Set the maximum size of each video uploaded to this workspace. 1 MB is
          1,000,000 bytes.
        </p>
      </header>
      <form
        className="studio-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label className="customize-motion">
          <input
            type="checkbox"
            checked={unlimited}
            onChange={(event) => setUnlimited(event.target.checked)}
          />
          Unlimited video size
        </label>
        {!unlimited && (
          <label className="field-label">
            Maximum video size (MB)
            <input
              aria-label="Maximum video size (MB)"
              type="text"
              inputMode="numeric"
              className="workspace-input"
              value={limit}
              onChange={(event) => setLimit(event.target.value)}
            />
          </label>
        )}
        {unlimited && (
          <p className="studio-hint">
            Unlimited removes the app’s video cap. Uploads still use your
            database storage and the network handling the connection.
          </p>
        )}
        <div className="record-actions">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Saving…" : "Save upload limit"}
          </Button>
          <Button
            onClick={() => {
              setUnlimited(false);
              setLimit(String(DEFAULT_VIDEO_LIMIT_MB));
            }}
          >
            Restore 500 MB
          </Button>
        </div>
      </form>
      {error && <Notice tone="bad">{error}</Notice>}
      {message && <Notice tone="ok">{message}</Notice>}
    </section>
  );
}
