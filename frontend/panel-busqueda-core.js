/* ============================================================
   CONTATECK · panel-busqueda-core.js  (OT-0068)

   Lógica PURA del buscador global y de las notificaciones de la barra superior. Sin DOM ni red, para
   poder probarla en Node (backend/test-busqueda-notificaciones.js).

   Buscador: solo busca en lo que el panel YA tiene cargado y que la persona ya puede ver (facturas,
   pólizas, clientes, empleados). No pide nada nuevo al servidor y no busca en datos sensibles de las
   personas (RFC, CURP, NSS, sueldo): del empleado solo nombre, puesto y departamento.

   Notificaciones: las MISMAS alertas reales y accionables que ya calcula el Dashboard, más las
   invitaciones a otras empresas dirigidas a mi correo. Nada inventado.

   API (window.CTBusqueda, o module.exports en Node):
     normalizar(texto)
     buscar(fuentes, consulta, { limite })  -> [{ clave, titulo, items:[{ titulo, detalle, destino }] }]
     notificaciones({ alertas, invitaciones }) -> [{ id, tipo, titulo, texto, destino }]
   ============================================================ */
(function (raiz) {
  "use strict";

  function normalizar(s) {
    return String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  }
  function tokens(q) { return normalizar(q).split(" ").filter(Boolean); }

  // 0 = el texto empieza con la consulta · 1 = una palabra empieza con ella · 2 = solo la contiene.
  function rango(textoNorm, consultaNorm) {
    if (textoNorm.startsWith(consultaNorm)) return 0;
    if (textoNorm.indexOf(" " + consultaNorm) !== -1) return 1;
    return 2;
  }

  function money(n) {
    const v = Number(n);
    return Number.isFinite(v) ? "$" + v.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
  }
  function fechaCorta(f) { return f ? String(f).slice(0, 10) : ""; }

  // Cada definición: cómo se arma el "pajar" (texto donde se busca) y cómo se muestra/lleva el resultado.
  const GRUPOS = [
    {
      clave: "facturas", titulo: "Facturas", fuente: "cfdis",
      pajar: (r) => [r.serie, r.folio, r.uuid_sat, r.receptor_nombre, r.receptor_rfc].join(" "),
      item: (r) => ({
        titulo: [r.serie && r.folio && String(r.folio).startsWith(r.serie) ? "" : r.serie, r.folio].filter(Boolean).join("") + " · " + (r.receptor_nombre || r.receptor_rfc || "—"),
        detalle: [money(r.total), fechaCorta(r.fecha || r.created_at), r.estatus === "cancelado" ? "cancelada" : (r.tipo === "E" ? "nota de crédito" : r.tipo === "P" ? "complemento de pago" : "vigente")].filter(Boolean).join(" · "),
        destino: { vista: "facturacion", filtro: { clave: "cfdis", texto: String(r.folio || r.receptor_nombre || "") } },
      }),
    },
    {
      clave: "polizas", titulo: "Pólizas", fuente: "polizas",
      pajar: (r) => [r.folio, r.concepto, r.tipo].join(" "),
      item: (r) => ({
        titulo: (r.folio || "—") + " · " + (r.concepto || ""),
        detalle: [r.tipo, fechaCorta(r.fecha), money(r.monto), r.estado && r.estado !== "ok" ? r.estado : ""].filter(Boolean).join(" · "),
        destino: { vista: "contabilidad", tab: "polizas", polizaPgId: r.id || null, filtro: { clave: "polizas", texto: String(r.folio || "") } },
      }),
    },
    {
      clave: "clientes", titulo: "Clientes", fuente: "clientes",
      pajar: (r) => [r.nombre, r.rfc].join(" "),
      item: (r) => ({
        titulo: r.nombre || r.rfc || "—", detalle: r.rfc || "",
        destino: { vista: "facturacion", filtro: { clave: "cfdis", texto: String(r.nombre || r.rfc || "") } },
      }),
    },
    {
      // Solo datos de trabajo: nunca RFC, CURP, NSS, cuenta ni sueldo.
      clave: "empleados", titulo: "Empleados", fuente: "empleados",
      pajar: (r) => [r.nombre, r.puesto, r.departamento].join(" "),
      item: (r) => ({
        titulo: r.nombre || "—", detalle: [r.puesto, r.departamento].filter(Boolean).join(" · "),
        destino: { vista: "nomina", filtro: { clave: "empleados", texto: String(r.nombre || "") } },
      }),
    },
  ];

  function buscar(fuentes, consulta, opciones) {
    const q = normalizar(consulta);
    if (q.length < 2) return [];
    const toks = tokens(consulta);
    const limite = (opciones && opciones.limite) || 6;
    const f = fuentes || {};
    const salida = [];
    GRUPOS.forEach((g) => {
      const filas = Array.isArray(f[g.fuente]) ? f[g.fuente] : [];
      const coinciden = [];
      filas.forEach((r, orden) => {
        if (!r || typeof r !== "object") return;
        const pajar = normalizar(g.pajar(r));
        if (!toks.every((t) => pajar.indexOf(t) !== -1)) return;
        coinciden.push({ r, orden, rango: rango(pajar, q) });
      });
      if (!coinciden.length) return;
      coinciden.sort((a, b) => a.rango - b.rango || a.orden - b.orden);
      salida.push({ clave: g.clave, titulo: g.titulo, total: coinciden.length, items: coinciden.slice(0, limite).map((c) => g.item(c.r)) });
    });
    return salida;
  }

  // Alertas del Dashboard (tipo: danger | warn | info, con accion.vista) + invitaciones a otras empresas.
  const TIPOS = { danger: 1, warn: 1, info: 1 };
  function notificaciones(datos) {
    const d = datos || {};
    const lista = [];
    (Array.isArray(d.alertas) ? d.alertas : []).forEach((a, i) => {
      if (!a || !a.titulo) return;
      lista.push({
        id: "alerta-" + i, tipo: TIPOS[a.tipo] ? a.tipo : "info", titulo: String(a.titulo), texto: String(a.texto || ""),
        destino: a.accion && a.accion.vista ? { vista: String(a.accion.vista) } : null,
      });
    });
    (Array.isArray(d.invitaciones) ? d.invitaciones : []).forEach((inv, i) => {
      if (!inv) return;
      lista.push({
        id: "invitacion-" + (inv.id || i), tipo: "info",
        titulo: "Te invitaron a " + (inv.empresa || "otra empresa"),
        texto: "Rol: " + (inv.rol || "—") + ". Acéptala desde el selector de empresa (arriba).",
        destino: { selectorEmpresa: true },
      });
    });
    // Lo más urgente primero (rojo, ámbar, informativo); dentro de cada tipo se respeta el orden original.
    const peso = { danger: 0, warn: 1, info: 2 };
    return lista.map((n, i) => ({ n, i })).sort((a, b) => peso[a.n.tipo] - peso[b.n.tipo] || a.i - b.i).map((x) => x.n);
  }

  const api = { normalizar, buscar, notificaciones };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.CTBusqueda = api;
})(typeof window !== "undefined" ? window : this);
