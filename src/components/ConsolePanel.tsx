"use client";

import { useState, type KeyboardEvent } from "react";
import { studio, type CmdResult } from "@/lib/client";
import { COMMAND_DOCS } from "@/lib/command-docs";
import { Button, JsonView, Notice, Panel, inputClass } from "./ui";
import PlaytestPanel from "./PlaytestPanel";

const GROUPS = ["Read", "Build", "Scripts", "Assets", "Control"] as const;
const STARTER = "-- Runs inside Studio with the full plugin API.\n-- Whatever you return or print comes back here.\nreturn #workspace:GetDescendants()";

export default function ConsolePanel({ token, online }: { token: string; online: boolean }) {
  const [mode, setMode] = useState<"luau" | "command">("luau");
  const [code, setCode] = useState(STARTER);
  const [type, setType] = useState(COMMAND_DOCS[0].type);
  const [payload, setPayload] = useState(JSON.stringify(COMMAND_DOCS[0].example, null, 2));
  const [busy, setBusy] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const [output, setOutput] = useState<CmdResult | null>(null);

  const doc = COMMAND_DOCS.find((c) => c.type === type) ?? COMMAND_DOCS[0];

  const run = async () => {
    if (busy) return;
    setInputError(null);
    let commandType = "run_luau";
    let body: object = { code };
    if (mode === "command") {
      try {
        const parsed: unknown = JSON.parse(payload || "{}");
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
        commandType = type;
        body = parsed;
      } catch {
        setInputError('The payload is not valid JSON. It must be an object, for example {"path": "Workspace"}.');
        return;
      }
    }
    setBusy(true);
    setOutput(await studio(token, commandType, body));
    setBusy(false);
  };

  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      run();
    }
  };

  const pick = (next: string) => {
    setType(next);
    const found = COMMAND_DOCS.find((c) => c.type === next);
    if (found) setPayload(JSON.stringify(found.example, null, 2));
  };

  const textareaClass = `${inputClass} min-h-56 resize-y font-mono text-[13px] leading-relaxed`;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="lg:col-span-2"><PlaytestPanel/></div>
      <Panel
        title="Send to Studio"
        action={
          <div className="flex rounded-md border border-line p-0.5" role="group" aria-label="Input mode">
            {(["luau", "command"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={`h-7 rounded px-3 text-xs font-medium focus-visible:outline-2 focus-visible:outline-signal ${
                  mode === m ? "bg-raised text-text" : "text-muted hover:text-text"
                }`}
              >
                {m === "luau" ? "Luau code" : "Command"}
              </button>
            ))}
          </div>
        }
      >
        {mode === "luau" ? (
          <>
            <label htmlFor="console-code" className="sr-only">
              Luau code
            </label>
            <textarea
              id="console-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={onKey}
              spellCheck={false}
              className={textareaClass}
            />
          </>
        ) : (
          <>
            <label htmlFor="console-type" className="block text-sm text-muted">
              Command
            </label>
            <select id="console-type" value={type} onChange={(e) => pick(e.target.value)} className={`${inputClass} mt-1.5`}>
              {GROUPS.map((group) => (
                <optgroup key={group} label={group}>
                  {COMMAND_DOCS.filter((c) => c.group === group).map((c) => (
                    <option key={c.type} value={c.type}>
                      {c.type}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <p className="mt-2 text-sm text-muted">{doc.summary}</p>
            <p className="mt-1 font-mono text-xs break-words text-dim">{doc.payload}</p>
            <label htmlFor="console-payload" className="mt-4 block text-sm text-muted">
              Payload (JSON)
            </label>
            <textarea
              id="console-payload"
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              onKeyDown={onKey}
              spellCheck={false}
              className={`${textareaClass} mt-1.5`}
            />
          </>
        )}
        {inputError && (
          <div className="mt-3">
            <Notice tone="bad">{inputError}</Notice>
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={run} disabled={busy || !online}>
            {busy ? "Running in Studio..." : "Run in Studio"}
          </Button>
          <span className="text-xs text-dim">{online ? "Ctrl / Cmd + Enter" : "Studio is offline. Open Studio to run commands."}</span>
        </div>
      </Panel>

      <Panel title="Result" action={output&&<Button size="sm" onClick={()=>setOutput(null)}>Clear output</Button>}>
        {busy ? (
          <p className="text-sm text-muted">Waiting for Studio...</p>
        ) : !output ? (
          <p className="text-sm text-muted">
            Run something to see Studio&apos;s answer. This is the same channel your AI uses, so it is a quick way to
            check that the connection works.
          </p>
        ) : output.ok ? (
          <>
            <p className="mb-2 text-xs text-ok">
              Done{typeof output.ms === "number" ? ` in ${output.ms} ms` : ""}
            </p>
            <JsonView value={output.result ?? "No return value."} className="max-h-[28rem]" />
          </>
        ) : (
          <Notice tone="bad">{output.error ?? "The command failed without a message."}</Notice>
        )}
      </Panel>
    </div>
  );
}
