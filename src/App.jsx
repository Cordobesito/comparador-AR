/**
 * App.jsx
 * Shell de la aplicación: carga los datos una sola vez y los reparte.
 *
 * Antes cada pestaña hacía su propia carga y `inflAnual` nunca llegaba a
 * la vista de billeteras, así que la columna "vs inflación" no aparecía
 * nunca ahí. Centralizando la carga las dos vistas ven exactamente los
 * mismos números y se le pega a las APIs la mitad de veces.
 */

import { Component, useCallback, useEffect, useState } from "react";
import { getAllData, invalidarCache } from "./api-argentina.js";
import ComparadorInversiones from "./ComparadorInversiones.jsx";
import ComparadorBilleterasBancos from "./ComparadorBilleterasBancos.jsx";
import { PanelError, SkeletonPanorama, haceCuanto } from "./componentes.jsx";

const REFRESCO_MS = 15 * 60 * 1000;

const PESTANAS = [
  { id: "panorama", label: "Panorama" },
  { id: "ranking", label: "Dónde poner los pesos" },
];

// ─────────────────────────────────────────────
// ERROR BOUNDARY
// Sin esto, cualquier excepción en el render dejaba la página en blanco
// sin ningún mensaje, que es lo peor que puede pasar en producción.
// ─────────────────────────────────────────────

class LimiteDeError extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Error de render:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="contenedor">
          <PanelError
            mensaje={this.state.error.message ?? "Error inesperado."}
            onReintentar={() => window.location.reload()}
          />
        </div>
      );
    }
    return this.props.children;
  }
}

// ─────────────────────────────────────────────
// APP
// ─────────────────────────────────────────────

export default function App() {
  return (
    <LimiteDeError>
      <Contenido />
    </LimiteDeError>
  );
}

function Contenido() {
  const [pestana, setPestana] = useState("panorama");
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const cargar = useCallback(async ({ forzar = false } = {}) => {
    setCargando(true);
    if (forzar) invalidarCache();
    try {
      setDatos(await getAllData());
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
    const id = setInterval(() => cargar(), REFRESCO_MS);

    // Al volver a la pestaña después de un rato, refrescar: si no, se
    // pueden estar mirando cotizaciones de hace horas sin saberlo. Solo si
    // pasó el intervalo completo, para no parpadear en cada cambio de foco.
    const alVolver = () => {
      if (document.visibilityState !== "visible") return;
      setDatos((actuales) => {
        if (!actuales || Date.now() - actuales.timestamp > REFRESCO_MS) cargar();
        return actuales;
      });
    };
    document.addEventListener("visibilitychange", alVolver);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [cargar]);

  const refrescar = () => cargar({ forzar: true });

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="marca">
            <h1>Comparador AR</h1>
            <span>
              {datos ? `Datos ${haceCuanto(datos.timestamp)}` : "Cargando cotizaciones…"}
            </span>
          </div>

          <nav className="nav" role="tablist" aria-label="Vistas">
            {PESTANAS.map((p) => (
              <button
                key={p.id}
                id={`tab-${p.id}`}
                role="tab"
                type="button"
                aria-selected={pestana === p.id}
                aria-controls={`panel-${p.id}`}
                className="nav-btn"
                onClick={() => setPestana(p.id)}
              >
                {p.label}
              </button>
            ))}
          </nav>

          <button className="btn" onClick={refrescar} disabled={cargando}>
            {cargando ? "Actualizando…" : "↻ Actualizar"}
          </button>
        </div>
      </header>

      <main className="contenedor">
        {error && !datos ? (
          <PanelError mensaje={error} onReintentar={refrescar} />
        ) : !datos ? (
          <SkeletonPanorama />
        ) : (
          <div
            role="tabpanel"
            id={`panel-${pestana}`}
            aria-labelledby={`tab-${pestana}`}
          >
            {pestana === "panorama" ? (
              <ComparadorInversiones datos={datos} />
            ) : (
              <ComparadorBilleterasBancos datos={datos} />
            )}
          </div>
        )}

        <Pie />
      </main>
    </>
  );
}

function Pie() {
  return (
    <footer className="pie">
      <p>
        <strong>Fuentes:</strong> cotizaciones del dólar de{" "}
        <a href="https://dolarapi.com" target="_blank" rel="noopener noreferrer">
          DolarApi
        </a>
        ; plazos fijos, cuentas remuneradas, inflación (INDEC) y riesgo país de{" "}
        <a href="https://argentinadatos.com" target="_blank" rel="noopener noreferrer">
          ArgentinaDatos
        </a>
        ; precios crypto de{" "}
        <a href="https://coingecko.com" target="_blank" rel="noopener noreferrer">
          CoinGecko
        </a>
        .
      </p>
      <p style={{ marginTop: "0.5rem" }}>
        Las tasas son las que publica cada entidad y pueden cambiar sin aviso; varias tienen topes
        de monto o condiciones de acceso. Esta página es informativa,{" "}
        <strong>no es asesoramiento financiero</strong>: verificá siempre en la entidad antes de
        invertir.
      </p>
      {/*
        Sello de versión: permite saber qué build está publicado sin tener que
        descargar los archivos y compararlos contra el build local.
        __COMMIT__ y __BUILD_DATE__ los inyecta vite.config.js.
      */}
      <p className="pie-version" title={`Compilado el ${__BUILD_DATE__}`}>
        versión {__COMMIT__} · {__BUILD_DATE__}
      </p>
    </footer>
  );
}
