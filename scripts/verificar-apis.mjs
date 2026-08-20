/**
 * verificar-apis.mjs — chequeo de salud de las fuentes de datos.
 *
 *   npm run verificar
 *
 * Corre la capa de datos real contra las APIs de verdad y avisa si alguna
 * dejó de responder o cambió de formato. Vale la pena pasarlo antes de
 * cada deploy: casi todas las roturas de esta página vinieron de una API
 * que se cayó o cambió sin aviso, no de un cambio en el código.
 *
 * Nota: en Node no hay proxy, así que se reescribe /api/ad → el host real,
 * igual que hacen netlify.toml y vite.config.js en el navegador.
 */

globalThis.sessionStorage = {
  _d: {},
  getItem(k) {
    return this._d[k] ?? null;
  },
  setItem(k, v) {
    this._d[k] = v;
  },
  removeItem(k) {
    delete this._d[k];
  },
};

const fetchReal = globalThis.fetch;
globalThis.fetch = (url, opts) =>
  fetchReal(
    String(url).startsWith("/api/ad")
      ? String(url).replace("/api/ad", "https://api.argentinadatos.com")
      : url,
    opts
  );

const api = await import("../src/api-argentina.js");

const datos = await api.getAllData();

const esperado = {
  dolares: (d) => d.length >= 5 && d.every((x) => x.venta > 0),
  plazoFijo: (d) => d.length >= 10 && d.every((x) => x.tna > 1 && x.tna < 200),
  cuentas: (d) => d.length >= 5 && d.every((x) => x.tna > 1 && x.tna < 200),
  inflacion: (d) => typeof d.interanual === "number" && typeof d.mensual === "number",
  riesgoPais: (d) => d.valor > 0,
  crypto: (d) => d.length === 4 && d.every((x) => x.precioUSD > 0),
  exchanges: (d) => d.length >= 3 && d.every((x) => x.apy > 0),
};

let fallas = 0;

console.log("Fuentes de datos\n" + "─".repeat(52));

for (const [clave, valida] of Object.entries(esperado)) {
  const r = datos[clave];

  if (!r.ok) {
    console.log(`✗ ${clave.padEnd(12)} no responde — ${r.error}`);
    fallas++;
    continue;
  }

  if (!valida(r.data)) {
    const muestra = JSON.stringify(Array.isArray(r.data) ? r.data[0] : r.data).slice(0, 120);
    console.log(`✗ ${clave.padEnd(12)} responde pero el formato cambió — ${muestra}`);
    fallas++;
    continue;
  }

  const n = Array.isArray(r.data) ? `${r.data.length} registros` : "ok";
  console.log(`✓ ${clave.padEnd(12)} ${n}`);
}

console.log("─".repeat(52));

if (fallas) {
  console.log(`${fallas} fuente(s) con problemas.`);
  process.exit(1);
}

// Resumen legible de lo que la página va a mostrar hoy.
const infl = datos.inflacion.data;
const referencia = infl.proyectada ?? infl.interanual;
const mejorCuenta = datos.cuentas.data[0];
const mejorPF = datos.plazoFijo.data[0];

console.log(`\nInflación de referencia: ${referencia}% anual`);
for (const [etiqueta, tna, cap] of [
  [`${mejorCuenta.nombre} (cuenta)`, mejorCuenta.tna, "diaria"],
  [`${mejorPF.banco} (plazo fijo)`, mejorPF.tna, 30],
]) {
  const rr = api.calcularRendimientoReal(tna, referencia, { capitalizacion: cap });
  console.log(
    `  ${etiqueta}: ${api.formatTasa(tna)} TNA → ${api.formatTasa(rr.tea)} TEA · ` +
      `real ${api.formatPct(rr.real)} ${rr.ganaInflacion ? "(gana)" : "(pierde)"}`
  );
}

console.log("\nTodas las fuentes responden correctamente.");
