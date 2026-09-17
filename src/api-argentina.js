/**
 * api-argentina.js
 * Capa de datos del comparador.
 *
 * FUENTES
 *   dolarapi.com           → cotizaciones del dólar          (CORS ✓, directo)
 *   api.coingecko.com      → precios crypto                  (CORS ✓, directo)
 *   api.argentinadatos.com → plazo fijo, cuentas remuneradas,
 *                            inflación, riesgo país, APY cripto
 *                                                            (CORS ✗, vía proxy)
 *
 * ⚠️ argentinadatos NO devuelve Access-Control-Allow-Origin. Consultarla
 * directo desde el navegador falla siempre: era el motivo de que en
 * producción el plazo fijo, la inflación, el riesgo país y los FCI
 * quedaran en "—". Por eso se pega a /api/ad/*, que netlify.toml (prod)
 * y vite.config.js (dev/preview) reenvían del lado del servidor.
 *
 * Fuentes retiradas:
 *   - api.cafci.org.ar → devuelve 403 desde el navegador y 401 desde el
 *     servidor; no hay credencial pública. Reemplazada por
 *     /v1/finanzas/fci/otros/ultimo, que trae la TNA de las cuentas
 *     remuneradas directamente.
 *   - /v1/finanzas/fci/mercado-dinero/{fecha} → 404 en cualquier fecha.
 *   - api.bcra.gob.ar/transparencia → responde, pero mezcla 905 filas de
 *     bancos, mutuales y plazos fijos UVA/dólar sin un código común para
 *     filtrar el producto; tomar el máximo por entidad devolvía valores
 *     absurdos (hasta 97% de una mutual). La tabla de plazo fijo de
 *     argentinadatos ya cubre los 30 bancos relevantes, limpia.
 */

// ─────────────────────────────────────────────
// CONFIGURACIÓN
// ─────────────────────────────────────────────

const AD = "/api/ad/v1"; // proxy → https://api.argentinadatos.com/v1

const TTL = {
  corto: 10 * 60 * 1000, //     10 min — dólar y crypto se mueven todo el día
  medio: 60 * 60 * 1000, //      1 h   — tasas, se publican una vez por día
  largo: 12 * 60 * 60 * 1000, // 12 h   — inflación y riesgo país
};

const TIMEOUT_MS = 12000;

/** Una tasa más vieja que esto no se muestra: son entidades que dejaron
 *  de publicar y el dato ya no dice nada sobre lo que pagan hoy. */
export const DIAS_MAX_ANTIGUEDAD = 45;
/** A partir de acá se muestra, pero con la advertencia de antigüedad. */
export const DIAS_AVISO_ANTIGUEDAD = 7;

// ─────────────────────────────────────────────
// CACHÉ (memoria + sessionStorage)
//
// sessionStorage evita volver a pegarle a todas las APIs en cada recarga
// y deja un último valor válido para mostrar si alguna fuente se cae.
// ─────────────────────────────────────────────

const memoria = new Map();
const CLAVE_STORAGE = "comparador-ar:cache:v2";

function leerStorage() {
  try {
    const raw = sessionStorage.getItem(CLAVE_STORAGE);
    if (raw) for (const [k, v] of Object.entries(JSON.parse(raw))) memoria.set(k, v);
  } catch {
    /* modo privado o storage deshabilitado: seguimos solo en memoria */
  }
}

function escribirStorage() {
  try {
    sessionStorage.setItem(CLAVE_STORAGE, JSON.stringify(Object.fromEntries(memoria)));
  } catch {
    /* cuota llena o storage deshabilitado: no es crítico */
  }
}

if (typeof window !== "undefined") leerStorage();

function guardar(clave, datos) {
  memoria.set(clave, { datos, ts: Date.now() });
  escribirStorage();
}

function vigente(clave, ttl) {
  const e = memoria.get(clave);
  if (!e) return null;
  return Date.now() - e.ts <= ttl ? e : null;
}

/** Limpia la caché para forzar una recarga real desde las APIs. */
export function invalidarCache() {
  memoria.clear();
  try {
    sessionStorage.removeItem(CLAVE_STORAGE);
  } catch {
    /* ignorado */
  }
}

// ─────────────────────────────────────────────
// FETCH
// ─────────────────────────────────────────────

