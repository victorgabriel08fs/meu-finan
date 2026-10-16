import { Check } from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

type RingSize = 44 | 56 | 120;

type RingProps = {
  /** Progress from 0 to 1 (values outside are clamped). */
  value: number;
  size?: RingSize;
  /** What the ring measures, e.g. the goal name, for screen readers. */
  label?: string;
  className?: string;
};

const METRICS: Record<
  RingSize,
  { stroke: number; text: string; check: string }
> = {
  44: { stroke: 6, text: "text-micro font-bold", check: "size-4" },
  56: { stroke: 7, text: "text-caption font-bold", check: "size-5" },
  120: { stroke: 10, text: "text-headline", check: "size-8" },
};

/**
 * Goal ring (doc 02 §5.10): --surface-2 track and a round-capped --primary
 * arc; % in the centre, or a check once the goal is reached. Grows from zero
 * on first display unless the user prefers reduced motion.
 */
export function Ring({ value, size = 56, label, className }: RingProps) {
  const progress = Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0;
  const done = progress >= 1;
  const { stroke, text, check } = METRICS[size];
  const radius = (size - stroke) / 2;
  const length = 2 * Math.PI * radius;
  const center = size / 2;
  // Floor so 99.6% never reads "100%" before the goal is actually met.
  const percent = `${Math.floor(progress * 100)}%`;
  const spoken = done ? "meta concluída" : `${percent} concluído`;

  return (
    <div
      role="img"
      aria-label={label ? `${label}: ${spoken}` : spoken}
      data-slot="ring"
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <svg
        aria-hidden="true"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0 -rotate-90"
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-surface-2"
        />
        {progress > 0 ? (
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={length}
            strokeDashoffset={length * (1 - progress)}
            className="ring-arc stroke-primary"
            style={{ "--ring-length": length } as CSSProperties}
          />
        ) : null}
      </svg>
      <span
        aria-hidden="true"
        className={cn(
          "relative text-fg tabular-nums",
          done ? "text-primary" : text,
        )}
      >
        {done ? <Check className={check} strokeWidth={2.5} /> : percent}
      </span>
    </div>
  );
}
