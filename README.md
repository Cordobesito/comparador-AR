# Comparador AR

Página web para comparar opciones de inversión en pesos argentinos: plazos fijos,
cuentas remuneradas, dólar y criptomonedas. También permite simular una inversión
y consultar el rendimiento real frente a la inflación.

La página publicada está disponible en:

<https://comparadorar.netlify.app/>

## Ejecutar localmente

Requiere Node.js 18 o superior.

```bash
npm install
npm run dev
```

Luego abrir <http://localhost:5173>.

## Fuentes de datos

La página consulta datos públicos de:

- [DolarApi](https://dolarapi.com): cotizaciones del dólar.
- [ArgentinaDatos](https://argentinadatos.com): plazos fijos, cuentas remuneradas,
  inflación, riesgo país y otros rendimientos.
- [CoinGecko](https://coingecko.com): precios de criptomonedas.

Las consultas y los cálculos están incluidos en el código fuente, principalmente en
`src/api-argentina.js`.

## Integración continua

`.github/workflows/ci.yml` corre dos cosas distintas:

| Trabajo | Cuándo | Qué controla |
|---|---|---|
| `build` | cada push y PR | Tests, compilación y que `dist/` salga completa |
| `fuentes` | todos los días 10:00 (ART) | Que las 7 APIs sigan vivas y con el formato esperado |

Van separados porque el segundo sale a internet: un hipo momentáneo de un
servidor ajeno no tiene por qué poner en rojo un commit sano.

Si una fuente se cae o cambia de formato, GitHub avisa por mail antes de que lo
note un visitante — que es exactamente lo que **no** pasó cuando CAFCI cortó el
acceso y la página se quedó mostrando "—" durante semanas.

---

## Licencia

MIT — ver [LICENSE](LICENSE).

---

## Aviso

Esta página es informativa y no constituye asesoramiento financiero. Las tasas y
cotizaciones pueden cambiar sin aviso y pueden existir topes o condiciones según
cada entidad.
