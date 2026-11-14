import { findByToken } from "@/lib/bridge";
import { ApiError } from "@/lib/http-utils";
import { featureSettings } from "@/lib/features";
import { unseal } from "@/lib/secrets";
export type Context = { params: Promise<{ token: string }> };
export async function project(ctx: Context) {
  const { token } = await ctx.params;
  const conn = await findByToken(token);
  if (!conn) throw new ApiError(404, "Connection not found.");
  return { conn, settings: featureSettings(conn.features) };
}
export function credentials(encrypted: string | null): { robloxKey?: string; tokens?: Record<string, string> } {
  return encrypted ? JSON.parse(unseal(encrypted)) : {};
}