/**
 * Trae JSON con caché y degradación elegante: si la red falla y hay un
 * valor viejo guardado lo devuelve marcado como `vencido`, en lugar de
 * tirar el error y vaciar la pantalla.
 */
async function traer(url, clave, { ttl = TTL.medio, headers } = {}) {
  const fresco = vigente(clave, ttl);
  if (fresco) return { datos: fresco.datos, vencido: false, consultadoEl: fresco.ts };

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", ...headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const datos = await res.json();
    guardar(clave, datos);
    return { datos, vencido: false, consultadoEl: Date.now() };
  } catch (err) {
    const viejo = memoria.get(clave);
    if (viejo) {
      console.warn(`[API] ${clave} falló (${err.message}); se usa el último valor guardado.`);
      return { datos: viejo.datos, vencido: true, consultadoEl: viejo.ts, error: err.message };
    }
    throw new Error(`${clave}: ${err.message}`);
  }
}

// ─────────────────────────────────────────────
// NORMALIZACIÓN DE TASAS
// ─────────────────────────────────────────────

/**
 * argentinadatos publica las tasas como fracción: 0.19 significa 19% TNA.
 * El código anterior las mostraba tal cual ("0.19% TNA") y simulaba con
 * ellas, con lo que todos los rendimientos salían 100 veces más chicos.
 *
 * El umbral en 2 también cubre el caso inverso: si la API pasara alguna
 * vez a publicar en porcentaje, 19 queda como está en vez de volverse 1900%.
 */
function aPorcentaje(valor) {
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor <= 0) return null;
  const pct = valor <= 2 ? valor * 100 : valor;
  return pct > 0 && pct < 500 ? +pct.toFixed(2) : null;
}

