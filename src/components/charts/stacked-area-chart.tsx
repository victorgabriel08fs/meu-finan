"use client";

import {
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
  useRef,
} from "react";
import { cn } from "@/lib/utils";
import {
  areaPath,
  labelAnchor,
  linePath,
  nearestIndex,
  type Point,
  type Ticks,
  topPercent,
  VIEWBOX,
} from "./scale";

export type AreaLayer = {
  key: string;
  label: string;
  /** CSS color of the layer, e.g. `var(--chart-1)`. */
  color: string;
  /** Amount of this layer at each point (not cumulative); layers stack bottom-up. */
  values: readonly number[];
};

type StackedAreaChartProps = {
  layers: readonly AreaLayer[];
  /** Point indices the scrub snaps to (e.g. one per year), ascending. */
  stops: readonly number[];
  /** Index into `stops`. */
  selected: number;
  onSelectedChange: (stopIndex: number) => void;
  /** Accessible name of the scrub control. */
  scrubLabel: string;
  /** Spoken description of a stop ("Ano 7: total R$ 149.697, investido R$ 94.000"). */
  valueText: (stopIndex: number) => string;
  ticks: Ticks;
  formatTick: (value: number) => ReactNode;
  /** Labels under the plot, at 0–1 positions along the x axis. */
  xLabels: readonly { position: number; label: string }[];
  /** One point worth flagging, with a short direct label. */
  marker?: { index: number; label: string } | null;
  /** Height of the plot (the x labels add 22px below it). */
  plotClassName?: string;
  className?: string;
};

const ANCHOR_SHIFT = { start: "0%", middle: "-50%", end: "-100%" } as const;

/**
 * Stacked area chart with scrub (doc 02 §9.2, §9.4): areas at 12% under 2px
 * lines, solid hairline grid with compact ticks in a gutter on the right, and a
 * transparent range input over the plot — drag, tap, arrow keys and screen
 * readers all move the selection, whose values the caller shows above.
 */
