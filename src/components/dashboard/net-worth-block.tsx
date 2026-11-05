import { Landmark } from "lucide-react";
import Link from "next/link";
import { NetWorthCard } from "@/components/reports/net-worth-card";
import { Button } from "@/components/ui/button";
import { BlockInvite } from "./block-invite";
import { BlockLink } from "./block-link";

type NetWorthBlockProps = {
  /** End-of-month net worth, from 7 months back to the last one. */
  points: { month: string; cents: number }[];
  /** "no fim de setembro" for a past month, "hoje" otherwise. */
  caption: string;
  reportHref: string;
};

/** Points on the Início: the 6 months of the window and the one before. */
export const NET_WORTH_BLOCK_POINTS = 7;

/**
 * Patrimônio on the Início (doc 02 §6.3, §6.12): the Visão geral's card —
 * value, change in 6 months and sparkline — up to the month on screen.
 */
export function NetWorthBlock({
  points,
  caption,
  reportHref,
}: NetWorthBlockProps) {
  return (
    <NetWorthCard
      // Another series starts its table view closed.
      key={points.at(-1)?.month}
      points={points}
      period={6}
      headingId="inicio-patrimonio"
      title="Patrimônio"
      caption={caption}
      action={<BlockLink href={reportHref}>Ver relatório</BlockLink>}
    />
  );
}

/** Every point at zero: no balance anywhere yet. */
export function NetWorthInvite() {
  return (
    <BlockInvite
      icon={<Landmark />}
      title="Seu patrimônio está zerado"
      description="Com saldo nas contas, a evolução dos últimos meses aparece aqui."
      action={
        <Button asChild variant="secondary" size="sm">
          <Link href="/contas">Ver contas</Link>
        </Button>
      }
    />
  );
}
