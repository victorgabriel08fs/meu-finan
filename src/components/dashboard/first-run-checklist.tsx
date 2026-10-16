import {
  ChevronDown,
  ChevronRight,
  Landmark,
  Lock,
  ReceiptText,
  Smartphone,
  Sprout,
  Target,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * First run (doc 02 §6.2, §6.3): without accounts the Início shows this
 * "Comece por aqui" checklist instead of its blocks. Creating the first
 * account is the one primary action; recording a spend waits for it (the
 * quick-add sheet needs an account), and says so.
 */
export function FirstRunChecklist() {
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-on-primary-soft"
        >
          <Sprout className="size-6" />
        </span>
        <div className="min-w-0">
          <h2 className="text-title-3 text-fg">Comece por aqui</h2>
          <p className="mt-1 text-body text-fg-2">
            Em poucos passos o app passa a mostrar quanto você tem e quanto pode
            gastar no mês.
          </p>
        </div>
      </div>

      <Button asChild variant="tonal" className="mt-4 w-full">
        <Link href="/onboarding">Configurar em 1 minuto</Link>
      </Button>

      <ol className="mt-5 flex flex-col [&>li+li]:border-t [&>li+li]:border-border">
        <Step
          number={1}
          icon={<Landmark />}
          title="Criar sua primeira conta"
          description="Conta corrente, poupança, carteira ou cartão."
          href="/contas/nova"
          highlight
        />
        <Step
          number={2}
          icon={<ReceiptText />}
          title="Registrar um gasto"
          description="Disponível depois de criar uma conta."
        />
        <Step
          number={3}
          icon={<Target />}
          title="Criar um orçamento"
          description="Quanto gastar por categoria no mês."
          href="/planejar/orcamentos"
        />
        <li>
          <details className="group">
            <summary
              className={cn(
                rowClass,
                "cursor-pointer list-none [&::-webkit-details-marker]:hidden",
              )}
            >
              <StepBadge number={4} icon={<Smartphone />} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-body font-semibold text-fg">
                  Instalar o app
                </span>
                <span className="text-caption text-fg-3">
                  Abre direto da tela inicial, como um app.
                </span>
              </span>
              <ChevronDown
                aria-hidden="true"
                className="size-5 shrink-0 text-fg-3 transition-transform duration-150 group-open:rotate-180"
              />
            </summary>
            <div className="mb-3 ml-13 flex flex-col gap-2 rounded-control bg-bg px-4 py-3 text-callout text-fg-2">
              <p>
                <strong className="font-semibold text-fg">iPhone:</strong> no
                Safari, toque em Compartilhar e depois em “Adicionar à Tela de
                Início”.
              </p>
              <p>
                <strong className="font-semibold text-fg">Android:</strong> no
                Chrome, toque no menu ⋮ e em “Instalar app”.
              </p>
            </div>
          </details>
        </li>
      </ol>

      <Button asChild size="lg" className="mt-4 w-full">
        <Link href="/contas/nova">Criar minha primeira conta</Link>
      </Button>
    </Card>
  );
}

const rowClass = "flex min-h-16 items-center gap-3 py-2.5";

function StepBadge({
  number,
  icon,
  highlight = false,
  disabled = false,
}: {
  number: number;
  icon: ReactNode;
  highlight?: boolean;
  disabled?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative flex size-10 shrink-0 items-center justify-center rounded-full [&_svg]:size-5",
        highlight ? "bg-primary text-on-primary" : "bg-surface-2 text-fg-2",
        disabled && "opacity-60",
      )}
    >
      {icon}
      <span className="absolute -right-1 -bottom-1 flex size-4.5 items-center justify-center rounded-full bg-surface text-micro font-bold text-fg-2 ring-1 ring-border">
        {number}
      </span>
    </span>
  );
}

function Step({
  number,
  icon,
  title,
  description,
  href,
  highlight = false,
}: {
  number: number;
  icon: ReactNode;
  title: string;
  description: string;
  /** Without it the step is shown as not available yet. */
  href?: string;
  highlight?: boolean;
}) {
  const content = (
    <>
      <StepBadge
        number={number}
        icon={icon}
        highlight={highlight}
        disabled={!href}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn(
            "text-body font-semibold",
            href ? "text-fg" : "text-fg-3",
          )}
        >
          {title}
        </span>
        <span className="text-caption text-fg-3">{description}</span>
      </span>
      {href ? (
        <ChevronRight
          aria-hidden="true"
          className="size-5 shrink-0 text-fg-3"
        />
      ) : (
        <Lock aria-hidden="true" className="size-4.5 shrink-0 text-fg-3" />
      )}
    </>
  );

  return (
    <li>
      {href ? (
        <Link
          href={href}
          className={cn(
            rowClass,
            "-mx-2 rounded-control px-2 transition-colors duration-100 hover:bg-surface-2/50 active:bg-surface-2",
          )}
        >
          {content}
        </Link>
      ) : (
        <div className={rowClass}>{content}</div>
      )}
    </li>
  );
}