export function StackedAreaChart({
  layers,
  stops,
  selected,
  onSelectedChange,
  scrubLabel,
  valueText,
  ticks,
  formatTick,
  xLabels,
  marker,
  plotClassName = "h-40",
  className,
}: StackedAreaChartProps) {
  const dragging = useRef(false);
  const count = layers[0]?.values.length ?? 0;
  const last = Math.max(1, count - 1);
  const xPercent = (index: number) => (index / last) * 100;
  const yPercent = (value: number) => topPercent(value, ticks);
  const toPoint = (index: number, value: number): Point => [
    (index / last) * VIEWBOX,
    (yPercent(value) / 100) * VIEWBOX,
  ];

  // Running totals: the top edge of each layer.
  const cumulative: number[][] = [];
  let running: number[] = Array.from({ length: count }, () => 0);
  for (const layer of layers) {
    running = running.map((sum, index) => sum + (layer.values[index] ?? 0));
    cumulative.push(running);
  }
  const baseline = Array.from({ length: count }, (_, index) =>
    toPoint(index, 0),
  );
  const edges = cumulative.map((values) =>
    values.map((value, index) => toPoint(index, value)),
  );

  const stopIndex = Math.min(Math.max(selected, 0), stops.length - 1);
  const pointIndex = stops[stopIndex] ?? 0;
  const selectedX = xPercent(pointIndex);
  const positions = stops.map((stop) => stop / last);

  const total = cumulative.at(-1) ?? [];
  const markerPoint =
    marker && marker.index >= 0 && marker.index < count
      ? { x: xPercent(marker.index), y: yPercent(total[marker.index] ?? 0) }
      : null;

  function selectFromPointer(event: PointerEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = (event.clientX - rect.left) / rect.width;
    onSelectedChange(nearestIndex(ratio, positions));
  }

  return (
    <div className={cn("relative pt-5", className)}>
      <div className={cn("relative", plotClassName)}>
        {ticks.values.map((value) => (
          <div
            key={value}
            aria-hidden="true"
            className={cn(
              "absolute inset-x-0 border-t",
              value === 0 ? "border-chart-axis" : "border-chart-grid",
            )}
            style={{ top: `${yPercent(value)}%` }}
          >
            {value === 0 ? null : (
              <span className="absolute right-0 bottom-0.5 text-micro text-fg-3 tabular-nums">
                {formatTick(value)}
              </span>
            )}
          </div>
        ))}

        {/* The data stops short of the tick labels on the right. */}
        <div className="absolute inset-y-0 right-11 left-0">
          <svg
            aria-hidden="true"
            viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
            preserveAspectRatio="none"
            className="absolute inset-0 size-full overflow-visible"
          >
            {layers.map((layer, index) => (
              <path
                key={`${layer.key}-area`}
                d={areaPath(edges[index] ?? [], edges[index - 1] ?? baseline)}
                style={{ fill: layer.color }}
                fillOpacity={0.12}
              />
            ))}
            {layers.map((layer, index) => (
              <path
                key={`${layer.key}-line`}
                d={linePath(edges[index] ?? [])}
                fill="none"
                style={{ stroke: layer.color }}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>

          <div
            aria-hidden="true"
            className="absolute inset-y-0 w-px -translate-x-1/2 bg-border-strong/60"
            style={{ left: `${selectedX}%` }}
          />

          {markerPoint && marker ? (
            <MarkerLabel
              x={markerPoint.x}
              y={markerPoint.y}
              label={marker.label}
            />
          ) : null}

          {layers.map((layer, index) => (
            <Dot
              key={`${layer.key}-dot`}
              x={selectedX}
              y={yPercent(cumulative[index]?.[pointIndex] ?? 0)}
              color={layer.color}
            />
          ))}

          <input
            type="range"
            min={0}
            max={Math.max(0, stops.length - 1)}
            step={1}
            value={stopIndex}
            aria-label={scrubLabel}
            aria-valuetext={valueText(stopIndex)}
            onChange={(event) => onSelectedChange(Number(event.target.value))}
            className="peer pointer-events-none absolute inset-0 m-0 size-full appearance-none opacity-0"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-1 rounded-chip peer-focus-visible:outline-2 peer-focus-visible:outline-focus"
          />
          {/* Pointer scrub: the range input above handles keys and screen
              readers; this layer follows the finger anywhere on the plot (iOS
              range inputs only move by their thumb) and lets vertical swipes
              scroll the page. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 cursor-ew-resize"
            style={{ touchAction: "pan-y" }}
            onPointerDown={(event) => {
              dragging.current = true;
              event.currentTarget.setPointerCapture?.(event.pointerId);
              selectFromPointer(event);
            }}
            onPointerMove={(event) => {
              if (dragging.current || event.pointerType === "mouse") {
                selectFromPointer(event);
              }
            }}
            onPointerUp={() => {
              dragging.current = false;
            }}
            onPointerCancel={() => {
              dragging.current = false;
            }}
          />
        </div>
      </div>

      <div aria-hidden="true" className="relative mt-1.5 mr-11 h-4">
        {xLabels.map((item) => {
          const percent = item.position * 100;
          const anchor = labelAnchor(percent);
          return (
            <span
              key={`${item.position}-${item.label}`}
              className="absolute top-0 whitespace-nowrap text-micro text-fg-3"
              style={{
                left: `${percent}%`,
                transform: `translateX(${ANCHOR_SHIFT[anchor]})`,
              }}
            >
              {item.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function Dot({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <span
      aria-hidden="true"
      className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-(--dot) ring-2 ring-surface"
      style={{ left: `${x}%`, top: `${y}%`, "--dot": color } as CSSProperties}
    />
  );
}

function MarkerLabel({ x, y, label }: { x: number; y: number; label: string }) {
  const anchor = x > 60 ? "end" : "start";
  return (
    <>
      <span
        aria-hidden="true"
        className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg ring-2 ring-surface"
        style={{ left: `${x}%`, top: `${y}%` }}
      />
      <span
        aria-hidden="true"
        className="absolute whitespace-nowrap rounded-badge bg-surface/85 px-1 text-micro font-bold text-fg"
        style={{
          left: `${x}%`,
          top: `${y}%`,
          transform: `translate(${anchor === "end" ? "calc(-100% - 8px)" : "8px"}, calc(-100% - 4px))`,
        }}
      >
        {label}
      </span>
    </>
  );
}
