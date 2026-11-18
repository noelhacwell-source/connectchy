"use client";
import {
  useMemo,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { Check, ImagePlus, RotateCcw } from "lucide-react";
import { Button, Notice } from "./ui";
const presets = {
  Harbor: "radial-gradient(ellipse at 85% -12%,#294a59,transparent 55%),linear-gradient(155deg,#101e2c,#111c27 62%,#121d26)",
  Dusk: "radial-gradient(ellipse at 90% 2%, #46365d, transparent 60%), linear-gradient(145deg, #18131e, #201928 65%, #17121d)",
  Fjord:
    "radial-gradient(ellipse at 92% 0%,#26495b 0%,transparent 62%),linear-gradient(138deg,#101728,#151724 60%,#0e1520)",
  Aurora:
    "radial-gradient(ellipse at 5% 0%,#344d42,transparent 55%),radial-gradient(ellipse at 100% 95%,#483358,transparent 68%),linear-gradient(#111d26,#141822)",
  Ember:
    "radial-gradient(ellipse at 100% 0%,#613838,transparent 60%),linear-gradient(135deg,#231b28,#1a1720 65%,#2f2524)",
  Midnight: "linear-gradient(140deg,#091222,#18223b 65%,#16182a)",
  Graphite: "linear-gradient(135deg,#22252a,#111216)",
};
const fonts = {
  System: 'Inter, "Segoe UI", system-ui, sans-serif',
  Sans: "Arial, sans-serif",
  Serif: "Georgia, serif",
  Monospace: "Consolas, monospace",
};
const colorFields = [
  { key: "background", label: "Canvas color", fallback: "#18131e" },
  { key: "sidebar", label: "Sidebar color", fallback: "#1a1721" },
  { key: "bar", label: "Toolbar color", fallback: "#16131d" },
  { key: "panel", label: "Panel color", fallback: "#201c2a" },
  { key: "text", label: "Text color", fallback: "#f1edf7" },
  { key: "muted", label: "Secondary text color", fallback: "#bcafc9" },
  { key: "border", label: "Border color", fallback: "#42364c" },
] as const;
type SurfaceColors = Partial<
  Record<(typeof colorFields)[number]["key"], string>
>;
type Appearance = {
  preset: keyof typeof presets;
  image: string;
  dim: number;
  position: string;
  fit: string;
  accent: string;
  pattern: string;
  fontSize: number;
  font: keyof typeof fonts;
  radius: number | null;
  colors: SurfaceColors;
};
const defaults: Appearance = {
  preset: "Harbor",
  image: "",
  dim: 35,
  position: "center",
  fit: "cover",
  accent: "#9de5dc",
  pattern: "none",
  fontSize: 14,
  font: "System",
  radius: null,
  colors: {},
};
function subscribeAppearance(fn: () => void) {
  window.addEventListener("storage", fn);
  window.addEventListener("studio-appearance", fn);
  return () => {
    window.removeEventListener("storage", fn);
    window.removeEventListener("studio-appearance", fn);
  };
}
export function useAppearance(token: string) {
  const key = "studio-appearance:" + token,
    [error, setError] = useState("");
  const raw = useSyncExternalStore(
    subscribeAppearance,
    () => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    () => null,
  );
  const value = useMemo<Appearance>(() => {
    try {
      return { ...defaults, ...JSON.parse(raw || "{}") };
    } catch {
      return defaults;
    }
  }, [raw]);
  function update(next: Appearance) {
    try {
      localStorage.setItem(key, JSON.stringify(next));
      window.dispatchEvent(new Event("studio-appearance"));
      setError("");
    } catch {
      setError("Browser storage is full. Choose a smaller wallpaper.");
    }
  }
  const image = value.image.startsWith("data:image/")
    ? 'url("' + value.image + '")'
    : value.colors.background
      ? `linear-gradient(${value.colors.background}, ${value.colors.background})`
      : presets[value.preset] || presets.Fjord;
  const pattern =
    value.pattern === "dots"
      ? "radial-gradient(#c2e9ec22 1px, transparent 1px),"
      : value.pattern === "grid"
        ? "linear-gradient(#d8ecff0b 1px,transparent 1px),linear-gradient(90deg,#d8ecff0b 1px,transparent 1px),"
        : "";
  const style = {
    "--studio-backdrop":
      pattern +
      "linear-gradient(rgb(7 12 20 / " +
      value.dim +
      "%),rgb(7 12 20 / " +
      value.dim +
      "%))," +
      image,
    "--studio-size":
      (value.pattern === "dots"
        ? "18px 18px,"
        : value.pattern === "grid"
          ? "32px 32px,32px 32px,"
          : "") +
      "cover," +
      value.fit,
    "--studio-position": value.position,
    "--color-signal": value.accent,
    "--studio-chat-size": value.fontSize + "px",
    "--custom-font": fonts[value.font] ?? fonts.System,
    "--custom-radius": value.radius === null ? undefined : value.radius + "px",
    "--theme-sidebar": value.colors.sidebar,
    "--theme-toolbar": value.colors.bar,
    "--theme-panel": value.colors.panel,
    "--theme-text": value.colors.text,
    "--theme-muted": value.colors.muted,
    "--theme-border": value.colors.border,
    "--color-panel": value.colors.panel,
    "--color-line": value.colors.border,
    "--color-text": value.colors.text,
    "--color-muted": value.colors.muted,
    "--color-dim": value.colors.muted,
  } as CSSProperties;
  const attributes = {
    "data-theme-panel": value.colors.panel ? "custom" : undefined,
    "data-theme-border": value.colors.border ? "custom" : undefined,
    "data-theme-text": value.colors.text ? "custom" : undefined,
    "data-theme-muted": value.colors.muted ? "custom" : undefined,
    "data-theme-radius": value.radius === null ? undefined : "custom",
  };
  return { value, update, style, attributes, error, setError };
}
export function AppearancePanel({
  prefs,
}: {
  prefs: ReturnType<typeof useAppearance>;
}) {
  const { value, update, error, setError } = prefs;
  const change = (patch: Partial<Appearance>) => update({ ...value, ...patch });
  return (
    <div className="studio-directory">
      <header>
        <h2>Appearance</h2>
        <p>Theme changes are saved in this browser.</p>
      </header>
      <div className="studio-swatches">
        {(Object.entries(presets) as [keyof typeof presets, string][]).map(
          ([name, bg]) => (
            <button
              key={name}
              aria-pressed={
                name === value.preset &&
                !value.image &&
                !value.colors.background
              }
              style={{ background: bg }}
              onClick={() =>
                change({
                  preset: name,
                  image: "",
                  colors: { ...value.colors, background: undefined },
                })
              }
            >
              <span>{name}</span>
              {name === value.preset &&
                !value.image &&
                !value.colors.background && <Check size={15} />}
            </button>
          ),
        )}
      </div>
      <div className="studio-form">
        <label className="studio-wall-upload">
          <ImagePlus size={17} />
          Upload wallpaper
          <input
            aria-label="Upload wallpaper"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                if (
                  !["image/png", "image/jpeg", "image/webp"].includes(
                    file.type,
                  ) ||
                  file.size > 16 * 1024 * 1024
                )
                  throw new Error("Choose a PNG, JPEG or WebP under 16 MiB.");
                const bmp = await createImageBitmap(file),
                  scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)),
                  c = document.createElement("canvas");
                c.width = Math.max(1, Math.round(bmp.width * scale));
                c.height = Math.max(1, Math.round(bmp.height * scale));
                const ctx = c.getContext("2d");
                if (!ctx) throw new Error("Could not read image.");
                ctx.drawImage(bmp, 0, 0, c.width, c.height);
                bmp.close();
                change({ image: c.toDataURL("image/jpeg", 0.76) });
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Could not load image.",
                );
              }
            }}
          />
        </label>
        {value.image && (
          <Button size="sm" onClick={() => change({ image: "" })}>
            Remove wallpaper
          </Button>
        )}
        <label className="field-label">
          Background dimming · {value.dim}%
          <input
            type="range"
            min={0}
            max={90}
            value={value.dim}
            onChange={(e) => change({ dim: Number(e.target.value) })}
          />
        </label>
        <div className="studio-form-grid">
          {(
            [
              ["Pattern", "pattern", ["none", "dots", "grid"]],
              [
                "Image position",
                "position",
                ["center", "top", "bottom", "left", "right"],
              ],
              ["Image fit", "fit", ["cover", "contain"]],
            ] as const
          ).map(([label, key, opts]) => (
            <label key={key} className="field-label">
              {label}
              <select
                className="workspace-input"
                value={value[key]}
                onChange={(e) => change({ [key]: e.target.value })}
              >
                {opts.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </label>
          ))}
          <label className="field-label">
            Accent color
            <input
              type="color"
              value={value.accent}
              onChange={(e) => change({ accent: e.target.value })}
            />
          </label>
        </div>
        <label className="field-label">
          Message size · {value.fontSize}px
          <input
            type="range"
            min={12}
            max={21}
            value={value.fontSize}
            onChange={(e) => change({ fontSize: Number(e.target.value) })}
          />
        </label>
        <div className="customize-fields">
          <label className="field-label">
            Interface font
            <select
              className="workspace-input"
                aria-label="Interface font"
              value={value.font}
              onChange={(event) =>
                change({ font: event.target.value as keyof typeof fonts })
              }
            >
              {Object.keys(fonts).map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Corner radius · {value.radius ?? "Default"}
            <input
              type="range"
              min={0}
              max={32}
              step={1}
              value={value.radius ?? 12}
              onChange={(event) =>
                change({ radius: Number(event.target.value) })
              }
            />
          </label>
        </div>
        <details className="customize-colors">
          <summary>Surface and text colors</summary>
          <div className="customize-fields">
            {colorFields.map(({ key, label, fallback }) => (
              <div className="customize-color" key={key}>
                <label className="field-label">
                  {label}
                  <input
                    type="color"
                    value={value.colors[key] ?? fallback}
                    onChange={(event) =>
                      change({
                        colors: { ...value.colors, [key]: event.target.value },
                        ...(key === "background" ? { image: "" } : {}),
                      })
                    }
                  />
                </label>
                {value.colors[key] && (
                  <button
                    className="studio-inline"
                    onClick={() =>
                      change({ colors: { ...value.colors, [key]: undefined } })
                    }
                  >
                    Default
                  </button>
                )}
              </div>
            ))}
          </div>
        </details>
        <Button size="sm" onClick={() => update(defaults)}>
          <RotateCcw size={14} />
          Reset appearance
        </Button>
        {error && <Notice tone="bad">{error}</Notice>}
      </div>
    </div>
  );
}
