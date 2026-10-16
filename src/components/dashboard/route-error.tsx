"use client";

import { CloudOff, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";

export type RouteErrorProps = {
  error: Error & { digest?: string };
  /** Re-fetches and re-renders the segment (Next's error boundary). */
  retry: () => void;
};

type Props = RouteErrorProps & {
  /** "Não deu para carregar o resumo". */
  title: string;
  /** Where to go instead, when the screen has a parent. */
  back?: { href: string; label: string };
};

/**
 * Error fallback of a screen (doc 02 §8): what failed, a calm hint and
 * "Tentar de novo"; the tab bar and the rest of the app keep working.
 */
export function RouteError({ error, retry, title, back }: Props) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="pt-[max(1.5rem,env(safe-area-inset-top))]">
      <EmptyState
        icon={<CloudOff />}
        title={title}
        description="Pode ter sido a conexão. Seus dados estão seguros — tente de novo em instantes."
        action={
          <>
            <Button variant="tonal" onClick={() => retry()}>
              <RefreshCw aria-hidden="true" />
              Tentar de novo
            </Button>
            {back ? (
              <Button asChild variant="ghost">
                <Link href={back.href}>{back.label}</Link>
              </Button>
            ) : null}
          </>
        }
      />
    </div>
  );
}
