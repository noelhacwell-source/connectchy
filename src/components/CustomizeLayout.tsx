"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, RotateCcw } from "lucide-react";
import {
  DEFAULT_LAYOUT,
  HOME_SECTIONS,
  NAV_SECTIONS,
  SIDEBAR_SECTIONS,
  VIDEO_SECTIONS,
  WORKSPACE_TOOLBAR,
  orderedItems,
  parseLayout,
  type LayoutSettings,
} from "@/lib/layout-settings";
import { downloadText } from "@/lib/workspace-client";
import { Button, Notice } from "./ui";

type Item = { id: string; label: string; group?: string };
type OrderKey =
  "sections" | "navigation" | "rooms" | "toolbar" | "home" | "video";

function Arrange({
  items,
  field,
  layout,
  update,
  moveBetweenGroups,
}: {
  items: readonly Item[];
  field: OrderKey;
  layout: LayoutSettings;
  update: (patch: Partial<LayoutSettings>) => void;
  moveBetweenGroups?: boolean;
}) {
  const dragging = useRef<string | null>(null);
  const rows = orderedItems(items, layout[field]);
  function move(id: string, destination: number) {
    const order = rows.map((row) => row.id);
    const source = order.indexOf(id);
    if (
      source < 0 ||
      destination < 0 ||
      destination >= order.length ||
      source === destination
    )
      return;
    order.splice(source, 1);
    order.splice(destination, 0, id);
    update(
      field === "home"
        ? { home: order, homeColumns: "stacked" }
        : { [field]: order },
    );
  }
  return (
    <ul className="customize-order">
      {rows.map((row, index) => {
        const name = layout.labels[row.id] || row.label;
        const visible = !layout.hidden.includes(row.id);
        return (
          <li
            key={row.id}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (dragging.current) move(dragging.current, index);
              dragging.current = null;
            }}
          >
            <span
              className="customize-grip"
              draggable
              title={`Drag ${name}`}
              onDragStart={(event) => {
                dragging.current = row.id;
                event.dataTransfer.setData("text/plain", row.id);
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={() => {
                dragging.current = null;
              }}
            >
              <GripVertical size={17} />
            </span>
            <input
              className="workspace-input customize-name"
              aria-label={`Label for ${row.label}`}
              maxLength={50}
              value={layout.labels[row.id] ?? ""}
              placeholder={row.label}
              onChange={(event) =>
                update({
                  labels: { ...layout.labels, [row.id]: event.target.value },
                })
              }
            />
            {moveBetweenGroups && (
              <select
                className="workspace-input customize-group"
                aria-label={`Group for ${row.label}`}
                value={layout.placements[row.id] ?? row.group}
                onChange={(event) =>
                  update({
                    placements: {
                      ...layout.placements,
                      [row.id]: event.target.value,
                    },
                  })
                }
              >
                {NAV_SECTIONS.map((section) => (
                  <option key={section.id} value={section.id}>
                    {layout.labels[section.id] || section.label}
                  </option>
                ))}
              </select>
            )}
            <div className="customize-row-actions">
              <label>
                <input
                  type="checkbox"
                  checked={visible}
                  aria-label={`Show ${row.label}`}
                  onChange={(event) =>
                    update({
                      hidden: event.target.checked
                        ? layout.hidden.filter((id) => id !== row.id)
                        : [...layout.hidden, row.id],
                    })
                  }
                />{" "}
                Show
              </label>
              <button
                className="icon-button"
                aria-label={`Move ${row.label} up`}
                disabled={index === 0}
                onClick={() => move(row.id, index - 1)}
              >
                <ArrowUp size={15} />
              </button>
              <button
                className="icon-button"
                aria-label={`Move ${row.label} down`}
                disabled={index === rows.length - 1}
                onClick={() => move(row.id, index + 1)}
              >
                <ArrowDown size={15} />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const sides = ["left", "right"] as const;
const vertical = ["top", "bottom"] as const;
const visibility = ["automatic", "open", "closed"] as const;
const density = ["compact", "comfortable", "spacious"] as const;
export default function CustomizeLayout({
  layout,
  update,
  error,
  navigation,
  rooms,
}: {
  layout: LayoutSettings;
  update: (patch: Partial<LayoutSettings>) => void;
  error: string;
  navigation?: Item[];
  rooms?: Item[];
}) {
  const [importError, setImportError] = useState("");
  function select<K extends keyof LayoutSettings>(
    key: K,
    label: string,
    options: readonly (LayoutSettings[K] & string)[],
  ) {
    return (
      <label className="field-label">
        {label}
        <select
          className="workspace-input"
          aria-label={label}
          value={String(layout[key])}
          onChange={(event) => update({ [key]: event.target.value })}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }
  function range(
    key: "sidebarWidth" | "agentPanelWidth" | "contentWidth" | "videoColumns",
    label: string,
    min: number,
    max: number,
    step: number,
  ) {
    return (
      <label className="field-label">
        {label} · {layout[key]}
        {key === "videoColumns" ? "" : " px"}
        <input
          type="range"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={layout[key]}
          onChange={(event) => update({ [key]: Number(event.target.value) })}
        />
      </label>
    );
  }
  const workspace = !!navigation;
  return (
    <section className="customize-layout">
      <header>
        <h2>{workspace ? "Workspace layout" : "Home layout"}</h2>
        <p>
          Drag rows or use the arrows to move them. Changes are saved in this
          browser.
        </p>
      </header>
      <div className="customize-fields">
        <label className="field-label"><span>Individual buttons</span><span><input type="checkbox" checked={layout.buttonEditing} onChange={e=>update({buttonEditing:e.target.checked})}/> Edit with Alt + click</span></label>
        <Button onClick={()=>update({buttons:{}})}>Reset button styles</Button>
        {select("density", "Interface density", density)}
        {range("contentWidth", "Content width", 680, 1800, 10)}
        <label className="customize-motion">
          <input
            type="checkbox"
            checked={layout.motion}
            onChange={(event) => update({ motion: event.target.checked })}
          />{" "}
          Animate interface
        </label>
        {workspace ? (
          <>
            {select("sidebarSide", "Sidebar side", sides)}
            {range("sidebarWidth", "Sidebar width", 180, 410, 1)}
            {select("sidebarDefault", "Sidebar at start", visibility)}
            {select("agentPanelSide", "Agent panel side", sides)}
            {range("agentPanelWidth", "Agent panel width", 230, 460, 1)}
            {select("agentPanelDefault", "Agent panel at start", visibility)}
            {select("toolbarSide", "Toolbar position", vertical)}
            {select("composerSide", "Message composer position", vertical)}
            {range("videoColumns", "Video grid columns", 1, 5, 1)}
          </>
        ) : (
          <>
            {select("homeColumns", "Home arrangement", ["columns", "stacked"])}
            {select("homeFormSide", "Forms side", sides)}
            {select("homeSort", "Workspace order", [
              "recent",
              "name",
              "editor",
            ])}
          </>
        )}
      </div>
      {workspace ? (
        <>
          <details open>
            <summary>Sidebar sections</summary>
            <Arrange
              items={SIDEBAR_SECTIONS}
              field="sections"
              layout={layout}
              update={update}
            />
          </details>
          <details>
            <summary>Navigation tabs</summary>
            <Arrange
              items={navigation}
              field="navigation"
              layout={layout}
              update={update}
              moveBetweenGroups
            />
          </details>
          <details>
            <summary>Room shortcuts</summary>
            {rooms?.length ? (
              <Arrange
                items={rooms}
                field="rooms"
                layout={layout}
                update={update}
              />
            ) : (
              <p className="text-muted">
                Create a room to arrange its shortcut.
              </p>
            )}
          </details>
          <details>
            <summary>Toolbar blocks</summary>
            <Arrange
              items={WORKSPACE_TOOLBAR}
              field="toolbar"
              layout={layout}
              update={update}
            />
          </details>
          <details>
            <summary>Videos panels</summary>
            <Arrange
              items={VIDEO_SECTIONS}
              field="video"
              layout={layout}
              update={update}
            />
          </details>
        </>
      ) : (
        <details open>
          <summary>Home sections</summary>
          <Arrange
            items={HOME_SECTIONS}
            field="home"
            layout={layout}
            update={update}
          />
        </details>
      )}
      <div className="record-actions">
        <Button
          size="sm"
          onClick={() =>
            downloadText(
              "connectchy-layout.json",
              JSON.stringify(layout, null, 2),
              "application/json",
            )
          }
        >
          Export layout
        </Button>
        <label className="studio-inline customize-import">
          Import layout
          <input
            type="file"
            accept=".json,application/json"
            aria-label="Import layout"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              try {
                if (file.size > 100_000)
                  throw new Error("Layout files must be under 100 KB.");
                const next = parseLayout(JSON.parse(await file.text()));
                if (!next)
                  throw new Error("This file does not contain a valid layout.");
                update(next);
                setImportError("");
              } catch (e) {
                setImportError(
                  e instanceof Error ? e.message : "Could not import layout.",
                );
              }
            }}
          />
        </label>
        <Button
          size="sm"
          onClick={() => {
            update(DEFAULT_LAYOUT);
            setImportError("");
          }}
        >
          <RotateCcw size={14} />
          Reset layout
        </Button>
      </div>
      {(error || importError) && (
        <Notice tone="bad">{error || importError}</Notice>
      )}
    </section>
  );
}
