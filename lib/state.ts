export type Role = "editor" | "prompter" | "remote" | "home";

export type TeleprompterState = {
  /** Guion completo. */
  text: string;
  /** Auto-scroll activo. */
  playing: boolean;
  /** Velocidad 1-100 (se mapea a px/s en el visor). */
  speed: number;
  /** Tamaño de fuente en px del visor. */
  fontSize: number;
  /** Interlineado (multiplicador). */
  lineHeight: number;
  /** Margen horizontal del visor en % del ancho. */
  margin: number;
  /** Espejo horizontal (el habitual en cristales de teleprompter). */
  mirrorH: boolean;
  /** Espejo vertical. */
  mirrorV: boolean;
  /** Posición de scroll normalizada 0..1. */
  position: number;
  /**
   * Recorrido total del guion en px, tal y como lo mide el visor. Permite al
   * mando traducir un arrastre del dedo a un desplazamiento proporcional y
   * estimar el tiempo restante.
   */
  docHeight: number;
};

export const DEFAULT_STATE: TeleprompterState = {
  text: "",
  playing: false,
  speed: 30,
  fontSize: 64,
  lineHeight: 1.5,
  margin: 8,
  mirrorH: false,
  mirrorV: false,
  position: 0,
  docHeight: 0,
};

/** Claves que se guardan en disco, para no perder el guion ni por dónde ibas. */
export const PERSISTED_KEYS = [
  "text",
  "speed",
  "fontSize",
  "lineHeight",
  "margin",
  "mirrorH",
  "mirrorV",
  "position",
] as const satisfies readonly (keyof TeleprompterState)[];

/**
 * Claves que cambian muchas veces por segundo mientras se lee o se arrastra.
 * Se guardan igual, pero con mucha menos prisa: escribir el guion entero en
 * disco varias veces por segundo no aporta nada.
 */
export const LIVE_KEYS = ["position"] as const satisfies readonly (keyof TeleprompterState)[];

export const LIMITS = {
  speed: { min: 1, max: 100, step: 1 },
  fontSize: { min: 24, max: 160, step: 2 },
  lineHeight: { min: 1, max: 2.5, step: 0.05 },
  margin: { min: 0, max: 30, step: 1 },
} as const;

/** px/s de desplazamiento para un valor de velocidad y un tamaño de fuente dados. */
export function speedToPixelsPerSecond(speed: number, fontSize: number): number {
  // Escalado con el tamaño de fuente: la velocidad percibida (líneas/segundo)
  // se mantiene constante al cambiar el cuerpo de letra.
  return (speed / 100) * fontSize * 4;
}

/**
 * Velocidad expresada en fracción de guion por segundo (0..1/s), la única
 * unidad que significa lo mismo en el iPad y en el móvil. Es 0 mientras el
 * visor no haya medido su recorrido, porque solo él sabe cuánto ocupa el
 * guion en el cristal.
 */
export function scrollRate(state: TeleprompterState): number {
  if (state.docHeight <= 0) return 0;
  const rate = speedToPixelsPerSecond(state.speed, state.fontSize) / state.docHeight;
  return Number.isFinite(rate) ? rate : 0;
}

export type ClientMessage =
  | { type: "hello"; role: Role }
  | { type: "update"; patch: Partial<TeleprompterState> };

export type ServerMessage =
  | { type: "state"; state: TeleprompterState; clients: Record<Role, number> }
  | { type: "patch"; patch: Partial<TeleprompterState> }
  | { type: "clients"; clients: Record<Role, number> };

const NUMERIC_KEYS = ["speed", "fontSize", "lineHeight", "margin", "position", "docHeight"] as const;
const BOOLEAN_KEYS = ["playing", "mirrorH", "mirrorV"] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Filtra y acota un patch recibido de un cliente. Devuelve solo las claves
 * válidas con valores dentro de rango, para que un cliente no pueda meter
 * basura en el estado compartido.
 */
export function sanitizePatch(input: unknown): Partial<TeleprompterState> {
  if (typeof input !== "object" || input === null) return {};
  const raw = input as Record<string, unknown>;
  const patch: Partial<TeleprompterState> = {};

  if (typeof raw.text === "string") patch.text = raw.text;

  for (const key of BOOLEAN_KEYS) {
    if (typeof raw[key] === "boolean") patch[key] = raw[key] as boolean;
  }

  for (const key of NUMERIC_KEYS) {
    const value = raw[key];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    if (key === "position") {
      patch.position = clamp(value, 0, 1);
    } else if (key === "docHeight") {
      patch.docHeight = clamp(value, 0, 1e7);
    } else {
      const { min, max } = LIMITS[key];
      patch[key] = clamp(value, min, max);
    }
  }

  return patch;
}
