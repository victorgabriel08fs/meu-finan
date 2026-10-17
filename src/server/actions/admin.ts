"use server";

// Server Actions of Administração (doc 01 §11.9–11.10). Every one goes through
// `adminAction`, which reads the role from the database on each call; the
// domain checks it again inside the transaction, with the guards.
import { refresh } from "next/cache";
import { z } from "zod";
import { USER_ROLES } from "@/lib/admin/roles";
import { setGlobalFlag, setUserFlag } from "@/server/domain/flag-admin";
import {
  createAccessLink,
  createUserWithInvite,
  deleteUserAccount,
  revokeAccessLink,
  revokeUserSessions,
  setUserBanned,
  setUserRole,
} from "@/server/domain/users";
import { appOrigin } from "@/server/env";
import { adminAction } from "@/server/safe-action";

/** Better Auth's ids: random letters and digits. */
const userId = z
  .string()
  .min(1, { error: "Conta inválida." })
  .max(64, { error: "Conta inválida." })
  .regex(/^[A-Za-z0-9_-]+$/, { error: "Conta inválida." });

const target = z.object({ userId });

const flagKey = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,62}$/, { error: "Flag desconhecida." });

/** "Convidar pessoa": the account and its invite link, shown once. */
export const createUserAction = adminAction
  .inputSchema(
    z.object({
      name: z
        .string()
        .trim()
        .min(1, { error: "Informe o nome." })
        .max(60, { error: "Use até 60 caracteres." }),
      email: z.email({ error: "Informe um e-mail válido." }).trim(),
      role: z.enum(USER_ROLES, { error: "Escolha o papel." }),
    }),
  )
  .action(async ({ parsedInput, ctx: { admin } }) => {
    const created = await createUserWithInvite(admin.id, parsedInput, {
      origin: appOrigin(),
    });
    refresh();
    return created;
  });

/** "Gerar novo convite" / "Gerar link de redefinição". */
export const createAccessLinkAction = adminAction
  .inputSchema(target)
  .action(async ({ parsedInput, ctx: { admin } }) => {
    const link = await createAccessLink(admin.id, parsedInput.userId, {
      origin: appOrigin(),
    });
    refresh();
    return link;
  });

export const revokeAccessLinkAction = adminAction
  .inputSchema(target)
  .action(async ({ parsedInput, ctx: { admin } }) => {
    await revokeAccessLink(admin.id, parsedInput.userId);
    refresh();
  });

/** "Desativar acesso" (true) / "Reativar acesso" (false). */
export const setUserBannedAction = adminAction
  .inputSchema(z.object({ userId, banned: z.boolean() }))
  .action(async ({ parsedInput, ctx: { admin } }) => {
    const result = await setUserBanned(
      admin.id,
      parsedInput.userId,
      parsedInput.banned,
    );
    refresh();
    return result;
  });

export const revokeUserSessionsAction = adminAction
  .inputSchema(target)
  .action(async ({ parsedInput, ctx: { admin } }) => {
    const result = await revokeUserSessions(admin.id, parsedInput.userId);
    refresh();
    return result;
  });

export const setUserRoleAction = adminAction
  .inputSchema(z.object({ userId, role: z.enum(USER_ROLES) }))
  .action(async ({ parsedInput, ctx: { admin } }) => {
    await setUserRole(admin.id, parsedInput.userId, parsedInput.role);
    refresh();
  });

/** "Excluir conta": irreversible; the typed e-mail is the confirmation. */
export const deleteUserAction = adminAction
  .inputSchema(
    z.object({
      userId,
      confirmEmail: z
        .string()
        .trim()
        .min(1, { error: "Digite o e-mail da conta para confirmar." })
        .max(254),
    }),
  )
  .action(async ({ parsedInput, ctx: { admin } }) => {
    const deleted = await deleteUserAccount(
      admin.id,
      parsedInput.userId,
      parsedInput.confirmEmail,
    );
    refresh();
    return deleted;
  });

/** Padrão (null) · Ligado (true) · Desligado (false), for everyone. */
export const setGlobalFlagAction = adminAction
  .inputSchema(z.object({ key: flagKey, value: z.boolean().nullable() }))
  .action(async ({ parsedInput, ctx: { admin } }) => {
    await setGlobalFlag(admin.id, parsedInput.key, parsedInput.value);
    refresh();
  });

/** The same, for one person (wins over the global value). */
export const setUserFlagAction = adminAction
  .inputSchema(
    z.object({ userId, key: flagKey, value: z.boolean().nullable() }),
  )
  .action(async ({ parsedInput, ctx: { admin } }) => {
    await setUserFlag(
      admin.id,
      parsedInput.userId,
      parsedInput.key,
      parsedInput.value,
    );
    refresh();
  });
