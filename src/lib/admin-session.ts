import { cookies } from "next/headers";

import {
  ADMIN_COOKIE_NAME,
  adminSessionValue,
  verifyAdminSession,
} from "./admin-auth";

export async function hasAdminSession() {
  const store = await cookies();
  return verifyAdminSession(store.get(ADMIN_COOKIE_NAME)?.value);
}

export async function requireAdminSession() {
  if (!(await hasAdminSession())) throw new Error("Operação administrativa não autorizada.");
}

export async function setAdminSession() {
  const secret = process.env.ADMIN_TOKEN;
  if (!secret) throw new Error("ADMIN_TOKEN não está configurado.");
  const store = await cookies();
  store.set(ADMIN_COOKIE_NAME, adminSessionValue(secret), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
}

export async function clearAdminSession() {
  const store = await cookies();
  store.delete(ADMIN_COOKIE_NAME);
}
