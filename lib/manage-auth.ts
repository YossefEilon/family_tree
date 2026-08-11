import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "family_manage_access";
const MAX_AGE_SECONDS = 60 * 60 * 8;

function secret() {
  return process.env.AUTH_SECRET || process.env.MANAGE_PASSWORD || "";
}

function signature(timestamp: string) {
  return createHmac("sha256", secret()).update(timestamp).digest("hex");
}

export function createManageToken() {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  return `${timestamp}.${signature(timestamp)}`;
}

export function isValidManageToken(token: string | undefined) {
  if (!token || !secret()) return false;
  const [timestamp, providedSignature] = token.split(".");
  const issuedAt = Number(timestamp);
  if (!timestamp || !providedSignature || !Number.isInteger(issuedAt) || Math.floor(Date.now() / 1000) - issuedAt > MAX_AGE_SECONDS) return false;
  const expectedSignature = signature(timestamp);
  if (providedSignature.length !== expectedSignature.length) return false;
  return timingSafeEqual(Buffer.from(providedSignature), Buffer.from(expectedSignature));
}

export async function hasManageAccess() {
  return isValidManageToken((await cookies()).get(COOKIE_NAME)?.value);
}

export { COOKIE_NAME, MAX_AGE_SECONDS };
