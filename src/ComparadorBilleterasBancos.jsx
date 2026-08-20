/**
 * ComparadorBilleterasBancos.jsx
 * Vista "Dónde poner los pesos": ranking único de cuentas remuneradas
 * (billeteras) y plazos fijos (bancos), ordenado por rendimiento real.
 *
 * Cambios respecto de la versión anterior:
 *  - Las tasas vienen de argentinadatos, no de CAFCI (que devuelve 403).
 *    Antes las 6 billeteras quedaban en `null` y la lista mostraba solo
 *    dos filas cargadas a mano en marzo de 2025.
 *  - `inflAnual` llega de verdad, así que la comparación contra la
 *    inflación ya no está siempre vacía.
 *  - Se quitó el panel de administración: guardaba la contraseña en el
 *    bundle público (VITE_ADMIN_PASSWORD queda en texto plano dentro del
 *    JS que descarga cualquiera) y existía solo para editar a mano tasas
 *    que ahora llegan de una fuente en vivo.
 */

import { useMemo, useState } from "react";
import {
  ajustarPorInflacion,
  calcularRendimientoReal,
  formatARS,
  formatNum,
  formatTasa,
  simularInversion,
  tnaATea,
} from "./api-argentina.js";
import {
  AvisoFuentesCaidas,
  Badge,
  BadgeAntiguedad,
  BadgeReal,
  Resultado,
  Simulador,
} from "./componentes.jsx";

const FILTROS = [
  { id: "todos", label: "Todos" },
  { id: "billetera", label: "Billeteras" },
  { id: "banco", label: "Plazos fijos" },
];

export default function ComparadorBilleterasBancos({ datos }) {
  const [capital, setCapital] = useState(100000);
  const [horizonte, setHorizonte] = useState(30);
  const [filtro, setFiltro] = useState("todos");
  const [abierta, setAbierta] = useState(null);

  const inflacion = datos.inflacion.ok ? datos.inflacion.data : null;
  const inflReferencia = inflacion?.proyectada ?? inflacion?.interanual ?? null;
  const capitalNum = Number(capital) || 0;

  const entidades = useMemo(
    () => construirRanking(datos, capitalNum, horizonte, inflReferencia),
    [datos, capitalNum, horizonte, inflReferencia]
  );

  const visibles = filtro === "todos" ? entidades : entidades.filter((e) => e.tipo === filtro);

  const cuentas = entidades.filter((e) => e.tipo === "billetera").length;
  const bancos = entidades.filter((e) => e.tipo === "banco").length;

  return (
    <section>
      <div className="seccion-head">
        <div>
          <h2>¿Dónde poner los pesos?</h2>
          <p>
            {cuentas} cuentas remuneradas y {bancos} plazos fijos, ordenados por tasa. Tocá una fila
            para ver el detalle.
          </p>
        </div>
      </div>

      <AvisoFuentesCaidas fuentes={datos.fuentesCaidas} />

      <Simulador
        capital={capital}
        setCapital={setCapital}
        horizonte={horizonte}
        setHorizonte={setHorizonte}
        nota={
          inflReferencia != null
            ? `Inflación de referencia: ${formatNum(inflReferencia, 1)}% anual proyectada.`
            : "Sin dato de inflación: no se calcula el rendimiento real."
        }
      />

      <div className="chips" role="group" aria-label="Filtrar entidades">
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

      {!visibles.length ? (
        <p className="vacio">No hay entidades para este filtro.</p>
      ) : (
        <div className="ranking">
          {visibles.map((e, i) => (
            <Fila
              key={e.id}
              entidad={e}
              posicion={i + 1}
              horizonte={horizonte}
              capital={capitalNum}
              inflReferencia={inflReferencia}
              abierta={abierta === e.id}
              onToggle={() => setAbierta(abierta === e.id ? null : e.id)}
            />
          ))}
        </div>
      )}

      <p className="pie" style={{ marginTop: "1.5rem" }}>
        Las <strong>cuentas remuneradas</strong> pagan todos los días y permiten sacar la plata
        cuando quieras, pero la tasa puede cambiar de un día para el otro y casi todas tienen tope
        de monto. El <strong>plazo fijo</strong> fija la tasa por 30 días, sin tope, a cambio de
        inmovilizar el capital.
      </p>
    </section>
  );
}

// ─────────────────────────────────────────────
// FILA
// ─────────────────────────────────────────────

