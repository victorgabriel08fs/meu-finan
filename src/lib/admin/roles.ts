// Roles of an account (doc 01 §11.9). Stored by Better Auth's admin plugin in
// user.role, a text column that may hold a comma-separated list; this app only
// writes "admin" or "user", and a missing value means "user".

export const USER_ROLES = ["admin", "user"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ADMIN_ROLE: UserRole = "admin";

/** True when the stored role (or role list) includes "admin". */
export function hasAdminRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return role.split(",").some((part) => part.trim() === ADMIN_ROLE);
}

/** The stored role as one of USER_ROLES. */
export function toUserRole(role: string | null | undefined): UserRole {
  return hasAdminRole(role) ? "admin" : "user";
}
