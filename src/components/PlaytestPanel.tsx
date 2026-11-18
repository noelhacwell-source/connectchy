"use client";
import { Panel } from "./ui";

export default function PlaytestPanel() {
  return <Panel title="AI playtesting">
    <div className="flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/playtest.svg" alt="" width={40} height={40}/>
      <p className="text-sm text-muted">Your AI can now run timed Play and Run tests through the Studio plugin, check server behavior, and read output and test results. Keep Studio connected with plugin 1.3.0 or newer. Ask your AI to playtest your game in the conversation.</p>
    </div>
  </Panel>;
}
