"use client";

import { ListChecks } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { accountTypeLabel } from "@/components/accounts/account-meta";
import {
  actionErrorMessage,
  NETWORK_ERROR,
} from "@/components/transactions/action-result";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { saveDailySpendAccountsAction } from "@/server/actions/preferences";
import type { SpendablePerDay } from "@/server/domain/dashboard";
import { ACCOUNT_DOT } from "./account-dot";

type Accounts = SpendablePerDay["accounts"];

/**
 * Saves the accounts left out of the lines. Shows what went wrong and
 * resolves to false when nothing was saved.
 */
export async function persistDailySpendAccounts(
  hiddenAccountIds: string[],
): Promise<boolean> {
  try {
    const message = actionErrorMessage(
      await saveDailySpendAccountsAction({ hiddenAccountIds }),
    );
    if (message) {
      toast(message);
      return false;
    }
    return true;
  } catch {
    toast(NETWORK_ERROR);
    return false;
  }
}

/** Shown per account id, from what is saved. */
const shownOf = (accounts: Accounts) =>
  Object.fromEntries(accounts.map((account) => [account.id, account.shown]));

type SpendableAccountsSheetProps = {
  /** Every account to spend from, `shown` as saved. */
  accounts: Accounts;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * "Contas no bloco" (doc 02 §6.3, §5.14): a switch per account to spend from,
 * on for those with a line under each day of Quanto dá para gastar por dia.
 * The total counts them all either way. Edits stay here until "Salvar".
 */
export function SpendableAccountsSheet({
  accounts,
  open,
  onOpenChange,
}: SpendableAccountsSheetProps) {
  const [shown, setShown] = useState(() => shownOf(accounts));
  const [saving, setSaving] = useState(false);
  // Every opening starts from what is saved.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setShown(shownOf(accounts));
  }

  async function save() {
    setSaving(true);
    const saved = await persistDailySpendAccounts(
      accounts
        .filter((account) => !shown[account.id])
        .map((account) => account.id),
    );
    setSaving(false);
    if (!saved) return;
    onOpenChange(false);
    toast("Contas do bloco salvas.");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        flowFooter
        title="Contas no bloco"
        description="Escolha as contas que aparecem em cada dia. O total continua com todas. Vale em todos os seus aparelhos."
        footer={
          <Button
            size="lg"
            className="w-full"
            aria-busy={saving || undefined}
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        }
      >
        <SpendableAccountsList
          accounts={accounts}
          shown={shown}
          onChange={setShown}
        />
      </SheetContent>
    </Sheet>
  );
}

/** The accounts being edited, each with its switch. */
export function SpendableAccountsList({
  accounts,
  shown,
  onChange,
}: {
  accounts: Accounts;
  /** On or off per account id. */
  shown: Record<string, boolean>;
  onChange: (shown: Record<string, boolean>) => void;
}) {
  const ids = useId();
  const noneShown = accounts.every((account) => !shown[account.id]);
  return (
    <>
      <ul className="overflow-hidden rounded-2xl border border-border">
        {accounts.map((account, index) => {
          const name = `${ids}-${account.id}-nome`;
          const type = `${ids}-${account.id}-tipo`;
          return (
            <li
              key={account.id}
              data-account={account.id}
              className={cn(
                "flex flex-wrap items-center gap-x-3 bg-surface py-2 pr-2 pl-4",
                index > 0 && "border-t border-border",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  ACCOUNT_DOT[account.color],
                )}
              />
              <span className="flex min-w-0 flex-[1_1_8rem] flex-col">
                <span
                  id={name}
                  className="text-body font-semibold text-pretty wrap-break-word text-fg"
                >
                  {account.name}
                </span>
                <span id={type} className="text-caption text-fg-3">
                  {accountTypeLabel(account.type)}
                </span>
              </span>
              <Switch
                className="ml-auto"
                checked={shown[account.id] ?? false}
                onCheckedChange={(checked) =>
                  onChange({ ...shown, [account.id]: checked })
                }
                labelledBy={name}
                describedBy={type}
              />
            </li>
          );
        })}
      </ul>
      {noneShown ? (
        <p className="mt-3 text-caption text-pretty text-fg-3">
          Sem contas marcadas, cada dia mostra só o total.
        </p>
      ) : null}
    </>
  );
}

/** "Escolher contas", at the foot of Quanto dá para gastar por dia. */
export function SpendableAccountsButton({ accounts }: { accounts: Accounts }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        className="max-w-full shrink self-start -ml-3"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <ListChecks aria-hidden="true" />
        Escolher contas
      </Button>
      <SpendableAccountsSheet
        accounts={accounts}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
