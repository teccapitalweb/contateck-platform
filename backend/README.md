# CONTATECK · Backend de timbrado CFDI 4.0

Backend en Node + Express que timbra y cancela CFDI 4.0 usando **Fiscalapi** como PAC,
verifica usuarios contra **Firebase** y guarda los comprobantes en **Firestore**.

Pensado para correr en **Railway**.

---

## 1. Qué hace

| Endpoint | Método | Para qué |
|---|---|---|
| `/` | GET | Health check (Railway lo usa) |
| `/api/timbrar` | POST | Timbra un CFDI |
| `/api/cancelar` | POST | Cancela un CFDI |
| `/api/cfdi/:id/pdf` | GET | Descarga el PDF (base64) |
| `/api/cfdi/:id/xml` | GET | Descarga el XML (base64) |
| `/api/cfdi/:id/status` | GET | Consulta estatus ante el SAT |

---

## 2. Variables de entorno

Copia `.env.example` a `.env` (local) o pégalas en Railway → Variables:

| Variable | Obligatoria | Notas |
|---|---|---|
| `FISCALAPI_URL` | sí | `https://test.fiscalapi.com` (pruebas) / `https://live.fiscalapi.com` (prod) |
| `FISCALAPI_KEY` | sí | API Key de Fiscalapi |
| `FISCALAPI_TENANT` | sí | Tenant Key de Fiscalapi |
| `REQUIRE_AUTH` | no | `false` para probar, `true` en producción |
| `ALLOWED_ORIGINS` | no | tu dominio, ej. `https://teccapitalweb.github.io` |
| `FIREBASE_SERVICE_ACCOUNT` | no* | JSON del service account, en una línea |
| `PORT` | no | Railway la define sola |

\* Sin `FIREBASE_SERVICE_ACCOUNT` el backend timbra igual, pero **no** verifica login ni guarda en Firestore.

---

## 3. Desplegar en Railway (paso a paso)

1. Sube esta carpeta a un repo de GitHub (ej. `teccapitalweb/contateck-backend`).
2. Entra a [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → elige el repo.
3. Railway detecta Node y corre `npm install` + `npm start` solo.
4. Ve a la pestaña **Variables** y pega al menos: `FISCALAPI_URL`, `FISCALAPI_KEY`, `FISCALAPI_TENANT`.
5. En **Settings → Networking → Generate Domain** para obtener tu URL pública.
6. Abre esa URL en el navegador: debe responder el JSON del health check.

> El frontend de CONTATECK apuntará a esa URL pública para timbrar.

---

## 4. Probar la conexión con Fiscalapi

En local, con tu `.env` lleno:

```bash
npm install
npm test
```

El script te dirá si las llaves autentican y si la **suscripción de prueba** está activa.
Si sale 403: entra al dashboard de Fiscalapi y activa la suscripción de prueba (gratis).

---

## 5. Antes de timbrar: configurar Fiscalapi (pruebas)

1. **Activar suscripción de prueba** — dashboard → Compras en línea → Suscripciones (gratis, tarjetas ficticias).
2. **Comprar timbres de prueba** — Tienda en línea → paquete de timbres (gratis en sandbox).
3. **Dar de alta un emisor** con su CSD de pruebas (Fiscalapi provee uno), o mandar el CSD en el body (modo "por valores").

---

## 6. Ejemplo de body para `/api/timbrar` (modo por referencias)

```json
{
  "invoice": {
    "versionCode": "4.0",
    "series": "F",
    "date": "2026-06-22T12:00:00",
    "paymentFormCode": "01",
    "paymentMethodCode": "PUE",
    "currencyCode": "MXN",
    "typeCode": "I",
    "expeditionZipCode": "75700",
    "exportCode": "01",
    "issuer":   { "id": "<id-emisor-en-fiscalapi>" },
    "recipient":{ "id": "<id-receptor-en-fiscalapi>" },
    "items": [
      { "id": "<id-producto-en-fiscalapi>", "quantity": 1 }
    ]
  }
}
```

Respuesta esperada: `{ "ok": true, "uuid": "....", "id": "....", "cfdi": { ... } }`.

---

## 7. Pasar a producción

1. Cambia `FISCALAPI_URL` a `https://live.fiscalapi.com`.
2. Genera la **API Key de producción** en Fiscalapi y reemplaza `FISCALAPI_KEY`.
3. Sube el **CSD real** (.cer + .key + contraseña) de cada RFC emisor.
4. Pon `REQUIRE_AUTH=true` y configura `FIREBASE_SERVICE_ACCOUNT` y `ALLOWED_ORIGINS`.
