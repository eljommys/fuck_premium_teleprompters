#!/usr/bin/env node
// Se ejecuta solo en el ciclo `prepare` de npm. Su motivo de ser es que al
// instalar el paquete desde git (que es lo que hace `npx github:...`) no viene
// nada construido: npm clona el repositorio y espera que el propio paquete se
// prepare. Aquí es donde se construye la aplicación de Next.
//
// Si ya hay una carpeta .next se salta, para no reconstruir en cada
// `npm install` de quien esté trabajando en el proyecto. Para rehacerla a
// propósito está `npm run build`.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const PACKAGE_DIR = resolve(import.meta.dirname, "..");

if (existsSync(join(PACKAGE_DIR, ".next"))) process.exit(0);

const build = spawnSync("npm", ["run", "build"], { cwd: PACKAGE_DIR, stdio: "inherit" });
process.exit(build.status ?? 1);
