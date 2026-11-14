import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
function key() {
  const dir = path.join(process.cwd(), ".local-runtime");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "credential-key");
  try { return readFileSync(file); } catch {
    try { writeFileSync(file, randomBytes(32), { flag: "wx", mode: 0o600 }); } catch { /* Another request created it. */ }
    return readFileSync(file);
  }
}
export function seal(value: string) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(), iv);
  const content = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), content]).toString("base64");
}
export function unseal(value: string | null | undefined): string {
  if (!value) return "";
  const b = Buffer.from(value, "base64"), decipher = createDecipheriv("aes-256-gcm", key(), b.subarray(0, 12));
  decipher.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([decipher.update(b.subarray(28)), decipher.final()]).toString("utf8");
}
