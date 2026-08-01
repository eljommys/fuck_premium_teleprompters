"use client";

import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";

/**
 * Relleno del bloque de guion. El texto arranca al 40 % del alto del hueco —ahí
 * está la línea de lectura— y deja aire de sobra al final.
 *
 * Con estos rellenos el recorrido medido es exactamente la altura del texto:
 * (0,4H + T + 0,6H) − H = T, sea cual sea H. Por eso `position` significa lo
 * mismo en el iPad a pantalla completa que en el panel del móvil, aunque tengan
 * pantallas y cuerpos de letra distintos.
 *
 * `cqh` mide el contenedor y no la ventana, así que el hueco necesita
 * `container-type: size`. Con `vh` la cuenta solo saldría si el hueco ocupara
 * la ventana entera, y además bailaría en Safari cada vez que aparece o
 * desaparece la barra de direcciones.
 */
export const SCRIPT_PADDING = { paddingTop: "40cqh", paddingBottom: "60cqh" } as const;

/** Altura de la línea de lectura dentro del hueco. La misma en las dos vistas. */
export const READ_LINE = "40cqh";

export type ScriptScrollOptions = {
  playing: boolean;
  /** Avance en fracción de guion por segundo. 0 = no avanzar solo. */
  rate: number;
  /**
   * Se llama en cada fotograma con la posición ya avanzada pero aún sin pintar.
   * Si devuelve un número, el bucle lo adopta como posición: así una vista que
   * sigue a otra corrige su desfase dentro del mismo fotograma, sin tirones.
   */
  onFrame?: (position: number, delta: number) => number | void;
  /** Una sola vez al llegar al final estando en marcha. */
  onEnd?: () => void;
  /** Al cambiar el recorrido medido, en px de esta pantalla. */
  onMeasure?: (travel: number) => void;
};

export type ScriptScroll = {
  /** Hueco visible. Necesita `container-type: size` y recorte del desbordamiento. */
  viewportRef: RefObject<HTMLDivElement | null>;
  /** Bloque de texto que se desplaza. Debe usar `SCRIPT_PADDING`. */
  contentRef: RefObject<HTMLDivElement | null>;
  getPosition: () => number;
  setPosition: (position: number) => void;
  /** Recorrido local en px: convierte píxeles de dedo en fracción de guion. */
  getTravel: () => number;
};

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

/**
 * Mecánica de desplazamiento del guion: mide, anima a la frecuencia de la
 * pantalla fuera de React y pinta con `transform`.
 *
 * La posición se guarda SIEMPRE normalizada, nunca en píxeles. Así una posición
 * que llega antes de haber medido no se pierde: se pinta en cuanto se conoce el
 * recorrido. Guardarla en px la multiplicaba por un recorrido de cero.
 *
 * El hook no sabe nada de la red. Quién manda, quién sigue y quién informa lo
 * decide cada vista.
 */
