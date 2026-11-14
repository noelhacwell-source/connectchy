import { modules } from "@/lib/modules";
import type { Connection } from "@/db/schema";
import { ensureActiveRoom } from "@/lib/project-rooms";
import { changesStudio } from "@/lib/room-coordination";
export async function protectionError(
  conn: Connection,
  agent: unknown,
  type: string,
  payload: unknown,
): Promise<string | null> {
  if (
    !modules(conn.features.modules).protectedPaths ||
    !changesStudio(type, payload)
  )
    return null;
  const room = await ensureActiveRoom(conn.id),
    person = room.team.participants.find(
      (p) => p.agent.toLowerCase() === String(agent).toLowerCase(),
    );
  if (!person)
    return "Protected paths require a registered agent and assigned paths.";
  const owns = (path: unknown) =>
    typeof path === "string" &&
    person.paths.some(
      (scope) => path === scope || path.startsWith(scope + "/"),
    );
  const inspect = (command: string, value: unknown): string | null => {
    const p = (value ?? {}) as Record<string, unknown>;
    if (["run_luau", "undo", "redo"].includes(command))
      return "Protected paths block AI Luau and global undo/redo. Ask the owner to perform a reviewed action.";
    if (command === "batch") {
      if (!Array.isArray(p.commands)) return "Invalid batch.";
      for (const child of p.commands) {
        if (!child || typeof child.type !== "string")
          return "Invalid batch item.";
        const error = inspect(child.type, child.payload);
        if (error) return error;
      }
      return null;
    }
    if (!changesStudio(command, p) || command === "set_selection") return null;
    const properties = p.properties as Record<string, unknown> | undefined;
    if (properties && "Parent" in properties)
      return "Use move for parenting; Parent properties are blocked in protected paths.";
    const targets: unknown[] = [];
    if (["create_instance", "create_script"].includes(command))
      targets.push(p.name ? `${p.parent}/${p.name}` : p.parent);
    else if (command === "insert_asset") targets.push(p.parent ?? "Workspace");
    else if (command === "clone")
      targets.push(
        `${p.parent ?? String(p.path).split("/").slice(0, -1).join("/")}/${p.name ?? String(p.path).split("/").at(-1)}`,
      );
    else if (command === "move")
      targets.push(p.path, `${p.parent}/${String(p.path).split("/").at(-1)}`);
    else if (command === "rename")
      targets.push(
        p.path,
        `${String(p.path).split("/").slice(0, -1).join("/")}/${p.name}`,
      );
    else targets.push(p.path);
    if (targets.some((path) => !owns(path)))
      return `Edit leaves ${person.agent}'s assigned paths: ${person.paths.join(", ")}. Coordinate a role update.`;
    if (Array.isArray(p.children))
      for (const child of p.children) {
        const error = inspect("create_instance", {
          ...child,
          parent: p.name ? `${p.parent}/${p.name}` : p.parent,
        });
        if (error) return error;
      }
    return null;
  };
  return inspect(type, payload);
}
