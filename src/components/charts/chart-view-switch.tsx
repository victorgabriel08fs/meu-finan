"use client";

import { ChartColumn, Table2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ChartViewSwitchProps = {
  chart: ReactNode;
  table: ReactNode;
  /** Footnote on the left of the toggle (e.g. "* outubro parcial"). */
  note?: ReactNode;
  className?: string;
};

/** "Ver como tabela" (doc 02 §9.5): swaps a chart for its table twin. */
export function ChartViewSwitch({
  chart,
  table,
  note,
  className,
}: ChartViewSwitchProps) {
  const [showTable, setShowTable] = useState(false);
  return (
    <div className={className}>
      {showTable ? table : chart}
      <div
        className={cn(
          "mt-3 flex items-center gap-3 border-t border-border pt-2",
          note ? "justify-between" : "justify-end",
        )}
      >
        {note ? <p className="text-caption text-fg-3">{note}</p> : null}
        <Button
          variant="ghost"
          size="sm"
          className="-mr-2"
          onClick={() => setShowTable((value) => !value)}
        >
          {showTable ? (
            <ChartColumn aria-hidden="true" />
          ) : (
            <Table2 aria-hidden="true" />
          )}
          {showTable ? "Ver como gráfico" : "Ver como tabela"}
        </Button>
      </div>
    </div>
  );
}
