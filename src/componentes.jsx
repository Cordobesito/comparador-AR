/**
 * componentes.jsx
 * Piezas de UI compartidas por las dos vistas.
 *
 * El simulador y los badges estaban duplicados —con estilos distintos—
 * en cada comparador. Acá viven una sola vez.
 */

import { formatARS, formatPct, DIAS_AVISO_ANTIGUEDAD } from "./api-argentina.js";

// ─────────────────────────────────────────────
// SIMULADOR (capital + horizonte)
// ─────────────────────────────────────────────

export const HORIZONTES = [
  { dias: 30, label: "30 días" },
  { dias: 60, label: "60 días" },
  { dias: 90, label: "90 días" },
  { dias: 180, label: "180 días" },
  { dias: 365, label: "1 año" },
];

export function Simulador({ capital, setCapital, horizonte, setHorizonte, nota }) {
  return (
    <div className="panel">
      <div className="campo">
        <label htmlFor="sim-capital">Capital inicial</label>
        <input
          id="sim-capital"
          className="input"
          type="number"
          inputMode="numeric"
          min={1000}
          step={10000}
          value={capital}
          // Borrar el campo daba NaN, que se propagaba a toda la tabla como
          // "NaN" o "$ NaN". Se conserva lo tipeado y se valida al salir.
          onChange={(e) => {
            const v = e.target.value;
            setCapital(v === "" ? "" : Math.min(1e12, Math.max(0, Number(v) || 0)));
          }}
          onBlur={(e) => {
            const v = Number(e.target.value);
            if (!Number.isFinite(v) || v < 1000) setCapital(100000);
          }}
        />
      </div>

      <div className="campo">
        <label htmlFor="sim-plazo">Plazo</label>
        <select
          id="sim-plazo"
          className="select"
          value={horizonte}
          onChange={(e) => setHorizonte(Number(e.target.value))}
        >
          {HORIZONTES.map((h) => (
            <option key={h.dias} value={h.dias}>
              {h.label}
            </option>
          ))}
        </select>
      </div>

      {nota && <p className="panel-nota">{nota}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────
// BADGES
// ─────────────────────────────────────────────

/** Rendimiento real contra la inflación. */
export function BadgeReal({ rr }) {
  if (!rr) return <span style={{ color: "var(--txt-tenue)" }}>—</span>;
  return (
    <span className={`badge ${rr.ganaInflacion ? "badge-ok" : "badge-mal"}`}>
      {rr.ganaInflacion ? "▲" : "▼"} {formatPct(rr.real)}
    </span>
  );
}

/**
 * Advierte cuando el dato no es de hoy.
 * La versión anterior mostraba tasas de marzo de 2025 sin ninguna marca,
 * ordenadas primeras por ser las más altas.
 */
export function BadgeAntiguedad({ dias, vencido }) {
  if (vencido) return <span className="badge badge-aviso">sin conexión</span>;
  if (dias == null || dias <= DIAS_AVISO_ANTIGUEDAD) return null;
  return (
    <span className="badge badge-aviso" title={`Último dato publicado hace ${dias} días`}>
      hace {dias}d
    </span>
  );
}

export function Badge({ tipo = "neutral", children, title }) {
  return (
    <span className={`badge badge-${tipo}`} title={title}>
      {children}
    </span>
  );
}

// ─────────────────────────────────────────────
// RESULTADO DE UNA SIMULACIÓN
// ─────────────────────────────────────────────

export function Resultado({ simulacion, horizonte }) {
  if (!simulacion) return <span style={{ color: "var(--txt-tenue)" }}>—</span>;
  return (
    <>
      <div className="destacado">{formatARS(simulacion.final)}</div>
      <div className="ganancia">
        +{formatARS(simulacion.ganancia)} en {horizonte}d
      </div>
    </>
  );
}

// ─────────────────────────────────────────────
// ESTADOS
// ─────────────────────────────────────────────

export function SkeletonPanorama() {
  return (
    <div aria-busy="true" aria-label="Cargando cotizaciones">
      <div className="cards">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skel skel-card" />
        ))}
      </div>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="skel skel-fila" />
      ))}
    </div>
  );
}

export function PanelError({ mensaje, onReintentar }) {
  return (
    <div className="aviso aviso-error" role="alert">
      <span aria-hidden="true">✕</span>
      <div>
        <strong>No se pudieron cargar los datos.</strong>
        <div style={{ marginTop: 4, opacity: 0.85 }}>{mensaje}</div>
        {onReintentar && (
          <button className="btn" style={{ marginTop: 10 }} onClick={onReintentar}>
            Reintentar
          </button>
        )}
      </div>
    </div>
  );
}

/** Se muestra cuando algunas fuentes respondieron y otras no. */
export function AvisoFuentesCaidas({ fuentes }) {
  if (!fuentes?.length) return null;
  const nombres = {
    dolares: "cotizaciones del dólar",
    plazoFijo: "plazos fijos",
    cuentas: "cuentas remuneradas",
    inflacion: "inflación",
    riesgoPais: "riesgo país",
    crypto: "crypto",
    exchanges: "rendimientos de exchanges",
  };
  return (
    <div className="aviso aviso-warn" role="status">
      <span aria-hidden="true">⚠</span>
      <div>
        Sin respuesta de: {fuentes.map((f) => nombres[f] ?? f).join(", ")}. El resto de la página
        está actualizado.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// UTILIDADES DE PRESENTACIÓN
// ─────────────────────────────────────────────

export function haceCuanto(ts) {
  if (!ts) return "—";
  const min = Math.floor((Date.now() - ts) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.floor(h / 24)} d`;
}
