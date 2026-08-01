"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/**
 * Copia al portapapeles. La API moderna solo existe en contextos seguros, y la
 * portada se abre por IP en `http://`, así que hace falta el apaño de siempre.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Denegado o no disponible: se intenta con el método antiguo.
  }
  try {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(field);
    return ok;
  } catch {
    return false;
  }
}

/** Deja el texto seleccionado, listo para un ⌘C. */
function selectText(node: HTMLElement | null) {
  if (!node) return;
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

export function DeviceCard({
  name,
  device,
  description,
  path,
  url,
  qr,
}: {
  name: string;
  device: string;
  description: string;
  path: string;
  url: string | null;
  qr: string | null;
}) {
  const [qrOpen, setQrOpen] = useState(false);
  const [copied, setCopied] = useState<boolean | null>(null);
  const urlRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (copied === null) return;
    const timer = setTimeout(() => setCopied(null), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-ink-800 bg-ink-900 p-5">
      <div className="flex items-baseline justify-between">
        <Link href={path} className="text-lg font-semibold hover:text-accent-bright">
          {name}
        </Link>
        <span className="text-xs uppercase tracking-widest text-accent">{device}</span>
      </div>

      <p className="flex-1 text-sm text-ink-300">{description}</p>

      {/* El QR solo aparece cuando lo pides, para no escanear el de otra vista
          por error al tener los tres a la vez delante. */}
      {qr && (
        <>
          <button
            type="button"
            onClick={() => setQrOpen((open) => !open)}
            aria-expanded={qrOpen}
            className={`rounded-xl border py-2.5 text-sm font-medium transition-colors ${
              qrOpen
                ? "border-accent bg-accent/10 text-ink-100"
                : "border-ink-800 bg-ink-850 text-ink-300 hover:border-ink-700"
            }`}
          >
            {qrOpen ? "Ocultar QR" : "Mostrar QR"}
          </button>

          {qrOpen && (
            <div
              className="rounded-xl bg-ink-850 p-3 [&_svg]:h-auto [&_svg]:w-full"
              dangerouslySetInnerHTML={{ __html: qr }}
            />
          )}
        </>
      )}

      <div className="flex items-center gap-2">
        <span
          ref={urlRef}
          className="min-w-0 flex-1 truncate font-mono text-xs text-ink-500 select-all"
        >
          {url ?? path}
        </span>
        <button
          type="button"
          onClick={async () => {
            const ok = await copyText(url ?? path);
            // Si el navegador no deja copiar, al menos deja la URL seleccionada
            // para que un ⌘C la lleve al portapapeles.
            if (!ok) selectText(urlRef.current);
            setCopied(ok);
          }}
          className="shrink-0 rounded-lg border border-ink-800 bg-ink-850 px-3 py-1.5 text-xs font-medium text-ink-300 hover:border-ink-700"
        >
          {copied === null ? "Copiar" : copied ? "¡Copiada!" : "Pulsa ⌘C"}
        </button>
      </div>
    </div>
  );
}
