/**
 * ComparadorInversiones.jsx
 * Vista "Panorama": indicadores del día + todos los instrumentos en una tabla.
 *
 * Recibe los datos ya cargados desde App; no hace fetch por su cuenta.
 */

import { useMemo, useState } from "react";
import {
  calcularRendimientoReal,
  formatARS,
  formatNum,
  formatPct,
  formatTasa,
  formatUSD,
  simularInversion,
} from "./api-argentina.js";
import {
  AvisoFuentesCaidas,
  BadgeAntiguedad,
  BadgeReal,
  Resultado,
  Simulador,
} from "./componentes.jsx";

const FILTROS = [
  { id: "todos", label: "Todos" },
  { id: "pesos", label: "Rinden en pesos" },
  { id: "dolar", label: "Dólar" },
  { id: "crypto", label: "Crypto" },
];

export default function ComparadorInversiones({ datos }) {
  const [capital, setCapital] = useState(100000);
  const [horizonte, setHorizonte] = useState(30);
  const [filtro, setFiltro] = useState("todos");

  const inflacion = datos.inflacion.ok ? datos.inflacion.data : null;
  // Para "¿le gana a la inflación?" usamos la proyección de los últimos 3
  // meses anualizada, no el interanual: con la inflación bajando, el
  // interanual arrastra meses viejos y hace ver perdedor a casi todo.
  const inflReferencia = inflacion?.proyectada ?? inflacion?.interanual ?? null;

  const capitalNum = Number(capital) || 0;

  const instrumentos = useMemo(
    () => construirInstrumentos(datos, capitalNum, horizonte, inflReferencia),
    [datos, capitalNum, horizonte, inflReferencia]
  );

  const visibles =
    filtro === "todos" ? instrumentos : instrumentos.filter((i) => i.grupo === filtro);

  return (
    <section>
      <div className="seccion-head">
        <div>
          <h2>Panorama del día</h2>
          <p>Dólar, plazos fijos, billeteras y crypto, con el rendimiento real detrás.</p>
        </div>
      </div>

      <AvisoFuentesCaidas fuentes={datos.fuentesCaidas} />

      <Indicadores datos={datos} inflacion={inflacion} />

      <Simulador
        capital={capital}
        setCapital={setCapital}
        horizonte={horizonte}
        setHorizonte={setHorizonte}
        nota={
          inflReferencia != null
            ? `"vs inflación" compara la tasa efectiva anual contra una inflación proyectada de ${formatNum(
                inflReferencia,
                1
              )}% (últimos 3 meses anualizados).`
            : "Sin dato de inflación disponible: no se puede calcular el rendimiento real."
        }
      />

      <div className="chips" role="group" aria-label="Filtrar instrumentos">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            type="button"
            className="chip"
            aria-pressed={filtro === f.id}
            onClick={() => setFiltro(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Tabla instrumentos={visibles} horizonte={horizonte} />
    </section>
  );
}

// ─────────────────────────────────────────────
// INDICADORES
// ─────────────────────────────────────────────

function Indicadores({ datos, inflacion }) {
  const dolares = datos.dolares.ok ? datos.dolares.data : [];
  const blue = dolares.find((d) => d.tipo === "blue");
  const oficial = dolares.find((d) => d.tipo === "oficial");

  const mejorCuenta = datos.cuentas.ok ? datos.cuentas.data[0] : null;
  const mejorPF = datos.plazoFijo.ok ? datos.plazoFijo.data[0] : null;
  const riesgo = datos.riesgoPais.ok ? datos.riesgoPais.data : null;

  // La "mejor tasa en pesos" es la más alta entre cuentas remuneradas y
  // plazos fijos: no tiene sentido mostrar solo una de las dos familias.
  const mejor =
    [
      mejorCuenta && { tasa: mejorCuenta.tna, quien: mejorCuenta.nombre, que: "cuenta remunerada" },
      mejorPF && { tasa: mejorPF.tna, quien: mejorPF.banco, que: "plazo fijo" },
    ]
      .filter(Boolean)
      .sort((a, b) => b.tasa - a.tasa)[0] ?? null;

  const cards = [
    {
      label: "Dólar blue",
      valor: blue ? formatARS(blue.venta) : "—",
      sub: oficial ? `Oficial ${formatARS(oficial.venta)}` : "",
      color: "var(--acento)",
    },
    {
      label: "Mejor tasa en pesos",
      valor: mejor ? formatTasa(mejor.tasa) : "—",
      sub: mejor ? `${mejor.quien} · ${mejor.que}` : "",
      color: "var(--ok)",
    },
    {
      label: "Inflación mensual",
      valor: inflacion?.mensual != null ? `${formatNum(inflacion.mensual, 1)}%` : "—",
      sub:
        inflacion?.interanual != null
          ? `${formatNum(inflacion.interanual, 1)}% interanual`
          : "Último dato INDEC",
      color: "var(--mal)",
    },
    {
      label: "Riesgo país",
      valor: riesgo ? `${formatNum(riesgo.valor)}` : "—",
      sub: riesgo?.fecha ? `puntos básicos · al ${riesgo.fecha}` : "puntos básicos",
      color: "var(--aviso)",
    },
  ];

  return (
    <div className="cards">
      {cards.map((c) => (
        <div key={c.label} className="card">
          <p className="card-label">{c.label}</p>
          <p className="card-valor" style={{ color: c.color }}>
            {c.valor}
          </p>
          {c.sub && <p className="card-sub">{c.sub}</p>}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// TABLA
// ─────────────────────────────────────────────

function Tabla({ instrumentos, horizonte }) {
  if (!instrumentos.length) {
    return <p className="vacio">No hay instrumentos para este filtro.</p>;
  }

  return (
    <div className="tabla-wrap">
      <div className="tabla-scroll">
        <table className="tabla">
          <thead>
            <tr>
              <th scope="col">Instrumento</th>
              <th scope="col">Tasa / Precio</th>
              <th scope="col">Resultado en {horizonte} días</th>
              <th scope="col">vs inflación</th>
              <th scope="col">
                <span className="sr-only">Enlace</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {instrumentos.map((i) => (
              <tr key={i.id}>
                <td data-label="Instrumento">
                  <div className="celda-titulo">
                    {i.nombre}{" "}
                    <BadgeAntiguedad dias={i.antiguedadDias} vencido={i.vencido} />
                  </div>
                  {i.sub && <div className="celda-sub">{i.sub}</div>}
                </td>

                <td data-label="Tasa / Precio" className="num">
                  <span className="destacado">{i.valorPrincipal}</span>
                  {i.valorSecundario && <div className="celda-sub">{i.valorSecundario}</div>}
                </td>

                <td data-label={`Resultado en ${horizonte}d`} className="num">
                  <Resultado simulacion={i.simulacion} horizonte={horizonte} />
                </td>

                <td data-label="vs inflación">
                  <BadgeReal rr={i.rr} />
                </td>

                <td data-label="">
                  {i.enlace && (
                    <a href={i.enlace} target="_blank" rel="noopener noreferrer">
                      Ir →
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// CONSTRUCCIÓN DE LA LISTA
// ─────────────────────────────────────────────

function construirInstrumentos(datos, capital, horizonte, inflReferencia) {
  const lista = [];

  const conRendimiento = (tna, capitalizacion) => ({
    simulacion: simularInversion(capital, tna, horizonte, { capitalizacion }),
    rr:
      inflReferencia != null
        ? calcularRendimientoReal(tna, inflReferencia, { capitalizacion })
        : null,
  });

  // ── Cuentas remuneradas ────────────────────────────────────
  if (datos.cuentas.ok) {
    for (const c of datos.cuentas.data.slice(0, 8)) {
      lista.push({
        id: `cuenta-${c.id}`,
        grupo: "pesos",
        nombre: c.nombre,
        sub: [
          "Cuenta remunerada · liquidez inmediata",
          c.tope ? `tope ${formatARS(c.tope)}` : null,
          c.condiciones,
        ]
          .filter(Boolean)
          .join(" · "),
        valorPrincipal: `${formatTasa(c.tna)} TNA`,
        valorSecundario: `${formatTasa(c.tea)} TEA`,
        antiguedadDias: c.antiguedadDias,
        vencido: c.vencido,
        enlace: null,
        // Los intereses se acreditan a diario y vuelven a rendir.
        ...conRendimiento(c.tna, "diaria"),
      });
    }
  }

  // ── Plazos fijos ───────────────────────────────────────────
  if (datos.plazoFijo.ok) {
    for (const pf of datos.plazoFijo.data.slice(0, 10)) {
      lista.push({
        id: `pf-${pf.banco}`,
        grupo: "pesos",
        nombre: pf.banco,
        sub: "Plazo fijo 30 días · capital inmovilizado",
        valorPrincipal: `${formatTasa(pf.tna)} TNA`,
        valorSecundario:
          pf.tnaNoClientes && pf.tnaNoClientes !== pf.tnaClientes
            ? `No clientes ${formatTasa(pf.tnaNoClientes)}`
            : null,
        antiguedadDias: null,
        vencido: pf.vencido,
        enlace: pf.enlace,
        // Interés simple dentro del plazo; capitaliza recién al renovar.
        ...conRendimiento(pf.tna, 30),
      });
    }
  }

  // ── Rendimientos de exchanges en pesos y stablecoins ───────
  if (datos.exchanges.ok) {
    for (const e of datos.exchanges.data.slice(0, 6)) {
      const esPesos = e.moneda === "ARS";
      lista.push({
        id: `ex-${e.id}`,
        grupo: esPesos ? "pesos" : "crypto",
        nombre: `${e.entidad} · ${e.moneda}`,
        sub: [
          "Exchange · rendimiento diario",
          e.bonus && e.bonusHasta ? `hasta ${e.bonus}% con saldo ≤ ${formatARS(e.bonusHasta)}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        valorPrincipal: `${formatTasa(e.apy)} APY`,
        valorSecundario: null,
        antiguedadDias: e.antiguedadDias,
        vencido: e.vencido,
        enlace: null,
        // Solo tiene sentido simular en pesos: un APY en USDT rinde
        // dólares, y compararlo contra la inflación en pesos no dice nada.
        ...(esPesos
          ? conRendimiento(e.apy, "diaria")
          : { simulacion: null, rr: null }),
      });
    }
  }

  // ── Dólar ──────────────────────────────────────────────────
  if (datos.dolares.ok) {
    for (const d of datos.dolares.data) {
      lista.push({
        id: `dolar-${d.tipo}`,
        grupo: "dolar",
        nombre: d.nombre,
        sub: "Compra / venta",
        valorPrincipal: formatARS(d.venta),
        valorSecundario: d.compra ? `Compra ${formatARS(d.compra)}` : null,
        antiguedadDias: null,
        vencido: d.vencido,
        enlace: null,
        // El dólar no tiene tasa: cuánto rinde depende de cuánto suba,
        // que es justamente lo que nadie sabe. No se simula.
        simulacion: null,
        rr: null,
      });
    }
  }

  // ── Crypto ─────────────────────────────────────────────────
  if (datos.crypto.ok) {
    for (const c of datos.crypto.data) {
      lista.push({
        id: `crypto-${c.id}`,
        grupo: "crypto",
        nombre: `${c.nombre} (${c.simbolo})`,
        sub: `${formatUSD(c.precioUSD)} · 24h ${formatPct(c.cambio24h)}`,
        valorPrincipal: formatARS(c.precioARS),
        valorSecundario: null,
        antiguedadDias: null,
        vencido: c.vencido,
        enlace: null,
        simulacion: null,
        rr: null,
      });
    }
  }

  return lista;
}
