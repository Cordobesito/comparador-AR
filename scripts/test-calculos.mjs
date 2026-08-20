/**
 * test-calculos.mjs — tests de la matemática financiera.
 *
 *   npm test
 *
 * Usa el runner nativo de Node (sin dependencias). Cubre lo que la página
 * afirma sobre la plata de la gente: si estos números están mal, el sitio
 * miente sin dar ninguna señal de error.
 *
 * Varios de estos casos son regresiones de bugs reales que tuvo la versión
 * anterior, están marcados como tal.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

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

const {
  simularInversion,
  calcularRendimientoReal,
  tnaATea,
  ajustarPorInflacion,
  formatARS,
  formatTasa,
  formatPct,
  diasDesde,
} = await import("../src/api-argentina.js");

/** Compara con tolerancia: son cuentas con decimales. */
const cerca = (a, b, tol = 0.01) =>
  assert.ok(Math.abs(a - b) <= tol, `esperaba ${b} ± ${tol}, recibí ${a}`);

// ─────────────────────────────────────────────

describe("tnaATea", () => {
  test("capitalización diaria: 24% TNA da 27,11% TEA", () => {
    cerca(tnaATea(24, "diaria"), 27.11);
  });

  test("capitalización a 30 días rinde menos que la diaria", () => {
    assert.ok(
      tnaATea(23, 30) < tnaATea(23, "diaria"),
      "un plazo fijo no puede rendir igual que una cuenta que capitaliza a diario"
    );
    cerca(tnaATea(23, 30), 25.59);
    cerca(tnaATea(23, "diaria"), 25.85);
  });

  test("la TEA siempre es mayor o igual que la TNA", () => {
    for (const tna of [1, 10, 19, 23, 50, 120]) {
      assert.ok(tnaATea(tna, "diaria") >= tna, `falló con TNA ${tna}`);
    }
  });

  test("descarta entradas inválidas en vez de devolver NaN", () => {
    for (const malo of [null, undefined, NaN, 0, -5, "24"]) {
      assert.equal(tnaATea(malo), null, `debería rechazar ${JSON.stringify(malo)}`);
    }
  });
});

describe("simularInversion", () => {
  test("cuenta remunerada: capitaliza a diario", () => {
    const r = simularInversion(100000, 24, 365, { capitalizacion: "diaria" });
    cerca(r.final, 127114.9, 1);
    cerca(r.gananciaPct, 27.11);
  });

  test("plazo fijo: interés simple dentro del plazo", () => {
    // 30 días exactos = una sola colocación, sin capitalizar nada.
    const r = simularInversion(100000, 24, 30, { capitalizacion: 30 });
    cerca(r.final, 100000 * (1 + (0.24 / 365) * 30), 1);
  });

  test("plazo fijo a 365 días rinde menos que la cuenta con la misma TNA", () => {
    const pf = simularInversion(100000, 23, 365, { capitalizacion: 30 });
    const cuenta = simularInversion(100000, 23, 365, { capitalizacion: "diaria" });
    assert.ok(pf.final < cuenta.final);
  });

  test("ganancia y final son coherentes entre sí", () => {
    const r = simularInversion(250000, 19, 90);
    cerca(r.final - 250000, r.ganancia, 0.02);
  });

  test("regresión: capital vacío o basura devuelve null, nunca NaN", () => {
    // El campo del simulador producía NaN al borrarlo y lo propagaba a
    // toda la tabla como "$ NaN".
    for (const malo of [NaN, 0, -1000, null, undefined, ""]) {
      assert.equal(
        simularInversion(malo, 20, 30),
        null,
        `capital ${JSON.stringify(malo)} debería dar null`
      );
    }
    assert.equal(simularInversion(100000, NaN, 30), null);
    assert.equal(simularInversion(100000, null, 30), null);
  });
});

describe("calcularRendimientoReal", () => {
  test("le gana a la inflación cuando la tasa es mayor", () => {
    const r = calcularRendimientoReal(50, 20, { capitalizacion: "diaria" });
    assert.equal(r.ganaInflacion, true);
    assert.ok(r.real > 0);
  });

  test("pierde contra la inflación cuando la tasa es menor", () => {
    const r = calcularRendimientoReal(24, 33.8, { capitalizacion: "diaria" });
    assert.equal(r.ganaInflacion, false);
    cerca(r.real, -5.0, 0.05);
  });

  test("usa la TEA, no la TNA cruda", () => {
    // La versión anterior comparaba la TNA contra la inflación, con lo que
    // el rendimiento real salía siempre peor de lo que es en realidad.
    const r = calcularRendimientoReal(24, 24, { capitalizacion: "diaria" });
    assert.ok(
      r.real > 0,
      "con TNA 24% e inflación 24%, la capitalización diaria debería dejar saldo positivo"
    );
  });

  test("la capitalización cambia el resultado", () => {
    const cuenta = calcularRendimientoReal(23, 27.3, { capitalizacion: "diaria" });
    const pf = calcularRendimientoReal(23, 27.3, { capitalizacion: 30 });
    assert.ok(cuenta.real > pf.real);
  });

  test("devuelve null con entradas incompletas", () => {
    assert.equal(calcularRendimientoReal(null, 30), null);
    assert.equal(calcularRendimientoReal(20, null), null);
    assert.equal(calcularRendimientoReal(undefined, undefined), null);
  });
});

describe("ajustarPorInflacion", () => {
  test("un año de inflación reduce el poder de compra en la misma proporción", () => {
    cerca(ajustarPorInflacion(133800, 33.8, 365), 100000, 1);
  });

  test("a plazo cero no cambia nada", () => {
    cerca(ajustarPorInflacion(100000, 33.8, 0), 100000, 0.01);
  });

  test("empatarle a la inflación deja el poder de compra intacto", () => {
    const tna = 30;
    const infl = tnaATea(tna, "diaria");
    const sim = simularInversion(100000, tna, 365, { capitalizacion: "diaria" });
    cerca(ajustarPorInflacion(sim.final, infl, 365), 100000, 1);
  });
});

describe("formato", () => {
  test("nunca imprime NaN ni undefined", () => {
    for (const malo of [NaN, undefined, null, "hola"]) {
      assert.equal(formatARS(malo), "—");
      assert.equal(formatTasa(malo), "—");
      assert.equal(formatPct(malo), "—");
    }
  });

  test("las tasas redondas van sin decimales y las quebradas con dos", () => {
    assert.equal(formatTasa(19), "19%");
    assert.equal(formatTasa(19.16), "19,16%");
  });

  test("formatea pesos en formato argentino", () => {
    assert.match(formatARS(1234567), /1\.234\.567/);
  });
});

describe("diasDesde", () => {
  test("hoy es 0 días", () => {
    assert.equal(diasDesde(new Date().toISOString().slice(0, 10)), 0);
  });

  test("tolera fechas inválidas o ausentes", () => {
    assert.equal(diasDesde(null), null);
    assert.equal(diasDesde("no-es-fecha"), null);
  });

  test("cuenta bien una fecha pasada", () => {
    const hace10 = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);
    assert.equal(diasDesde(hace10), 10);
  });
});
