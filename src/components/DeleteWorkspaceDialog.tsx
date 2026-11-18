"use client";

import { useState } from "react";
import { forgetConnection, type Saved } from "@/lib/client";
import WorkspaceDialog from "./WorkspaceDialog";
import { Button, Notice } from "./ui";

export default function DeleteWorkspaceDialog({
  workspace,
  close,
  done,
}: {
  workspace: Saved;
  close: () => void;
  done: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/agent/${workspace.token}`, {
        method: "DELETE",
      });
      if (!response.ok && response.status !== 404) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not delete the workspace.");
      }
      forgetConnection(workspace.token);
      done();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not delete the workspace.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <WorkspaceDialog label="Delete workspace" close={close}>
      <div className="delete-workspace-dialog">
        <h2>Delete {workspace.name}?</h2>
        <p>
          This permanently deletes the Connectchy workspace, its rooms, videos,
          and records. Its editor connection will stop. Files in VS Code and
          places in Roblox are kept.
        </p>
        {error && <Notice tone="bad">{error}</Notice>}
        <div className="record-actions">
          <Button disabled={busy} onClick={close}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => void remove()}
          >
            {busy ? "Deleting…" : "Delete workspace"}
          </Button>
        </div>
      </div>
    </WorkspaceDialog>
  );
}
