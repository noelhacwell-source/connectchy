"use client";

/** Deterministic two-letter avatar for a room participant. */
export function AgentAvatar({
  name,
  size = "md",
}: {
  name: string;
  size?: "sm" | "md";
}) {
  let hue = 0;
  for (const c of name) hue = (hue * 31 + c.charCodeAt(0)) % 360;
  return (
    <span
      className={`agent-avatar ${size}`}
      style={{
        background: `hsl(${hue} 28% 20%)`,
        color: `hsl(${hue} 65% 78%)`,
      }}
    >
      {name === "Owner" ? "Y" : name.slice(0, 2).toUpperCase()}
    </span>
  );
}
