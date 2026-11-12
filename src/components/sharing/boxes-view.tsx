"use client";

import { PiggyBank, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Sheet } from "@/components/ui/sheet";
import { afterSheetsClose } from "@/components/ui/use-back-to-close";
import type { YearMonth } from "@/lib/finance";
import type { BoxSummary } from "@/server/domain/sharing/boxes";
import { BoxCard } from "./box-card";
import { boxHref } from "./box-model";
import { BoxSheet } from "./box-sheet";
import { GroupTabs } from "./group-tabs";

/** A group's Caixinhas (doc 02 §6.18); the server already checked membership. */
export function BoxesView({
  groupId,
  groupName,
  boxes,
  today,
}: {
  groupId: string;
  groupName: string;
  boxes: BoxSummary[];
  today: YearMonth;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState({ open: false, key: 0 });
  const [goTo, setGoTo] = useState<string | null>(null);
  // The sheet gives its history entry back while it unmounts, in this same
  // commit's cleanup; only then can the push stick.
  useEffect(() => {
    if (goTo && !creating.open) afterSheetsClose(() => router.push(goTo));
  }, [goTo, creating.open, router]);
  const create = () =>
    setCreating((state) => ({ open: true, key: state.key + 1 }));

  return (
    <>
      <PageHeader
        title={groupName}
        back={{ href: "/compartilhado", label: "Compartilhado" }}
        actions={
          <>
            <IconButton
              label="Nova caixinha"
              className="text-primary sm:hidden"
              onClick={create}
            >
              <Plus />
            </IconButton>
            <Button
              size="sm"
              variant="tonal"
              className="max-sm:hidden"
              onClick={create}
            >
              <Plus aria-hidden="true" />
              Nova caixinha
            </Button>
          </>
        }
      />
      <GroupTabs groupId={groupId} active="boxes" />

      {boxes.length === 0 ? (
        <EmptyState
          icon={<PiggyBank />}
          title="Guardem dinheiro juntos"
          description="Uma viagem, uma reforma… cada um guarda a sua parte e vocês acompanham juntos."
          action={
            <Button onClick={create}>
              <Plus aria-hidden="true" />
              Criar caixinha
            </Button>
          }
        />
      ) : (
        <section aria-label="Caixinhas" className="flex flex-col gap-3">
          {boxes.map((box) => (
            <BoxCard key={box.id} box={box} headingLevel={2} />
          ))}
        </section>
      )}

      <Sheet
        open={creating.open}
        onOpenChange={(open) => setCreating((state) => ({ ...state, open }))}
      >
        <BoxSheet
          key={creating.key}
          groupId={groupId}
          box={null}
          today={today}
          onCreated={(boxId) => setGoTo(boxHref(groupId, boxId))}
          onDone={() => setCreating((state) => ({ ...state, open: false }))}
        />
      </Sheet>
    </>
  );
}
