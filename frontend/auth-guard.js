/* ============================================================
   CONTATECK · auth-guard.js  (módulo ES)
   OT-0004 · Protege el panel con Supabase Auth (reemplaza Firebase
   Auth). Mismo comportamiento: sin sesión → manda a login. Pinta
   el usuario real y maneja "Cerrar sesión". Si no hay config
   válida, corre en modo demo (no bloquea).
   ============================================================ */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cfg = window.SUPABASE_CONFIG || {};
const configured = !!cfg.url && !!cfg.anonKey && cfg.url.indexOf("PEGA") === -1;
const logoutEls = document.querySelectorAll("[data-logout]");

function initials(name) {
  if (!name) return "U";
  const clean = name.split("@")[0].replace(/[._-]+/g, " ").trim();
  const p = clean.split(/\s+/);
  return ((p[0] ? p[0][0] : "") + (p[1] ? p[1][0] : "")).toUpperCase() || name[0].toUpperCase();
}
function paintUser(name, sub) {
  document.querySelectorAll("[data-user-name]").forEach((e) => { e.textContent = name; });
  document.querySelectorAll("[data-user-ini]").forEach((e) => { e.textContent = initials(name); });
  if (sub) document.querySelectorAll("[data-user-sub]").forEach((e) => { e.textContent = sub; });
}

