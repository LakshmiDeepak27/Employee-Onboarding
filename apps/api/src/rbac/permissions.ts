import { prisma, setDatabaseOnline } from "../db/client.js";
import { SCOPE_RANK, widestScope, type Scope } from "@eo/contracts";

export interface EffectivePermission {
  key: string;
  resource: string;
  action: string;
  scope: Scope;
}

/** permissionKey -> widest scope the user holds it at. */
export type PermissionMap = Map<string, Scope>;

/**
 * Permissions are resolved from the DATABASE, not from the JWT.
 *
 * This is the deliberate design decision in our auth model: the token proves
 * who you are, the database decides what you may do. Revoking a role takes
 * effect on the next request instead of whenever the access token happens to
 * expire. The cost is a lookup per request, which we absorb with a short TTL
 * cache keyed by user and invalidated whenever roles change.
 */
const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  permissions: PermissionMap;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export function invalidatePermissionCache(userId?: string): void {
  if (userId) cache.delete(userId);
  else cache.clear();
}

export async function resolvePermissions(
  userId: string,
): Promise<PermissionMap> {
  const hit = cache.get(userId);
  if (hit && hit.expiresAt > Date.now()) return hit.permissions;

  let rows: any[] = [];
  try {
    rows = await prisma.userRole.findMany({
      where: { userId },
      select: {
        role: {
          select: {
            rolePermissions: {
              select: {
                scope: true,
                permission: {
                  select: { key: true, resource: true, action: true },
                },
              },
            },
          },
        },
      },
    });
  } catch (error) {
    setDatabaseOnline(false);
    throw error;
  }

  const map: PermissionMap = new Map();
  if (rows.length > 0) {
    for (const ur of rows) {
      for (const rp of ur.role.rolePermissions) {
        const key = rp.permission.key;
        const existing = map.get(key);
        // A user with several roles gets the WIDEST scope of any of them.
        map.set(
          key,
          existing
            ? widestScope(existing, rp.scope as Scope)
            : (rp.scope as Scope),
        );
      }
    }
  }

  cache.set(userId, { permissions: map, expiresAt: Date.now() + CACHE_TTL_MS });
  return map;
}

export function toEffectiveList(map: PermissionMap): EffectivePermission[] {
  return [...map.entries()]
    .map(([key, scope]) => {
      const [resource = "", action = ""] = key.split(".");
      return { key, resource, action, scope };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function has(map: PermissionMap, key: string): boolean {
  return map.has(key);
}

export function scopeOf(map: PermissionMap, key: string): Scope | undefined {
  return map.get(key);
}

export function scopeAtLeast(actual: Scope, required: Scope): boolean {
  return SCOPE_RANK[actual] >= SCOPE_RANK[required];
}
