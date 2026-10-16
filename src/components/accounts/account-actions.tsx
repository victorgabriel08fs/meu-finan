"use client";

import { Archive, Pencil, Scale } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";
import { AccountEditSheet } from "./account-edit-sheet";
import type { AccountSnapshot } from "./account-meta";
import { AdjustBalanceSheet } from "./adjust-balance-sheet";
import { ArchiveAccountSheet } from "./archive-account-sheet";

/** In-line actions of an account (doc 02 §6.7): Ajustar saldo · Editar · Arquivar. */
export function AccountActions({ account }: { account: AccountSnapshot }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <AdjustBalanceSheet
        account={account}
        trigger={<ActionTile icon={<Scale />} label="Ajustar saldo" />}
      />
      <AccountEditSheet
        account={account}
        trigger={<ActionTile icon={<Pencil />} label="Editar" />}
      />
      <ArchiveAccountSheet
        account={account}
        trigger={<ActionTile icon={<Archive />} label="Arquivar" />}
      />
    </div>
  );
}

/** Edit and archive a card from its screen header (two 44px icon buttons). */
export function CardHeaderActions({ account }: { account: AccountSnapshot }) {
  return (
    <>
      <AccountEditSheet
        account={account}
        trigger={
          <IconButton label="Editar cartão">
            <Pencil />
          </IconButton>
        }
      />
      <ArchiveAccountSheet
        account={account}
        trigger={
          <IconButton label="Arquivar cartão">
            <Archive />
          </IconButton>
        }
      />
    </>
  );
}

type ActionTileProps = ComponentProps<"button"> & {
  icon: ReactNode;
  label: string;
};

/** Tile button: 40px tonal icon over a caption label, the whole tile tappable. */
function ActionTile({ icon, label, className, ...props }: ActionTileProps) {
  return (
    <button
      type="button"
      className={cn(
        "flex min-h-19 flex-col items-center justify-center gap-1.5 rounded-card bg-surface px-2 py-3 text-caption font-semibold text-fg shadow-card",
        "transition-[scale,background-color] duration-100 ease-standard hover:bg-surface-2/60 active:scale-97 active:bg-surface-2",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="flex size-10 items-center justify-center rounded-full bg-primary-soft text-on-primary-soft [&_svg]:size-5"
      >
        {icon}
      </span>
      {label}
    </button>
  );
}
