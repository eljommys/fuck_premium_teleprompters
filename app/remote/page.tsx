"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LIMITS, scrollRate } from "@/lib/state";
import { useTeleprompter } from "@/lib/useTeleprompter";
import {
  READ_LINE,
  SCRIPT_PADDING,
  SETTLED,
  useFollower,
  useScriptScroll,
} from "@/lib/useScriptScroll";
import { ConnectionDot, Slider, Toggle } from "@/components/ui";

/** Cuerpo de letra del guion en el móvil: es un monitor, no el cristal. */
const REMOTE_FONT_SIZES = [16, 19, 22, 26, 30] as const;
const REMOTE_FONT_KEY = "teleprompter:remoteFontSize";
/** Salto de los botones del pie, en segundos de lectura. */
const JUMP_SECONDS = 5;
/** Movimiento a partir del cual un toque deja de contar como toque. */
const TAP_SLOP = 10;
/** Suavizado al seguir al visor. */
const FOLLOW_TAU = 0.09;
/** Tras soltar el dedo se ignoran los informes del visor que aún viajaban. */
const SETTLE_MS = 400;
/** Ritmo máximo al que se publica la posición mientras se arrastra. */
const PUBLISH_MS = 33;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export default function RemotePage() {
  const { state, update, connection, clients } = useTeleprompter("remote");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fontSize, setFontSize] = useState<number>(REMOTE_FONT_SIZES[2]);
  /** Posición para pintar la barra y el reloj, no en cada fotograma. */
  const [shown, setShown] = useState(0);

  const rate = scrollRate(state);
  const follower = useFollower(FOLLOW_TAU);
  const gesture = useRef({ startY: 0, startPosition: 0, moved: false, pointerId: -1 });
  const publishedAtRef = useRef(0);
  /** Última posición publicada por este mando, para no seguir su propio eco. */
  const publishedRef = useRef(0);
  const stepRef = useRef(-1);
  const liveRef = useRef({ rate, playing: state.playing });
  liveRef.current = { rate, playing: state.playing };

  // El cuerpo de letra del móvil es una preferencia de este aparato, no del
  // guion: no viaja por la red ni toca el tamaño del iPad.
  useEffect(() => {
    const saved = Number(localStorage.getItem(REMOTE_FONT_KEY));
    if (REMOTE_FONT_SIZES.includes(saved as (typeof REMOTE_FONT_SIZES)[number])) setFontSize(saved);
  }, []);

  const onFrame = useCallback(
    (position: number, delta: number) => {
      const step = Math.round(position * 500);
      if (step !== stepRef.current) {
        stepRef.current = step;
        setShown(position);
      }
      // Mientras el dedo está apoyado manda el dedo, no el visor.
      const blocked = gesture.current.pointerId !== -1;
      return follower.step(position, delta, { ...liveRef.current, blocked });
    },
    [follower],
  );

  // Sin `onMeasure`: el mando nunca publica docHeight, esa medida es del visor.
  const scroll = useScriptScroll({ playing: state.playing, rate, onFrame });

  // Seguir lo que informa el visor, pero no el eco de lo que uno mismo mandó:
  // perseguir la propia posición dejaría el guion congelado.
  useEffect(() => {
    if (Math.abs(state.position - publishedRef.current) < SETTLED) return;
    follower.aim(state.position);
  }, [state.position, follower]);

  const publish = useCallback(
    (position: number, force = false) => {
      const now = performance.now();
      if (!force && now - publishedAtRef.current < PUBLISH_MS) return;
      publishedAtRef.current = now;
      publishedRef.current = position;
      update({ position });
    },
    [update],
  );

  const jump = (seconds: number) => {
    if (rate <= 0) return;
    follower.hold(SETTLE_MS);
    scroll.setPosition(scroll.getPosition() + seconds * rate);
    publish(scroll.getPosition(), true);
  };

  const goToStart = () => {
    follower.hold(SETTLE_MS);
    scroll.setPosition(0);
    publishedRef.current = 0;
    update({ position: 0, playing: false });
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // Un segundo dedo apoyado sin querer no debe secuestrar el gesto en curso
    // ni contar como un toque suelto que arranca o para la marcha.
    if (gesture.current.pointerId !== -1) return;
    gesture.current = {
      startY: event.clientY,
      startPosition: scroll.getPosition(),
      moved: false,
      pointerId: event.pointerId,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (gesture.current.pointerId !== event.pointerId) return;
    if (!gesture.current.moved) {
      if (Math.abs(event.clientY - gesture.current.startY) < TAP_SLOP) return;
      gesture.current.moved = true;
      setDragging(true);
      // Agarrar el guion lo detiene, como sujetar el papel con la mano. Además
      // evita que el visor pelee entre su propio avance y lo que mandas tú.
      if (state.playing) update({ playing: false });
      // Se anclan aquí y no en el pointerdown: entre uno y otro el guion pudo
      // seguir avanzando, y anclar con el valor viejo daría un salto atrás.
      // De paso, el arrastre empieza en cero en vez de brincar los 10 px del
      // umbral.
      gesture.current.startY = event.clientY;
      gesture.current.startPosition = scroll.getPosition();
    }
    const travel = scroll.getTravel();
    if (travel <= 0) return;
    // 1:1 con el texto que ves en este móvil: el papel sigue al dedo.
    const delta = event.clientY - gesture.current.startY;
    scroll.setPosition(gesture.current.startPosition - delta / travel);
    publish(scroll.getPosition());
  };

  const endGesture = (event: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    if (gesture.current.pointerId !== event.pointerId) return;
    const { moved } = gesture.current;
    gesture.current.pointerId = -1;
    setDragging(false);
    follower.hold(SETTLE_MS);
    if (moved) publish(scroll.getPosition(), true);
    else if (!cancelled) update({ playing: !state.playing });
  };

  const remaining = rate > 0 ? (1 - shown) / rate : 0;

  return (
    <main className="fixed inset-0 flex flex-col bg-ink-950 select-none">
      <header className="flex items-center justify-between px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <ConnectionDot connection={connection} label={connection !== "online"} />
        <span
          className={`flex items-center gap-2 text-xs uppercase tracking-widest ${
            state.playing ? "text-accent-bright" : "text-ink-500"
          }`}
        >
          {state.playing ? (
            <svg viewBox="0 0 24 24" className="size-3 fill-current">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="size-3 fill-current">
              <path d="M7 4.5 19.5 12 7 19.5z" />
            </svg>
          )}
          {state.playing ? "En marcha" : "En pausa"}
        </span>
        <span className="font-mono text-xs text-ink-500">
          {clients.prompter === 0
            ? "sin visor"
            : clients.prompter === 1
              ? "1 visor"
              : `${clients.prompter} visores`}
        </span>
      </header>

      {/* El guion es el botón: un toque reproduce o pausa, arrastrar desplaza. */}
      <div
        ref={scroll.viewportRef}
        className="relative flex-1 touch-none overflow-hidden"
        style={{ containerType: "size" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => endGesture(event, false)}
        onPointerCancel={(event) => endGesture(event, true)}
      >
        <div
          ref={scroll.contentRef}
          className="absolute inset-x-0 top-0 whitespace-pre-wrap break-words px-5 text-center text-ink-100 will-change-transform"
          style={{
            fontSize: `${fontSize}px`,
            lineHeight: state.lineHeight,
            ...SCRIPT_PADDING,
          }}
        >
          {state.text || "Pega el guion desde el editor del Mac."}
        </div>

        {/* Línea de lectura, en el mismo 40 % que el iPad. */}
        <div
          className="pointer-events-none absolute inset-x-0 flex items-center"
          style={{ top: READ_LINE }}
        >
          <div className="h-px flex-1 bg-accent/30" />
          <div className="mx-2 size-1.5 rotate-45 bg-accent" />
          <div className="h-px flex-1 bg-accent/30" />
        </div>

        {/* Fundidos para que el texto no choque con la cabecera ni con la barra
            de progreso: abajo el fundido llega opaco hasta pasada la barra. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-linear-to-b from-ink-950 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-linear-to-t from-ink-950 from-25% to-transparent" />

        <div className="pointer-events-none absolute inset-x-5 bottom-4">
          <div className="flex items-baseline justify-between pb-2 font-mono text-xs tabular-nums text-ink-500">
            <span>{Math.round(shown * 100)}%</span>
            <span className={dragging ? "text-ink-300" : "text-accent"}>
              {rate > 0 ? `quedan ${formatTime(remaining)}` : "sin visor"}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-ink-800">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${shown * 100}%` }}
            />
          </div>
        </div>
      </div>

      <nav className="flex items-center justify-between gap-3 border-t border-ink-800 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => jump(-JUMP_SECONDS)}
          className="flex-1 rounded-xl bg-ink-900 py-3 text-center text-sm font-medium text-ink-300"
        >
          ▲ {JUMP_SECONDS} s
        </button>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Ajustes"
          className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-accent text-ink-950"
        >
          {/* Rueda dentada: los dientes son gruesos y salen del cuerpo, que es
              lo que la distingue de un sol de radios finos y sueltos. */}
          <svg viewBox="0 0 24 24" className="size-7 fill-current">
            {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
              <rect
                key={angle}
                x="10.3"
                y="1.4"
                width="3.4"
                height="5.4"
                rx="1.2"
                transform={`rotate(${angle} 12 12)`}
              />
            ))}
            <path
              fillRule="evenodd"
              d="M12 5a7 7 0 1 0 0 14 7 7 0 1 0 0-14zm0 4.4a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2z"
            />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => jump(JUMP_SECONDS)}
          className="flex-1 rounded-xl bg-ink-900 py-3 text-center text-sm font-medium text-ink-300"
        >
          ▼ {JUMP_SECONDS} s
        </button>
      </nav>

      {settingsOpen && (
        <div className="fixed inset-0 z-10 flex flex-col justify-end bg-black/60">
          <button
            type="button"
            aria-label="Cerrar ajustes"
            className="flex-1"
            onClick={() => setSettingsOpen(false)}
          />
          <div className="max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-ink-800 bg-ink-900 px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-ink-700" />

            <div className="space-y-5">
              <Slider
                label="Velocidad"
                value={state.speed}
                {...LIMITS.speed}
                format={(value) => `${value}`}
                onChange={(speed) => update({ speed })}
              />
              <Slider
                label="Tamaño de letra del visor"
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
                label="Márgenes del visor"
                value={state.margin}
                {...LIMITS.margin}
                format={(value) => `${value}%`}
                onChange={(margin) => update({ margin })}
              />

              <div>
                <span className="block pb-2 text-sm font-medium text-ink-300">
                  Tamaño de letra en este móvil
                </span>
                <div className="flex gap-2">
                  {REMOTE_FONT_SIZES.map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => {
                        setFontSize(size);
                        localStorage.setItem(REMOTE_FONT_KEY, String(size));
                      }}
                      className={`flex-1 rounded-xl border py-3 text-sm ${
                        size === fontSize
                          ? "border-accent bg-accent/10 text-ink-100"
                          : "border-ink-800 bg-ink-850 text-ink-300"
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Toggle
                  label="Espejo H"
                  checked={state.mirrorH}
                  onChange={(mirrorH) => update({ mirrorH })}
                />
                <Toggle
                  label="Espejo V"
                  checked={state.mirrorV}
                  onChange={(mirrorV) => update({ mirrorV })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    goToStart();
                    setSettingsOpen(false);
                  }}
                  className="rounded-xl border border-ink-800 bg-ink-850 py-3 text-sm font-medium text-ink-100"
                >
                  Volver al inicio
                </button>
                <Link
                  href="/"
                  className="rounded-xl border border-ink-800 bg-ink-850 py-3 text-center text-sm font-medium text-ink-300"
                >
                  Inicio
                </Link>
              </div>

              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="w-full rounded-xl bg-accent py-4 text-base font-semibold text-ink-950"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
