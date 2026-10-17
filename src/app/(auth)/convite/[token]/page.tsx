import { CircleCheck, Clock, Hourglass, Link2Off } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { AccessLinkState } from "@/lib/admin/status";
import { deadlineLabel } from "@/lib/format/datetime";
import { getSession } from "@/server/dal";
import { inspectAccessLink } from "@/server/domain/access-links";
import { clientAddress } from "@/server/security/guards";
import { throttle } from "@/server/security/throttle";
import { AcceptForm } from "./accept-form";
import { SignedInNotice } from "./signed-in-notice";

export const metadata: Metadata = { title: "Convite" };

// Blocking route: an unknown or forged link answers a real 404 before
// anything renders, like /primeiro-acesso and /recuperar.
export const instant = false;

/**
 * Invite or reset link (doc 01 §11.9, doc 02 §6.1): public and gated by the
 * link's own token. Views are rate-limited per address; a token that does not
 * match any link is a 404 with no hint of why.
 */
export default async function AccessLinkPage({
  params,
}: PageProps<"/convite/[token]">) {
  await connection();
  const { token } = await params;
  const limit = await throttle(
    `invite-view:${clientAddress(await headers())}`,
    { windowSeconds: 600, max: 30 },
  );
  if (!limit.ok) {
    return (
      <Notice
        icon={<Hourglass />}
        title="Muitas tentativas"
        text="Espere alguns minutos e abra o link de novo."
      />
    );
  }

  const link = await inspectAccessLink(token);
  if (!link) notFound();
  if (link.state !== "valid") return <LinkProblem state={link.state} />;

  const isReset = link.purpose === "reset";
  const session = await getSession();
  return (
    <>
      <h1 className="text-title-1 text-fg">
        {isReset ? "Redefinir acesso" : `Olá, ${link.firstName}`}
      </h1>
      <p className="mt-2 text-body text-fg-2">
        {isReset
          ? `${link.firstName}, defina uma nova senha. As sessões abertas da sua conta serão encerradas.`
          : "Você recebeu um convite para o Meu Finan. Crie uma senha para entrar: suas finanças ficam só na sua conta."}
      </p>
      {session ? (
        <SignedInNotice email={session.user.email} />
      ) : (
        <AcceptForm
          token={token}
          purpose={link.purpose}
          email={link.email}
          expiresLabel={deadlineLabel(link.expiresAt, Date.now())}
        />
      )}
    </>
  );
}

const PROBLEMS: Record<
  Exclude<AccessLinkState, "valid">,
  { icon: ReactNode; title: string; text: string; signIn: boolean }
> = {
  expired: {
    icon: <Clock />,
    title: "Este link expirou",
    text: "Os links de acesso valem por 72 horas. Peça um novo a quem administra o app.",
    signIn: false,
  },
  used: {
    icon: <CircleCheck />,
    title: "Este link já foi usado",
    text: "Cada link funciona uma única vez. Se você já criou a sua senha, é só entrar.",
    signIn: true,
  },
  revoked: {
    icon: <Link2Off />,
    title: "Este link não funciona mais",
    text: "Ele foi trocado por um link mais novo ou cancelado. Peça um novo a quem administra o app.",
    signIn: false,
  },
};

function LinkProblem({ state }: { state: Exclude<AccessLinkState, "valid"> }) {
  const problem = PROBLEMS[state];
  return (
    <Notice
      icon={problem.icon}
      title={problem.title}
      text={problem.text}
      action={
        <Button
          asChild
          size="lg"
          variant={problem.signIn ? "primary" : "secondary"}
          className="w-full"
        >
          <Link href="/entrar">
            {problem.signIn ? "Entrar" : "Ir para o login"}
          </Link>
        </Button>
      }
    />
  );
}

function Notice({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <>
      <span
        aria-hidden="true"
        className="flex size-14 items-center justify-center rounded-full bg-surface-2 text-fg-2 [&_svg]:size-7 [&_svg]:stroke-[1.75]"
      >
        {icon}
      </span>
      <h1 className="mt-5 text-title-1 text-fg">{title}</h1>
      <p className="mt-2 text-body text-fg-2">{text}</p>
      {action ? <div className="mt-8">{action}</div> : null}
    </>
  );
}
