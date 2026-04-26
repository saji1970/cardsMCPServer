import { randomUUID } from "node:crypto";
import type { Permission, UserContext, AuditEntry } from "../types/rbac";
import { expandPermissions } from "../data/permission-matrix";
import { userStore } from "../data/user-store";
import { config } from "../config/env";

const AUDIT_MAX = 5000;
const auditLog: AuditEntry[] = [];

export class EntitlementError extends Error {
  constructor(
    public readonly userId: string,
    public readonly permission: string,
  ) {
    super(`Access denied: user "${userId}" lacks permission "${permission}"`);
    this.name = "EntitlementError";
  }
}

export const entitlementService = {
  /**
   * Resolve a userId into a UserContext. Returns an anonymous (no-permission)
   * context if the user is unknown or inactive.
   */
  resolveContext(userId: string): UserContext {
    const user = userStore.get(userId);
    if (!user || !user.active) {
      return { userId, roles: [], permissions: new Set() };
    }
    userStore.touchLastActive(userId);
    return {
      userId: user.userId,
      roles: [...user.roles],
      permissions: expandPermissions(user.roles),
    };
  },

  /**
   * Check whether context has an exact permission, with wildcard support
   * for `tool:ext_*` — any tool starting with `ext_` is covered.
   */
  hasPermission(ctx: UserContext, permission: Permission | string): boolean {
    if (!config.rbacEnabled) return true;
    if (ctx.permissions.has(permission as Permission)) return true;
    // Wildcard: ext_* tools are covered by the "tool:ext_*" permission
    if (permission.startsWith("tool:ext_") && ctx.permissions.has("tool:ext_*" as Permission)) {
      return true;
    }
    return false;
  },

  /**
   * Assert permission, throwing EntitlementError on denial.
   */
  assertPermission(ctx: UserContext, permission: Permission | string): void {
    if (!entitlementService.hasPermission(ctx, permission)) {
      throw new EntitlementError(ctx.userId, permission);
    }
  },

  recordAccess(userId: string, action: string, meta?: Record<string, unknown>): void {
    const entry: AuditEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      userId,
      action,
      result: "allowed",
      meta,
    };
    auditLog.unshift(entry);
    if (auditLog.length > AUDIT_MAX) auditLog.length = AUDIT_MAX;
  },

  recordDenied(userId: string, action: string, meta?: Record<string, unknown>): void {
    const entry: AuditEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      userId,
      action,
      result: "denied",
      meta,
    };
    auditLog.unshift(entry);
    if (auditLog.length > AUDIT_MAX) auditLog.length = AUDIT_MAX;
  },

  recordError(userId: string, action: string, error: string): void {
    const entry: AuditEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      userId,
      action,
      result: "error",
      meta: { error },
    };
    auditLog.unshift(entry);
    if (auditLog.length > AUDIT_MAX) auditLog.length = AUDIT_MAX;
  },

  queryAuditLog(filter?: { userId?: string; actionPrefix?: string; limit?: number }): AuditEntry[] {
    let entries: AuditEntry[] = auditLog;
    if (filter?.userId) {
      entries = entries.filter((e) => e.userId === filter.userId);
    }
    if (filter?.actionPrefix) {
      entries = entries.filter((e) => e.action.startsWith(filter.actionPrefix!));
    }
    const limit = filter?.limit ?? 100;
    return entries.slice(0, limit);
  },
};
