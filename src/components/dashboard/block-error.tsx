"use client";

import { CloudOff, RefreshCw } from "lucide-react";
import { catchError, type ErrorInfo } from "next/error";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type BlockErrorProps = {
  /** "Não deu para carregar o orçamento" (the catalog's errorTitle). */
  title: string;
};

/**
 * Error of one block of the Início (doc 02 §8): the rest of the screen keeps
 * working, and "Tentar de novo" fetches the block again.
 */
function BlockError({
  title,
  error,
  retry,
}: BlockErrorProps & Pick<ErrorInfo, "error" | "retry">) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Card role="alert" className="flex flex-col items-center px-5 py-6">
      <div
        aria-hidden="true"
        className="flex size-12 items-center justify-center rounded-full bg-surface-2 text-fg-2 [&_svg]:size-6 [&_svg]:stroke-[1.75]"
      >
        <CloudOff />
      </div>
      <h2 className="mt-3 text-center text-headline text-balance text-fg">
        {title}
      </h2>
      <p className="mt-1 max-w-sm text-center text-callout text-pretty text-fg-2">
        Pode ter sido a conexão. Seus dados estão seguros.
      </p>
      <Button variant="tonal" className="mt-4" onClick={() => retry()}>
        <RefreshCw aria-hidden="true" />
        Tentar de novo
      </Button>
    </Card>
  );
}

/** Wraps a block of the Início in its own error boundary. */
export const HomeBlockBoundary = catchError(
  ({ title }: BlockErrorProps, { error, retry }: ErrorInfo) => (
    <BlockError title={title} error={error} retry={retry} />
  ),
);
