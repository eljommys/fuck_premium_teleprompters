"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LIMITS, scrollRate } from "@/lib/state";
import { useTeleprompter } from "@/lib/useTeleprompter";
import { ConnectionDot, Slider, Toggle } from "@/components/ui";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export default function EditorPage() {
  const { state, update, connection, clients } = useTeleprompter("editor");
  const [draft, setDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Mientras se escribe manda el borrador local; en cuanto se guarda vuelve a
  // seguir al servidor (por si el texto se cambia desde otro dispositivo).
  const text = draft ?? state.text;

  useEffect(() => {
    if (draft === null) return;
    // Si al borrar lo escrito el borrador vuelve a coincidir con lo guardado,
    // hay que soltarlo: si no, se quedaría pegado y el editor dejaría de ver
    // los cambios que llegasen desde otro aparato.
    if (draft === state.text) {
      setDraft(null);
      return;
    }
    const timer = setTimeout(() => {
      update({ text: draft });
      setDraft(null);
      setSaved(true);
      clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 1500);
    }, 400);
    return () => clearTimeout(timer);
  }, [draft, state.text, update]);

  useEffect(() => () => clearTimeout(savedTimer.current), []);

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  // El recorrido real lo mide el visor, así que la duración solo es fiable
  // cuando hay un iPad conectado.
  const rate = scrollRate(state);
  const duration = rate > 0 ? 1 / rate : 0;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Editor del guion</h1>
          <p className="text-sm text-ink-500">
            Se guarda solo y aparece al instante en el iPad.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <ConnectionDot connection={connection} />
          <Link
            href="/"
            className="rounded-lg border border-ink-800 bg-ink-900 px-3 py-1.5 text-sm text-ink-300"
          >
            Inicio
          </Link>
        </div>
      </header>

      <div className="flex flex-1 flex-col rounded-2xl border border-ink-800 bg-ink-900">
        <textarea
          value={text}
          onChange={(event) => setDraft(event.target.value)}
          spellCheck={false}
          placeholder="Pega aquí tu guion…"
          className="min-h-[45vh] flex-1 resize-none bg-transparent p-5 font-mono text-base leading-relaxed text-ink-100 outline-none placeholder:text-ink-500"
        />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-800 px-5 py-3 text-sm text-ink-500">
          <span className="font-mono tabular-nums">
            {words} palabras
            {rate > 0
              ? ` · ≈ ${formatTime(duration)} a velocidad ${state.speed}`
              : " · conecta el visor para estimar la duración"}
          </span>
          <span className={`transition-opacity ${saved ? "text-accent-bright opacity-100" : "opacity-0"}`}>
            Guardado
          </span>
        </div>
      </div>

      <section className="grid gap-5 rounded-2xl border border-ink-800 bg-ink-900 p-5 sm:grid-cols-2">
        <Slider
          label="Velocidad"
          value={state.speed}
          {...LIMITS.speed}
          onChange={(speed) => update({ speed })}
        />
        <Slider
          label="Tamaño de letra"
          value={state.fontSize}
          {...LIMITS.fontSize}
          format={(value) => `${value} px`}
          onChange={(fontSize) => update({ fontSize })}
        />
        <Slider
          label="Interlineado"
          value={state.lineHeight}
          {...LIMITS.lineHeight}
          format={(value) => value.toFixed(2)}
          onChange={(lineHeight) => update({ lineHeight })}
        />
        <Slider
          label="Márgenes"
          value={state.margin}
          {...LIMITS.margin}
          format={(value) => `${value}%`}
          onChange={(margin) => update({ margin })}
        />
        <Toggle label="Espejo horizontal" checked={state.mirrorH} onChange={(mirrorH) => update({ mirrorH })} />
        <Toggle label="Espejo vertical" checked={state.mirrorV} onChange={(mirrorV) => update({ mirrorV })} />
      </section>

      {/* Los controles van pegados abajo: en una ventana baja o con un guion
          largo quedaban fuera de la vista y no había forma de pulsarlos. */}
      <footer className="sticky bottom-0 -mx-6 mt-auto flex flex-wrap items-center gap-3 border-t border-ink-800 bg-ink-950/95 px-6 py-4 backdrop-blur">
        <button
          type="button"
          onClick={() => update({ playing: !state.playing })}
          className="rounded-xl bg-accent px-6 py-3 font-semibold text-ink-950"
        >
          {state.playing ? "Pausar" : "Reproducir"}
        </button>
        <button
          type="button"
          onClick={() => update({ position: 0, playing: false })}
          className="rounded-xl border border-ink-800 bg-ink-900 px-5 py-3 text-ink-300"
        >
          Volver al inicio
        </button>

        {/* Confirma de un vistazo que la orden llegó al iPad. */}
        <div className="flex min-w-40 flex-1 items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-800">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-150"
              style={{ width: `${state.position * 100}%` }}
            />
          </div>
          <span className="font-mono text-sm tabular-nums text-ink-500">
            {Math.round(state.position * 100)}%
          </span>
        </div>

        <span className="font-mono text-sm text-ink-500">
          {clients.prompter} {clients.prompter === 1 ? "visor" : "visores"} ·{" "}
          {clients.remote} {clients.remote === 1 ? "mando" : "mandos"}
        </span>
      </footer>
    </main>
  );
}
