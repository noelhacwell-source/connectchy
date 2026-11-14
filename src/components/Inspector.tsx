"use client";

import { useEffect, useState } from "react";
import { formatValue, studio, type InstanceInfo } from "@/lib/client";
import { Button, Notice, inputClass } from "./ui";

type Props = { token: string; path: string; onChanged: (nextPath: string | null) => void };

export default function Inspector({ token, path, onChanged }: Props) {
  const [info, setInfo] = useState<InstanceInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [source, setSource] = useState("");
  const [propName, setPropName] = useState("");
  const [propValue, setPropValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);
  const load = () => setReloadKey((key) => key + 1);

  useEffect(() => {
    let cancelled = false;
    studio<InstanceInfo>(token, "get_instance", { path }).then((res) => {
      if (cancelled) return;
      if (res.ok && res.result) {
        setInfo(res.result);
        setName(res.result.name);
        setSource(res.result.source ?? "");
      } else {
        setError(res.error ?? "Studio could not read this item.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [token, path, reloadKey]);

  /** Send one change to Studio and report the outcome in plain words. */
  const act = async (type: string, payload: object, okText: string, after: (newPath?: string) => void) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await studio<{ path?: string }>(token, type, payload);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Studio rejected the change.");
      return;
    }
    setNotice(okText);
    after(res.result?.path);
  };

  const setProperty = () => {
    let value: unknown = propValue;
    try {
      value = JSON.parse(propValue);
    } catch {
      // Not JSON: send it as plain text (enum names, colors like #ff8800, paths).
    }
    act("set_properties", { path, properties: { [propName.trim()]: value } }, `${propName.trim()} updated.`, () => {
      setPropValue("");
      load();
    });
  };

  if (!info) {
    return (
      <section className="rounded-lg border border-line bg-panel p-5">
        {error ? <Notice tone="bad">{error}</Notice> : <p className="text-sm text-muted">Reading from Studio...</p>}
      </section>
    );
  }

  const properties = Object.entries(info.properties ?? {}).sort(([a], [b]) => a.localeCompare(b));
  const attributes = Object.entries(info.attributes ?? {});
  const tags = Array.isArray(info.tags) ? info.tags : [];
  const isScript = typeof info.source === "string";
  const label = "font-mono text-[11px] font-semibold tracking-[0.14em] text-muted uppercase";

  return (
    <section className="min-w-0 rounded-lg border border-line bg-panel" aria-label={`Inspector for ${info.name}`}>
      <header className="border-b border-line px-5 py-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-xl font-semibold break-all">{info.name}</h2>
          <span className="rounded border border-line px-2 py-0.5 font-mono text-xs text-signal">{info.className}</span>
        </div>
        <p className="mt-1.5 font-mono text-xs break-all text-dim">{info.path}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={() => act("set_selection", { paths: [path] }, "Selected in Studio.", () => {})}>
            Select in Studio
          </Button>
          <Button size="sm" disabled={busy} onClick={() => act("clone", { path }, "Duplicated.", (p) => onChanged(p ?? path))}>
            Duplicate
          </Button>
          {confirmDelete ? (
            <>
              <Button size="sm" variant="danger" disabled={busy} onClick={() => act("delete", { path }, "Deleted.", () => onChanged(null))}>
                Delete {info.childCount > 0 ? `it and ${info.childCount} ${info.childCount === 1 ? "child" : "children"}` : "it"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                Keep it
              </Button>
            </>
          ) : (
            <Button size="sm" variant="danger" disabled={busy} onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          )}
        </div>
        {(error || notice) && (
          <div className="mt-3">
            <Notice tone={error ? "bad" : "ok"}>{error ?? notice}</Notice>
          </div>
        )}
      </header>

      <div className="space-y-6 p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            act("rename", { path, name: name.trim() }, "Renamed.", (p) => onChanged(p ?? path));
          }}
        >
          <label htmlFor="inspector-name" className={label}>
            Name
          </label>
          <div className="mt-1.5 flex gap-2">
            <input id="inspector-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className={inputClass} />
            <Button type="submit" disabled={busy || !name.trim() || name.trim() === info.name}>
              Rename
            </Button>
          </div>
        </form>

        {isScript && (
          <div>
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="inspector-source" className={label}>
                Source - {source.split("\n").length} lines
              </label>
              <Button
                size="sm"
                variant="primary"
                disabled={busy || source === info.source}
                onClick={() => act("set_source", { path, source }, "Script saved in Studio.", () => load())}
              >
                Save script
              </Button>
            </div>
            <textarea
              id="inspector-source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              spellCheck={false}
              wrap="off"
              className={`${inputClass} mt-1.5 min-h-80 resize-y font-mono text-[13px] leading-relaxed`}
            />
          </div>
        )}

        <div>
          <h3 className={label}>Properties</h3>
          {properties.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No common properties to show for this class.</p>
          ) : (
            <dl className="mt-2 divide-y divide-line rounded-md border border-line">
              {properties.map(([key, value]) => (
                <div key={key} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-3 px-3 py-1.5 text-sm">
                  <dt className="truncate text-muted">{key}</dt>
                  <dd className="font-mono text-xs leading-5 break-all text-text">{formatValue(value)}</dd>
                </div>
              ))}
            </dl>
          )}
          <form
            className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              setProperty();
            }}
          >
            <input aria-label="Property name" value={propName} onChange={(e) => setPropName(e.target.value)} placeholder="Property" className={inputClass} />
            <input
              aria-label="New value"
              value={propValue}
              onChange={(e) => setPropValue(e.target.value)}
              placeholder="Value: 0.5, true, [255,120,0], Enum.Material.Neon"
              className={`${inputClass} font-mono`}
            />
            <Button type="submit" disabled={busy || !propName.trim() || propValue === ""}>
              Set
            </Button>
          </form>
        </div>

        {(attributes.length > 0 || tags.length > 0) && (
          <div>
            <h3 className={label}>Attributes and tags</h3>
            <ul className="mt-2 space-y-1 font-mono text-xs text-text">
              {attributes.map(([key, value]) => (
                <li key={key} className="break-all">
                  <span className="text-muted">{key}</span> = {formatValue(value)}
                </li>
              ))}
              {tags.length > 0 && <li className="break-all text-muted">tags: {tags.join(", ")}</li>}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