/** Días transcurridos desde una fecha ISO (YYYY-MM-DD). */
export function diasDesde(fechaISO) {
  if (!fechaISO) return null;
  const t = new Date(fechaISO).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

// ─────────────────────────────────────────────
// 1. DÓLAR
// ─────────────────────────────────────────────

const NOMBRES_DOLAR = {
  oficial: "Dólar Oficial",
  blue: "Dólar Blue",
  bolsa: "Dólar MEP",
  contadoconliqui: "Dólar CCL",
  mayorista: "Dólar Mayorista",
  tarjeta: "Dólar Tarjeta",
  cripto: "Dólar Cripto",
};

const ORDEN_DOLAR = [
  "oficial",
  "blue",
  "bolsa",
  "contadoconliqui",
  "tarjeta",
  "cripto",
  "mayorista",
];

export async function getDolares() {
  const { datos, vencido } = await traer("https://dolarapi.com/v1/dolares", "dolares", {
    ttl: TTL.corto,
  });

  return datos
    .filter((d) => typeof d.venta === "number" && d.venta > 0 && d.venta < 1000000)
    .map((d) => ({
      tipo: d.casa,
      nombre: NOMBRES_DOLAR[d.casa] ?? d.nombre ?? d.casa,
      compra: d.compra,
      venta: d.venta,
      actualizacion: d.fechaActualizacion,
      vencido,
    }))
    .sort((a, b) => indiceOrden(ORDEN_DOLAR, a.tipo) - indiceOrden(ORDEN_DOLAR, b.tipo));
}

function indiceOrden(orden, valor) {
  const i = orden.indexOf(valor);
  return i === -1 ? orden.length : i;
}

// ─────────────────────────────────────────────
// 2. PLAZO FIJO POR BANCO
//    GET /v1/finanzas/tasas/plazoFijo
//    → { entidad, logo, tnaClientes, tnaNoClientes, enlace }
//      con las TNA en fracción (0.19 = 19%).
// ─────────────────────────────────────────────

export async function getPlazoFijo() {
  const { datos, vencido } = await traer(`${AD}/finanzas/tasas/plazoFijo`, "plazoFijo");

  return datos
    .map((b) => {
      const clientes = aPorcentaje(b.tnaClientes);
      // Ojo: la API manda 0 (no null) cuando el banco no toma plazos fijos
      // de no clientes. `??` no lo captura, así que ~8 de 30 bancos
      // aparecían con "0% TNA" y encabezaban el orden descendente.
      const noClientes = aPorcentaje(b.tnaNoClientes);
      if (clientes == null && noClientes == null) return null;

      return {
        banco: formatearNombreEntidad(b.entidad ?? b.banco ?? "Entidad sin identificar"),
        tnaClientes: clientes,
        tnaNoClientes: noClientes,
        // Para rankear usamos la tasa a la que accede la mayoría (clientes).
        // La de no clientes se muestra aparte cuando existe.
        tna: clientes ?? noClientes,
        logo: b.logo ?? null,
        enlace: b.enlace ?? null,
        vencido,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.tna - a.tna);
}

/**
 * "BANCO DE LA NACION ARGENTINA" → "Banco de la Nación Argentina"
 *
 * La fuente publica los nombres en mayúsculas y sin acentos, y de forma
 * inconsistente: "Crédito Regional" llega acentuado y "Reba Compañia" no.
 * Pasarlo todo a minúscula y capitalizar la inicial deja errores visibles
 * en una tabla de entidades financieras ("Banco Cmf", "Sociedad Anonima"),
 * así que hacen falta las tres listas de abajo.
 */
const NOMBRE_MENORES = new Set([
  "de", "del", "la", "las", "los", "y", "el", "en", "and", "of", "the",
]);

const NOMBRE_SIGLAS = new Set([
  "S.A.", "S.A.U.", "SAU", "N.A.", "S.A.U", "S.R.L.",
  "BBVA", "ICBC", "HSBC", "BICA", "CMF", "BNA", "BIND", "CCF", "GPAT", "IOL",
]);

/** Acentos que la fuente no trae. Solo palabras sin ambigüedad. */
const NOMBRE_ACENTOS = [
  [/\bNacion\b/gi, "Nación"],
  [/\bCordoba\b/gi, "Córdoba"],
  [/\bCompania\b/gi, "Compañía"],
  [/\bCompañia\b/gi, "Compañía"],
  [/\bAnonima\b/gi, "Anónima"],
  [/\bCredito\b/gi, "Crédito"],
  [/\bTucuman\b/gi, "Tucumán"],
  [/\bRio\b/gi, "Río"],
  [/\bUala\b/gi, "Ualá"],
];

/**
 * Da formato a un nombre de entidad que la fuente publica en mayúsculas.
 *
 * La usan las dos listas. Antes las cuentas remuneradas tenían su propia
 * versión, más pobre, y la misma entidad terminaba escrita de dos formas
 * según dónde apareciera: "Banco BICA S.A." entre los bancos y "Bica Cuenta
 * Positiva 4" entre las cuentas.
 */
function formatearNombreEntidad(nombre) {
  const capitalizado = String(nombre)
    .trim()
    .split(/\s+/)
    .map((palabra, i) => {
      if (NOMBRE_SIGLAS.has(palabra.toUpperCase())) return palabra.toUpperCase();

      const bajo = palabra.toLowerCase();
      if (i > 0 && NOMBRE_MENORES.has(bajo)) return bajo;

      // Se busca la primera LETRA, no el primer carácter: "(argentina)"
      // empieza con paréntesis y quedaba sin capitalizar.
      const pos = bajo.search(/[a-záéíóúñü]/i);
      if (pos === -1) return bajo;
      return bajo.slice(0, pos) + bajo.charAt(pos).toUpperCase() + bajo.slice(pos + 1);
    })
    .join(" ");

  return NOMBRE_ACENTOS.reduce((txt, [re, con]) => txt.replace(re, con), capitalizado);
}

// ─────────────────────────────────────────────
// 3. CUENTAS REMUNERADAS (billeteras virtuales)
//    GET /v1/finanzas/fci/otros/ultimo
//    → { fondo, tna, tea, tope, fecha, condiciones, plazoMinDias, ... }
//
//    Reemplaza a CAFCI (403). Cubre Ualá, Naranja X, Brubank, Fiwind,
//    Carrefour Banco, Voii, Supervielle, BNA y otras.
// ─────────────────────────────────────────────

export async function getCuentasRemuneradas() {
  const { datos, vencido } = await traer(`${AD}/finanzas/fci/otros/ultimo`, "cuentasRemuneradas");

  const cuentas = datos
    .map((f) => {
      const tna = aPorcentaje(f.tna);
      if (tna == null) return null; // tna 0 = la entidad dejó de publicar

      const antiguedad = diasDesde(f.fecha);
      // Una tasa de hace más de mes y medio no dice nada sobre lo que la
      // billetera paga hoy; mostrarla primera en el ranking sería engañoso.
      if (antiguedad != null && antiguedad > DIAS_MAX_ANTIGUEDAD) return null;

      return {
        id: slug(f.fondo),
        nombre: formatearNombreEntidad(f.fondo),
        tna,
        tea: aPorcentaje(f.tea) ?? tnaATea(tna),
        tope: f.tope ?? null,
        plazoMinDias: f.plazoMinDias ?? null,
        plazoMaxDias: f.plazoMaxDias ?? null,
        condiciones: f.condicionesCorto ?? f.condiciones ?? null,
        fecha: f.fecha ?? null,
        antiguedadDias: antiguedad,
        vencido,
      };
    })
    .filter(Boolean);

  return agruparVariantesDePlazo(cuentas).sort((a, b) => b.tna - a.tna);
}

/**
 * Junta las variantes de un mismo producto que solo se diferencian por el
 * tramo de plazo y pagan exactamente lo mismo.
 *
 * Naranja X publica "FRASCOS 7-13", "FRASCOS 14-27" y "FRASCOS 28", las
 * tres al 19%: ocupaban tres lugares del ranking repitiendo el mismo dato.
 * Se muestran como una sola fila con el rango completo (7–28 días).
 *
 * Solo agrupa si coinciden la tasa y el tope: si Naranja X paga distinto
 * según el plazo, siguen siendo filas separadas, que es la información útil.
 */
function agruparVariantesDePlazo(cuentas) {
  const grupos = new Map();

  for (const c of cuentas) {
    // "Naranja X Frascos 14-27" → "Naranja X Frascos"
    const base = c.nombre.replace(/\s+\d+(\s*[-–]\s*\d+)?$/, "").trim();
    const clave = `${base}|${c.tna}|${c.tope ?? "sin-tope"}`;

    const previo = grupos.get(clave);
    if (!previo) {
      grupos.set(clave, { ...c, nombreBase: base, variantes: 1 });
      continue;
    }

    previo.variantes += 1;
    previo.nombre = base;
    previo.id = slug(base);
    previo.plazoMinDias = minDefinido(previo.plazoMinDias, c.plazoMinDias);
    previo.plazoMaxDias = maxDefinido(previo.plazoMaxDias, c.plazoMaxDias);
    // Nos quedamos con el dato más reciente del grupo.
    if ((c.antiguedadDias ?? 99) < (previo.antiguedadDias ?? 99)) {
      previo.fecha = c.fecha;
      previo.antiguedadDias = c.antiguedadDias;
    }
  }

  return [...grupos.values()];
}

function minDefinido(a, b) {
  const vals = [a, b].filter((v) => typeof v === "number");
  return vals.length ? Math.min(...vals) : null;
}

function maxDefinido(a, b) {
  const vals = [a, b].filter((v) => typeof v === "number");
  return vals.length ? Math.max(...vals) : null;
}

function slug(texto) {
  return String(texto)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Los nombres llegan en mayúsculas: "UALA PLUS 2", "NARANJA X FRASCOS 28". */

// ─────────────────────────────────────────────
// 4. INFLACIÓN
// ─────────────────────────────────────────────

export async function getInflacion() {
  const [mensual, interanual] = await Promise.all([
    traer(`${AD}/finanzas/indices/inflacion`, "inflacion", { ttl: TTL.largo }),
    traer(`${AD}/finanzas/indices/inflacionInteranual`, "inflacionInteranual", { ttl: TTL.largo }),
  ]);

  const ultMensual = ultimo(mensual.datos);
  const ultInteranual = ultimo(interanual.datos);
  const ultimos12 = (mensual.datos ?? []).slice(-12);

  return {
    mensual: ultMensual?.valor ?? null,
    mensualFecha: ultMensual?.fecha ?? null,
    interanual: ultInteranual?.valor ?? null,
    interanualFecha: ultInteranual?.fecha ?? null,
    ultimos12,
    // Anualizar los últimos 3 meses proyecta mejor que el interanual
    // cuando la inflación viene bajando rápido: el interanual arrastra
    // meses viejos que ya no se parecen al presente.
    proyectada: anualizarUltimosMeses(ultimos12, 3),
    vencido: mensual.vencido || interanual.vencido,
  };
}

function anualizarUltimosMeses(serie, meses) {
  const tramo = (serie ?? []).slice(-meses).filter((m) => typeof m?.valor === "number");
  if (tramo.length < meses) return null;
  const acumulado = tramo.reduce((acc, m) => acc * (1 + m.valor / 100), 1);
  return +((Math.pow(acumulado, 12 / meses) - 1) * 100).toFixed(1);
}

function ultimo(arr) {
  return Array.isArray(arr) && arr.length ? arr[arr.length - 1] : null;
}

// ─────────────────────────────────────────────
// 5. RIESGO PAÍS
// ─────────────────────────────────────────────

export async function getRiesgoPais() {
  const { datos, vencido } = await traer(`${AD}/finanzas/indices/riesgo-pais/ultimo`, "riesgoPais", {
    ttl: TTL.largo,
  });
  if (typeof datos?.valor !== "number") throw new Error("riesgo país sin valor numérico");
  return { valor: datos.valor, fecha: datos.fecha ?? null, vencido };
}

// ─────────────────────────────────────────────
// 6. CRYPTO
// ─────────────────────────────────────────────

const CRYPTO_IDS = "bitcoin,ethereum,tether,usd-coin";
const NOMBRES_CRYPTO = {
  bitcoin: "Bitcoin",
  ethereum: "Ethereum",
  tether: "Tether",
  "usd-coin": "USD Coin",
};
const SIMBOLOS_CRYPTO = { bitcoin: "BTC", ethereum: "ETH", tether: "USDT", "usd-coin": "USDC" };

export async function getCrypto() {
  const url =
    `https://api.coingecko.com/api/v3/simple/price?ids=${CRYPTO_IDS}` +
    `&vs_currencies=usd,ars&include_24hr_change=true`;

  const { datos, vencido } = await traer(url, "crypto", { ttl: TTL.corto });

  return Object.entries(datos).map(([id, p]) => ({
    id,
    nombre: NOMBRES_CRYPTO[id] ?? id,
    simbolo: SIMBOLOS_CRYPTO[id] ?? id.toUpperCase(),
    precioUSD: p.usd ?? null,
    precioARS: p.ars ?? null,
    cambio24h: p.usd_24h_change ?? null,
    vencido,
  }));
}

// ─────────────────────────────────────────────
// 7. RENDIMIENTOS DE EXCHANGES (APY en pesos y stablecoins)
//    GET /v1/finanzas/rendimientos
// ─────────────────────────────────────────────

const MONEDAS_INTERES = new Set(["ARS", "ARSS", "USDT", "USDC", "USD", "DAI"]);

export async function getRendimientosExchanges() {
  const { datos, vencido } = await traer(`${AD}/finanzas/rendimientos`, "rendimientos");

  // Algunas entidades publican la misma moneda varias veces, una por tramo
  // o por red (Lemoncash manda USDT cuatro veces). Nos quedamos con la
  // mejor de cada par entidad+moneda: repetir la fila no aporta nada y
  // además duplicaba la key de React.
  const mejores = new Map();

  for (const entidad of datos ?? []) {
    for (const r of entidad.rendimientos ?? []) {
      const moneda = r.moneda === "ARSS" ? "ARS" : r.moneda;
      if (!MONEDAS_INTERES.has(moneda)) continue;

      const apy = typeof r.apy === "number" && r.apy > 0 ? +r.apy.toFixed(2) : null;
      if (apy == null) continue;

      const antiguedad = diasDesde(r.fecha);
      if (antiguedad != null && antiguedad > DIAS_MAX_ANTIGUEDAD) continue;

      const id = `${entidad.entidad}-${moneda}`;
      if (mejores.get(id)?.apy >= apy) continue;

      mejores.set(id, {
        id,
        entidad: entidad.entidad.charAt(0).toUpperCase() + entidad.entidad.slice(1),
        moneda,
        apy,
        bonus: r.bonusValue || null,
        bonusHasta: r.bonusThreshold || null,
        fecha: r.fecha ?? null,
        antiguedadDias: antiguedad,
        vencido,
      });
    }
  }

  return [...mejores.values()].sort((a, b) => b.apy - a.apy);
}

// ─────────────────────────────────────────────
// 8. CARGA COMPLETA
// ─────────────────────────────────────────────

const CLAVES = ["dolares", "plazoFijo", "cuentas", "inflacion", "riesgoPais", "crypto", "exchanges"];

export async function getAllData() {
  const resultados = await Promise.allSettled([
    getDolares(),
    getPlazoFijo(),
    getCuentasRemuneradas(),
    getInflacion(),
    getRiesgoPais(),
    getCrypto(),
    getRendimientosExchanges(),
  ]);

  const salida = { timestamp: Date.now() };
  CLAVES.forEach((clave, i) => {
    const r = resultados[i];
    salida[clave] =
      r.status === "fulfilled"
        ? { ok: true, data: r.value }
        : { ok: false, error: r.reason?.message ?? "Error desconocido" };
  });

  // Fiwind (y cualquier otra) puede estar en las dos fuentes con tasas
  // distintas: 20% en cuentas remuneradas y 18,2% en el feed de exchanges.
  // Mostrar las dos filas deja al lector sin saber cuál es la buena. Gana
  // la de cuentas remuneradas, que además trae tope y condiciones.
  if (salida.cuentas.ok && salida.exchanges.ok) {
    const yaListadas = new Set(salida.cuentas.data.map((c) => normalizarEntidad(c.nombre)));
    salida.exchanges.data = salida.exchanges.data.filter(
      (e) => e.moneda !== "ARS" || !yaListadas.has(normalizarEntidad(e.entidad))
    );
  }

  salida.fuentesCaidas = CLAVES.filter((k) => !salida[k].ok);
  return salida;
}

/** "Ualá Plus 2" → "uala"; sirve para cruzar la misma entidad entre fuentes. */
function normalizarEntidad(nombre) {
  return String(nombre)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "")
    .replace(/(plus|frascos|hit|iol)\d*$/, "");
}

// ─────────────────────────────────────────────
// 9. CÁLCULOS FINANCIEROS
// ─────────────────────────────────────────────

/**
 * TNA → TEA, según cada cuánto capitaliza el producto.
 *
 * Importa para comparar: una cuenta remunerada y un plazo fijo con la
 * misma TNA del 23% no rinden lo mismo. La cuenta acredita intereses
 * todos los días (TEA 25,86%) y el plazo fijo recién al renovar a los
 * 30 (TEA 25,60%). Ordenar por TNA los empata de más.
 */
export function tnaATea(tnaPct, capitalizacion = "diaria") {
  if (!Number.isFinite(tnaPct) || tnaPct <= 0) return null;
  // Los exchanges publican APY, que ya es la tasa efectiva anual: convertirla
  // otra vez la infla. Un APY del 19,16% se mostraba como 21,11%.
  if (capitalizacion === "efectiva") return +tnaPct.toFixed(2);
  const periodoDias = capitalizacion === "diaria" ? 1 : Number(capitalizacion) || 30;
  const periodos = 365 / periodoDias;
  const tasaPeriodo = (tnaPct / 100 / 365) * periodoDias;
  return +((Math.pow(1 + tasaPeriodo, periodos) - 1) * 100).toFixed(2);
}

/**
 * Rendimiento real: cuánto sobra (o falta) después de la inflación.
 * Fórmula de Fisher, comparando tasas efectivas anuales.
 *
 * Antes se comparaba la TNA cruda contra la inflación interanual. Como la
 * TNA no incluye la capitalización, el rendimiento real salía
 * sistemáticamente por debajo del verdadero.
 */
export function calcularRendimientoReal(tnaPct, inflAnualPct, { capitalizacion = "diaria" } = {}) {
  if (!Number.isFinite(tnaPct) || !Number.isFinite(inflAnualPct)) return null;
  const tea = tnaATea(tnaPct, capitalizacion);
  if (tea == null) return null;
  const real = ((1 + tea / 100) / (1 + inflAnualPct / 100) - 1) * 100;
  return { real: +real.toFixed(2), tea, ganaInflacion: real > 0 };
}

/**
 * Simula una inversión.
 *
 * `capitalizacion`:
 *   "efectiva" → la tasa recibida ya es efectiva anual (el APY que publican
 *              los exchanges). No se capitaliza de nuevo: solo se prorratea
 *              al plazo. Tratarla como nominal sobreestimaba un 19,16% de
 *              APY en casi $20.000 sobre un millón a un año.
 *   "diaria" → cuentas remuneradas: los intereses se acreditan y rinden
 *              todos los días.
 *   número   → plazo fijo: el interés es simple dentro del plazo y solo
 *              capitaliza al renovar (30 = renovación mensual). El código
 *              anterior capitalizaba a diario todo, sobreestimando el
 *              plazo fijo en horizontes largos.
 *
 * `tope`: monto máximo que la entidad remunera a esa tasa.
 *
 * Casi todas las cuentas remuneradas pagan la tasa publicada solo hasta
 * cierto monto: Ualá Plus 2 hasta $1.000.000, Naranja X hasta $30.000.000.
 * Sin aplicarlo, simular $5.000.000 en una cuenta con tope de $1.000.000
 * devolvía cinco veces la ganancia real y la dejaba primera en el ranking,
 * por encima de plazos fijos sin tope que rendían mucho más.
 *
 * El excedente se considera sin remunerar, que es lo que hacen la mayoría
 * de las billeteras. Algunas pagan una tasa base más baja sobre ese resto,
 * pero no la publican en ninguna fuente, así que estimarla sería inventar:
 * quedarse corto es preferible a prometer de más.
 */
export function simularInversion(
  capital,
  tnaPct,
  dias = 30,
  { capitalizacion = "diaria", tope = null } = {}
) {
  if (!Number.isFinite(capital) || capital <= 0) return null;
  if (!Number.isFinite(tnaPct) || tnaPct <= 0) return null;

  const hayTope = Number.isFinite(tope) && tope > 0 && capital > tope;
  const remunerado = hayTope ? tope : capital;
  const excedente = capital - remunerado;

  const tasaDiaria = tnaPct / 100 / 365;
  let crecido;

  if (capitalizacion === "efectiva") {
    // La tasa ya contiene la capitalización (APY): solo se prorratea el plazo.
    crecido = remunerado * Math.pow(1 + tnaPct / 100, dias / 365);
  } else if (capitalizacion === "diaria") {
    crecido = remunerado * Math.pow(1 + tasaDiaria, dias);
  } else {
    const plazo = Number(capitalizacion) || 30;
    const renovaciones = Math.floor(dias / plazo);
    const sobrante = dias - renovaciones * plazo;
    crecido =
      remunerado * Math.pow(1 + tasaDiaria * plazo, renovaciones) * (1 + tasaDiaria * sobrante);
  }

  const final = crecido + excedente;
  const ganancia = final - capital;

  return {
    final: +final.toFixed(2),
    ganancia: +ganancia.toFixed(2),
    gananciaPct: +((ganancia / capital) * 100).toFixed(2),
    superaTope: hayTope,
    montoRemunerado: +remunerado.toFixed(2),
    excedente: +excedente.toFixed(2),
    // Lo que rinde el capital completo una vez diluido el excedente ocioso.
    // Sirve para comparar de igual a igual contra una opción sin tope.
    tnaEfectiva: hayTope ? +((tnaPct * remunerado) / capital).toFixed(2) : tnaPct,
  };
}

/** Poder de compra de un monto futuro, medido en pesos de hoy. */
export function ajustarPorInflacion(monto, inflAnualPct, dias) {
  if (!Number.isFinite(monto) || !Number.isFinite(inflAnualPct)) return null;
  const factor = Math.pow(1 + inflAnualPct / 100, dias / 365);
  return +(monto / factor).toFixed(2);
}

// ─────────────────────────────────────────────
// 10. FORMATO
// ─────────────────────────────────────────────

const fmtARS = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

export function formatARS(num) {
  return Number.isFinite(num) ? fmtARS.format(num) : "—";
}

export function formatNum(num, decimales = 0) {
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(num);
}

export function formatUSD(num) {
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: num < 10 ? 4 : 0,
  }).format(num);
}

export function formatPct(num, decimales = 2) {
  if (!Number.isFinite(num)) return "—";
  return `${num >= 0 ? "+" : ""}${num.toFixed(decimales)}%`;
}

/** Tasas: sin decimales cuando son redondas (19%), con dos si no (19,16%). */
export function formatTasa(num) {
  if (!Number.isFinite(num)) return "—";
  return `${formatNum(num, num % 1 === 0 ? 0 : 2)}%`;
}
