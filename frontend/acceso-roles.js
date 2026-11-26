/* ============================================================
   CONTATECK · acceso-roles.js  (OT-0070)

   Qué secciones del panel ve cada rol. Hasta la OT-0069 solo el auditor tenía la pantalla ajustada a su rol;
   rh y vendedor veían todo el menú (aunque el servidor les rechazara las acciones). Esto sigue la matriz de roles
   (docs/informe/diagramas/04-Matriz-de-Roles-y-Permisos.md):
     · rh       → Nómina y Equipo.
     · vendedor → Ventas y pagos y Facturación (la facturación en solo lectura: sus botones de escritura se ocultan en styles.css).
     · el resto de los roles (director, admin, contador, auditor) conserva todas las secciones.

   IMPORTANTE: esto solo ordena la pantalla. La seguridad real sigue estando en el servidor y en las reglas de la base (RLS);
   un rol que hablara directo con la API seguiría topándose con ellas.

   API (window.CTAcceso, o module.exports en Node):
     vistasDe(rol)           -> arreglo de vistas permitidas, o null si el rol ve todas
     puedeVer(rol, vista)    -> boolean
     inicioDe(rol)           -> vista con la que arranca ese rol (null = la de siempre)
     aplicar(rol, doc)       -> oculta en el DOM lo que ese rol no ve y lo lleva a su vista de inicio
   ============================================================ */
(function (raiz) {
  "use strict";

  const ACCESO = {
    rh: { vistas: ["nomina", "invitaciones"], inicio: "nomina" },
    vendedor: { vistas: ["ventas", "facturacion"], inicio: "ventas" },
  };

  function vistasDe(rol) { return ACCESO[rol] ? ACCESO[rol].vistas.slice() : null; }
  function puedeVer(rol, vista) { return !ACCESO[rol] || ACCESO[rol].vistas.indexOf(vista) !== -1; }
  function inicioDe(rol) { return ACCESO[rol] ? ACCESO[rol].inicio : null; }

  function aplicar(rol, doc) {
    if (!ACCESO[rol] || !doc) return { ocultas: [], inicio: null };
    const ocultas = [];
    const items = Array.prototype.slice.call(doc.querySelectorAll(".nav-item[data-view]"));
    items.forEach(function (it) {
      const v = it.getAttribute("data-view");
      if (!puedeVer(rol, v)) { it.classList.add("por-rol-oculto"); if (ocultas.indexOf(v) === -1) ocultas.push(v); }
    });
    // Una sección del menú (grupo) sin ninguna opción visible tampoco muestra su rótulo.
    Array.prototype.slice.call(doc.querySelectorAll(".side__group")).forEach(function (g) {
      const hijos = Array.prototype.slice.call(g.querySelectorAll(".nav-item[data-view]"));
      if (hijos.length && hijos.every(function (h) { return h.classList.contains("por-rol-oculto"); })) g.classList.add("por-rol-oculto");
    });
    Array.prototype.slice.call(doc.querySelectorAll(".view[data-view]")).forEach(function (s) {
      if (!puedeVer(rol, s.getAttribute("data-view"))) { s.classList.remove("is-active"); s.classList.add("por-rol-oculto"); }
    });
    // Si la vista activa ya no es suya, se pasa a la de inicio de su rol (sin depender de que app.js ya haya cargado).
    const inicio = ACCESO[rol].inicio;
    const activa = doc.querySelector(".view.is-active");
    if (!activa || !puedeVer(rol, activa.getAttribute("data-view"))) {
      Array.prototype.slice.call(doc.querySelectorAll(".view[data-view]")).forEach(function (s) { s.classList.toggle("is-active", s.getAttribute("data-view") === inicio); });
      let titulo = null;
      items.forEach(function (it) {
        const es = it.getAttribute("data-view") === inicio;
        it.classList.toggle("is-active", es);
        if (es) titulo = it.getAttribute("data-title");
      });
      const crumb = doc.querySelector("[data-crumb-title]");
      if (crumb && titulo) crumb.textContent = titulo;
    }
    return { ocultas: ocultas, inicio: inicio };
  }

  const API = { vistasDe: vistasDe, puedeVer: puedeVer, inicioDe: inicioDe, aplicar: aplicar };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else raiz.CTAcceso = API;
})(typeof window !== "undefined" ? window : globalThis);
