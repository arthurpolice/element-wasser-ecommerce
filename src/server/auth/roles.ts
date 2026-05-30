export const USER_ROLES = ["customer", "owner"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export function isOwnerRole(role: string | undefined | null): role is "owner" {
  return role === "owner";
}
