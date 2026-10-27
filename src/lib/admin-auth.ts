import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE_NAME = "justwork_admin";
const SESSION_MESSAGE = "justwork-local-admin-v1";

export function isAdminConfigured(secret = process.env.ADMIN_TOKEN) {
  return Boolean(secret?.trim());
}

export function adminSessionValue(secret: string) {
  return createHmac("sha256", secret).update(SESSION_MESSAGE).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyAdminToken(candidate: string, secret = process.env.ADMIN_TOKEN) {
  if (!secret) return false;
  return safeEqual(candidate, secret);
}

export function verifyAdminSession(value: string | undefined, secret = process.env.ADMIN_TOKEN) {
  if (!value || !secret) return false;
  return safeEqual(value, adminSessionValue(secret));
}
