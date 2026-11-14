"use client";
import { useEffect, useState } from "react";
import { MODULES, modules, type ModuleId } from "@/lib/modules";
import type { FeatureSettings } from "@/lib/features";
import { requestJson } from "@/lib/workspace-client";
import { Notice } from "./ui";
import { Check, Search, ToggleLeft, ToggleRight } from "lucide-react";
export default function FeatureControls({
  token,
  changed,
}: {
  token: string;
  changed: () => void;
}) {
  const [settings, setSettings] = useState<FeatureSettings | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [q, setQ] = useState(""),
    [saved, setSaved] = useState(false);
  useEffect(() => {
    let live = true;
    requestJson<{ settings: FeatureSettings }>(`/api/agent/${token}/features`)
      .then((d) => {
        if (live) setSettings(d.settings);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [token]);
  const save = async (next: FeatureSettings) => {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const d = await requestJson<{ settings: FeatureSettings }>(
        `/api/agent/${token}/features`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ settings: next }),
        },
      );
      setSettings(d.settings);
      setSaved(true);
      changed();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save features.");
    } finally {
      setBusy(false);
    }
  };
  if (!settings)
    return error ? (
      <Notice tone="bad">{error}</Notice>
    ) : (
      <p className="text-muted">Loading feature settings…</p>
    );
  const enabled = modules(settings.modules),
    filtered = MODULES.filter((m) =>
      `${m[1]} ${m[3]}`.toLowerCase().includes(q.toLowerCase()),
    );
  return (
    <div className="feature-settings">
      <div className="mb-6">
        <p className="eyebrow">YOUR WORKSPACE, YOUR RULES</p>
        <h2 className="mt-2 text-2xl font-semibold">
          Make room for your workflow.
        </h2>
        <p className="mt-2 text-sm text-muted">
          Changes are saved to this project. Turning a feature off keeps its
          stored data.
        </p>
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      <div className="mb-5 grid grid-cols-2 gap-3">
        {(
          [
            ["room", "AI communication"],
            ["uploads", "Asset uploads"],
            ["mcps", "MCP connections"],
            ["skills", "Callable skills"],
          ] as const
        ).map(([key, label]) => (
          <button
            role="switch"
            aria-checked={settings[key]}
            key={key}
            disabled={busy}
            className={`feature-master ${settings[key] ? "enabled" : ""}`}
            onClick={() => void save({ ...settings, [key]: !settings[key] })}
          >
            <span>{label}</span>
            {settings[key] ? (
              <ToggleRight size={23} />
            ) : (
              <ToggleLeft size={23} />
            )}
          </button>
        ))}
      </div>
      <label className="search-field mb-5">
        <Search size={16} />
        <input
          aria-label="Search features"
          placeholder="Find a feature…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      <div className="flex items-center justify-between pb-2 text-xs text-muted">
        <span>
          {MODULES.filter((m) => enabled[m[0]]).length} of {MODULES.length}{" "}
          workspace options enabled
        </span>
        {saved && (
          <span className="flex items-center gap-1 text-ok">
            <Check size={13} />
            Saved
          </span>
        )}
      </div>
      {[...new Set(filtered.map((m) => m[2]))].map((group) => (
        <section key={group} className="mb-6">
          <h3 className="eyebrow mb-2 mt-4">{group}</h3>
          {filtered
            .filter((m) => m[2] === group)
            .map(([id, name, , description]) => (
              <label className="feature-row" key={id}>
                <span>
                  <strong>{name}</strong>
                  <small>{description}</small>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={name}
                  checked={enabled[id as ModuleId]}
                  disabled={busy}
                  onChange={(e) =>
                    void save({
                      ...settings,
                      modules: { ...enabled, [id]: e.target.checked },
                    })
                  }
                />
              </label>
            ))}
        </section>
      ))}
    </div>
  );
}
