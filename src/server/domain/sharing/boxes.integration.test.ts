// Shared boxes (ADR-13, doc 03 §8.1) against a real (in-memory) Postgres:
// entries with and without the transfer between one's own accounts, the
// limit of what each one takes out (also with two at once), "Desfazer",
// the isolation from a third account (Carla) and from others' accounts, the
// notices, and a member who leaves or whose account is deleted with money in
// the box.
import { and, eq, isNull } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.DATABASE_URL = "pglite:memory";

type Modules = {
  db: typeof import("../../db/client")["db"];
  schema: typeof import("../../db/schema");
  groups: typeof import("./groups");
  boxes: typeof import("./boxes");
  accounts: typeof import("../accounts");
};
let m: Modules;
type Ctx = import("../context").UserContext;
const ctx = {} as Record<"ana" | "bruno" | "carla", Ctx>;
const ids = {} as Record<
  "anaChecking" | "anaBox" | "anaCard" | "brunoChecking" | "brunoBox",
  string
>;

// 12/nov/2026, 12:00 in São Paulo.
const NOW = Date.UTC(2026, 10, 12, 15, 0, 0);
const TODAY = "2026-11-12";
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
  ]);
  for (const id of ["ana", "bruno", "carla"]) await ensureOwnerDefaults(id);
  m = {
    db: client.db,
    schema,
    groups: await import("./groups"),
    boxes: await import("./boxes"),
    accounts: await import("../accounts"),
  };
  const context = await import("../context");
  for (const id of ["ana", "bruno", "carla"] as const) {
    ctx[id] = await context.getUserContext(id, { now: NOW });
  }
  ids.anaChecking = await m.accounts.createAccount("ana", {
    name: "Conta Principal",
    type: "checking",
    initialBalanceCents: 1_000_000,
  });
  ids.anaBox = await m.accounts.createAccount("ana", {
    name: "Caixinha da Ana",
    type: "savings_box",
    initialBalanceCents: 0,
  });
  ids.anaCard = await m.accounts.createAccount("ana", {
    name: "Cartão",
    type: "credit_card",
    initialBalanceCents: 0,
    card: { limitCents: 100_000, closingDay: 5, dueDay: 12 },
  });
  ids.brunoChecking = await m.accounts.createAccount("bruno", {
    name: "Conta do Bruno",
    type: "checking",
    initialBalanceCents: 500_000,
  });
  ids.brunoBox = await m.accounts.createAccount("bruno", {
    name: "Caixinha do Bruno",
    type: "savings_box",
    initialBalanceCents: 0,
  });
}, 120_000);

const now = () => new Date(NOW);

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

/** "Casa" with Ana (owner) and Bruno, and a box "Viagem" of R$ 8.000. */
async function boxWithBruno(
  name = "Casa",
  targetCents: number | null = 800_000,
) {
  const groupId = uuidv7();
  await m.groups.createGroup(
    ctx.ana,
    { id: groupId, name, emails: ["bruno@exemplo.com"] },
    { now: now() },
  );
  const bruno = await memberIdOf(groupId, "bruno");
  await m.groups.respondToInvite(ctx.bruno, bruno, "accept", { now: now() });
  const boxId = uuidv7();
  await m.boxes.createBox(ctx.ana, groupId, {
    id: boxId,
    name: "Viagem",
    icon: "plane",
    color: "cat-3",
    targetCents,
    targetDate: "2027-06-30",
    expectedRate: null,
  });
  return { groupId, boxId, ana: await memberIdOf(groupId, "ana"), bruno };
}

const save = (
  who: "ana" | "bruno" | "carla",
  boxId: string,
  amountCents: number,
  extra: { fromAccountId?: string; toBoxAccountId?: string } = {},
) =>
  m.boxes.contribute(ctx[who], boxId, {
    id: uuidv7(),
    amountCents,
    occurredOn: TODAY,
    ...extra,
  });

const takeOut = (
  who: "ana" | "bruno" | "carla",
  boxId: string,
  amountCents: number,
  extra: { fromBoxAccountId?: string; toAccountId?: string } = {},
) =>
  m.boxes.withdraw(ctx[who], boxId, {
    id: uuidv7(),
    amountCents,
    occurredOn: TODAY,
    ...extra,
  });

async function legsOf(transferId: string) {
  return m.db
    .select()
    .from(m.schema.transactions)
    .where(
      and(
        eq(m.schema.transactions.transferId, transferId),
        isNull(m.schema.transactions.deletedAt),
      ),
    );
}

