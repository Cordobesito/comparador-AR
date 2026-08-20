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

## Aviso

Esta página es informativa y no constituye asesoramiento financiero. Las tasas y
cotizaciones pueden cambiar sin aviso y pueden existir topes o condiciones según
cada entidad.
