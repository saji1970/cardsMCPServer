import type { User, Role } from "../types/rbac";

const users = new Map<string, User>();
const passwords = new Map<string, string>();

function seed(userId: string, displayName: string, email: string, roles: Role[], password?: string): void {
  const now = new Date().toISOString();
  users.set(userId, { userId, displayName, email, roles, active: true, createdAt: now, lastActiveAt: now });
  if (password) passwords.set(userId, password);
}

// Demo users seeded on import
seed("admin", "Administrator", "admin@example.com", ["admin"], "admin@123");
seed("demo-user", "Demo Consumer", "demo@example.com", ["consumer"], "demo");
seed("admin-user", "Admin", "admin@example.com", ["admin"], "admin@123");
seed("ops-user", "Ops Engineer", "ops@example.com", ["operations"], "ops");
seed("finance-user", "Finance Analyst", "finance@example.com", ["finance"], "finance");
seed("support-user", "Support Agent", "support@example.com", ["support"], "support");
seed("publisher-user", "Publisher", "publisher@example.com", ["publisher"], "publisher");
seed("default-user", "Default User", "default@example.com", ["consumer"], "demo");

export const userStore = {
  get(userId: string): User | undefined {
    return users.get(userId);
  },

  list(): User[] {
    return Array.from(users.values());
  },

  create(data: { userId: string; displayName: string; email: string; roles: Role[] }): User {
    if (users.has(data.userId)) {
      throw new Error(`User ${data.userId} already exists`);
    }
    const now = new Date().toISOString();
    const user: User = { ...data, active: true, createdAt: now, lastActiveAt: now };
    users.set(data.userId, user);
    return user;
  },

  update(userId: string, patch: Partial<Pick<User, "displayName" | "email" | "roles" | "active">>): User {
    const existing = users.get(userId);
    if (!existing) throw new Error(`User ${userId} not found`);
    const updated: User = { ...existing, ...patch };
    users.set(userId, updated);
    return updated;
  },

  touchLastActive(userId: string): void {
    const existing = users.get(userId);
    if (existing) {
      existing.lastActiveAt = new Date().toISOString();
    }
  },

  verifyPassword(userId: string, password: string): boolean {
    const stored = passwords.get(userId);
    if (!stored) return false;
    return stored === password;
  },

  setPassword(userId: string, password: string): void {
    passwords.set(userId, password);
  },
};
