/* ============================================================
   CONTATECK · panel-busqueda.js  (OT-0068)

   Los dos botones de la barra superior que antes no hacían nada:
   · 🔍 Buscar (o Ctrl+K / ⌘K): busca en lo que el panel ya tiene cargado (facturas, pólizas, clientes y
     empleados) y lleva al módulo, filtrado, o abre directamente la póliza.
   · 🔔 Notificaciones: las alertas reales del Dashboard (con clic a su módulo) y las invitaciones a otras
     empresas dirigidas a tu correo. El punto rojo solo aparece si hay algo pendiente.
   La lógica de búsqueda y de armado de avisos vive en panel-busqueda-core.js (probada en Node).
   ============================================================ */
(function () {
  "use strict";

  var core = window.CTBusqueda;
  var btnBuscar = document.querySelector("[data-busqueda-global]");
  var btnCampana = document.querySelector("[data-notificaciones]");
  if (!core || (!btnBuscar && !btnCampana)) return;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function backend() { return (window.APP_CONFIG && window.APP_CONFIG.BACKEND_URL) || ""; }
  function esperar(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* ---------- estilos ---------- */
  var css = document.createElement("style");
  css.textContent = [
    ".pb-scrim{position:fixed;inset:0;z-index:140;display:none;background:rgba(2,6,15,.55);backdrop-filter:blur(3px)}",
    ".pb-scrim.is-open{display:block}",
    ".pb-caja{position:fixed;z-index:141;left:50%;top:12vh;transform:translateX(-50%);width:min(640px,94vw);max-height:70vh;display:none;flex-direction:column;",
    "  background:var(--ink-800,#0d1322);border:1px solid var(--line,#1a2540);border-radius:16px;box-shadow:0 30px 80px -20px rgba(0,0,0,.7);overflow:hidden}",
    ".pb-caja.is-open{display:flex}",
    ".pb-campo{display:flex;align-items:center;gap:.6rem;padding:.9rem 1.1rem;border-bottom:1px solid var(--line,#1a2540)}",
    ".pb-campo svg{width:18px;height:18px;flex:none;color:var(--muted,#8a96b0)}",
    ".pb-campo input{flex:1;background:transparent;border:0;outline:0;color:var(--text,#e2e8f2);font-size:1rem;font-family:inherit}",
    ".pb-campo kbd{font-size:.7rem;color:var(--faint,#5b6680);border:1px solid var(--line,#1a2540);border-radius:6px;padding:.1rem .4rem}",
    ".pb-lista{overflow:auto;padding:.4rem}",
    ".pb-grupo{padding:.55rem .7rem .2rem;font-size:.7rem;text-transform:uppercase;letter-spacing:.06em;color:var(--faint,#5b6680)}",
    ".pb-item{display:flex;flex-direction:column;gap:.1rem;padding:.55rem .7rem;border-radius:10px;cursor:pointer}",
    ".pb-item b{font-weight:600;color:var(--text,#e2e8f2);font-size:.9rem}",
    ".pb-item span{color:var(--muted,#8a96b0);font-size:.78rem}",
    ".pb-item.is-sel,.pb-item:hover{background:var(--brand-soft,rgba(110,139,255,.12))}",
    ".pb-vacio{padding:1.2rem 1rem;text-align:center;color:var(--faint,#5b6680);font-size:.88rem}",
    ".pb-notif{position:fixed;z-index:141;top:62px;right:12px;width:min(380px,94vw);max-height:70vh;overflow:auto;display:none;",
    "  background:var(--ink-800,#0d1322);border:1px solid var(--line,#1a2540);border-radius:14px;box-shadow:0 24px 60px -18px rgba(0,0,0,.65)}",
    ".pb-notif.is-open{display:block}",
    ".pb-notif h4{margin:0;padding:.8rem 1rem;font-size:.85rem;border-bottom:1px solid var(--line,#1a2540);display:flex;justify-content:space-between}",
    ".pb-notif h4 small{color:var(--faint,#5b6680);font-weight:400}",
    ".pb-n{display:flex;gap:.7rem;padding:.75rem 1rem;border-bottom:1px solid var(--line,#1a2540)}",
    ".pb-n:last-child{border-bottom:0}",
    ".pb-n[data-ir]{cursor:pointer}.pb-n[data-ir]:hover{background:var(--brand-soft,rgba(110,139,255,.12))}",
    ".pb-n i{flex:none;width:8px;height:8px;border-radius:50%;margin-top:.4rem;background:var(--brand,#6E8BFF)}",
    ".pb-n.pb-danger i{background:#FB7185}.pb-n.pb-warn i{background:#FBBF24}",
    ".pb-n b{display:block;font-size:.86rem;color:var(--text,#e2e8f2)}",
    ".pb-n p{margin:.15rem 0 0;font-size:.78rem;line-height:1.4;color:var(--muted,#8a96b0)}",
    ".icon-btn[data-notificaciones] .dot{display:none}.icon-btn[data-notificaciones].tiene-avisos .dot{display:block}",
  ].join("\n");
  document.head.appendChild(css);

  /* ---------- ir a un lugar del panel ---------- */
  function clic(selector) { var e = document.querySelector(selector); if (e) e.click(); return !!e; }
  // OT-0070: el buscador y la campana solo usan lo que el rol de la persona puede ver en el panel.
  function puede(vista) { return !window.CTAcceso || window.CTAcceso.puedeVer(document.documentElement.getAttribute("data-rol"), vista); }
  async function ir(d) {
    if (!d) return;
    if (d.vista && !puede(d.vista)) return;
    if (d.selectorEmpresa) { clic(".empresa-sel .select__btn"); return; }
    if (d.vista) clic('.nav-item[data-view="' + d.vista + '"]');
    if (d.tab) { await esperar(80); clic('[data-tabs="cont"] .tab[data-tab="' + d.tab + '"]'); }
    // Una póliza se abre directo (detalle), esperando a que su copia local esté cargada; si no, se filtra la lista.
    if (d.polizaPgId && window.CTCont && window.CTCont.getPolizas && window.CTCont.verPoliza) {
      for (var i = 0; i < 16; i++) {
        var p = window.CTCont.getPolizas().filter(function (x) { return x.pgId === d.polizaPgId; })[0];
        if (p) { window.CTCont.verPoliza(p.id); return; }
        await esperar(250);
      }
    }
    if (d.filtro) {
      await esperar(160);
      var inp = document.querySelector('[data-search="' + d.filtro.clave + '"]');
      if (inp) { inp.value = d.filtro.texto; inp.dispatchEvent(new Event("input", { bubbles: true })); }
    }
  }

  /* ---------- buscador ---------- */
  var scrim = document.createElement("div"); scrim.className = "pb-scrim";
  var caja = document.createElement("div"); caja.className = "pb-caja"; caja.setAttribute("role", "dialog"); caja.setAttribute("aria-label", "Buscar en el panel");
  caja.innerHTML = '<div class="pb-campo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/></svg>' +
    '<input type="text" data-pb-input placeholder="Buscar factura, póliza, cliente o empleado…" autocomplete="off" spellcheck="false"><kbd>Esc</kbd></div>' +
    '<div class="pb-lista" data-pb-lista aria-live="polite"></div>';
  document.body.appendChild(scrim); document.body.appendChild(caja);
  var input = caja.querySelector("[data-pb-input]"), lista = caja.querySelector("[data-pb-lista]");
  var planos = [], sel = 0, timer = null;

  function fuentes() {
    return {
      cfdis: puede("facturacion") ? (window.CONTATECK_CFDIS_PG || []) : [], polizas: puede("contabilidad") ? (window.CONTATECK_POLIZAS_PG || []) : [],
      clientes: puede("facturacion") ? (window.CONTATECK_CLIENTES_PG || []) : [], empleados: puede("nomina") ? (window.CONTATECK_EMPLEADOS_REAL_PG || []) : [],
    };
  }
  function pintar(grupos, consulta) {
    planos = [];
    if (consulta.trim().length < 2) { lista.innerHTML = '<div class="pb-vacio">Escribe al menos 2 letras. Busca por folio, UUID, cliente, concepto de póliza o nombre de empleado.</div>'; return; }
    if (!grupos.length) { lista.innerHTML = '<div class="pb-vacio">Sin resultados para «' + esc(consulta) + '».</div>'; return; }
    var html = "";
    grupos.forEach(function (g) {
      html += '<div class="pb-grupo">' + esc(g.titulo) + (g.total > g.items.length ? " · " + g.items.length + " de " + g.total : "") + "</div>";
      g.items.forEach(function (it) {
        html += '<div class="pb-item" data-pb-i="' + planos.length + '"><b>' + esc(it.titulo) + "</b><span>" + esc(it.detalle) + "</span></div>";
        planos.push(it);
      });
    });
    lista.innerHTML = html; sel = 0; marcar();
  }
  function marcar() {
    lista.querySelectorAll(".pb-item").forEach(function (e) { e.classList.toggle("is-sel", Number(e.getAttribute("data-pb-i")) === sel); });
    var s = lista.querySelector(".pb-item.is-sel"); if (s && s.scrollIntoView) s.scrollIntoView({ block: "nearest" });
  }
  function buscarAhora() { pintar(core.buscar(fuentes(), input.value, { limite: 6 }), input.value); }
  function abrirBusqueda() {
    cerrarCampana(); scrim.classList.add("is-open"); caja.classList.add("is-open");
    input.value = ""; buscarAhora(); input.focus();
  }
  function cerrarBusqueda() { scrim.classList.remove("is-open"); caja.classList.remove("is-open"); }
  function elegir(i) { var it = planos[i]; if (!it) return; cerrarBusqueda(); ir(it.destino); }

  input.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(buscarAhora, 80); });
  input.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") { e.preventDefault(); if (planos.length) { sel = (sel + 1) % planos.length; marcar(); } }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (planos.length) { sel = (sel - 1 + planos.length) % planos.length; marcar(); } }
    else if (e.key === "Enter") { e.preventDefault(); elegir(sel); }
  });
  lista.addEventListener("click", function (e) { var it = e.target.closest("[data-pb-i]"); if (it) elegir(Number(it.getAttribute("data-pb-i"))); });
  scrim.addEventListener("click", cerrarBusqueda);
  if (btnBuscar) btnBuscar.addEventListener("click", function (e) { e.stopPropagation(); abrirBusqueda(); });

  /* ---------- notificaciones ---------- */
  var alertas = [], invitaciones = [];
  var panel = document.createElement("div"); panel.className = "pb-notif"; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Notificaciones");
  document.body.appendChild(panel);
  var avisos = [];

  function pintarAvisos() {
    avisos = core.notificaciones({ alertas: alertas, invitaciones: invitaciones });
    if (btnCampana) {
      btnCampana.classList.toggle("tiene-avisos", avisos.length > 0);
      btnCampana.setAttribute("aria-label", avisos.length ? "Notificaciones (" + avisos.length + ")" : "Notificaciones");
      btnCampana.title = avisos.length ? avisos.length + (avisos.length === 1 ? " aviso pendiente" : " avisos pendientes") : "Sin avisos pendientes";
    }
    panel.innerHTML = '<h4>Notificaciones<small>' + (avisos.length ? avisos.length + (avisos.length === 1 ? " pendiente" : " pendientes") : "") + "</small></h4>" +
      (avisos.length ? avisos.map(function (n, i) {
        return '<div class="pb-n pb-' + esc(n.tipo) + '"' + (n.destino ? ' data-ir="' + i + '"' : "") + "><i></i><div><b>" + esc(n.titulo) + "</b><p>" + esc(n.texto) + "</p></div></div>";
      }).join("") : '<div class="pb-vacio">Sin notificaciones: todo en orden.</div>');
  }
  function cerrarCampana() { panel.classList.remove("is-open"); }
  function abrirCampana() { cerrarBusqueda(); pintarAvisos(); panel.classList.add("is-open"); }
  if (btnCampana) btnCampana.addEventListener("click", function (e) { e.stopPropagation(); panel.classList.contains("is-open") ? cerrarCampana() : abrirCampana(); });
  panel.addEventListener("click", function (e) {
    e.stopPropagation();
    var el = e.target.closest("[data-ir]"); if (!el) return;
    var n = avisos[Number(el.getAttribute("data-ir"))]; cerrarCampana(); if (n) ir(n.destino);
  });
  document.addEventListener("click", function (e) { if (!panel.contains(e.target)) cerrarCampana(); });

  // Alertas: las que ya calculó el Dashboard (evento de app.js; o las que ya estén guardadas si llegamos tarde).
  document.addEventListener("contateck:dashboard-datos", function (e) { alertas = puede("dashboard") ? ((e.detail && e.detail.alertas) || []) : []; pintarAvisos(); });
  if (puede("dashboard") && window.__ctDashDatos && window.__ctDashDatos.alertas) alertas = window.__ctDashDatos.alertas;
  // Invitaciones a otras empresas (solo si el backend ya es multiempresa).
  (async function () {
    for (var i = 0; i < 100 && !(window.CONTATECK_SUPABASE_TOKEN && window.CONTATECK_EMPRESA_PG); i++) await esperar(150);
    if (!window.CONTATECK_MULTIEMPRESA || !backend()) return;
    try {
      var r = await fetch(backend() + "/api/empresas", { headers: { Authorization: "Bearer " + window.CONTATECK_SUPABASE_TOKEN } });
      var d = await r.json();
      if (d && d.ok) { invitaciones = d.invitaciones || []; pintarAvisos(); }
    } catch (e) { /* sin conexión: la campana muestra solo las alertas */ }
  })();
  pintarAvisos();

  /* ---------- teclado ---------- */
  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === "k") { e.preventDefault(); caja.classList.contains("is-open") ? cerrarBusqueda() : abrirBusqueda(); }
    else if (e.key === "Escape") { cerrarBusqueda(); cerrarCampana(); }
  });
})();
