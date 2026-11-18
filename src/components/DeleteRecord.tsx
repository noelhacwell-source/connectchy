"use client";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { postJson } from "@/lib/workspace-client";
export default function DeleteRecord({
  token,
  kind,
  id,
  revision,
  done,
  label = "Delete",
  title,
}: {
  token: string;
  kind: string;
  id: number;
  revision?: number;
  done: () => void | Promise<void>;
  label?: string;
  title?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <span className="studio-delete">
      <button
        type="button"
        disabled={busy}
        className="studio-inline"
        aria-label={label + " " + (title || kind)}
        onClick={async () => {
          const detail =
            kind === "activity"
              ? "Remove this entry from the activity log?"
              : kind === "asset"
                ? "Remove this upload from the project library?"
                : kind === "review"
                  ? "Discard this proposal before it runs?"
                  : "Permanently delete " + (title || "this " + kind) + "?";
          if (!confirm(detail)) return;
          setBusy(true);
          setError("");
          try {
            await postJson("/api/agent/" + token + "/cleanup", {
              kind,
              id,
              revision,
            });
            await done();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not delete item.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Trash2 size={13} />
        {busy ? "Removing…" : label}
      </button>
      {error && <small role="alert">{error}</small>}
    </span>
  );
}
