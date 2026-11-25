# Arquitectura y capas de seguridad (CONTATECK)

Los diagramas están en Mermaid (se ven en GitHub y en VS Code; para el informe se pueden exportar como imagen desde https://mermaid.live).

## 1. Arquitectura general

```mermaid
flowchart LR
    U["Usuario<br/>(navegador)"]

    subgraph FE["Frontend (GitHub Pages)"]
        direction TB
        H["Paginas HTML<br/>login, onboarding, dashboard, admin"]
        J["JavaScript por modulo<br/>contabilidad, ventas, facturacion,<br/>nomina, SAT y Fiscal, asistente"]
    end

    subgraph BE["Backend (Node.js + Express, Railway)"]
        direction TB
        MW["Autenticacion<br/>verifyAuth + rol"]
        RT["Rutas /api<br/>(87 rutas)"]
        LG["Logica de negocio y validaciones"]
        AS["Asistente contable<br/>reglas + base de conocimiento"]
    end

    subgraph SB["Supabase"]
        direction TB
        AU["Auth<br/>correo y Google"]
        PG["PostgreSQL<br/>25 tablas con RLS<br/>17 funciones SECURITY DEFINER"]
        ST["Storage privado<br/>documentos por empresa"]
    end

    PAC["Fiscalapi<br/>(PAC: timbrado CFDI 4.0)"]
    IA["Proveedor de IA<br/>(opcional, apagado)"]

    U --> H
    H --> J
    J -- "token de sesion" --> MW
    J -- "inicio de sesion" --> AU
    MW --> RT --> LG
    LG -- "con el token del usuario (RLS)" --> PG
    LG --> ST
    LG -- "timbrar, cancelar" --> PAC
    AS --> LG
    AS -. "ASISTENTE_MODO=ia" .-> IA
```

## 2. Capas de seguridad (defensa en profundidad)

```mermaid
flowchart TD
    A["1. Sesion<br/>Supabase Auth entrega un token (JWT) al iniciar sesion"]
    B["2. Backend: verifyAuth<br/>valida el token en cada peticion a /api"]
    C["3. Backend: rol<br/>cada ruta revisa el rol permitido<br/>(director, admin, contador, auditor, rh, vendedor)"]
    D["4. Base de datos: RLS<br/>cada tabla filtra por empresa_id = auth_empresa_id()"]
    E["5. Funciones SECURITY DEFINER<br/>revisan rol y empresa dentro de la base<br/>y validan reglas de negocio (Debe = Haber, periodo cerrado...)"]
    F["6. Triggers de proteccion<br/>impiden que un usuario se cambie el rol o la empresa"]

    A --> B --> C --> D --> E --> F
```

**Principios aplicados** (comprobados con pruebas y con la comparación del esquema real):
- Los datos se leen y escriben **con el token del propio usuario**, nunca con la llave de servicio, así que RLS siempre aplica.
- Una póliza no se borra: se **anula** o se **corrige** (queda la bitácora en `auditoria_log`).
- El rol **auditor** es de solo lectura en pantalla y en la base.
- La llave del proveedor de timbrado, los certificados y la llave de la IA solo viven en variables de entorno del backend.
- Se detectó y se documentó (OT-0047) que todas las tablas conceden permisos básicos a `anon` y solo las protege RLS; el endurecimiento queda propuesto como SQL.

## 3. Despliegue
| Pieza | Dónde | Cómo se publica |
|---|---|---|
| Frontend (HTML/JS) | GitHub Pages | Flujo de GitHub Actions al subir a la rama `dev` (`.github/workflows/pages.yml`) |
| Backend (Node.js ≥ 22) | Railway | Variables de entorno en Railway; ver `backend/.env.example` |
| Base de datos, Auth y Storage | Supabase (proyecto `contateck-dev` para desarrollo) | Scripts en `database/`; el plan gratuito pausa el proyecto tras días sin uso |
| Pruebas automáticas | GitHub Actions (`.github/workflows/pruebas.yml`) y `npm run test:ci` | 9 suites, 122 pruebas, sin red ni llaves |