if (!configured) {
  /* ---------- MODO DEMO: no bloquea ---------- */
  logoutEls.forEach((el) => el.addEventListener("click", () => { window.location.href = "login.html"; }));
} else {
  /* ---------- PROTECCIÓN REAL ---------- */
  const app2 = document.querySelector(".app");
  try {
    const supabase = createClient(cfg.url, cfg.anonKey, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
    });

    // Evita el "flash" del panel antes de confirmar la sesión.
    if (app2) app2.style.visibility = "hidden";

    // OT-0033 · Red de seguridad ante un token vencido. Si el panel lleva abierto
    // más de una hora, o la pestaña estuvo en segundo plano y Supabase no alcanzó a
    // renovar la sesión, TODAS las llamadas al backend fallaban con 401 ("Token
    // inválido o expirado") y las pantallas se quedaban en "No se pudieron cargar los
    // datos" hasta recargar a mano. Ahora, ante un 401 en una llamada al backend que
    // iba con sesión: se pide UNA renovación (compartida si fallan varias a la vez) y
    // se reintenta una sola vez con el token nuevo. Solo si la renovación misma falla
    // (la sesión ya no sirve) se cierra la sesión y se manda al login. Si tras renovar
    // el backend sigue respondiendo 401, se devuelve esa respuesta sin cerrar sesión.
    (function instalarRenovacionDeToken() {
      const original = window.fetch.bind(window);
      const BASE = (window.APP_CONFIG && window.APP_CONFIG.BACKEND_URL) || "https://contateck-backend-production.up.railway.app";
      let renovando = null;
      // OT-0056 · Multiempresa: cada llamada al backend dice qué empresa está mostrando esta pestaña
      // (cabecera X-Empresa-Id). Si la persona ya cambió de empresa en otra pestaña, el backend responde
      // 409 EMPRESA_CAMBIO y aquí se recarga, en vez de seguir mostrando/escribiendo en la empresa vieja.
      // Solo se manda cuando el backend avisó (multiempresa:true en /api/perfil): un backend anterior
      // rechazaría la cabecera nueva en el preflight de CORS. Solo con encabezados en objeto plano.
      let avisandoCambio = false;
      function conEmpresa(input, init) {
        const emp = window.CONTATECK_MULTIEMPRESA && window.CONTATECK_EMPRESA_PG && window.CONTATECK_EMPRESA_PG.id;
        const u = typeof input === "string" ? input : (input && input.url) || "";
        const h = init && init.headers;
        if (!emp || !u.startsWith(BASE) || !h || typeof h !== "object" || typeof h.get === "function" || Array.isArray(h)) return init;
        return Object.assign({}, init, { headers: Object.assign({}, h, { "X-Empresa-Id": emp }) });
      }
      function avisarCambioDeEmpresa(resp) {
        if (avisandoCambio) return;
        resp.clone().json().then((j) => {
          if (!j || j.codigo !== "EMPRESA_CAMBIO" || avisandoCambio) return;
          avisandoCambio = true;
          const b = document.createElement("div");
          b.setAttribute("role", "alert");
          b.style.cssText = "position:fixed;left:50%;top:1rem;transform:translateX(-50%);z-index:9999;max-width:90vw;padding:.8rem 1.1rem;border-radius:10px;background:#1b2338;color:#fff;border:1px solid #6E8BFF;box-shadow:0 10px 40px rgba(0,0,0,.5);font-size:.9rem";
          b.textContent = j.error || "Cambiaste de empresa en otra pestaña. Recargando…";
          document.body.appendChild(b);
          setTimeout(() => window.location.reload(), 1800);
        }).catch(() => { /* respuesta sin cuerpo: no es el aviso */ });
      }
      window.fetch = async function (input, init) {
        init = conEmpresa(input, init);
        const resp = await original(input, init);
        if (resp.status === 409) avisarCambioDeEmpresa(resp);
        if (resp.status !== 401) return resp;
        const url = typeof input === "string" ? input : (input && input.url) || "";
        const h = init && init.headers;
        if (!url.startsWith(BASE) || !h || typeof h !== "object" || typeof h.get === "function") return resp;
        if (!(h.Authorization || h.authorization)) return resp; // iba sin sesión: no es un token vencido
        if (!renovando) {
          renovando = supabase.auth.refreshSession().finally(() => { setTimeout(() => { renovando = null; }, 2000); });
        }
        let nuevo = null, fallo = false;
        try {
          const r = await renovando;
          nuevo = r && r.data && r.data.session && r.data.session.access_token;
          fallo = !!(r && r.error) || !nuevo;
        } catch (e) { fallo = true; }
        if (fallo) {
          try { window.CTStorage && window.CTStorage.limpiarCaches(); } catch (e) { /* solo es un respaldo */ }
          try { await supabase.auth.signOut(); } catch (e) { /* sigue al login */ }
          window.location.replace("login.html");
          return resp;
        }
        window.CONTATECK_SUPABASE_TOKEN = nuevo;
        return original(input, Object.assign({}, init, { headers: Object.assign({}, h, { Authorization: "Bearer " + nuevo }) }));
      };
    })();

    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      const user = data?.session?.user;
      if (!user) { window.location.replace("login.html"); return; }
      const displayName = user.user_metadata?.full_name || user.email || "Usuario";
      paintUser(displayName, "Cerrar sesión");
      if (app2) app2.style.visibility = "";

      // OT-0008-B: se expone para que data-firestore.js pueda pedir el
      // puente de Firebase Custom Token (ver /api/firebase-token).
      window.CONTATECK_SUPABASE_TOKEN = data.session.access_token;

      // OT-0006 · Fase A: intenta traer empresa/perfil reales de Postgres.
      // Si no hay backend, no hay datos, o algo falla, NO se toca nada —
      // el selector de empresa sigue funcionando con EMPRESAS de data.js
      // exactamente como antes. Esto es un agregado, no un reemplazo.
      try {
        const BACKEND = (window.APP_CONFIG && window.APP_CONFIG.BACKEND_URL) || "https://contateck-backend-production.up.railway.app";
        const authHeader = { Authorization: `Bearer ${data.session.access_token}` };

        // OT-0014: estas 4 llamadas son independientes entre sí (ninguna
        // necesita el resultado de otra), así que antes no había motivo
        // para esperarlas una por una — eso sumaba los tiempos de red en
        // vez de dejarlos correr al mismo tiempo. Con Promise.all, el
        // tiempo total baja al de la más lenta de las 4, no a la suma.
        const [perfilData, catData, opData, cfdisData, empleadosData, onbData, configContableData, saldoData, saldoProveedorData] = await Promise.all([
          fetch(`${BACKEND}/api/perfil`, { headers: authHeader }).then((r) => r.json()).catch(() => ({ ok: false })),
          fetch(`${BACKEND}/api/catalogo`, { headers: authHeader }).then((r) => r.json()).catch(() => ({ ok: false })),
          fetch(`${BACKEND}/api/operacion`, { headers: authHeader }).then((r) => r.json()).catch(() => ({ ok: false })),
          fetch(`${BACKEND}/api/cfdis`, { headers: authHeader }).then((r) => r.json()).catch(() => ({ ok: false })),
          fetch(`${BACKEND}/api/empleados`, { headers: authHeader }).then((r) => r.json()).catch(() => ({ ok: false })),
          fetch(`${BACKEND}/api/onboarding/estado`, { headers: authHeader }).then((r) => r.json()).catch(() => ({ ok: false })),
          // OT-0044: por CTPostgres (caché de 8 s con petición compartida) para que Contabilidad, que la pide
          // otra vez al abrir, no repita la petición. Sin CTPostgres (páginas que no lo cargan) va directo.
          (window.CTPostgres && window.CTPostgres.leerConfigContable
            ? window.CTPostgres.leerConfigContable()
            : fetch(`${BACKEND}/api/config-contable`, { headers: authHeader }).then((r) => r.json())
          ).catch(() => ({ ok: false })),
          fetch(`${BACKEND}/api/cfdis-saldo`, { headers: authHeader }).then((r) => r.json()).catch(() => ({ ok: false })),
          fetch(`${BACKEND}/api/cfdis-proveedor-saldo`, { headers: authHeader }).then((r) => r.json()).catch(() => ({ ok: false })),
        ]);

        // Fase 1 (onboarding): confirma con el endpoint dedicado (preciso)
        // si de verdad no hay perfil — /api/perfil no distingue bien entre
        // "sin perfil" y "Postgres no configurado", así que no sirve para
        // esta decisión.
        if (onbData.ok && (onbData.tienePerfil === false || onbData.activo === false)) {
          // OT-0056: si le dieron de baja en la empresa que tenía activa pero pertenece a otra con acceso,
          // se le cambia a esa en vez de mandarla a una pantalla sin salida. Una sola vez por minuto (sin ciclos).
          if (onbData.tienePerfil !== false && onbData.activo === false) {
            try {
              const previo = Number(sessionStorage.getItem("ct_auto_empresa") || 0);
              if (Date.now() - previo > 60000) {
                sessionStorage.setItem("ct_auto_empresa", String(Date.now()));
                const lista = await fetch(BACKEND + "/api/empresas", { headers: authHeader }).then((r) => r.json());
                const otra = lista && lista.ok && (lista.empresas || []).find((e) => e.acceso && !e.activa);
                if (otra) {
                  const cambio = await fetch(BACKEND + "/api/empresas/cambiar", { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, authHeader), body: JSON.stringify({ empresaId: otra.id }) }).then((r) => r.json());
                  if (cambio && cambio.ok) {
                    sessionStorage.setItem("ct_aviso_empresa", "Tu acceso a la empresa anterior está dado de baja. Entraste a " + otra.nombre + ".");
                    window.location.reload();
                    return;
                  }
                }
              }
            } catch (e) { /* sin otra empresa o sin conexión: sigue el camino de siempre */ }
          }
          window.location.replace("onboarding.html");
          return;
        }

        if (perfilData.ok && perfilData.fuente === "postgres" && perfilData.empresa) {
          window.CONTATECK_EMPRESA_PG = perfilData.empresa;
          window.CONTATECK_MULTIEMPRESA = perfilData.multiempresa === true; // OT-0056
          try { // aviso de una sola vez tras un cambio automático de empresa
            const aviso = sessionStorage.getItem("ct_aviso_empresa");
            if (aviso) {
              sessionStorage.removeItem("ct_aviso_empresa");
              const b = document.createElement("div");
              b.setAttribute("role", "status");
              b.style.cssText = "position:fixed;left:50%;top:1rem;transform:translateX(-50%);z-index:9999;max-width:90vw;padding:.8rem 1.1rem;border-radius:10px;background:#1b2338;color:#fff;border:1px solid #6E8BFF;box-shadow:0 10px 40px rgba(0,0,0,.5);font-size:.9rem";
              b.textContent = aviso;
              document.body.appendChild(b);
              setTimeout(() => b.remove(), 7000);
            }
          } catch (e) { /* solo es un aviso */ }
          window.CONTATECK_PERFIL_PG = perfilData.perfil;
          // OT-0042: el rol queda en <html data-rol="…"> para que styles.css oculte, al auditor
          // (rol de solo lectura), los botones que escriben. El servidor y la base los rechazan igual.
          if (perfilData.perfil && perfilData.perfil.rol) document.documentElement.setAttribute("data-rol", perfilData.perfil.rol);
          document.querySelectorAll("[data-empresa-label]").forEach((el) => {
            el.textContent = perfilData.empresa.nombre;
          });
          // Etiqueta de rol junto al nombre (ej. "Contador · Cerrar sesión"),
          // para que cada quien sepa con qué rol está viendo el panel.
          if (perfilData.perfil && perfilData.perfil.rol) {
            const rolTxt = perfilData.perfil.rol[0].toUpperCase() + perfilData.perfil.rol.slice(1);
            paintUser(displayName, rolTxt + " · Cerrar sesión");
          }
        }

        // OT-0007 · Fase A: catálogo de clientes/productos.
        if (catData.ok && catData.fuente === "postgres") {
          window.CONTATECK_CLIENTES_PG = catData.clientes || [];
          window.CONTATECK_PRODUCTOS_PG = catData.productos || [];
        }

        // OT-0008 · Fase A: empleados/pólizas.
        if (opData.ok && opData.fuente === "postgres") {
          window.CONTATECK_EMPLEADOS_PG = opData.empleados || [];
          window.CONTATECK_POLIZAS_PG = opData.polizas || [];
        }

        // OT-0012: CFDIs reales.
        if (cfdisData.ok) {
          window.CONTATECK_CFDIS_PG = cfdisData.cfdis || [];
          // OT-0030: cuántos CFDI hay en total (el listado llega por páginas de 200).
          window.CONTATECK_CFDIS_META = { total: cfdisData.total, pagina: cfdisData.pagina || 1, limite: cfdisData.limite || 200 };
        }

        // OT-0020: configuración contable (mapa de roles -> cuentas
        // reales de la empresa) y facturas con saldo pendiente para
        // el flujo de "Me pagó un cliente".
        if (configContableData.ok) {
          window.CONTATECK_CONFIG_CONTABLE_PG = configContableData.config || {};
        } else {
          window.CONTATECK_CONFIG_CONTABLE_PG = {}; // sin datos: todo se trata como "no configurado"
        }
        if (saldoData.ok) {
          window.CONTATECK_CFDIS_SALDO_PG = saldoData.facturas || [];
        } else {
          window.CONTATECK_CFDIS_SALDO_PG = [];
        }
        // OT-0023: facturas de proveedor con saldo por pagar.
        if (saldoProveedorData.ok) {
          window.CONTATECK_CFDIS_PROVEEDOR_SALDO_PG = saldoProveedorData.facturas || [];
        } else {
          window.CONTATECK_CFDIS_PROVEEDOR_SALDO_PG = [];
        }

        // Nómina Parte A (OT-0017): empleados reales (columnas según rol).
        if (empleadosData.ok) {
          window.CONTATECK_EMPLEADOS_REAL_PG = empleadosData.empleados || [];
        } else {
          window.CONTATECK_EMPLEADOS_REAL_PG = []; // sin permiso o error: tabla vacía, nunca datos falsos
        }
      } catch (e) {
        // Silencioso a propósito: sin Postgres disponible, sigue el modo local.
      }
    }
    checkSession();

    supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) { window.location.replace("login.html"); return; }
      // Fix: sin esto, el token guardado nunca se actualizaba cuando
      // Supabase lo renovaba por dentro (cada ~1 hora) — después de un
      // rato, todas las llamadas al backend empezaban a fallar con
      // "Token inválido o expirado" aunque la sesión siguiera activa.
      window.CONTATECK_SUPABASE_TOKEN = session.access_token;
    });

    logoutEls.forEach((el) =>
      el.addEventListener("click", async () => {
        // OT-0038: el respaldo del catálogo de cuentas no debe quedarse en un equipo compartido.
        try { window.CTStorage && window.CTStorage.limpiarCaches(); } catch (e) { /* solo es un respaldo */ }
        try { await supabase.auth.signOut(); } catch (e) {}
        window.location.replace("login.html");
      })
    );
  } catch (e) {
    // Si Supabase no carga, no dejamos el panel oculto.
    if (app2) app2.style.visibility = "";
    logoutEls.forEach((el) => el.addEventListener("click", () => { window.location.href = "login.html"; }));
  }
}
