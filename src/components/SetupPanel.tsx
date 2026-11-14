"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { forgetConnection, subscribeNever, timeAgo, type Status } from "@/lib/client";
import { Button, CopyButton, Notice, Panel, StatusPill } from "./ui";

export default function SetupPanel({ token, status }: { token: string; status: Status }) {
  const router = useRouter();
  const browserOrigin = useSyncExternalStore(subscribeNever, () => window.location.origin, () => "");
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const origin = status.tunnelReady ? status.origin! : browserOrigin;
  const link = `${origin}/api/agent/${token}`;
  const extras = [
    status.features?.room && "Read /rooms for the active room ID. Pin that ID with ?room=<id> on room/team calls and top-level room on edit commands (_room in MCP). Stop if the active room changes. MANDATORY ROLE PLANNING: Do not start work because the room is empty. Choose a stable AI name, read /room/team, then register your role and exact owned paths with POST /room/team action join. Agree distinct roles with the other AIs and mark ready. WAIT until team.phase is active and every expected AI is ready. The owner sets the expected team size in the room window (default 2; ask them to set 1 if working alone). Read /room?agent=<your-name> before each edit, read attention.unacknowledgedPings first and explicitly acknowledge them. Use @Owner, @all or an AI name to ping. Include your agent name in every edit command; mark your role done when finished. Read the full coordination instructions at the link.",
    status.modules?.taskBoard && "The task board is enabled. Read /workspace?kind=task, agree owners and dependencies, and keep task statuses current. Read the workspace API instructions at the link.",
    status.modules?.reviewQueue && "AI edits require owner approval. A response with status review means the edit has NOT run. Wait for review; do not submit duplicate commands.",
    status.modules?.protectedPaths && "Protected work areas are enabled. Stay inside your assigned paths. Arbitrary Luau and global undo/redo are blocked for agents.",
    status.features?.room && !status.modules?.rolePlanning && "The role-planning gate is currently disabled: skip the mandatory join/ready gating above, but still coordinate and use a stable agent name.",
    status.features?.room && !status.modules?.pingInbox && "Priority pings are disabled: no ping acknowledgement gate is active.",
    status.features?.uploads && "Asset uploads are enabled. Use /uploads for supported images/models and, if audioUploads is enabled, sound effects/music. Poll processing, then insert the asset or create a Sound with the returned asset ID. Read upload instructions and Roblox permission requirements first.",
    status.modules?.gameReferences && "Read /references before building. Research ALL enabled game references using public sources, save cited briefs with POST /references, compare their strengths and adapt original ideas for my game. Do not claim private code access or gameplay you did not observe. The optional reference gate blocks mutations until research is saved.",
    "Read /control before starting and between meaningful steps. When paused=true, acknowledge with POST /control {action:'ackStop',agent:YOUR_NAME}, stop generating/tool calls, and end your turn until I resume. Never bypass Stop. Read the extended chat tool instructions and use the shared room to coordinate.",
    status.features?.mcps && "MCP tools are enabled. Discover servers at /tools, list a server's tool schemas with /tools?server=<id>, and call tools with POST /tools. You can use terminal HTTP calls; native MCP installation is not required.",
    status.features?.skills && "Skills are enabled. List /skills, read relevant skills with /skills?id=<id>, and follow their instructions while using the available commands.",
  ].filter(Boolean).join("\n\n");
  const prompt = `Open ${link} and read it fully. It is a live connection to my Roblox Studio and explains every command you can send.\n\n${extras}\n\nThen build this in my place, checking your work as you go:\n\n[describe the game you want here]`;

  const download = async (format: "rbxmx" | "lua") => {
    setDownloading(true);
    setDownloadError(null);
    try {
      const res = await fetch("/api/plugin/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, origin, format }),
      });
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `StudioLink.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      setDownloadError("The plugin file could not be downloaded. Try again.");
    }
    setDownloading(false);
  };

  const remove = async () => {
    setDeleteError(null);
    try {
      const res = await fetch(`/api/agent/${token}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      forgetConnection(token);
      router.push("/");
    } catch {
      setDeleteError("The connection could not be deleted. Try again.");
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel
        title="1 - Install the plugin in Studio"
        action={
          <StatusPill
            online={status.online}
            label={
              status.online
                ? `Connected${status.placeName ? ` to ${status.placeName}` : ""}`
                : status.lastSeenAt
                  ? `Last seen ${timeAgo(status.lastSeenAt)}`
                  : "Waiting for Studio..."
            }
          />
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={() => download("rbxmx")} disabled={downloading}>
            {downloading ? "Preparing..." : "Download StudioLink.rbxmx"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => download("lua")} disabled={downloading}>
            or as .lua
          </Button>
        </div>
        {downloadError && (
          <div className="mt-3">
            <Notice tone="bad">{downloadError}</Notice>
          </div>
        )}
        <ol className="mt-5 list-decimal space-y-2.5 pl-5 text-sm leading-relaxed text-muted marker:text-signal">
          <li>
            In Roblox Studio open the <strong className="text-text">Plugins</strong> tab and click{" "}
            <strong className="text-text">Plugins Folder</strong>. A folder opens on your computer.
          </li>
          <li>Move the downloaded file into that folder.</li>
          <li>
            Restart Studio and open your place. A <strong className="text-text">Studio Link</strong> panel appears and
            shows <strong className="text-ok">CONNECTED</strong>.
          </li>
          <li>
            If Studio asks whether the plugin may make HTTP requests or edit scripts, choose{" "}
            <strong className="text-text">Allow</strong>. You can review this under Plugins, Manage Plugins.
          </li>
        </ol>
        <p className="mt-4 text-xs leading-relaxed text-dim">
          The file contains a private project key. Do not share it. Studio connects to the app on this computer,
          so changing the public AI tunnel does not require reinstalling the plugin. For a different server,
          change the saved app address in the Studio Link panel. To use another project, paste its AI link
          in that panel and click Save / pair and reconnect. The plugin only runs while editing.
        </p>
      </Panel>

      <Panel title="2 - Give this link to your AI">
        <div className="mb-4"><Notice tone={status.tunnelReady ? undefined : "bad"}>
          {status.tunnelReady ? "Public tunnel running. Your private project link can receive requests from an online AI. Keep this app running." : "Public tunnel is offline. Start the app with npm run dev to connect it. Local links cannot be reached by an online AI."}
        </Notice></div>
        <div className="flex items-center gap-2">
          <input
            readOnly
            aria-label="Agent link"
            value={status.tunnelReady ? link : "Waiting for public tunnel…"}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 rounded-md border border-line bg-ink px-3 py-2 font-mono text-xs text-text focus-visible:outline-2 focus-visible:outline-signal"
          />
          {status.tunnelReady && <CopyButton text={link} label="Copy link" />}
        </div>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          Opening the link gives an AI the full instructions and command list. It works with any AI that can open web
          pages or make HTTP requests. Paste a message like this:
        </p>
        <div className="mt-3 min-w-0 rounded-md border border-line bg-ink p-3">
          <p className="font-mono text-xs leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap text-text">{status.tunnelReady ? prompt : "Your AI instructions will appear when the public tunnel is connected."}</p>
          <div className="mt-3">
            {status.tunnelReady && <CopyButton text={prompt} label="Copy message" />}
          </div>
        </div>
        <div className="mt-4">
          <Notice>
            Anyone who has this link can change the place you have open in Studio. Share it only with an AI you trust.
            Deleting the connection below switches the link off at once.
          </Notice>
        </div>
      </Panel>

      <Panel title="What the AI can and cannot do">
        <ul className="space-y-2 text-sm leading-relaxed text-muted">
          <li>
            <span className="text-ok">Can:</span> read the whole Explorer and every script, create, edit, rename, move,
            clone and delete instances, write scripts and GUIs, insert Creator Store models and decals, run Luau.
          </li>
          <li>
            <span className="text-signal">Needs you:</span> Studio must be open with your place loaded. Publishing the
            game and play testing stay in your hands.
          </li>
          <li>
            <span className="text-signal">Optional:</span> enable uploads in Tools &amp; uploads and connect a Roblox API key to upload new images and models. Enable the room, MCP tools and skills there too.
          </li>
          <li>Every change is one undo step in Studio (Ctrl+Z) and is listed under Activity.</li>
        </ul>
      </Panel>

      <Panel title="Delete connection">
        <p className="text-sm text-muted">
          Removes this connection and its history. The link and the plugin file stop working. Your Roblox place is not
          touched.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {confirmDelete ? (
            <>
              <Button variant="danger" onClick={remove}>
                Yes, delete it
              </Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                Keep it
              </Button>
            </>
          ) : (
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              Delete connection
            </Button>
          )}
        </div>
        {deleteError && (
          <div className="mt-3">
            <Notice tone="bad">{deleteError}</Notice>
          </div>
        )}
      </Panel>
    </div>
  );
}
