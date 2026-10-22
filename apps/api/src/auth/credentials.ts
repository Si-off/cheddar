import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const parameters = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const derive = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, 64, parameters, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const key = await derive(password, salt);
  return `scrypt$32768$8$1$${salt}$${key.toString("base64url")}`;
}
export async function verifyPassword(password: string, hash: string | null) {
  const parts = hash?.split("$");
  // Still perform scrypt for unknown accounts or accounts without a password.
  const valid =
    parts?.length === 6 && parts.slice(0, 4).join("$") === "scrypt$32768$8$1";
  const key = await derive(password, valid ? parts[4] : "cheddar-dummy-salt");
  const expected = Buffer.from(valid ? parts[5] : "", "base64url");
  return expected.length === key.length && timingSafeEqual(expected, key);
}
