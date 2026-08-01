#!/usr/bin/env node
// Punto de entrada de `npx fuck_premium_teleprompters`.
//
// El servidor está escrito en TypeScript y se ejecuta tal cual: Node quita los
// tipos por su cuenta desde la 22.18. Si la versión es más vieja no hay error
// que se entienda, así que se comprueba aquí y se dice qué pasa.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const PACKAGE_DIR = resolve(import.meta.dirname, "..");
const [major, minor] = process.versions.node.split(".").map(Number);
const soportaTypeScript = major > 23 || (major === 23 && minor >= 6) || (major === 22 && minor >= 18);

if (!soportaTypeScript) {
  console.error(
    `\n  Hace falta Node 22.18 o superior (tienes ${process.versions.node}).\n` +
      `  El servidor se ejecuta en TypeScript sin compilar y las versiones\n` +
      `  anteriores no saben quitar los tipos.\n`,
  );
  process.exit(1);
}

// Sin la carpeta .next no hay nada que servir: pasa si se clona el repo y se
// lanza a mano sin haber construido. Se construye una vez y ya.
if (!existsSync(join(PACKAGE_DIR, ".next"))) {
  console.log("\n  Primera vez: construyendo la aplicación…\n");
  const build = spawnSync("npm", ["run", "build"], { cwd: PACKAGE_DIR, stdio: "inherit" });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

process.env.NODE_ENV ??= "production";
await import(join(PACKAGE_DIR, "server.ts"));
