// Administração › Flags (doc 01 §11.10): the registry with the stored global
// values and per-person values, and the writes that change them. The writes
// lock the administrator's row and record the audit entry in one transaction.
// Effect is immediate: flags are read fresh on every request.
import { and, eq } from "drizzle-orm";
import { hasAdminRole } from "@/lib/admin/roles";
import {
  FLAG_KEYS,
  FLAGS,
  type FlagKey,
  isFlagKey,
} from "@/lib/flags/registry";
import { db, type Transaction } from "@/server/db/client";
import { featureFlagOverrides, featureFlags, user } from "@/server/db/schema";
import { recordAudit } from "./audit";
import { DomainError, NOT_ALLOWED } from "./errors";

export type FlagOverrideItem = {
  userId: string;
  name: string;
  email: string;
  enabled: boolean;
};

export type FlagAdminItem = {
  key: FlagKey;
  label: string;
  description: string;
  owner: string;
  since: string;
  defaultValue: boolean;
  /** Stored global value; null = the default. */
  global: boolean | null;
  overrides: FlagOverrideItem[];
};

export async function listFlagsForAdmin(): Promise<FlagAdminItem[]> {
  const [globals, overrides] = await Promise.all([
    db
      .select({ key: featureFlags.key, enabled: featureFlags.enabled })
      .from(featureFlags),
    db
      .select({
        key: featureFlagOverrides.key,
        enabled: featureFlagOverrides.enabled,
        userId: featureFlagOverrides.userId,
        name: user.name,
        email: user.email,
      })
      .from(featureFlagOverrides)
      .innerJoin(user, eq(user.id, featureFlagOverrides.userId)),
  ]);
  const globalBy = new Map(globals.map((row) => [row.key, row.enabled]));
  return FLAG_KEYS.map((key) => ({
    key,
    ...FLAGS[key],
    global: globalBy.get(key) ?? null,
    overrides: overrides
      .filter((row) => row.key === key)
      .map(({ userId, name, email, enabled }) => ({
        userId,
        name,
        email,
        enabled,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
  }));
}

async function lockAdmin(tx: Transaction, actorId: string) {
  const [actor] = await tx
    .select({
      id: user.id,
      name: user.name,
      role: user.role,
      banned: user.banned,
    })
    .from(user)
    .where(eq(user.id, actorId))
    .for("update");
  if (!actor || actor.banned || !hasAdminRole(actor.role)) {
    throw new DomainError(NOT_ALLOWED);
  }
  return actor;
}

function requireKey(key: string): FlagKey {
  if (!isFlagKey(key)) throw new DomainError("Flag desconhecida.");
  return key;
}

/** Ligado, Desligado, or `null` for Padrão (removes the stored value). */
export async function setGlobalFlag(
  actorId: string,
  key: string,
  value: boolean | null,
): Promise<void> {
  const flag = requireKey(key);
  await db.transaction(async (tx) => {
    const actor = await lockAdmin(tx, actorId);
    if (value === null) {
      await tx.delete(featureFlags).where(eq(featureFlags.key, flag));
    } else {
      await tx
        .insert(featureFlags)
        .values({ key: flag, enabled: value, updatedBy: actor.id })
        .onConflictDoUpdate({
          target: featureFlags.key,
          set: { enabled: value, updatedBy: actor.id, updatedAt: new Date() },
        });
    }
    await recordAudit(tx, {
      action: "flag.global_set",
      actor,
      metadata: { flag, value },
    });
  });
}

/** A person's own value; `null` drops it, so the global value applies. */
export async function setUserFlag(
  actorId: string,
  targetId: string,
  key: string,
  value: boolean | null,
): Promise<void> {
  const flag = requireKey(key);
  await db.transaction(async (tx) => {
    const actor = await lockAdmin(tx, actorId);
    const [target] = await tx
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(eq(user.id, targetId));
    if (!target) throw new DomainError("Conta não encontrada.");
    if (value === null) {
      await tx
        .delete(featureFlagOverrides)
        .where(
          and(
            eq(featureFlagOverrides.userId, target.id),
            eq(featureFlagOverrides.key, flag),
          ),
        );
    } else {
      await tx
        .insert(featureFlagOverrides)
        .values({
          userId: target.id,
          key: flag,
          enabled: value,
          updatedBy: actor.id,
        })
        .onConflictDoUpdate({
          target: [featureFlagOverrides.userId, featureFlagOverrides.key],
          set: { enabled: value, updatedBy: actor.id, updatedAt: new Date() },
        });
    }
    await recordAudit(tx, {
      action: "flag.user_set",
      actor,
      target,
      metadata: { flag, value },
    });
  });
}
