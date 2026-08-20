# Comparador AR

Comparador de inversiones en pesos para Argentina: plazos fijos, cuentas remuneradas
de billeteras virtuales, dólar y crypto — con el **rendimiento real** después de
descontar la inflación.

En producción: <https://comparadorar.netlify.app/>

---

## Correr el proyecto

Necesitás [Node.js](https://nodejs.org/) 18 o superior.

```bash
npm install
```

```bash
npm run dev
```

Abre <http://localhost:5173> solo. En Windows también podés hacer doble clic en
`iniciar.bat`, que instala las dependencias la primera vez y arranca el servidor.

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con recarga en caliente |
| `npm run build` | Genera `dist/` para publicar |
| `npm run publicar` | Compila, revisa que `dist/` esté completa y la abre para arrastrar |
| `npm run preview` | Sirve `dist/` como lo haría el hosting |
| `npm run verificar` | Chequea que las APIs sigan respondiendo y con el formato esperado |
| `npm test` | Tests de la matemática financiera (runner nativo de Node) |
| `npm run assets` | Regenera los PNG de marca (requiere Python + Pillow) |

---

## El proxy de API: lo más importante de entender

`api.argentinadatos.com` **no envía cabeceras CORS**. Un `fetch` directo desde el
navegador contra esa API falla siempre, aunque desde Node ande perfecto. Esa era la
razón por la que en la página publicada el plazo fijo, la inflación, el riesgo país
y los FCI aparecían todos en "—".

La solución es que el servidor haga el pedido, no el navegador. La app le pega a
rutas relativas `/api/ad/...` que se reescriben del lado del servidor:

- **Producción** → `netlify.toml`, bloque `[[redirects]]` con `status = 200`
  (un rewrite en el edge, no una redirección al navegador).
- **Dev y preview** → `vite.config.js`, `server.proxy` y `preview.proxy`.

> Los dos archivos tienen que declarar las mismas rutas. Si se desincronizan, la app
> funciona en local y se rompe en producción, o al revés.

`dolarapi.com` y `api.coingecko.com` sí mandan CORS: esas se consultan directo.

---

## Estructura

```
comparador-ar/
├── src/
│   ├── main.jsx                        Punto de entrada
│   ├── App.jsx                         Shell, carga de datos y error boundary
│   ├── index.css                       Paleta y estilos (una sola fuente de verdad)
│   ├── api-argentina.js                Capa de datos: APIs, caché, cálculos, formato
│   ├── componentes.jsx                 Simulador, badges y estados compartidos
│   ├── ComparadorInversiones.jsx       Vista "Panorama"
│   └── ComparadorBilleterasBancos.jsx  Vista "Dónde poner los pesos"
├── scripts/
│   ├── publicar.mjs                    Compila y abre la carpeta a subir
│   ├── verificar-apis.mjs              Chequeo de salud de las fuentes
│   ├── test-calculos.mjs               Tests de TNA/TEA, simulación e inflación
│   └── generar-assets.py               Redibuja los PNG de marca desde el isotipo
├── public/
│   ├── _redirects                      Proxy y SPA fallback para deploy manual
│   ├── _headers                        Cabeceras para deploy manual
│   ├── favicon.svg                     Isotipo de la marca, vectorial
│   ├── apple-touch-icon.png            180×180, pantalla de inicio en iOS
│   ├── og-image.png                    1200×630, tarjeta al compartir el link
│   ├── robots.txt
│   └── sitemap.xml
├── netlify.toml                        Build, proxy, redirects y cabeceras
├── vite.config.js                      Espejo local del proxy
└── index.html
```

La carga de datos vive **solo en `App.jsx`**. Las dos vistas reciben los mismos
datos por props y no hacen fetch por su cuenta: así no se pisan, no duplican
pedidos y siempre muestran los mismos números.

---

## Fuentes de datos

| Dato | Fuente | Vía |
|---|---|---|
| Cotizaciones del dólar | [DolarApi](https://dolarapi.com) | directo |
| Plazo fijo por banco | [ArgentinaDatos](https://argentinadatos.com) | proxy |
| Cuentas remuneradas (billeteras) | ArgentinaDatos `/fci/otros/ultimo` | proxy |
| Inflación mensual e interanual (INDEC) | ArgentinaDatos | proxy |
| Riesgo país | ArgentinaDatos | proxy |
| APY de exchanges | ArgentinaDatos `/rendimientos` | proxy |
| Precios crypto | [CoinGecko](https://coingecko.com) | directo |

Ninguna requiere clave de API. No hay variables de entorno que configurar.

### Fuentes que se retiraron

- **CAFCI** (`api.cafci.org.ar`) — devuelve 403 desde el navegador y 401 desde el
  servidor, y no publica credenciales. Era la fuente de las billeteras; se
  reemplazó por `/fci/otros/ultimo`, que trae la TNA directamente.
- **`/fci/mercado-dinero/{fecha}`** — devuelve 404 en cualquier fecha.
- **BCRA** (`/transparencia/v1.0/PlazosFijos`) — responde, pero mezcla 905 filas de
  bancos, mutuales y plazos fijos UVA y en dólares sin un código común para filtrar
  el producto. Tomar el máximo por entidad devolvía valores absurdos (hasta 97% de
  una mutual). La tabla de ArgentinaDatos ya cubre los 30 bancos relevantes, limpia.

---

## Detalles de los cálculos

- **Las tasas llegan como fracción.** ArgentinaDatos publica `0.19` para decir 19%
  de TNA. Se convierten en `aPorcentaje()`, que además tolera que la API pase a
  publicar en porcentaje sin romperse.
- **TNA no es TEA.** Una cuenta remunerada capitaliza a diario y un plazo fijo
  recién al renovar a los 30 días. Con la misma TNA del 23%, la cuenta rinde 25,86%
  efectivo anual y el plazo fijo 25,59%. El ranking ordena por TEA, que es lo
  comparable.
- **La simulación respeta esa diferencia**: interés compuesto diario para cuentas,
  interés simple dentro del plazo para plazo fijo.
- **Inflación de referencia**: los últimos 3 meses anualizados, no el interanual.
  Con la inflación bajando, el interanual arrastra meses viejos y haría ver
  perdedores a instrumentos que hoy empatan.
- **Datos viejos**: una tasa de más de 45 días no se muestra, y entre 7 y 45 días
  se muestra con la advertencia de cuándo se publicó.
- **Duplicados entre fuentes**: algunas entidades salen en dos feeds con números
  distintos (Fiwind aparecía al 20% como cuenta remunerada y al 18,2% como
  exchange). Gana la fila de cuentas remuneradas, que trae tope y condiciones.
- **Variantes del mismo producto**: si solo se diferencian por el tramo de plazo y
  pagan lo mismo se muestran juntas (los tres "Naranja X Frascos" al 19% son una
  sola fila, 7–28 días). Si pagan distinto siguen separadas, que es el dato útil.

---

## Publicar

Antes de subir, conviene correr:

```bash
npm run verificar
```

```bash
npm test
```

Si alguna fuente cambió de formato o dejó de responder, avisa ahí y no en la página
publicada.

### Opción A — arrastrar la carpeta a Netlify

```bash
npm run publicar
```

Compila, verifica que `dist/` tenga `index.html` y `_redirects`, y te abre la
carpeta en el explorador. Arrastrá **esa** a Netlify.

> ⚠️ Arrastrar la carpeta del proyecto da el error *"contiene varios archivos HTML,
> pero no un archivo index.html"*: Netlify busca `index.html` en la raíz de lo que
> se sube, y ahí lo encuentra en `index.html` y en `dist/index.html`, ninguno en la
> raíz. La carpeta correcta es `dist/`, que tiene `index.html` arriba de todo.

`dist/` sale autosuficiente: incluye `_redirects` y `_headers`, que llevan el proxy
y las cabeceras. Salen de `public/`, que Vite copia tal cual.

### Opción B — conectar el repo (recomendado)

Netlify lee `netlify.toml` de la raíz del repo y hace el build solo: cada push
publica. Además queda historial y se puede volver atrás a un deploy anterior.

### Por qué hay dos archivos de configuración

`netlify.toml` y `public/_redirects` declaran el mismo proxy, pero se despliegan
distinto:

| Archivo | Se usa cuando | Por qué |
|---|---|---|
| `netlify.toml` | Netlify buildea desde git | Está en la raíz del repo |
| `public/_redirects` + `public/_headers` | Se sube `dist/` a mano | Vite los copia dentro de `dist/` |

Si cambiás las rutas del proxy, **actualizá los dos** (y `vite.config.js` para
dev). Si se desincronizan, la app anda en un entorno y se rompe en el otro.

### Otro hosting

Hay que replicar el rewrite de `/api/ad/*` hacia `https://api.argentinadatos.com/`.
Sin eso, media página queda en "—".

---

## Marca

El favicon y la imagen para compartir usan el isotipo de **Guzmán Asesor Bursátil**
—la línea de cotización dentro del círculo— redibujado en vectores.

| | |
|---|---|
| Crema | `#f1ede2` |
| Tinta | `#2e2d29` |
| Oro | `#a1885c` |

`public/favicon.svg` es la fuente de verdad: es vectorial y escala solo. Los dos
PNG se regeneran con `npm run assets` y únicamente hace falta hacerlo si cambia
la marca.

Los trazos del isotipo son un poco más gruesos que en el logo original a
propósito: el anillo del logo es un hairline y a 16px —el tamaño real de un
favicon— desaparecía por completo.

---

Esta página es informativa y **no es asesoramiento financiero**. Las tasas son las
que publica cada entidad, pueden cambiar sin aviso y muchas tienen topes de monto o
condiciones de acceso.