export function useScriptScroll(options: ScriptScrollOptions): ScriptScroll {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  /** Posición normalizada viva, fuera de React porque cambia en cada fotograma. */
  const positionRef = useRef(0);
  /** Recorrido local en px. */
  const travelRef = useRef(0);

  // Las opciones cambian en cada render; el bucle lee siempre la última copia
  // para no reiniciarse cada vez que se mueve un slider.
  const live = useRef(options);
  live.current = options;

  const paint = useCallback(() => {
    const content = contentRef.current;
    if (!content) return;
    content.style.transform = `translate3d(0, ${-positionRef.current * travelRef.current}px, 0)`;
  }, []);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const measure = () => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const travel = Math.max(0, content.scrollHeight - viewport.clientHeight);
      const changed = Math.abs(travel - travelRef.current) > 1;
      travelRef.current = travel;
      paint();
      // El ResizeObserver dispara de más: solo se avisa de los cambios reales.
      if (changed) live.current.onMeasure?.(travel);
    };

    const observer = new ResizeObserver(measure);
    observer.observe(content);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [paint]);

  // Bucle local y continuo: el movimiento es fluido aunque la Wi-Fi no lo sea.
  useEffect(() => {
    let frame = 0;
    let previous = performance.now();

    const tick = (now: number) => {
      const delta = Math.min((now - previous) / 1000, 0.1);
      previous = now;
      const { playing, rate, onFrame, onEnd } = live.current;

      if (playing && rate > 0) {
        // Avisar del final también cuando ya se estaba allí: si no, pulsar
        // Reproducir con el guion terminado dejaría `playing` encendido para
        // siempre sin que se mueva nada.
        if (positionRef.current >= 1) onEnd?.();
        else {
          positionRef.current = clamp01(positionRef.current + rate * delta);
          if (positionRef.current >= 1) onEnd?.();
        }
      }

      const corrected = onFrame?.(positionRef.current, delta);
      if (typeof corrected === "number") positionRef.current = clamp01(corrected);

      paint();
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [paint]);

  // Identidad estable: las vistas lo usan en listas de dependencias de efectos.
  return useMemo(
    () => ({
      viewportRef,
      contentRef,
      getPosition: () => positionRef.current,
      setPosition: (position: number) => {
        positionRef.current = clamp01(position);
        paint();
      },
      getTravel: () => travelRef.current,
    }),
    [paint],
  );
}

/**
 * Acerca `position` a `target` de forma exponencial e independiente de los
 * fotogramas por segundo, para que un iPhone a 120 Hz no corrija al doble de
 * velocidad que un iPad a 60 Hz. `tau` es el tiempo en segundos que tarda en
 * recorrer el 63 % de la distancia que falta.
 */
export function converge(position: number, target: number, delta: number, tau: number): number {
  return position + (target - position) * (1 - Math.exp(-delta / tau));
}

/** Por debajo de esta diferencia se da por alcanzada la posición pedida. */
export const SETTLED = 0.0002;

/**
 * Sigue una posición que llega por la red acercándose a ella poco a poco, en
 * vez de saltar: es lo que convierte el arrastre del móvil en un movimiento
 * continuo en el iPad aunque las posiciones lleguen a golpes.
 */
export function useFollower(tau: number) {
  const targetRef = useRef<number | null>(null);
  const holdUntilRef = useRef(0);

  return useMemo(
    () => ({
      /** Fija la posición a la que hay que llegar. */
      aim(target: number) {
        targetRef.current = target;
      },
      /**
       * Deja de hacer caso a la red durante un rato y descarta lo que hubiera
       * pendiente. Se usa al mandar una posición propia: los informes que aún
       * viajaban traen la posición ANTERIOR y aplicarlos daría un salto atrás.
       */
      hold(milliseconds: number) {
        targetRef.current = null;
        holdUntilRef.current = performance.now() + milliseconds;
      },
      /**
       * Un paso de seguimiento. Devuelve la posición corregida, o undefined si
       * no hay nada que corregir.
       *
       * Mientras se reproduce, el objetivo envejece al mismo ritmo que la
       * lectura. Sin eso el objetivo se queda quieto mientras la posición
       * avanza sola, la diferencia se estabiliza en `rate * tau` y nunca baja
       * del umbral: el seguimiento no termina nunca y la vista se congela.
       */
      step(
        position: number,
        delta: number,
        { rate, playing, blocked }: { rate: number; playing: boolean; blocked: boolean },
      ): number | undefined {
        if (targetRef.current === null) return;
        if (blocked || performance.now() < holdUntilRef.current) {
          targetRef.current = null;
          return;
        }
        if (playing && rate > 0) {
          targetRef.current = Math.min(1, targetRef.current + rate * delta);
        }
        const target = targetRef.current;
        if (Math.abs(target - position) < SETTLED) {
          targetRef.current = null;
          return target;
        }
        return converge(position, target, delta, tau);
      },
      /** ¿Está alcanzando una posición pedida por otro aparato? */
      get busy() {
        return targetRef.current !== null;
      },
    }),
    [tau],
  );
}
