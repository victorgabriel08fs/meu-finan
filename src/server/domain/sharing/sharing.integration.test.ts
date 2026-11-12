// Shared finances (ADR-13) against a real (in-memory) Postgres: invites that
// never tell whether an e-mail has an account, accept / decline / leave /
// remove, expenses copied from one's own entries, balances and settlements,
// the isolation from a third account (Carla) in every function, the races
// the group lock settles, and an account deleted by an administrator.
import { and, count, eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.DATABASE_URL = "pglite:memory";

type Modules = {
  db: typeof import("../../db/client")["db"];
  schema: typeof import("../../db/schema");
  groups: typeof import("./groups");
  expenses: typeof import("./expenses");
  settlements: typeof import("./settlements");
  transactions: typeof import("../transactions");
  accounts: typeof import("../accounts");
};
let m: Modules;
type Ctx = import("../context").UserContext;
const ctx = {} as Record<"ana" | "bruno" | "carla" | "dani", Ctx>;
const ids = {} as Record<
  "anaChecking" | "brunoChecking" | "anaMarket" | "anaRent" | "brunoBill",
  string
>;

// 12/nov/2026, 12:00 in São Paulo.
const NOW = Date.UTC(2026, 10, 12, 15, 0, 0);
const GROUP_NOT_FOUND = "Grupo não encontrado.";

beforeAll(async () => {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = await import("../../db/client");
  await migrate(client.db as never, { migrationsFolder: "drizzle" });
  const schema = await import("../../db/schema");
  const { ensureOwnerDefaults } = await import("../../db/seed-defaults");
  await client.db.insert(schema.user).values([
    { id: "ana", name: "Ana", email: "ana@exemplo.com", role: "admin" },
    { id: "bruno", name: "Bruno", email: "bruno@exemplo.com" },
    { id: "carla", name: "Carla", email: "carla@exemplo.com" },
    { id: "dani", name: "Dani", email: "dani@exemplo.com" },
  ]);
  for (const id of ["ana", "bruno", "carla", "dani"])
    await ensureOwnerDefaults(id);
  m = {
    db: client.db,
    schema,
    groups: await import("./groups"),
    expenses: await import("./expenses"),
    settlements: await import("./settlements"),
    transactions: await import("../transactions"),
    accounts: await import("../accounts"),
  };
  const context = await import("../context");
  for (const id of ["ana", "bruno", "carla", "dani"] as const) {
    ctx[id] = await context.getUserContext(id, { now: NOW });
  }
  ids.anaChecking = await m.accounts.createAccount("ana", {
    name: "Conta Principal",
    type: "checking",
    initialBalanceCents: 500_000,
  });
  ids.brunoChecking = await m.accounts.createAccount("bruno", {
    name: "Conta do Bruno",
    type: "checking",
    initialBalanceCents: 100_000,
  });
  const expense = async (
    who: "ana" | "bruno",
    accountId: string,
    cents: number,
    description: string,
  ) =>
    (
      await m.transactions.createTransaction(ctx[who], {
        kind: "expense",
        amountCents: cents,
        accountId,
        categoryId: null,
        description,
        notes: "nota particular",
        occurredOn: "2026-11-05",
      })
    ).ids[0] ?? "";
  ids.anaMarket = await expense("ana", ids.anaChecking, 30_000, "Mercado");
  ids.anaRent = await expense("ana", ids.anaChecking, 250_000, "Aluguel");
  ids.brunoBill = await expense("bruno", ids.brunoChecking, 12_000, "Internet");
}, 120_000);

const now = () => new Date(NOW);

async function newGroup(name = "Casa", emails: string[] = []) {
  const id = uuidv7();
  const result = await m.groups.createGroup(
    ctx.ana,
    { id, name, emails },
    { now: now() },
  );
  return { id, ...result };
}

async function memberIdOf(groupId: string, userId: string) {
  const [row] = await m.db
    .select({ id: m.schema.shareMembers.id })
    .from(m.schema.shareMembers)
    .where(
      and(
        eq(m.schema.shareMembers.groupId, groupId),
        eq(m.schema.shareMembers.userId, userId),
      ),
    );
  if (!row) throw new Error(`sem membro ${userId}`);
  return row.id;
}

async function groupWithBruno(name = "Casa") {
  const group = await newGroup(name, ["bruno@exemplo.com"]);
  const brunoMember = await memberIdOf(group.id, "bruno");
  await m.groups.respondToInvite(ctx.bruno, brunoMember, "accept", {
    now: now(),
  });
  return {
    ...group,
    ana: await memberIdOf(group.id, "ana"),
    bruno: brunoMember,
  };
}

async function noticesOf(userId: string, type?: string) {
  const rows = await m.db
    .select()
    .from(m.schema.notifications)
    .where(eq(m.schema.notifications.userId, userId));
  return type ? rows.filter((row) => row.type === type) : rows;
}

const equalSplit = (...members: string[]) => ({
  method: "equal" as const,
  inputs: members.map((memberId) => ({ memberId, value: 1 })),
});

describe("invites", () => {
  it("answers the same whether the e-mail has an account or not", async () => {
    const auditBefore = await m.db
      .select({ total: count() })
      .from(m.schema.auditLog);
    const withAccount = await newGroup("Casa A", ["bruno@exemplo.com"]);
    const without = await newGroup("Casa B", ["ninguem@exemplo.com"]);
    expect(Object.keys(withAccount).sort()).toEqual(
      Object.keys(without).sort(),
    );
    expect(withAccount.pending).toHaveLength(1);
    expect(without.pending).toHaveLength(0);

    // Ana sees the same status for both; only Bruno got a notice.
    const a = await m.groups.getGroup(ctx.ana, withAccount.id, { now: now() });
    const b = await m.groups.getGroup(ctx.ana, without.id, { now: now() });
    const invitedA = a.members.find((member) => !member.isMe);
    const invitedB = b.members.find((member) => !member.isMe);
    expect(invitedA).toMatchObject({
      status: "invited",
      pending: true,
      email: "bruno@exemplo.com",
    });
    expect(invitedB).toMatchObject({
      status: "invited",
      pending: true,
      email: "ninguem@exemplo.com",
    });
    // A pending invite reads the same: the typed e-mail, never the account's name.
    expect(invitedA?.name).toBe("bruno@exemplo.com");
    expect(invitedB?.name).toBe("ninguem@exemplo.com");
    expect(Object.keys(invitedA ?? {}).sort()).toEqual(
      Object.keys(invitedB ?? {}).sort(),
    );
    expect(JSON.stringify(a)).not.toContain("Bruno");
    expect(JSON.stringify(a.names)).not.toContain("Bruno");
    const invites = await noticesOf("bruno", "share_invite");
    expect(invites.at(-1)?.payload).toMatchObject({
      groupName: "Casa A",
      inviterName: "Ana",
      inviterEmail: "ana@exemplo.com",
    });

    // The audit names the account, never the e-mail without one, the group or amounts.
    const entries = await m.db
      .select()
      .from(m.schema.auditLog)
      .where(eq(m.schema.auditLog.action, "share.invited"));
    expect(entries.length).toBeGreaterThanOrEqual(2);
    const unresolved = entries.find((entry) => entry.metadata.unresolved);
    expect(unresolved).toMatchObject({ targetUserId: null, targetEmail: null });
    expect(JSON.stringify(entries)).not.toContain("ninguem");
    expect(JSON.stringify(entries)).not.toContain("Casa");
    expect(
      (await m.db.select({ total: count() }).from(m.schema.auditLog))[0]?.total,
    ).toBeGreaterThan(auditBefore[0]?.total ?? 0);
  });

  it("refuses the person's own e-mail, a repeated one and a seventh person", async () => {
    await expect(newGroup("Casa C", ["ANA@exemplo.com"])).rejects.toThrow(
      "Esse é o seu e-mail. Convide outra pessoa.",
    );
    const group = await newGroup("Casa D", ["bruno@exemplo.com"]);
    await expect(
      m.groups.inviteToGroup(ctx.ana, group.id, ["bruno@exemplo.com"], {
        now: now(),
      }),
    ).rejects.toThrow("Esse e-mail já foi convidado para Casa D.");
    await expect(
      m.groups.inviteToGroup(
        ctx.ana,
        group.id,
        ["a@x.com", "b@x.com", "c@x.com", "d@x.com", "e@x.com"],
        { now: now() },
      ),
    ).rejects.toThrow(
      "Um grupo tem até 6 pessoas, contando os convites pendentes.",
    );
  });

  it("serializes two invites of the same e-mail at once", async () => {
    const group = await newGroup("Casa E");
    const results = await Promise.allSettled([
      m.groups.inviteToGroup(ctx.ana, group.id, ["carla@exemplo.com"], {
        now: now(),
      }),
      m.groups.inviteToGroup(ctx.ana, group.id, ["carla@exemplo.com"], {
        now: now(),
      }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const failed = results.find((result) => result.status === "rejected");
    expect(failed?.status === "rejected" && String(failed.reason)).toContain(
      "Esse e-mail já foi convidado para Casa E.",
    );
  });

  it("expires, and an expired invite can be sent again", async () => {
    const group = await newGroup("Casa F", ["dani@exemplo.com"]);
    const dani = await memberIdOf(group.id, "dani");
    const later = new Date(NOW + 15 * 24 * 60 * 60 * 1000);
    await expect(
      m.groups.respondToInvite(ctx.dani, dani, "accept", { now: later }),
    ).rejects.toThrow("Este convite não vale mais.");
    expect(
      (await m.groups.listMyGroups(ctx.dani, { now: later })).invites,
    ).toHaveLength(0);
    await m.groups.inviteToGroup(ctx.ana, group.id, ["dani@exemplo.com"], {
      now: later,
    });
    expect(await memberIdOf(group.id, "dani")).toBe(dani);
    await m.groups.respondToInvite(ctx.dani, dani, "decline", { now: later });
    const view = await m.groups.getGroup(ctx.ana, group.id, { now: later });
    expect(view.members.find((member) => member.id === dani)?.status).toBe(
      "declined",
    );
    expect((await noticesOf("ana", "share_declined")).length).toBeGreaterThan(
      0,
    );
  });

  it("accepts: the person joins, the others hear of it, the invite is read", async () => {
    const group = await groupWithBruno("Casa G");
    const list = await m.groups.listMyGroups(ctx.bruno, { now: now() });
    expect(list.groups.find((item) => item.id === group.id)?.others).toEqual([
      { id: group.ana, name: "Ana" },
    ]);
    const joined = await noticesOf("ana", "share_joined");
    expect(
      joined.some(
        (row) =>
          row.payload.type === "share_joined" &&
          row.payload.groupId === group.id,
      ),
    ).toBe(true);
    const invite = (await noticesOf("bruno", "share_invite")).find(
      (row) => row.dedupeKey === `share_invite:${group.bruno}`,
    );
    expect(invite?.readAt).not.toBeNull();
  });

  it("lets only one of two accepts in when one place is left", async () => {
    const group = await newGroup("Casa H");
    // Four more active people seeded directly, plus two open invites.
    const extra = ["e1", "e2", "e3", "e4"];
    await m.db
      .insert(m.schema.user)
      .values(
        extra.map((id) => ({ id, name: id, email: `${id}@exemplo.com` })),
      );
    await m.db.insert(m.schema.shareMembers).values(
      extra.map((id) => ({
        groupId: group.id,
        userId: id,
        invitedEmail: `${id}@exemplo.com`,
        displayName: id,
        status: "active" as const,
      })),
    );
    const expiresAt = new Date(NOW + 24 * 60 * 60 * 1000);
    const [carla, dani] = await m.db
      .insert(m.schema.shareMembers)
      .values(
        (["carla", "dani"] as const).map((id) => ({
          groupId: group.id,
          userId: id,
          invitedEmail: `${id}@exemplo.com`,
          displayName: id,
          status: "invited" as const,
          expiresAt,
        })),
      )
      .returning({ id: m.schema.shareMembers.id });
    const results = await Promise.allSettled([
      m.groups.respondToInvite(ctx.carla, carla?.id ?? "", "accept", {
        now: now(),
      }),
      m.groups.respondToInvite(ctx.dani, dani?.id ?? "", "accept", {
        now: now(),
      }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const failed = results.find((result) => result.status === "rejected");
    expect(failed?.status === "rejected" && String(failed.reason)).toContain(
      "já tem 6 pessoas",
    );
  });
});

describe("isolation from a third account", () => {
  it("never shows Carla a group, an expense or a settlement of others", async () => {
    const group = await groupWithBruno("Casa I");
    await m.expenses.addSharedExpenses(ctx.ana, group.id, [
      {
        id: uuidv7(),
        description: "",
        amountCents: 1,
        occurredOn: "2026-11-05",
        paidByMemberId: group.ana,
        transactionId: ids.anaMarket,
        ...equalSplit(group.ana, group.bruno),
      },
    ]);
    const range = { start: "2026-11-01", end: "2026-11-30" };
    await expect(m.groups.getGroup(ctx.carla, group.id)).rejects.toThrow(
      GROUP_NOT_FOUND,
    );
    await expect(
      m.expenses.listGroupActivity(ctx.carla, group.id, range),
    ).rejects.toThrow(GROUP_NOT_FOUND);
    await expect(
      m.expenses.shareableExpenses(ctx.carla, group.id, range),
    ).rejects.toThrow(GROUP_NOT_FOUND);
    await expect(
      m.groups.inviteToGroup(ctx.carla, group.id, ["x@exemplo.com"], {
        now: now(),
      }),
    ).rejects.toThrow(GROUP_NOT_FOUND);
    await expect(m.groups.leaveGroup(ctx.carla, group.id)).rejects.toThrow(
      GROUP_NOT_FOUND,
    );
    await expect(
      m.groups.removeMember(ctx.carla, group.id, group.bruno),
    ).rejects.toThrow(GROUP_NOT_FOUND);
    await expect(
      m.groups.setDefaultSplit(ctx.carla, group.id, {
        method: "equal",
        inputs: {},
      }),
    ).rejects.toThrow(GROUP_NOT_FOUND);
    await expect(
      m.settlements.settleUp(ctx.carla, group.id, {
        id: uuidv7(),
        withMemberId: group.ana,
        amountCents: 100,
        expectedCents: 0,
        occurredOn: "2026-11-12",
      }),
    ).rejects.toThrow(GROUP_NOT_FOUND);
    // Answering someone else's invite by its id: as if it did not exist.
    const other = await newGroup("Casa J", ["bruno@exemplo.com"]);
    const brunoInvite = await memberIdOf(other.id, "bruno");
    await expect(
      m.groups.respondToInvite(ctx.carla, brunoInvite, "accept", {
        now: now(),
      }),
    ).rejects.toThrow("Este convite não vale mais.");
    const activity = await m.expenses.listGroupActivity(
      ctx.ana,
      group.id,
      range,
    );
    const [expense] = activity.expenses;
    expect(expense).toBeDefined();
    await expect(
      m.expenses.deleteSharedExpense(ctx.carla, expense?.id ?? ""),
    ).rejects.toThrow(GROUP_NOT_FOUND);
    const carlas = await m.groups.listMyGroups(ctx.carla, { now: now() });
    expect(carlas.groups.map((item) => item.id)).not.toContain(group.id);
  });

  it("copies only the creator's own entry, and shows its account only to them", async () => {
    const group = await groupWithBruno("Casa K");
    // Bruno cannot use Ana's entry.
    await expect(
      m.expenses.addSharedExpenses(ctx.bruno, group.id, [
        {
          id: uuidv7(),
          description: "",
          amountCents: 1,
          occurredOn: "2026-11-05",
          paidByMemberId: group.bruno,
          transactionId: ids.anaRent,
          ...equalSplit(group.ana, group.bruno),
        },
      ]),
    ).rejects.toThrow("Lançamento não encontrado.");
    // Ana's copy: her description, amount and date, paid by her, whatever came.
    await m.expenses.addSharedExpenses(ctx.ana, group.id, [
      {
        id: uuidv7(),
        description: "outra coisa",
        amountCents: 1,
        occurredOn: "2026-01-01",
        paidByMemberId: group.bruno,
        transactionId: ids.anaRent,
        method: "percent",
        inputs: [
          { memberId: group.ana, value: 6_000 },
          { memberId: group.bruno, value: 4_000 },
        ],
      },
    ]);
    const range = { start: "2026-11-01", end: "2026-11-30" };
    const forAna = await m.expenses.listGroupActivity(ctx.ana, group.id, range);
    const forBruno = await m.expenses.listGroupActivity(
      ctx.bruno,
      group.id,
      range,
    );
    expect(forAna.expenses[0]).toMatchObject({
      description: "Aluguel",
      amountCents: 250_000,
      occurredOn: "2026-11-05",
      paidByMemberId: group.ana,
      source: { accountName: "Conta Principal", stale: null },
    });
    expect(forAna.expenses[0]?.shares.map((share) => share.shareCents)).toEqual(
      [150_000, 100_000],
    );
    expect(forBruno.expenses[0]?.source).toBeNull();
    expect(JSON.stringify(forBruno)).not.toContain("Conta Principal");
    expect(JSON.stringify(forBruno)).not.toContain("nota particular");

    // The entry is now in a group: not offered again, and not twice.
    const offered = await m.expenses.shareableExpenses(
      ctx.ana,
      group.id,
      range,
    );
    expect(offered.map((item) => item.id)).not.toContain(ids.anaRent);
    expect(offered.every((item) => item.id !== ids.brunoBill)).toBe(true);
    await expect(
      m.expenses.addSharedExpenses(ctx.ana, group.id, [
        {
          id: uuidv7(),
          description: "",
          amountCents: 1,
          occurredOn: "2026-11-05",
          paidByMemberId: group.ana,
          transactionId: ids.anaRent,
          ...equalSplit(group.ana),
        },
      ]),
    ).rejects.toThrow("Este lançamento já está dividido em um grupo.");

    // Bruno's own entries are his to offer.
    const brunos = await m.expenses.shareableExpenses(
      ctx.bruno,
      group.id,
      range,
    );
    expect(brunos.map((item) => item.id)).toEqual([ids.brunoBill]);

    // "Desatualizada": the entry changed after it was copied.
    await m.db
      .update(m.schema.transactions)
      .set({ amountCents: -260_000 })
      .where(eq(m.schema.transactions.id, ids.anaRent));
    const stale = await m.expenses.listGroupActivity(ctx.ana, group.id, range);
    expect(stale.expenses[0]?.source?.stale).toMatchObject({
      amountCents: 260_000,
    });
    await m.expenses.refreshFromSource(ctx.ana, stale.expenses[0]?.id ?? "");
    const fresh = await m.expenses.listGroupActivity(ctx.ana, group.id, range);
    expect(fresh.expenses[0]?.amountCents).toBe(260_000);
    expect(fresh.expenses[0]?.shares.map((share) => share.shareCents)).toEqual([
      156_000, 104_000,
    ]);
  });
});

describe("expenses, balances and settlements", () => {
  it("divides on the server, adds the day's notices up and settles", async () => {
    const group = await groupWithBruno("Casa L");
    const typed = (description: string, cents: number, paidBy: string) => ({
      id: uuidv7(),
      description,
      amountCents: cents,
      occurredOn: "2026-11-10",
      paidByMemberId: paidBy,
      ...equalSplit(group.ana, group.bruno),
    });
    await expect(
      m.expenses.addSharedExpenses(ctx.ana, group.id, [
        {
          ...typed("Luz", 12_000, group.ana),
          method: "amounts",
          inputs: [
            { memberId: group.ana, value: 8_000 },
            { memberId: group.bruno, value: 2_800 },
          ],
        },
      ]),
    ).rejects.toThrow(/^Faltam R\$\s12,00 para fechar o total\.$/);
    const first = typed("Mercado", 30_000, group.ana);
    await m.expenses.addSharedExpenses(ctx.ana, group.id, [first]);
    // The same id again adds nothing.
    expect(
      (await m.expenses.addSharedExpenses(ctx.ana, group.id, [first])).added,
    ).toBe(0);
    await m.expenses.addSharedExpenses(ctx.ana, group.id, [
      typed("Feira", 6_000, group.ana),
    ]);
    const [activity] = (await noticesOf("bruno", "shared_activity")).filter(
      (row) =>
        row.payload.type === "shared_activity" &&
        row.payload.groupId === group.id,
    );
    expect(activity?.payload).toMatchObject({
      added: 2,
      addedCents: 36_000,
      myShareCents: 18_000,
    });

    const detail = await m.groups.getGroup(ctx.bruno, group.id);
    expect(detail.transfers).toEqual([
      { memberId: group.ana, name: "Ana", amountCents: -18_000 },
    ]);

    // Two settlements of the same debt at once: only one passes.
    const settle = () =>
      m.settlements.settleUp(ctx.bruno, group.id, {
        id: uuidv7(),
        withMemberId: group.ana,
        amountCents: 18_000,
        expectedCents: -18_000,
        occurredOn: "2026-11-12",
      });
    const results = await Promise.allSettled([settle(), settle()]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const failed = results.find((result) => result.status === "rejected");
    expect(failed?.status === "rejected" && String(failed.reason)).toContain(
      "O saldo mudou enquanto você acertava.",
    );
    expect((await m.groups.getGroup(ctx.ana, group.id)).transfers).toEqual([]);
    const settled = (await noticesOf("ana", "share_settled")).at(-1);
    expect(settled?.payload).toMatchObject({
      amountCents: 18_000,
      direction: "paid_you",
    });

    // Undo by whoever recorded it.
    const ok = results.find((result) => result.status === "fulfilled");
    const settlementId =
      ok?.status === "fulfilled" ? ok.value.settlementId : "";
    await expect(
      m.settlements.undoSettlement(ctx.ana, settlementId),
    ).rejects.toThrow("Acerto não encontrado.");
    await m.settlements.undoSettlement(ctx.bruno, settlementId);
    expect(
      (await m.groups.getGroup(ctx.ana, group.id)).transfers[0]?.amountCents,
    ).toBe(18_000);
  });

  it("keeps who left in the history and their expenses read only", async () => {
    const group = await groupWithBruno("Casa M");
    const expenseId = uuidv7();
    await m.expenses.addSharedExpenses(ctx.ana, group.id, [
      {
        id: expenseId,
        description: "Internet",
        amountCents: 10_000,
        occurredOn: "2026-11-10",
        paidByMemberId: group.ana,
        ...equalSplit(group.ana, group.bruno),
      },
    ]);
    await m.groups.leaveGroup(ctx.bruno, group.id);
    await expect(m.groups.getGroup(ctx.bruno, group.id)).rejects.toThrow(
      GROUP_NOT_FOUND,
    );
    const view = await m.groups.getGroup(ctx.ana, group.id);
    expect(view.names[group.bruno]).toBe("Bruno (saiu)");
    expect(view.transfers).toEqual([
      { memberId: group.bruno, name: "Bruno (saiu)", amountCents: 5_000 },
    ]);
    await expect(
      m.expenses.updateSharedExpense(ctx.ana, expenseId, {
        paidByMemberId: group.ana,
        ...equalSplit(group.ana),
      }),
    ).rejects.toThrow(
      "Esta despesa inclui quem saiu do grupo e não pode mais ser mudada.",
    );
    // Adding an expense with someone who left is refused.
    await expect(
      m.expenses.addSharedExpenses(ctx.ana, group.id, [
        {
          id: uuidv7(),
          description: "Gás",
          amountCents: 5_000,
          occurredOn: "2026-11-10",
          paidByMemberId: group.ana,
          ...equalSplit(group.ana, group.bruno),
        },
      ]),
    ).rejects.toThrow("Pessoa não encontrada neste grupo.");
  });

  it("hands the group on when the owner leaves and deletes it with the last one", async () => {
    const group = await groupWithBruno("Casa N");
    await m.groups.leaveGroup(ctx.ana, group.id);
    const view = await m.groups.getGroup(ctx.bruno, group.id);
    expect(view.me.role).toBe("owner");
    await m.groups.leaveGroup(ctx.bruno, group.id);
    const [left] = await m.db
      .select({ total: count() })
      .from(m.schema.shareGroups)
      .where(eq(m.schema.shareGroups.id, group.id));
    expect(left?.total).toBe(0);
  });

  it("lets only the owner take someone out, and the access ends at once", async () => {
    const group = await groupWithBruno("Casa O");
    await expect(
      m.groups.removeMember(ctx.bruno, group.id, group.ana),
    ).rejects.toThrow("Só quem criou o grupo pode fazer isso.");
    await m.groups.removeMember(ctx.ana, group.id, group.bruno);
    await expect(m.groups.getGroup(ctx.bruno, group.id)).rejects.toThrow(
      GROUP_NOT_FOUND,
    );
    expect((await noticesOf("bruno", "share_removed")).length).toBeGreaterThan(
      0,
    );
    // Cancelling an invite leaves no row.
    await m.groups.inviteToGroup(ctx.ana, group.id, ["sem-conta@exemplo.com"], {
      now: now(),
    });
    const pending = (
      await m.groups.getGroup(ctx.ana, group.id, { now: now() })
    ).members.find((member) => member.status === "invited");
    await m.groups.removeMember(ctx.ana, group.id, pending?.id ?? "");
    const after = await m.groups.getGroup(ctx.ana, group.id, { now: now() });
    expect(after.members.some((member) => member.status === "invited")).toBe(
      false,
    );
  });
});

describe("an account deleted by an administrator", () => {
  it("keeps the name and the balances, and drops its open invites", async () => {
    await m.db
      .insert(m.schema.user)
      .values({ id: "rui", name: "Rui", email: "rui@exemplo.com" });
    const group = await newGroup("Casa P", ["rui@exemplo.com"]);
    const rui = await memberIdOf(group.id, "rui");
    const ruiCtx = { ...ctx.dani, userId: "rui" };
    await m.groups.respondToInvite(ruiCtx, rui, "accept", { now: now() });
    const ana = await memberIdOf(group.id, "ana");
    await m.expenses.addSharedExpenses(ctx.ana, group.id, [
      {
        id: uuidv7(),
        description: "Viagem",
        amountCents: 20_000,
        occurredOn: "2026-11-10",
        paidByMemberId: ana,
        ...equalSplit(ana, rui),
      },
    ]);
    const other = await newGroup("Casa Q", ["rui@exemplo.com"]);

    await m.db.transaction(async (tx) => {
      await m.groups.detachDeletedAccount(tx, "rui", now());
      await tx.delete(m.schema.user).where(eq(m.schema.user.id, "rui"));
    });
    const view = await m.groups.getGroup(ctx.ana, group.id);
    expect(view.names[rui]).toBe("Rui (conta excluída)");
    expect(view.members.find((member) => member.id === rui)).toMatchObject({
      deleted: true,
    });
    expect(view.transfers).toEqual([
      { memberId: rui, name: "Rui (conta excluída)", amountCents: 10_000 },
    ]);
    const otherView = await m.groups.getGroup(ctx.ana, other.id, {
      now: now(),
    });
    expect(otherView.members).toHaveLength(1);
  });
});
