import { cookies } from "next/headers";
import { jwtVerify } from "jose";

export type AccountRole = "staff" | "manager" | "admin";

export type SessionClaims = {
  userId: string;
  email: string;
  role: AccountRole;
  organisationID: string | null;
  staffID: string | null;
};

const DEFAULT_SECRET = "your-secret-key-change-in-production";

function getJwtSecret() {
  return process.env.JWT_SECRET || DEFAULT_SECRET;
}

export async function getSessionClaimsFromCookies(): Promise<SessionClaims | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth-token")?.value;
  if (!token) return null;

  try {
    const secret = new TextEncoder().encode(getJwtSecret());
    const { payload } = await jwtVerify(token, secret);

    const role = String(payload?.role || "staff").toLowerCase();
    const normalisedRole: AccountRole = role === "admin" ? "admin" : role === "manager" ? "manager" : "staff";

    return {
      userId: String(payload?.userId || ""),
      email: String(payload?.email || ""),
      role: normalisedRole,
      organisationID: payload?.organisationID ? String(payload.organisationID) : null,
      staffID: payload?.staffID ? String(payload.staffID) : null,
    };
  } catch {
    return null;
  }
}

export function canManageSchedules(role: AccountRole) {
  return role === "manager" || role === "admin";
}

export function isAdmin(role: AccountRole) {
  return role === "admin";
}
