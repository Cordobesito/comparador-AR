/**
 * publicar.mjs — deja lista la carpeta para subir a Netlify y la abre.
 *
 *   npm run publicar
 *
 * Existe para sacar del medio la única decisión que se puede errar en el
 * deploy manual: qué carpeta arrastrar.
 *
 * La carpeta del proyecto NO sirve. Su index.html es la plantilla de Vite y
 * termina en <script src="/src/main.jsx">, que el navegador no sabe ejecutar.
 * La página de verdad es dist/index.html, que apunta al bundle ya compilado.
 */

import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(raiz, "dist");

// Se invoca el binario de Vite con el propio Node, en vez de `npm run build`:
// desde Node 24 spawn no ejecuta archivos .cmd (como npm.cmd) sin shell, y
// usar shell partiría la ruta, que tiene espacios ("Guzman Seguros").
const vite = join(raiz, "node_modules", "vite", "bin", "vite.js");

console.log("Compilando...\n");
const build = spawnSync(process.execPath, [vite, "build"], { cwd: raiz, stdio: "inherit" });

if (build.status !== 0) {
  console.error("\nLa compilación falló: no se generó nada para subir.");
  process.exit(1);
}

const archivos = await readdir(dist);

// Sin index.html en la raíz, Netlify muestra "Página no encontrada".
if (!archivos.includes("index.html")) {
  console.error("\nFalta index.html en dist/. Algo salió mal en la compilación.");
  process.exit(1);
}

// Sin _redirects no viaja el proxy, y la mitad de la página queda en "—".
if (!archivos.includes("_redirects")) {
  console.error(
    "\nFalta _redirects en dist/. Sin ese archivo la página se publica,\n" +
      "pero el plazo fijo, la inflación y las billeteras quedan en «—».\n" +
      "Revisá que public/_redirects exista."
  );
  process.exit(1);
}

console.log(`
────────────────────────────────────────────────────────
  Listo para subir.

  Arrastrá a Netlify esta carpeta:

    ${dist}

  Tiene ${archivos.length} archivos. NO subas la carpeta del proyecto:
  son 420 archivos y 45 MB, y la home queda en blanco.
────────────────────────────────────────────────────────
`);

const abrir =
  process.platform === "win32" ? "explorer.exe" :
  process.platform === "darwin" ? "open" :
  "xdg-open";

// Sin shell: la ruta lleva espacios ("Guzman Seguros") y concatenarla en una
// línea de comandos la partiría en dos argumentos.
// explorer.exe devuelve un código distinto de cero aunque abra bien, así que
// no se comprueba el resultado.
spawnSync(abrir, [dist]);
