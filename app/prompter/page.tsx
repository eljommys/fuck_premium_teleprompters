"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { scrollRate } from "@/lib/state";
import { useTeleprompter } from "@/lib/useTeleprompter";
import { READ_LINE, SCRIPT_PADDING, SETTLED, useFollower, useScriptScroll } from "@/lib/useScriptScroll";
import { ConnectionDot } from "@/components/ui";

/**
 * Suavizado al seguir una posición que llega de fuera. Con 90 ms el arrastre
 * del móvil se ve continuo en el iPad en vez de a saltos, y sigue siendo lo
 * bastante rápido como para que no parezca que va con retraso.
 */
const FOLLOW_TAU = 0.09;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export default function PrompterPage() {
  const { state, update, connection } = useTeleprompter("prompter");
  const [progress, setProgress] = useState(0);
  const [chromeVisible, setChromeVisible] = useState(true);

  const rate = scrollRate(state);
  const follower = useFollower(FOLLOW_TAU);
  /** Última posición publicada, para distinguir el propio eco de una orden. */
  const reportedRef = useRef(0);
  /** Paso redondeado, para no renderizar React en cada fotograma. */
  const stepRef = useRef(-1);
  /** El bucle necesita el ritmo y la marcha del render actual. */
  const liveRef = useRef({ rate, playing: state.playing });
  liveRef.current = { rate, playing: state.playing };

  const onFrame = useCallback(
    (position: number, delta: number) => {
      // La barra y el reloj no necesitan 60 fps: 500 pasos ya son más finos que
      // un píxel de barra, y así React renderiza ~4 veces por segundo, no 60.
      const step = Math.round(position * 500);
      if (step !== stepRef.current) {
        stepRef.current = step;
        setProgress(position);
      }
      return follower.step(position, delta, { ...liveRef.current, blocked: false });
    },
    [follower],
  );

  const onEnd = useCallback(() => update({ playing: false }), [update]);
  // El visor es el único que mide: publica su recorrido para que el mando pueda
  // calcular el ritmo y el tiempo que queda.
  const onMeasure = useCallback((travel: number) => update({ docHeight: travel }), [update]);

  const scroll = useScriptScroll({ playing: state.playing, rate, onFrame, onEnd, onMeasure });

  // Una posición que llega de la red es una orden; la que coincide con la que
  // acaba de publicar este mismo visor es su propio eco y se ignora.
  useEffect(() => {
    if (Math.abs(state.position - reportedRef.current) < SETTLED) return;
    follower.aim(state.position);
  }, [state.position, follower]);

  // Pulsar Reproducir con el guion terminado lo rebobina, en vez de dejar la
  // marcha puesta sin que se mueva nada.
  useEffect(() => {
    if (!state.playing || scroll.getPosition() < 1) return;
    scroll.setPosition(0);
    reportedRef.current = 0;
    update({ position: 0 });
  }, [state.playing, scroll, update]);

  // Informa de su posición al resto. Mientras está alcanzando una posición
  // pedida por otro no informa: en ese momento la autoridad es quien la pidió.
  useEffect(() => {
    const timer = setInterval(() => {
      if (follower.busy) return;
      const position = scroll.getPosition();
      if (Math.abs(position - reportedRef.current) < 0.0005) return;
      reportedRef.current = position;
      update({ position });
    }, 200);
    return () => clearInterval(timer);
  }, [scroll, update, follower]);

  // Al recuperar la conexión, el visor reafirma lo que solo él sabe: dónde va
  // leyendo y cuánto mide el guion en su pantalla. Si no, adoptaría la posición
  // vieja que guardaba el servidor —dando un salto atrás en plena toma— y se
  // quedaría sin docHeight, que no se persiste, dejando el avance automático
  // muerto hasta el siguiente cambio de tamaño.
  const wasOnlineRef = useRef(false);
  useEffect(() => {
    if (connection !== "online") return;
    if (wasOnlineRef.current) {
      const position = scroll.getPosition();
      reportedRef.current = position;
      update({ position, docHeight: scroll.getTravel() });
    }
    wasOnlineRef.current = true;
  }, [connection, scroll, update]);

  // Mantiene la pantalla del iPad encendida mientras dura la grabación.
  useEffect(() => {
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const request = async () => {
      if (!("wakeLock" in navigator) || document.visibilityState !== "visible") return;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) void lock.release();
        else sentinel = lock;
      } catch {
        // Safari lo deniega si la pestaña no está activa: se reintenta al volver.
      }
    };

    void request();
    document.addEventListener("visibilitychange", request);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", request);
      void sentinel?.release();
    };
  }, []);

  // La barra superior se esconde sola para no distraer durante la toma.
  useEffect(() => {
    if (!chromeVisible) return;
    const timer = setTimeout(() => setChromeVisible(false), 4000);
    return () => clearTimeout(timer);
  }, [chromeVisible]);

  const remaining = rate > 0 ? (1 - progress) / rate : 0;
  const mirror = `${state.mirrorH ? "scaleX(-1) " : ""}${state.mirrorV ? "scaleY(-1)" : ""}`.trim();

  return (
    <main
      ref={scroll.viewportRef}
      onClick={() => update({ playing: !state.playing })}
      className="fixed inset-0 overflow-hidden bg-black select-none"
      style={{ touchAction: "none", containerType: "size" }}
    >
      {/* Todo lo que se lee va dentro del contenedor espejado: así el cristal
          del teleprompter lo devuelve en su orientación correcta. */}
      <div className="absolute inset-0" style={{ transform: mirror || undefined }}>
        <div
          ref={scroll.contentRef}
          className="absolute inset-x-0 top-0 whitespace-pre-wrap break-words text-center font-medium text-white will-change-transform"
          style={{
            fontSize: `${state.fontSize}px`,
            lineHeight: state.lineHeight,
            paddingLeft: `${state.margin}%`,
            paddingRight: `${state.margin}%`,
            ...SCRIPT_PADDING,
          }}
        >
          {state.text || "Pega el guion desde el editor del Mac."}
        </div>

        {/* Marcador de la línea de lectura. */}
        <div
          className="pointer-events-none absolute inset-x-0 flex items-center"
          style={{ top: READ_LINE }}
        >
          <div className="h-px flex-1 bg-accent/25" />
          <div className="mx-3 size-2 rotate-45 bg-accent" />
          <div className="h-px flex-1 bg-accent/25" />
        </div>

        {/* Progreso del guion en el margen derecho. */}
        <div className="pointer-events-none absolute inset-y-8 right-3 flex w-8 flex-col items-center gap-2">
          <div className="relative w-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
            <div
              className="absolute inset-x-0 top-0 rounded-full bg-accent"
              style={{ height: `${progress * 100}%` }}
            />
          </div>
          <span className="font-mono text-[11px] tabular-nums text-accent">
            {formatTime(remaining)}
          </span>
        </div>
      </div>

      {/* Barra de servicio, sin espejar: es para quien monta el equipo. Oculta
          debe dejar pasar los toques, o una franja de la parte de arriba del
          iPad cambiaría el espejo o saldría de la página en plena toma. */}
      <div
        className={`absolute inset-x-0 top-0 flex items-center justify-between gap-4 bg-ink-950/80 px-4 py-3 transition-opacity duration-500 ${
          chromeVisible || connection !== "online"
            ? "opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <ConnectionDot connection={connection} />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => update({ mirrorH: !state.mirrorH })}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              state.mirrorH ? "bg-accent text-ink-950" : "bg-ink-800 text-ink-300"
            }`}
          >
            Espejo H
          </button>
          <button
            type="button"
            onClick={() => update({ mirrorV: !state.mirrorV })}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              state.mirrorV ? "bg-accent text-ink-950" : "bg-ink-800 text-ink-300"
            }`}
          >
            Espejo V
          </button>
          <Link href="/" className="rounded-lg bg-ink-800 px-3 py-1.5 text-sm text-ink-300">
            Inicio
          </Link>
        </div>
      </div>

      {/* Zona sensible para recuperar la barra sin tocar el play/pausa. Solo
          existe mientras la barra está oculta: si no, taparía su enlace. */}
      {!chromeVisible && connection === "online" && (
        <button
          type="button"
          aria-label="Mostrar controles"
          className="absolute right-0 top-0 h-14 w-24"
          onClick={(event) => {
            event.stopPropagation();
            setChromeVisible(true);
          }}
        />
      )}
    </main>
  );
}
