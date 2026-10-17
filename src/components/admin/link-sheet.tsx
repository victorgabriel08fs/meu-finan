"use client";

import { Check, Copy, Share2, ShieldCheck } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SheetContent } from "@/components/ui/sheet";
import { deadlineLabel } from "@/lib/format/datetime";

export type IssuedLink = {
  purpose: "invite" | "reset";
  url: string;
  /** ISO timestamp. */
  expiresAt: string;
};

/**
 * The link right after it was made (doc 02 §6.16): the only time it is shown,
 * since only a hash of it is stored. "Copiar link" first; "Compartilhar…"
 * where the browser can hand it to WhatsApp, e-mail and the like.
 */
export function LinkSheetContent({
  link,
  name,
  onDone,
}: {
  link: IssuedLink;
  name: string;
  onDone: () => void;
}) {
  const id = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    setCanShare(typeof navigator.share === "function");
  }, []);

  const firstName = name.trim().split(/\s+/)[0] || name;
  const expires = deadlineLabel(link.expiresAt, Date.now());
  const isInvite = link.purpose === "invite";
  const message = isInvite
    ? `${firstName}, este é o seu convite para o Meu Finan. Crie a sua senha por este link, que vale até ${expires}:`
    : `${firstName}, use este link para redefinir o seu acesso ao Meu Finan. Ele vale até ${expires}:`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      toast("Link copiado");
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // No clipboard (plain HTTP on the local network, or a refusal).
      inputRef.current?.focus();
      inputRef.current?.select();
      toast("O link ficou selecionado: copie e envie.");
    }
  }

  async function share() {
    try {
      await navigator.share({
        title: "Meu Finan",
        text: message,
        url: link.url,
      });
    } catch (error) {
      if ((error as { name?: string } | null)?.name !== "AbortError") {
        await copy();
      }
    }
  }

  return (
    <SheetContent
      title={isInvite ? "Convite pronto" : "Link de redefinição pronto"}
      description={`Envie para ${firstName} por mensagem ou e-mail. O link vale até ${expires} e funciona uma única vez.`}
      footer={
        <>
          <div className={canShare ? "grid grid-cols-2 gap-2" : "flex"}>
            <Button size="lg" className="w-full" onClick={copy}>
              {copied ? (
                <Check aria-hidden="true" />
              ) : (
                <Copy aria-hidden="true" />
              )}
              {copied ? "Copiado" : "Copiar link"}
            </Button>
            {canShare ? (
              <Button
                variant="secondary"
                size="lg"
                className="w-full"
                onClick={share}
              >
                <Share2 aria-hidden="true" />
                Compartilhar
              </Button>
            ) : null}
          </div>
          <Button variant="ghost" size="lg" className="w-full" onClick={onDone}>
            Concluir
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2 pb-2">
        <Label htmlFor={`${id}-link`}>
          {isInvite ? "Link do convite" : "Link de redefinição"}
        </Label>
        {/* The whole link, wrapped: easy to check, and selectable by hand
            when the clipboard is not available. */}
        <textarea
          ref={inputRef}
          id={`${id}-link`}
          readOnly
          rows={3}
          value={link.url}
          spellCheck={false}
          onFocus={(event) => event.currentTarget.select()}
          aria-describedby={`${id}-note`}
          data-testid="access-link"
          className="w-full resize-none break-all rounded-control border border-border-strong bg-surface-2 px-4 py-3 font-mono text-callout text-fg outline-none focus-visible:border-primary focus-visible:shadow-[inset_0_0_0_1px_var(--primary)]"
        />
        <p
          id={`${id}-note`}
          className="mt-1 flex items-start gap-2 text-caption text-fg-3"
        >
          <ShieldCheck aria-hidden="true" className="mt-px size-4 shrink-0" />
          <span>
            Por segurança, o link não aparece de novo. Se ele se perder, gere
            outro: o anterior para de funcionar na hora.
          </span>
        </p>
      </div>
    </SheetContent>
  );
}
