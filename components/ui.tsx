"use client";

import type { Connection } from "@/lib/useTeleprompter";

export function ConnectionDot({ connection, label = true }: { connection: Connection; label?: boolean }) {
  const text =
    connection === "online" ? "Conectado" : connection === "connecting" ? "Conectando…" : "Sin conexión";
  const color =
    connection === "online" ? "bg-accent-bright" : connection === "connecting" ? "bg-ink-500" : "bg-red-500";

  return (
    <span className="inline-flex items-center gap-2 text-sm text-ink-300">
      <span className={`size-2 rounded-full ${color} ${connection !== "online" ? "animate-pulse" : ""}`} />
      {label && text}
    </span>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block select-none">
      <span className="flex items-baseline justify-between pb-1">
        <span className="text-sm font-medium text-ink-300">{label}</span>
        <span className="font-mono text-sm text-accent-bright tabular-nums">
          {format ? format(value) : value}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex w-full select-none items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
        checked
          ? "border-accent bg-accent/10 text-ink-100"
          : "border-ink-800 bg-ink-900 text-ink-300"
      }`}
    >
      <span className="text-base font-medium">{label}</span>
      <span
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
          checked ? "bg-accent" : "bg-ink-700"
        }`}
      >
        <span
          className={`absolute top-1 size-5 rounded-full bg-ink-100 transition-[left] ${
            checked ? "left-6" : "left-1"
          }`}
        />
      </span>
    </button>
  );
}