function Fila({ entidad, posicion, horizonte, capital, inflReferencia, abierta, onToggle }) {
  const esBilletera = entidad.tipo === "billetera";
  const lider = posicion === 1;

  const poderCompra =
    entidad.simulacion && inflReferencia != null
      ? ajustarPorInflacion(entidad.simulacion.final, inflReferencia, horizonte)
      : null;

  // Casi todas las cuentas remuneradas pagan la tasa alta solo hasta cierto
  // saldo. Si el capital simulado la supera, el rendimiento mostrado no es
  // el que la persona va a recibir: hay que decirlo.
  const superaTope = entidad.tope != null && capital > entidad.tope;

  return (
    <div
      className={`fila${lider ? " fila-lider" : ""}`}
      role="button"
      tabIndex={0}
      aria-expanded={abierta}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      <div className="fila-pos">{posicion}</div>

      <div>
        <div className="fila-nombre">
          {entidad.nombre}
          <Badge tipo="neutral">{esBilletera ? "billetera" : "plazo fijo"}</Badge>
          {lider && <Badge tipo="ok">mejor tasa</Badge>}
          {superaTope && (
            <Badge tipo="aviso" title="La tasa alta se paga solo hasta el tope">
              supera el tope
            </Badge>
          )}
          <BadgeAntiguedad dias={entidad.antiguedadDias} vencido={entidad.vencido} />
        </div>
        <div className="fila-sub">{entidad.detalle}</div>
      </div>

      <div className="fila-tasa">
        <b style={{ color: esBilletera ? "var(--acento)" : "var(--ok)" }}>
          {formatTasa(entidad.tna)}
        </b>
        <span>TNA</span>
      </div>

      <div className="fila-resultado">
        <Resultado simulacion={entidad.simulacion} horizonte={horizonte} />
        <div style={{ marginTop: 4 }}>
          <BadgeReal rr={entidad.rr} />
        </div>
      </div>

      {abierta && (
        <div className="fila-detalle">
          <Dato titulo="Tasa efectiva anual" valor={formatTasa(entidad.tea)} />
          <Dato titulo="Liquidez" valor={entidad.liquidez} />
          <Dato titulo="Tope de monto" valor={entidad.tope ? formatARS(entidad.tope) : "Sin tope"} />
          <Dato
            titulo="Poder de compra final"
            valor={poderCompra != null ? formatARS(poderCompra) : "—"}
          />
          <Dato titulo="Fuente" valor={entidad.fuente} />
          <Dato titulo="Último dato" valor={entidad.fecha ?? "—"} />
          {entidad.condiciones && (
            <div className="detalle-item" style={{ gridColumn: "1 / -1" }}>
              <span>Condiciones</span>
              <b style={{ fontWeight: 500 }}>{entidad.condiciones}</b>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Dato({ titulo, valor }) {
  return (
    <div className="detalle-item">
      <span>{titulo}</span>
      <b>{valor}</b>
    </div>
  );
}

// ─────────────────────────────────────────────
// RANKING
// ─────────────────────────────────────────────

function construirRanking(datos, capital, horizonte, inflReferencia) {
  const lista = [];

  if (datos.cuentas.ok) {
    for (const c of datos.cuentas.data) {
      lista.push({
        id: `cuenta-${c.id}`,
        tipo: "billetera",
        nombre: c.nombre,
        tna: c.tna,
        tea: c.tea,
        tope: c.tope,
        liquidez: "Inmediata",
        condiciones: c.condiciones,
        fecha: c.fecha,
        antiguedadDias: c.antiguedadDias,
        vencido: c.vencido,
        fuente: "ArgentinaDatos",
        detalle: [
          "Cuenta remunerada",
          c.tope ? `tope ${formatARS(c.tope)}` : "sin tope",
          c.plazoMinDias ? `${c.plazoMinDias}–${c.plazoMaxDias ?? c.plazoMinDias} días` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        simulacion: simularInversion(capital, c.tna, horizonte, { capitalizacion: "diaria" }),
        rr:
          inflReferencia != null
            ? calcularRendimientoReal(c.tna, inflReferencia, { capitalizacion: "diaria" })
            : null,
      });
    }
  }

  if (datos.plazoFijo.ok) {
    for (const pf of datos.plazoFijo.data) {
      lista.push({
        id: `pf-${pf.banco}`,
        tipo: "banco",
        nombre: pf.banco,
        tna: pf.tna,
        tea: null,
        tope: null,
        liquidez: "30 días",
        condiciones:
          pf.tnaNoClientes && pf.tnaNoClientes !== pf.tnaClientes
            ? `Tasa para clientes. Para no clientes: ${formatTasa(pf.tnaNoClientes)} TNA.`
            : null,
        fecha: null,
        antiguedadDias: null,
        vencido: pf.vencido,
        fuente: "ArgentinaDatos / BCRA",
        detalle: "Plazo fijo 30 días · capital inmovilizado",
        simulacion: simularInversion(capital, pf.tna, horizonte, { capitalizacion: 30 }),
        rr:
          inflReferencia != null
            ? calcularRendimientoReal(pf.tna, inflReferencia, { capitalizacion: 30 })
            : null,
      });
    }
  }

  // La TEA es lo comparable entre productos con capitalización distinta:
  // un plazo fijo al 23% TNA rinde menos que una cuenta al 23% TNA, porque
  // la cuenta capitaliza a diario. Ordenar por TNA los empataría de más.
  return lista
    .map((e) => ({
      ...e,
      tea: e.tea ?? tnaATea(e.tna, e.tipo === "banco" ? 30 : "diaria"),
    }))
    .sort((a, b) => (b.tea ?? b.tna) - (a.tea ?? a.tna));
}
