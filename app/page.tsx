import QRCode from "qrcode";
import { localAddresses } from "@/lib/network";
import { DeviceCard } from "@/components/DeviceCard";

export const dynamic = "force-dynamic";

const VIEWS = [
  {
    path: "/editor",
    name: "Editor",
    device: "Mac",
    description: "Pega y edita el guion, ajusta velocidad y cuerpo de letra.",
    qr: false,
  },
  {
    path: "/prompter",
    name: "Visor",
    device: "iPad",
    description: "Pantalla completa con espejo y barra de progreso lateral.",
    qr: true,
  },
  {
    path: "/remote",
    name: "Mando",
    device: "Móvil",
    description: "Toca para reproducir, desliza para desplazar, ajustes al pie.",
    qr: true,
  },
] as const;

export default async function HomePage() {
  const port = process.env.PORT ?? "3000";
  const host = localAddresses()[0];
  const base = host ? `http://${host}:${port}` : null;

  const codes = await Promise.all(
    VIEWS.map(async (view) =>
      view.qr && base
        ? QRCode.toString(`${base}${view.path}`, {
            type: "svg",
            margin: 1,
            color: { dark: "#e6eded", light: "#0d121300" },
          })
        : null,
    ),
  );

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-14">
      <header className="space-y-2">
        <h1 className="font-mono text-2xl font-semibold tracking-tight break-words sm:text-4xl">
          fuck_premium_teleprompters
        </h1>
        <p className="text-sm text-ink-500">
          Sin cuota, sin cuenta, sin marca de agua, sin nube. Corre en tu Mac.
        </p>
        <p className="pt-1 text-ink-300">
          Este Mac es el servidor. Conecta el iPad y el móvil a la misma Wi-Fi y abre las
          direcciones de abajo.
        </p>
        {base ? (
          <p className="font-mono text-sm text-accent-bright">{base}</p>
        ) : (
          <p className="text-sm text-amber-400">
            No se detecta ninguna red local: el iPad y el móvil no podrán conectarse hasta que el
            Mac esté en una Wi-Fi o red por cable.
          </p>
        )}
      </header>

      <div className="grid gap-5 sm:grid-cols-3">
        {VIEWS.map((view, index) => (
          <DeviceCard
            key={view.path}
            name={view.name}
            device={view.device}
            description={view.description}
            path={view.path}
            url={base ? `${base}${view.path}` : null}
            qr={codes[index]}
          />
        ))}
      </div>

      <section className="rounded-2xl border border-ink-800 bg-ink-900 p-5 text-sm text-ink-300">
        <h2 className="pb-2 font-semibold text-ink-100">Montaje</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Pega el guion en el editor, aquí en el Mac.</li>
          <li>Abre el visor en el iPad (escanea el QR) y colócalo bajo el cristal.</li>
          <li>
            Activa <span className="text-ink-100">Espejo H</span> si el cristal invierte el texto;
            añade <span className="text-ink-100">Espejo V</span> si el iPad va boca abajo.
          </li>
          <li>Abre el mando en el móvil y controla desde ahí toda la toma.</li>
        </ol>
      </section>
    </main>
  );
}