async function noticesOf(userId: string, type: string, boxId: string) {
  const rows = await m.db
    .select()
    .from(m.schema.notifications)
    .where(eq(m.schema.notifications.userId, userId));
  return rows.filter(
    (row) =>
      row.type === type &&
      "boxId" in row.payload &&
      row.payload.boxId === boxId,
  );
}

describe("saving and taking out", () => {
  it("records an entry with and without the transfer to one's own caixinha", async () => {
    const { boxId } = await boxWithBruno("Casa A");
    const plain = await save("bruno", boxId, 110_000);
    expect(plain.transferId).toBeNull();

    const moved = await save("ana", boxId, 50_000, {
      fromAccountId: ids.anaChecking,
      toBoxAccountId: ids.anaBox,
    });
    expect(moved.transferId).not.toBeNull();
    const legs = await legsOf(moved.transferId ?? "");
    expect(legs.map((leg) => [leg.accountId, leg.amountCents]).sort()).toEqual(
      [
        [ids.anaBox, 50_000],
        [ids.anaChecking, -50_000],
      ].sort(),
    );
    expect(legs.every((leg) => leg.userId === "ana")).toBe(true);
    expect(legs[0]?.description).toBe("Caixinha Viagem");

    // The same entry sent again is recorded once.
    const id = uuidv7();
    const input = { id, amountCents: 1_000, occurredOn: TODAY };
    await m.boxes.contribute(ctx.ana, boxId, input);
    await m.boxes.contribute(ctx.ana, boxId, input);

    const box = await m.boxes.getBox(ctx.ana, boxId);
    expect(box.savedCents).toBe(161_000);
    expect(box.mySavedCents).toBe(51_000);
    expect(box.lastBoxAccountId).toBe(ids.anaBox);
    expect(box.members.map((row) => row.savedCents)).toEqual([51_000, 110_000]);
    // Bruno sees that Ana saved, never that she moved money between accounts.
    const seen = await m.boxes.getBox(ctx.bruno, boxId);
    expect(seen.entries.every((entry) => !entry.withTransfer)).toBe(true);
    expect(seen.lastBoxAccountId).toBeNull();
  });

  it("refuses a card, an account that is not a caixinha and someone else's accounts", async () => {
    const { boxId } = await boxWithBruno("Casa B");
    await expect(
      save("ana", boxId, 1_000, {
        fromAccountId: ids.anaCard,
        toBoxAccountId: ids.anaBox,
      }),
    ).rejects.toThrow("não de um cartão");
    await expect(
      save("ana", boxId, 1_000, {
        fromAccountId: ids.anaChecking,
        toBoxAccountId: ids.anaChecking,
      }),
    ).rejects.toThrow();
    await expect(
      save("ana", boxId, 1_000, {
        fromAccountId: ids.anaChecking,
        toBoxAccountId: ids.brunoBox,
      }),
    ).rejects.toThrow("Conta não encontrad");
    await expect(
      save("ana", boxId, 1_000, {
        fromAccountId: ids.brunoChecking,
        toBoxAccountId: ids.anaBox,
      }),
    ).rejects.toThrow("Conta não encontrad");
    await expect(
      save("ana", boxId, 1_000, { fromAccountId: ids.anaChecking }),
    ).rejects.toThrow("Escolha de onde sai");
    // Nothing was written: no entry and no transfer.
    const box = await m.boxes.getBox(ctx.ana, boxId);
    expect(box.entries).toHaveLength(0);
    await expect(
      m.boxes.contribute(ctx.ana, boxId, {
        id: uuidv7(),
        amountCents: 1_000,
        occurredOn: "2026-11-13",
      }),
    ).rejects.toThrow("depois de hoje");
  });

  it("takes out at most what the person put in", async () => {
    const { boxId } = await boxWithBruno("Casa C");
    await save("ana", boxId, 180_000);
    await save("bruno", boxId, 110_000);
    await expect(takeOut("ana", boxId, 180_001)).rejects.toThrow(
      /^Você pode resgatar até R\$\s1\.800,00, o que você guardou\.$/,
    );
    await expect(takeOut("carla", boxId, 1)).rejects.toThrow(GROUP_NOT_FOUND);
    const out = await takeOut("ana", boxId, 30_000, {
      fromBoxAccountId: ids.anaBox,
      toAccountId: ids.anaChecking,
    });
    const legs = await legsOf(out.transferId ?? "");
    expect(legs).toHaveLength(2);
    await expect(
      takeOut("ana", boxId, 1_000, {
        fromBoxAccountId: ids.anaBox,
        toAccountId: ids.anaCard,
      }),
    ).rejects.toThrow("não para um cartão");
    const box = await m.boxes.getBox(ctx.ana, boxId);
    expect(box.mySavedCents).toBe(150_000);
    expect(box.savedCents).toBe(260_000);
  });

  it("lets only one of two withdrawals at once through", async () => {
    const { boxId } = await boxWithBruno("Casa D");
    await save("bruno", boxId, 100_000);
    const results = await Promise.allSettled([
      takeOut("bruno", boxId, 60_000),
      takeOut("bruno", boxId, 60_000),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const failed = results.find((result) => result.status === "rejected");
    expect(failed?.status === "rejected" && String(failed.reason)).toMatch(
      /Você pode resgatar até R\$\s400,00/,
    );
    expect((await m.boxes.getBox(ctx.bruno, boxId)).mySavedCents).toBe(40_000);
  });

  it("undoes an entry with both legs of its transfer, by whoever made it", async () => {
    const { boxId } = await boxWithBruno("Casa E");
    const entry = await save("ana", boxId, 20_000, {
      fromAccountId: ids.anaChecking,
      toBoxAccountId: ids.anaBox,
    });
    await expect(m.boxes.undoEntry(ctx.bruno, entry.entryId)).rejects.toThrow(
      "Registro não encontrado",
    );
    await expect(m.boxes.undoEntry(ctx.carla, entry.entryId)).rejects.toThrow(
      GROUP_NOT_FOUND,
    );
    await m.boxes.undoEntry(ctx.ana, entry.entryId);
    expect(await legsOf(entry.transferId ?? "")).toHaveLength(0);
    expect((await m.boxes.getBox(ctx.ana, boxId)).savedCents).toBe(0);

    // An entry in that was taken out since cannot go: it would leave less than nothing.
    const again = await save("ana", boxId, 10_000);
    await takeOut("ana", boxId, 8_000);
    await expect(m.boxes.undoEntry(ctx.ana, again.entryId)).rejects.toThrow(
      "já resgatou parte desse valor",
    );
  });
});

describe("isolation from a third account", () => {
  it("never shows Carla a box nor lets her change one", async () => {
    const { groupId, boxId } = await boxWithBruno("Casa F");
    await save("ana", boxId, 10_000);
    await expect(m.boxes.getBox(ctx.carla, boxId)).rejects.toThrow(
      GROUP_NOT_FOUND,
    );
    await expect(m.boxes.listGroupBoxes(ctx.carla, groupId)).rejects.toThrow(
      GROUP_NOT_FOUND,
    );
    expect(await m.boxes.listMyBoxes(ctx.carla)).toEqual([]);
    await expect(save("carla", boxId, 1_000)).rejects.toThrow(GROUP_NOT_FOUND);
    await expect(m.boxes.setMyPlan(ctx.carla, boxId, 100)).rejects.toThrow(
      GROUP_NOT_FOUND,
    );
    await expect(m.boxes.archiveBox(ctx.carla, boxId, true)).rejects.toThrow(
      GROUP_NOT_FOUND,
    );
    await expect(
      m.boxes.createBox(ctx.carla, groupId, {
        id: uuidv7(),
        name: "Minha",
        icon: "plane",
        color: "cat-1",
        targetCents: null,
        targetDate: null,
        expectedRate: null,
      }),
    ).rejects.toThrow(GROUP_NOT_FOUND);
    // An id that exists nowhere answers the same.
    await expect(m.boxes.getBox(ctx.ana, uuidv7())).rejects.toThrow(
      GROUP_NOT_FOUND,
    );
  });
});

describe("plans and parts", () => {
  it("projects the total and each part, and only the owner changes the parts", async () => {
    const { boxId, ana, bruno } = await boxWithBruno("Casa G");
    await save("ana", boxId, 180_000);
    await save("bruno", boxId, 110_000);
    await m.boxes.setMyPlan(ctx.ana, boxId, 40_000);
    await m.boxes.setMyPlan(ctx.bruno, boxId, 30_000);
    let box = await m.boxes.getBox(ctx.ana, boxId);
    expect(box.monthlyCents).toBe(70_000);
    expect(box.projection?.eta).toEqual({ year: 2027, month: 7 });
    expect(box.members.map((row) => row.shareCents)).toEqual([
      400_000, 400_000,
    ]);
    expect(box.members[0]?.missingCents).toBe(220_000);

    await expect(
      m.boxes.setTargetWeights(ctx.bruno, boxId, { method: "equal" }),
    ).rejects.toThrow("Só quem criou o grupo");
    await expect(
      m.boxes.setTargetWeights(ctx.ana, boxId, {
        method: "percent",
        weights: { [ana]: 6_000, [bruno]: 3_000 },
      }),
    ).rejects.toThrow("Os percentuais somam 90%. Precisam somar 100%.");
    await m.boxes.setTargetWeights(ctx.ana, boxId, {
      method: "percent",
      weights: { [ana]: 6_000, [bruno]: 4_000 },
    });
    box = await m.boxes.getBox(ctx.bruno, boxId);
    expect(box.targetSplit).toBe("percent");
    expect(box.members.map((row) => row.shareCents)).toEqual([
      480_000, 320_000,
    ]);
  });
});

describe("notices", () => {
  it("adds up the day's entries for the others and tells everyone once at the target", async () => {
    const { boxId } = await boxWithBruno("Casa H", 100_000);
    await save("ana", boxId, 30_000);
    await save("ana", boxId, 20_000);
    const [activity] = await noticesOf("bruno", "box_activity", boxId);
    expect(activity?.payload).toMatchObject({
      type: "box_activity",
      actorName: "Ana",
      boxName: "Viagem",
      saved: 2,
      savedCents: 50_000,
      withdrawn: 0,
    });
    expect(await noticesOf("ana", "box_activity", boxId)).toHaveLength(0);

    const reached = await save("bruno", boxId, 50_000);
    // Push to the others only: Ana, not Bruno who made it.
    expect(
      reached.pending
        .filter((push) => push.payload.type === "box_reached")
        .map((push) => push.userId),
    ).toEqual(["ana"]);
    await takeOut("bruno", boxId, 10_000);
    await save("bruno", boxId, 10_000);
    const reachedNotices = [
      ...(await noticesOf("ana", "box_reached", boxId)),
      ...(await noticesOf("bruno", "box_reached", boxId)),
    ];
    expect(reachedNotices).toHaveLength(2);
  });
});

describe("leaving with money in the box", () => {
  it("keeps who left in the history, out of the total, and the parts back to equal", async () => {
    const { groupId, boxId, ana, bruno } = await boxWithBruno("Casa I");
    await save("ana", boxId, 50_000);
    await save("bruno", boxId, 30_000);
    await m.boxes.setTargetWeights(ctx.ana, boxId, {
      method: "percent",
      weights: { [ana]: 7_000, [bruno]: 3_000 },
    });
    await m.groups.leaveGroup(ctx.bruno, groupId, { now: now() });

    const box = await m.boxes.getBox(ctx.ana, boxId);
    expect(box.targetSplit).toBe("equal");
    expect(box.savedCents).toBe(50_000);
    expect(box.members.map((row) => row.memberId)).toEqual([ana]);
    expect(box.departed).toEqual([
      { memberId: bruno, name: "Bruno (saiu)", savedCents: 30_000 },
    ]);
    expect(box.entries.find((entry) => entry.memberId === bruno)?.name).toBe(
      "Bruno (saiu)",
    );
    await expect(takeOut("bruno", boxId, 1_000)).rejects.toThrow(
      GROUP_NOT_FOUND,
    );
  });

  it("keeps the entries of an account deleted by an administrator", async () => {
    await m.db
      .insert(m.schema.user)
      .values({ id: "rui", name: "Rui", email: "rui@exemplo.com" });
    const groupId = uuidv7();
    await m.groups.createGroup(
      ctx.ana,
      { id: groupId, name: "Casa J", emails: ["rui@exemplo.com"] },
      { now: now() },
    );
    const rui = await memberIdOf(groupId, "rui");
    const ruiCtx = { ...ctx.carla, userId: "rui" };
    await m.groups.respondToInvite(ruiCtx, rui, "accept", { now: now() });
    const boxId = uuidv7();
    await m.boxes.createBox(ruiCtx, groupId, {
      id: boxId,
      name: "Reforma",
      icon: "house",
      color: "cat-2",
      targetCents: null,
      targetDate: null,
      expectedRate: null,
    });
    await m.boxes.contribute(ruiCtx, boxId, {
      id: uuidv7(),
      amountCents: 25_000,
      occurredOn: TODAY,
    });

    await m.db.transaction(async (tx) => {
      await m.groups.detachDeletedAccount(tx, "rui", now());
      await tx.delete(m.schema.user).where(eq(m.schema.user.id, "rui"));
    });
    const box = await m.boxes.getBox(ctx.ana, boxId);
    expect(box.departed).toEqual([
      { memberId: rui, name: "Rui (conta excluída)", savedCents: 25_000 },
    ]);
    expect(box.savedCents).toBe(0);
    expect(box.projection).toBeNull();
  });
});
