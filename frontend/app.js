/* ============================================================
   CONTATECK · app.js
   Interacciones compartidas + render de charts (SVG puro).
   Cada bloque se auto-protege: solo corre si el elemento existe,
   así el mismo archivo sirve para landing, login y dashboard.
   ============================================================ */
(function () {
  "use strict";

  /* ---------- Tema día/noche ---------- */
  const THEME_KEY = "contateck-theme";
  function storedTheme() { try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; } }
  function saveTheme(v) { try { localStorage.setItem(THEME_KEY, v); } catch (e) {} }
  function applyTheme(v) { document.documentElement.setAttribute("data-theme", v); }
  applyTheme(storedTheme() || "dark");
  document.addEventListener("click", function (e) {
    const t = e.target.closest("[data-theme-toggle]");
    if (!t) return;
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next); saveTheme(next);
  });

  /* ---------- Inyección de nombre de marca ---------- */
  if (window.APP) {
    document.querySelectorAll("[data-app-name]").forEach(function (el) { el.textContent = APP.name; });
    document.querySelectorAll("[data-app-tagline]").forEach(function (el) { el.textContent = APP.tagline; });
    if (document.title.indexOf("{{APP}}") > -1) document.title = document.title.replace("{{APP}}", APP.name);
  }

  /* ---------- Helpers de formato (es-MX) ---------- */
  function money(n) { return Number(n).toLocaleString("es-MX"); }
  function moneyShort(n) {
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return "$" + (n / 1e3).toFixed(0) + "k";
    return "$" + money(n);
  }

  /* ---------- Mostrar/ocultar contraseña ---------- */
  document.querySelectorAll(".input-eye").forEach(function (eye) {
    eye.addEventListener("click", function () {
      const inp = eye.parentElement.querySelector("input");
      const show = inp.type === "password";
      inp.type = show ? "text" : "password";
      eye.classList.toggle("is-on", show);
    });
  });

  /* ---------- Login ----------
     Lo maneja auth-login.js (módulo): Firebase Auth real con
     degradación a modo demo. app.js ya no toca el login. */

  /* ---------- Selects custom (empresa / periodo) ---------- */
  document.querySelectorAll(".select").forEach(function (sel) {
    const btn = sel.querySelector(".select__btn");
    const label = sel.querySelector("[data-sel-label]");
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      document.querySelectorAll(".select.is-open").forEach(function (s) { if (s !== sel) s.classList.remove("is-open"); });
      sel.classList.toggle("is-open");
    });
    sel.querySelectorAll(".select__opt").forEach(function (opt) {
      opt.addEventListener("click", function () {
        sel.querySelectorAll(".select__opt").forEach(function (o) {
          o.classList.remove("is-sel"); const c = o.querySelector(".ck"); if (c) c.remove();
        });
        opt.classList.add("is-sel");
        if (!opt.querySelector(".ck")) {
          opt.insertAdjacentHTML("beforeend", '<span class="ck">' + ICON.check + "</span>");
        }
        if (label) label.textContent = opt.getAttribute("data-val") || opt.textContent.trim();
        sel.classList.remove("is-open");
      });
    });
  });
  document.addEventListener("click", function () {
    document.querySelectorAll(".select.is-open").forEach(function (s) { s.classList.remove("is-open"); });
  });

  /* ---------- Sidebar móvil ---------- */
  const side = document.querySelector(".side");
  const scrim = document.querySelector(".scrim");
  document.querySelectorAll("[data-menu]").forEach(function (b) {
    b.addEventListener("click", function () { side.classList.toggle("is-open"); if (scrim) scrim.classList.toggle("is-open"); });
  });
  if (scrim) scrim.addEventListener("click", function () { side.classList.remove("is-open"); scrim.classList.remove("is-open"); });

  /* ---------- Navegación entre vistas del dashboard ---------- */
  const crumbTitle = document.querySelector("[data-crumb-title]");
  document.querySelectorAll(".nav-item[data-view]").forEach(function (item) {
    item.addEventListener("click", function () {
      const id = item.getAttribute("data-view");
      document.querySelectorAll(".nav-item[data-view]").forEach(function (n) { n.classList.remove("is-active"); });
      item.classList.add("is-active");
      document.querySelectorAll(".view").forEach(function (v) { v.classList.toggle("is-active", v.getAttribute("data-view") === id); });
      if (crumbTitle) crumbTitle.textContent = item.getAttribute("data-title") || item.textContent.trim();
      if (side) side.classList.remove("is-open"); if (scrim) scrim.classList.remove("is-open");
      window.scrollTo({ top: 0, behavior: "smooth" });
      // OT-0013A: al volver a Dashboard, trae datos frescos (sin caché) en
      // vez de quedarse con lo que se cargó la última vez que se abrió la página.
      if (id === "dashboard" && window.dashboardService && typeof window.renderDashboardReal === "function") {
        window.dashboardService.invalidarCache();
        window.renderDashboardReal();
      }
    });
  });

  /* ---------- Tabs dentro de módulos ---------- */
  document.querySelectorAll("[data-tabs]").forEach(function (group) {
    const view = group.closest(".view") || document;
    group.querySelectorAll(".tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        group.querySelectorAll(".tab").forEach(function (t) { t.classList.remove("is-active"); });
        tab.classList.add("is-active");
        const pane = tab.getAttribute("data-tab");
        view.querySelectorAll(".tabpane").forEach(function (p) {
          p.classList.toggle("is-active", p.getAttribute("data-pane") === pane);
        });
      });
    });
  });

  /* ============================================================
     ICONOS (stroke = currentColor, finos)
     ============================================================ */
  window.ICON = {
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 14 12 8 18 14"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 10 12 16 18 10"/></svg>',
    scale: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M5 7h14M5 7l-2.5 6h5L5 7zm14 0l-2.5 6h5L19 7z"/></svg>',
  };

  const ICO_KPI = {
    trend: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 13 15 21 7"/><polyline points="21 7 16 7 21 7 21 12"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 7 9 13 13 9 21 17"/><polyline points="21 17 16 17 21 17 21 12"/></svg>',
    wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18M16 14.5h.01"/></svg>',
    flow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h11a4 4 0 0 1 0 8H7"/><polyline points="7 11 4 7 7 3"/></svg>',
  };

  /* ============================================================
     RENDER DASHBOARD
     ============================================================ */
  if (document.querySelector("[data-dashboard]")) {

    /* Selector de empresas: DESACTIVADO a propósito (OT Equipo).
       Antes mostraba una lista de empresas de ejemplo (data.js) sin
       ninguna conexión a la sesión real — causaba confusión constante
       (parecía mostrar la empresa equivocada). El nombre real de la
       empresa lo pone auth-guard.js con datos de Postgres; aquí ya no
       se pinta nada por encima ni se ofrece "cambiar" a una empresa
       de mentira. Cuando exista multiempresa real por usuario, este
       selector se reconstruye desde cero con datos reales. */
    const empMenu = document.querySelector("[data-empresas]");
    if (empMenu) empMenu.innerHTML = '<div style="padding:.8rem 1rem;color:var(--faint);font-size:.82rem">Cargando tus empresas…</div>'; // OT-0056: lo llena empresas-selector.js

    /* ============================================================
       OT-0013A: Dashboard real, vía dashboardService (sin globals).
       ============================================================ */
    function proximamente(motivo) {
      return '<div class="dash-proximamente" style="padding:1rem;text-align:center;color:var(--faint);font-size:.9rem">' +
        '<b style="display:block;color:var(--text);margin-bottom:.2rem">Sin información</b>' + motivo + '</div>';
    }
    /*CSV-INICIO*/
    // Exporta el resumen del Dashboard como CSV (Excel lo abre con acentos por el BOM). Los textos que escribió un usuario
    // se neutralizan (=, +, -, @ al inicio) para que Excel no los tome como fórmula; los números van tal cual.
    function dashboardACsv(d, empresa, fecha) {
      const txt = function (v) {
        let s = String(v == null ? "" : v).replace(/\r?\n/g, " ");
        if (/^[=+\-@\t]/.test(s)) s = "'" + s;
        return '"' + s.replace(/"/g, '""') + '"';
      };
      const n = function (v) { return String(Math.round((Number(v) || 0) * 100) / 100); };
      const f = function (a, b, c) { return [txt(a), b === undefined ? "" : (typeof b === "number" ? n(b) : txt(b)), c === undefined ? "" : txt(c)].join(","); };
      const fac = d.facturacion || {}, op = d.operacion || {}, nom = d.nomina || {}, bal = d.balanceGeneral || {};
      const filas = [
        f("CONTATECK · Resumen del Dashboard"), f("Empresa", empresa), f("Fecha", fecha), "",
        f("Facturación del mes"), f("Facturado", Number(fac.montoMes) || 0), f("CFDI timbrados", Number(fac.timbradasMes) || 0), f("CFDI cancelados", Number(fac.canceladasMes) || 0), "",
        f("Movimientos de pólizas del mes"), f("Ingresos", Number(op.ingresosMes) || 0), f("Egresos", Number(op.egresosMes) || 0), f("Ingresos menos egresos (no es la utilidad contable)", Number(op.utilidadMes) || 0), "",
        f("Nómina"), f("Empleados activos", Number(nom.empleadosActivos) || 0), f("Nómina mensual estimada", Number(nom.nominaMensualEstimada) || 0), "",
        f("Balance General"), f("Activo", Number(bal.totalActivo) || 0), f("Pasivo", Number(bal.totalPasivo) || 0), f("Capital", Number(bal.totalCapital) || 0), f("Resultado del periodo", Number(bal.resultadoDelPeriodo) || 0), f("Cuadra", bal.cuadra ? "Sí" : "No"), "",
        f("Gastos por cuenta"), f("Cuenta", "Monto"),
      ].concat((d.composicionGastos || []).map(function (g) { return f(g.cuenta, Number(g.monto) || 0); }))
        .concat(["", f("Alertas")]).concat((d.alertas || []).length ? d.alertas.map(function (a) { return f(a.titulo, a.texto || ""); }) : [f("Sin alertas")])
        .concat(["", f("Obligaciones pendientes"), f("Obligación", "Periodo", "Vence")]).concat((d.proximasObligacionesSat || []).map(function (o) { return f(o.obligacion, o.periodo, o.fechaVencimiento); }));
      return "\uFEFF" + filas.join("\r\n") + "\r\n";
    }
    /*CSV-FIN*/
    document.addEventListener("click", function (e) {
      if (e.target.closest("[data-dash-imprimir]")) { window.print(); return; }
      if (!e.target.closest("[data-dash-exportar]")) return;
      const datos = window.__ctDashDatos;
      if (!datos || !datos.ok) { toast("Espera a que carguen los datos del Dashboard e inténtalo de nuevo.", "warn"); return; }
      const empresa = (window.CONTATECK_EMPRESA_PG && window.CONTATECK_EMPRESA_PG.nombre) || "empresa";
      const fecha = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" });
      const blob = new Blob([dashboardACsv(datos, empresa, fecha)], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "Dashboard_" + empresa.replace(/[^A-Za-z0-9]+/g, "_") + "_" + fecha + ".csv";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      toast("Se descargó el resumen del Dashboard (se abre en Excel).", "ok");
    });
    // Tarjeta "Indicadores fiscales" (OT-0061): IVA del mes e ISR estimado; todo con aviso de que es referencia.
    function pintarIndicadoresFiscales(r) {
      if (!r || !r.ok) return sinPendientes("No se pudieron calcular los indicadores fiscales.");
      if (r.restringido) return sinPendientes("Disponible para los roles de contabilidad.");
      const fila = function (a, b) { return '<div class="comp__row"><span>' + a + '</span><b>' + b + '</b></div>'; };
      let h = "";
      const iva = r.iva || {};
      if (iva.error) h += '<p style="color:var(--faint);font-size:.82rem;margin:.2rem 0">' + esc(iva.detalle || iva.error) + '</p>';
      else {
        h += fila("IVA trasladado (" + esc(iva.periodo) + ")", "$" + money(iva.trasladado)) + fila("IVA acreditable", "$" + money(iva.acreditable)) +
          fila(iva.resultado > 0 ? "IVA a cargo" : (iva.resultado < 0 ? "IVA a favor" : "Diferencia del mes"), "$" + money(Math.abs(iva.resultado)));
      }
      const isr = r.isr || {};
      if (isr.disponible) h += fila("ISR estimado " + esc(isr.anio), "$" + money(isr.estimado)) + '<p style="color:var(--faint);font-size:.76rem;margin:.4rem 0 0">30% de la utilidad contable acumulada ($' + money(isr.base) + '). Es un estimado: el pago provisional real usa el coeficiente de utilidad.</p>';
      else h += '<p style="color:var(--faint);font-size:.78rem;margin:.5rem 0 0"><b>ISR:</b> ' + esc(isr.motivo || "no disponible") + '</p>';
      return h + '<p style="color:var(--faint);font-size:.72rem;margin:.4rem 0 0">' + esc(r.nota || "") + '</p>';
    }
    // Estado vacío SIN el rótulo "Próximamente": para cuando no hay nada que mostrar pero la función sí existe.
    function sinPendientes(texto) {
      return '<div style="padding:1rem;text-align:center;color:var(--faint);font-size:.9rem">' + texto + '</div>';
    }
    // Mientras llegan los datos del backend: antes estos bloques decían
    // "Próximamente" por un instante, como si no existieran.
    function cargando(que) {
      return '<div class="dash-cargando" style="padding:1rem;text-align:center;color:var(--faint);font-size:.9rem">Cargando ' + que + '…</div>';
    }
    function kpiCard(label, valor, ico, spark, deltaTxt, deltaUp) {
      return '<div class="kpi rise">' +
        '<div class="kpi__top"><span class="kpi__label">' + label + '</span>' +
        '<span class="kpi__ico">' + (ICO_KPI[ico] || "") + '</span></div>' +
        '<div class="kpi__val"><span class="cur">$</span>' + money(valor) + '</div>' +
        (deltaTxt ? '<div class="kpi__foot"><span class="delta ' + (deltaUp ? "delta--up" : "delta--down") + '">' +
          (deltaUp ? ICON.up : ICON.down) + deltaTxt + '%</span><span>vs mes anterior</span></div>' :
          '<div class="kpi__foot"><span>Mes en curso</span></div>') +
        (spark ? '<div class="spark">' + sparkline(spark, deltaUp === false ? "var(--down)" : "var(--up)") + '</div>' : '') +
        '</div>';
    }
    function lineChartReal(serie, gastosSerie) {
      const W = 720, H = 280, padL = 46, padR = 14, padT = 18, padB = 34;
      const innerW = W - padL - padR, innerH = H - padT - padB;
      const valores = serie.map(function (s) { return s.monto; });
      const valoresGasto = (gastosSerie || []).map(function (s) { return s.monto; });
      const mx = Math.max.apply(null, valores.concat(valoresGasto).concat([1])) * 1.1, mn = 0;
      const x = function (i) { return padL + (i / (serie.length - 1)) * innerW; };
      const y = function (v) { return padT + innerH - ((v - mn) / (mx - mn)) * innerH; };
      let grid = "", ylab = "";
      for (let s = 0; s <= 4; s++) {
        const val = (mx / 4) * s, yy = y(val);
        grid += '<line x1="' + padL + '" y1="' + yy.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + yy.toFixed(1) + '" stroke="var(--line)" stroke-width="1"/>';
        ylab += '<text x="' + (padL - 8) + '" y="' + (yy + 3).toFixed(1) + '" text-anchor="end" font-size="10" fill="var(--faint)" font-family="JetBrains Mono">' + moneyShort(val) + '</text>';
      }
      let xlab = "";
      serie.forEach(function (s, i) {
        xlab += '<text x="' + x(i).toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="10" fill="var(--faint)" font-family="JetBrains Mono">' + s.mes + '</text>';
      });
      const area = "M" + x(0).toFixed(1) + " " + (padT + innerH) + " " +
        valores.map(function (v, i) { return "L" + x(i).toFixed(1) + " " + y(v).toFixed(1); }).join(" ") +
        " L" + x(valores.length - 1).toFixed(1) + " " + (padT + innerH) + " Z";
      const line = valores.map(function (v, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1); }).join(" ");
      const lineGasto = valoresGasto.length
        ? valoresGasto.map(function (v, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1); }).join(" ")
        : "";
      return '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Ventas vs gastos real por mes">' +
        "<defs><linearGradient id=\"gv\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0%\" stop-color=\"var(--brand)\" stop-opacity=\".30\"/><stop offset=\"100%\" stop-color=\"var(--brand)\" stop-opacity=\"0\"/></linearGradient></defs>" +
        grid + ylab + xlab +
        '<path d="' + area + '" fill="url(#gv)"/>' +
        '<path d="' + line + '" fill="none" stroke="var(--brand)" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>' +
        valores.map(function (v, i) { return '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="3" fill="var(--ink-800)" stroke="var(--brand)" stroke-width="2"/>'; }).join("") +
        (lineGasto ? '<path d="' + lineGasto + '" fill="none" stroke="#F2A63A" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="0"/>' +
          valoresGasto.map(function (v, i) { return '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="3" fill="var(--ink-800)" stroke="#F2A63A" stroke-width="2"/>'; }).join("") : "") +
        "</svg>";
    }
    function barChartMes(ventas, gastos) {
      const W = 720, H = 280, padB = 34, padT = 18;
      const mx = Math.max(ventas, gastos, 1) * 1.15;
      const escala = (H - padT - padB) / mx;
      const hV = ventas * escala, hG = gastos * escala;
      const y0 = H - padB;
      return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Ventas vs gastos del mes en curso">' +
        '<rect x="220" y="' + (y0 - hV) + '" width="110" height="' + hV + '" rx="6" fill="var(--brand)"/>' +
        '<rect x="390" y="' + (y0 - hG) + '" width="110" height="' + hG + '" rx="6" fill="#F2A63A"/>' +
        '<text x="275" y="' + (y0 + 22) + '" text-anchor="middle" font-size="12" fill="var(--faint)" font-family="JetBrains Mono">Ventas</text>' +
        '<text x="445" y="' + (y0 + 22) + '" text-anchor="middle" font-size="12" fill="var(--faint)" font-family="JetBrains Mono">Gastos</text>' +
        '<text x="275" y="' + (y0 - hV - 10) + '" text-anchor="middle" font-size="13" fill="var(--text)" font-family="JetBrains Mono">$' + money(ventas) + '</text>' +
        '<text x="445" y="' + (y0 - hG - 10) + '" text-anchor="middle" font-size="13" fill="var(--text)" font-family="JetBrains Mono">$' + money(gastos) + '</text>' +
        '</svg>';
    }
    function renderChartAnio(serie, gastosSerie) {
      const chartHost = document.querySelector("[data-chart-main]");
      if (chartHost) chartHost.innerHTML = serie.length ? lineChartReal(serie, gastosSerie) : proximamente("Aún no hay facturación registrada.");
    }
    function renderChartMes(o) {
      const chartHost = document.querySelector("[data-chart-main]");
      if (chartHost) chartHost.innerHTML = barChartMes(o.ingresosMes || 0, o.egresosMes || 0);
    }
    const ALERT_ICO = {
      danger: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
      warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>',
      info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
    };
    function alertHTML(a) {
      const accion = a.accion && a.accion.vista ? ' data-alert-goto="' + a.accion.vista + '" style="cursor:pointer"' : '';
      return '<div class="alert alert--' + a.tipo + '"' + accion + '><div class="alert__ico">' + ALERT_ICO[a.tipo] + '</div>' +
        '<div class="alert__body"><b>' + esc(a.titulo) + '</b><p>' + esc(a.texto) + '</p></div></div>';
    }
    document.addEventListener("click", function (e) {
      const el = e.target.closest("[data-alert-goto]");
      if (!el) return;
      const vista = el.getAttribute("data-alert-goto");
      const navItem = document.querySelector('.nav-item[data-view="' + vista + '"]');
      if (navItem) navItem.click();
    });

    document.addEventListener("click", function (e) {
      const seg = e.target.closest(".seg button");
      if (!seg) return;
      const grupo = seg.closest(".seg");
      grupo.querySelectorAll("button").forEach(function (b) { b.classList.remove("is-active"); });
      seg.classList.add("is-active");
      const datosSeries = window.CTDashboardSeries;
      if (!datosSeries) return;
      if (seg.textContent.trim() === "Mes") renderChartMes(datosSeries.o);
      else renderChartAnio(datosSeries.serie, datosSeries.gastosSerie);
    });

    async function renderDashboardReal() {
      const kpiWrap = document.querySelector("[data-kpis]");
      const chartHost = document.querySelector("[data-chart-main]");
      const alertHost = document.querySelector("[data-alerts]");
      const infoHost = document.querySelector("[data-info-general]");
      const ledgerBar = document.querySelector("[data-ledger-bar]");
      const donutHost = document.querySelector("[data-donut]");
      const donutLegend = document.querySelector("[data-donut-legend]");
      const balHost = document.querySelector("[data-balance]");
      const fiscalHost = document.querySelector("[data-fiscal]");
      const oblHost = document.querySelector("[data-obligaciones]");
      const periodoEl = document.querySelector("[data-dash-periodo]");
      const alertasCountEl = document.querySelector("[data-alertas-count]");

      // Periodo del resumen: el mes en curso real (antes decía "junio 2026" fijo).
      if (periodoEl) periodoEl.textContent = new Date().toLocaleDateString("es-MX", { month: "long", year: "numeric" });

      // Placeholders honestos mientras carga o si algo falla — nunca datos falsos.
      if (ledgerBar) ledgerBar.innerHTML = cargando("el cuadre contable");
      if (donutHost) donutHost.innerHTML = "";
      if (donutLegend) donutLegend.innerHTML = cargando("la composición de gastos");
      if (balHost) balHost.innerHTML = cargando("el balance general");
      // OT-0061: IVA del mes e ISR estimado (de referencia); se piden aparte para no retrasar el resto del Dashboard.
      if (fiscalHost) fiscalHost.innerHTML = cargando("los indicadores fiscales");
      if (oblHost) oblHost.innerHTML = '<tr><td colspan="5">' + cargando("las obligaciones SAT") + '</td></tr>';

      const datos = await window.dashboardService.obtenerDatos();
      window.__ctDashDatos = datos; // para Exportar
      if (fiscalHost) {
        window.CTPostgres.indicadoresFiscales().then(function (r) { fiscalHost.innerHTML = pintarIndicadoresFiscales(r); })
          .catch(function () { fiscalHost.innerHTML = sinPendientes("No se pudieron calcular los indicadores fiscales."); });
      }

      if (!datos.ok) {
        if (kpiWrap) kpiWrap.innerHTML = proximamente("No se pudieron cargar los datos (" + (datos.error || "sin conexión") + ").");
        if (chartHost) chartHost.innerHTML = "";
        if (alertHost) alertHost.innerHTML = "";
        if (alertasCountEl) alertasCountEl.textContent = "";
        return;
      }

      const f = datos.facturacion || {};
      const o = datos.operacion || {};
      const serie = datos.serieMensual || [];
      const gastosSerie = datos.gastosSerieMensual || [];
      window.CTDashboardSeries = { serie: serie, gastosSerie: gastosSerie, o: o }; // para el toggle Mes/Año
      const montosSerie = serie.map(function (s) { return s.monto; });
      const actual = montosSerie[montosSerie.length - 1] || 0;
      const anterior = montosSerie[montosSerie.length - 2] || 0;
      const deltaFact = anterior > 0 ? (((actual - anterior) / anterior) * 100) : null;

      if (kpiWrap) {
        kpiWrap.innerHTML =
          kpiCard("Facturación del mes", f.montoMes || 0, "trend", montosSerie.length > 1 ? montosSerie : null,
            deltaFact !== null ? Math.abs(deltaFact).toFixed(1) : null, deltaFact !== null ? deltaFact >= 0 : true) +
          kpiCard("Ingresos (pólizas)", o.ingresosMes || 0, "trend", null, null, true) +
          kpiCard("Egresos (pólizas)", o.egresosMes || 0, "down", null, null, false) +
          // OT-0043: antes decía "Utilidad operativa", pero es ingresos − egresos según el MONTO de las pólizas del mes
          // (movimientos de caja), no la utilidad contable del Estado de Resultados (cuentas de ingresos y gastos);
          // las dos cifras podían ser muy distintas y parecía un error. La clave `utilidadMes` del servidor no cambia.
          kpiCard("Ingresos − egresos (pólizas)", o.utilidadMes || 0, "wallet", null, null, (o.utilidadMes || 0) >= 0);
      }

      renderChartAnio(serie, gastosSerie);

      // Alertas reales (accionables, con clic a su módulo) — separadas de
      // la información neutral, que ya no se mezcla como si fuera alerta.
      if (alertHost) alertHost.innerHTML = (datos.alertas || []).length
        ? (datos.alertas || []).map(alertHTML).join("")
        : '<p style="color:var(--faint);font-size:.85rem;padding:.5rem 0">Sin alertas activas — todo en orden.</p>';
      if (alertasCountEl) {
        const nAlertas = (datos.alertas || []).length;
        alertasCountEl.textContent = nAlertas === 0 ? "Sin alertas" : nAlertas + (nAlertas === 1 ? " activa" : " activas");
      }

      if (infoHost) {
        const n = datos.nomina || {};
        const cc = datos.catalogoContable || {};
        infoHost.innerHTML = alertHTML({
          tipo: "info",
          titulo: n.empleadosActivos + " empleado" + (n.empleadosActivos === 1 ? "" : "s") + " activo" + (n.empleadosActivos === 1 ? "" : "s") + " en nómina",
          texto: "Nómina mensual estimada: $" + money(n.nominaMensualEstimada || 0),
          accion: { vista: "nomina" },
        }) + alertHTML({
          tipo: "info",
          titulo: (cc.totalCuentas || 0) + " cuentas en el catálogo contable",
          texto: "Cuentas registradas en tu catálogo de cuentas.",
          accion: { vista: "contabilidad" },
        });
      }

      // ---- Cuadre del libro mayor (Debe = Haber, integridad real) ----
      if (ledgerBar) {
        const bg = datos.balanceGeneral || {};
        // No tenemos debe/haber totales por separado en el payload — se
        // muestra el resultado del cuadre (activo vs pasivo+capital), que
        // es la comprobación contable real equivalente en este punto.
        // FIX: el backend calcula "cuadra" con la ecuación completa
        // (Activo = Pasivo + Capital + Resultado del periodo — correcto
        // antes de cerrar el ejercicio), pero esta pantalla solo
        // MOSTRABA Pasivo+Capital sin el resultado, así que el check ✓
        // aparecía junto a dos números que no coincidían entre sí.
        const cuadra = bg.cuadra !== false && (bg.totalActivo || bg.totalPasivo || bg.totalCapital || bg.resultadoDelPeriodo);
        const resultado = bg.resultadoDelPeriodo || 0;
        const totalDerecha = (bg.totalPasivo || 0) + (bg.totalCapital || 0) + resultado;
        if (bg.totalActivo === undefined) {
          ledgerBar.innerHTML = proximamente("Aún no hay pólizas para calcular el cuadre.");
        } else {
          ledgerBar.innerHTML =
            '<div class="card__head" style="margin-bottom:.9rem"><h3>Balance General</h3><span class="sub">Acumulado</span></div>' +
            '<div class="ledger__top"><span>Activo</span><span>Pasivo + Capital + Resultado del periodo</span></div>' +
            '<div class="ledger__nums"><b>$' + money(bg.totalActivo || 0) + '</b><b>$' + money(totalDerecha) + '</b></div>' +
            '<div style="font-size:.78rem;color:var(--muted,#8a93a6);text-align:right;margin-top:-.4rem;margin-bottom:.6rem">Pasivo $' + money(bg.totalPasivo || 0) + ' + Capital $' + money(bg.totalCapital || 0) + ' ' + (resultado >= 0 ? '+' : '−') + ' Resultado $' + money(Math.abs(resultado)) + (resultado < 0 ? ' (pérdida del periodo)' : '') + '</div>' +
            '<div class="ledger__bal">' + (cuadra ?
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Cuadra — Activo = Pasivo + Capital' :
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg> No cuadra — revisa el catálogo de cuentas') +
            '</div>';
        }
      }

      // ---- Composición de gastos (real, agrupado por cuenta código 6xx) ----
      const gastos = datos.composicionGastos || [];
      if (donutLegend) {
        donutLegend.innerHTML = gastos.length
          ? gastos.slice(0, 6).map(function (g, i) {
              return '<li><i style="background:hsl(' + (i * 47) + ',65%,55%)"></i>' + g.cuenta + ' <b>$' + money(g.monto) + '</b></li>';
            }).join("")
          : proximamente("Aún no hay gastos registrados en pólizas.");
      }
      if (donutHost) {
        if (gastos.length) {
          const total = gastos.reduce(function (a, g) { return a + g.monto; }, 0) || 1;
          let acumulado = 0;
          const segmentos = gastos.slice(0, 6).map(function (g, i) {
            const pct = g.monto / total;
            const seg = '<circle cx="21" cy="21" r="15.9" fill="none" stroke="hsl(' + (i * 47) + ',65%,55%)" stroke-width="6" ' +
              'stroke-dasharray="' + (pct * 100).toFixed(2) + ' ' + (100 - pct * 100).toFixed(2) + '" stroke-dashoffset="' + (25 - acumulado * 100).toFixed(2) + '"/>';
            acumulado += pct;
            return seg;
          }).join("");
          donutHost.innerHTML = '<svg viewBox="0 0 42 42" width="150" height="150">' + segmentos + '</svg>';
        } else {
          donutHost.innerHTML = "";
        }
      }

      // ---- Balance General detallado ----
      if (balHost) {
        const bg = datos.balanceGeneral || {};
        balHost.innerHTML = bg.totalActivo === undefined
          ? proximamente("Balance General — aún sin pólizas registradas.")
          : '<div class="comp__row"><span>Activo</span><b>$' + money(bg.totalActivo || 0) + '</b></div>' +
            '<div class="comp__row"><span>Pasivo</span><b>$' + money(bg.totalPasivo || 0) + '</b></div>' +
            '<div class="comp__row"><span>Capital</span><b>$' + money(bg.totalCapital || 0) + '</b></div>';
      }

      // ---- Próximas obligaciones SAT (reales, del módulo SAT y Fiscal) ----
      if (oblHost) {
        const obls = datos.proximasObligacionesSat || [];
        oblHost.innerHTML = obls.length
          ? obls.map(function (o) {
              const vencida = o.diasRestantes < 0;
              // OT-0031: nombre y periodo los captura un usuario; se escapan.
              return '<tr><td>' + esc(o.obligacion) + '</td><td>' + esc(o.periodo) + '</td><td>' + esc(o.fechaVencimiento) +
                '</td><td>—</td><td><span class="pill ' + (vencida ? "pill--late" : "pill--pend") + '">' +
                (vencida ? "Vencida" : "Pendiente") + '</span></td></tr>';
            }).join("")
          : '<tr><td colspan="5">' + (datos.obligacionesConfiguradas > 0
            ? sinPendientes("No tienes obligaciones pendientes por presentar.")
            : proximamente("Sin obligaciones fiscales configuradas todavía (SAT y Fiscal → + Obligación).")) + '</td></tr>';
      }
    }
    window.renderDashboardReal = renderDashboardReal;
    renderDashboardReal();

    /* Usuario */
    if (window.USER) {
      const un = document.querySelector("[data-user-name]"); if (un) un.textContent = USER.nombre + " · " + USER.rol;
      const ui = document.querySelector("[data-user-ini]"); if (ui) ui.textContent = USER.iniciales;
    }

    /* ---------- Helpers de módulo ---------- */
    function statCards(arr) {
      return arr.map(function (s) {
        return '<div class="stat ' + (s.tono === "warn" ? "is-warn" : "") + '"><span>' + s.label + "</span><b>" + s.valor + "</b></div>";
      }).join("");
    }
    function setStats(sel, arr) { const h = document.querySelector(sel); if (h && arr) h.innerHTML = statCards(arr); }
    function fill(sel, html) { const h = document.querySelector(sel); if (h) h.innerHTML = html; }
    const ICO_EDIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
    const ICO_DEL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/></svg>';
    const ICO_BAN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/></svg>';
    const ICO_PDF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h4"/></svg>';
    const ICO_MAIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>';
    const ICO_NC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15h6"/></svg>';
    const ICO_REP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>';
    function rowAct(coll, id, extra) {
      return '<td class="row-act">' + (extra || "") + '<button class="ract" data-edit="' + coll + "::" + (id || "") + '" title="Editar">' + ICO_EDIT +
        '</button><button class="ract ract--del" data-del="' + coll + "::" + (id || "") + '" title="Eliminar">' + ICO_DEL + "</button></td>";
    }
    const alertIco = {
      danger: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
      warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>',
      info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
    };
    function alertList(arr) {
      return arr.map(function (a) {
        return '<div class="alert alert--' + a.tipo + '"><div class="alert__ico">' + alertIco[a.tipo] + "</div>" +
          '<div class="alert__body"><b>' + a.titulo + "</b><p>" + a.texto + "</p><span class=\"when\">" + a.when + "</span></div></div>";
      }).join("");
    }

    /* ---------- Módulo 01 · Contabilidad ---------- */
    if (window.CONT_STATS) setStats("[data-cont-stats]", CONT_STATS);
    if (window.CUENTAS) {
      fill("[data-cuentas]", CUENTAS.map(function (c) {
        return '<tr class="acct-lvl' + c.nivel + '"><td class="num">' + c.codigo + "</td><td>" + c.nombre +
          '</td><td><span class="nat">' + c.nat + '</span></td><td class="num" style="text-align:right">$' + money(c.saldo) + "</td></tr>";
      }).join(""));
    }
    function renderPolizas(arr) {
      fill("[data-polizas]", (arr || []).map(function (p) {
        const ok = p.estado === "ok";
        return '<tr><td class="num">' + p.folio + "</td><td>" + p.tipo + '</td><td class="num">' + p.fecha +
          "</td><td>" + p.concepto + '</td><td class="num" style="text-align:right">$' + money(p.monto) +
          '</td><td><span class="pill ' + (ok ? "pill--ok" : "pill--pend") + '">' + (ok ? "Cuadrada" : "Por revisar") + "</span></td>" + rowAct("polizas", p.id) + "</tr>";
      }).join(""));
    }
    window.CTRender = window.CTRender || {};
    window.CTRender.polizas = renderPolizas;
    if (window.POLIZAS) renderPolizas(POLIZAS);

    /* ---------- Módulo 03 · Facturación ---------- */
    // OT-0030: escapa texto que viene de la base (cliente, folio…) antes de
    // pintarlo con innerHTML. Un nombre con <script> o <img onerror=…> ya no
    // se ejecuta en el navegador de quien lo ve.
    function esc(s) {
      return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    }
    // OT-0030: KPIs reales de Facturación. Antes eran las cifras de ejemplo
    // de data.js (38 timbradas, $1.28M, 3 canceladas, $984k) aunque la base
    // estuviera vacía. `todos` = lista COMPLETA (no la filtrada por la búsqueda).
    function renderFactStats(todos) {
      if (!todos) {
        setStats("[data-fact-stats]", [
          { label: "Timbradas (mes)", valor: "—" }, { label: "Monto facturado", valor: "—" },
          { label: "Canceladas (mes)", valor: "—" }, { label: "Por cobrar", valor: "—" },
        ]);
        return;
      }
      const hoy = new Date();
      const delMes = function (f) {
        const d = new Date(f.fechaISO || f.createdAt || 0);
        return d.getFullYear() === hoy.getFullYear() && d.getMonth() === hoy.getMonth();
      };
      const mes = todos.filter(delMes);
      const ingresos = mes.filter(function (f) { return f.tipo !== "E" && f.tipo !== "P"; });
      const monto = ingresos.filter(function (f) { return f.estado === "ok"; })
        .reduce(function (a, f) { return a + (Number(f.total) || 0); }, 0);
      const canceladas = mes.filter(function (f) { return f.estado === "cancelada"; }).length;
      const porCobrar = (window.CONTATECK_CFDIS_SALDO_PG || [])
        .reduce(function (a, r) { return a + (Number(r.saldo_pendiente) || 0); }, 0);
      setStats("[data-fact-stats]", [
        { label: "Timbradas (mes)", valor: String(ingresos.length) },
        { label: "Monto facturado", valor: "$" + money(monto) },
        { label: "Canceladas (mes)", valor: String(canceladas), tono: canceladas ? "warn" : undefined },
        { label: "Por cobrar", valor: "$" + money(porCobrar), tono: porCobrar > 0 ? "warn" : undefined },
      ]);
    }
    window.CTRender = window.CTRender || {};
    window.CTRender.cfdiStats = renderFactStats;
    renderFactStats(null);
    function renderCfdis(arr) {
      fill("[data-cfdis]", (arr || []).map(function (f) {
        const ok = f.estado === "ok";
        const esFactura = f.tipo !== "E" && f.tipo !== "P"; // las NC y REP no generan NC/REP/cancelación encadenada
        let btns = "";
        // Ver PDF (con logo de empresa si está configurado)
        if (f.cfdiId) btns += '<button class="ract" data-pdf-cfdi="' + f.cfdiId + '" title="Ver PDF">' + ICO_PDF + "</button>";
        // Enviar por correo
        if (f.cfdiId) btns += '<button class="ract" data-correo-cfdi="' + f.cfdiId + "::" + f.id + '" title="Enviar por correo" style="color:#6E8BFF">' + ICO_MAIL + "</button>";
        // Nota de crédito (solo facturas de ingreso vigentes)
        if (f.uuidFull && ok && esFactura) btns += '<button class="ract" data-nc-cfdi="' + f.uuidFull + "::" + f.id + '" title="Nota de crédito" style="color:#F2B84B">' + ICO_NC + "</button>";
        // REP (solo facturas PPD vigentes con saldo pendiente)
        const conSaldo = (typeof f.saldo === "number") ? f.saldo > 0.01 : true;
        if (f.uuidFull && ok && esFactura && f.metodoPago === "PPD" && conSaldo) btns += '<button class="ract" data-rep-cfdi="' + f.uuidFull + "::" + f.id + '" title="Registrar pago (REP)" style="color:#34D399">' + ICO_REP + "</button>";
        // Cancelar ante el SAT
        if (f.uuidFull && ok) btns += '<button class="ract" data-cancelar-cfdi="' + f.uuidFull + "::" + f.id + '" title="Cancelar ante el SAT" style="color:#FB7185">' + ICO_BAN + "</button>";
        // OT-0012: sin rowAct() aquí a propósito — un CFDI real no se edita
        // ni se borra de forma genérica (eso viviría solo en Firestore,
        // sin tocar el SAT). Las únicas acciones válidas son las de arriba
        // (PDF, correo, nota de crédito, REP, cancelar ante el SAT).
        return '<tr><td class="num">' + esc(f.folio) + '</td><td class="num" style="color:var(--faint)">' + esc(f.uuid) +
          "</td><td>" + esc(f.cliente) + '</td><td class="num">' + esc(f.fecha) + '</td><td class="num" style="text-align:right">$' + money(f.total) +
          '</td><td><span class="pill ' + (ok ? "pill--ok" : "pill--late") + '">' + (ok ? "Vigente" : "Cancelada") + "</span></td><td class=\"row-act\">" + btns + "</td></tr>";
      }).join(""));
    }
    window.CTRender.cfdis = renderCfdis;

    /* ---------- Módulo 08 · Nómina (Parte A — OT-0017) ---------- */
    // Estado inicial (sin periodo activo). El cálculo (ISR, IMSS) ya lo hace
    // nomina.js con el Motor Fiscal 2026 al generar una prenómina; aquí solo
    // se deja la pantalla vacía, nunca una cifra inventada.
    (function () {
      const cont = document.querySelector("[data-nom-desglose]");
      const setT = function (sel, v) { const e = document.querySelector(sel); if (e) e.textContent = v; };
      setT("[data-nom-periodo]", "Sin periodo activo");
      setT("[data-nom-perc]", "—");
      setT("[data-nom-ded]", "—");
      setT("[data-nom-neto]", "—");
      if (cont) {
        cont.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--faint);font-size:.9rem">' +
          '<b style="display:block;color:var(--text);margin-bottom:.2rem">Sin periodo activo</b>' +
          "Da clic en <b>Calcular</b> para generar la prenómina con ISR e IMSS.</div>";
      }
    })();

    const ROLES_ESCRIBEN_EMPLEADOS = ["rh", "admin", "director"];
    function miRolActual() {
      const p = window.CONTATECK_PERFIL_PG;
      return p ? p.rol : null;
    }
    function puedeEscribirEmpleados() { return ROLES_ESCRIBEN_EMPLEADOS.indexOf(miRolActual()) !== -1; }

    function renderEmpleados(arr) {
      arr = arr || [];
      const ec = document.querySelector("[data-emp-count]"); if (ec) ec.textContent = arr.length + " registrados";
      const puedeEscribir = puedeEscribirEmpleados();
      const btnNuevo = document.querySelector('[data-new="empleado"]');
      if (btnNuevo) btnNuevo.style.display = puedeEscribir ? "" : "none";
      // OT-nomina-p1: mapa de los 5 estados con su etiqueta y color —
      // antes era binario (todo lo que no fuera "ok" se pintaba "Baja"
      // en rojo), y un empleado en incapacidad/maternidad/permiso se
      // veía mal etiquetado. "pill--pend" (ámbar) para ausencias
      // temporales: no está de baja, pero tampoco cuenta para prenómina.
      const ESTADOS_EMP = {
        ok: { t: "Activo", c: "pill--ok" },
        incapacidad: { t: "Incapacidad", c: "pill--pend" },
        maternidad: { t: "Maternidad", c: "pill--pend" },
        permiso: { t: "Permiso", c: "pill--pend" },
        baja: { t: "Baja", c: "pill--late" },
      };
      fill("[data-empleados]", arr.map(function (e) {
        const est = ESTADOS_EMP[e.estado] || ESTADOS_EMP.baja;
        const sueldoTxt = e.sueldo == null ? "—" : "$" + money(e.sueldo);
        return "<tr><td>" + e.nombre + "</td><td>" + (e.puesto || "—") + '</td><td class="num" style="text-align:right">' + sueldoTxt +
          '</td><td><span class="pill ' + est.c + '">' + est.t + "</span></td>" +
          (puedeEscribir ? rowAct("empleados", e.id) : "<td></td>") + "</tr>";
      }).join(""));
    }
    window.CTRender.empleados = renderEmpleados;

    /* ---------- Módulo 02 · SAT y Fiscal: ver fiscal.js ---------- */

    /* ---------- Módulo 15 · Asistente contable (OT-0053 IA / OT-0054 reglas) ---------- */
    // Chat real de SOLO LECTURA: el backend consulta los datos de la empresa con el permiso del propio usuario y se los
    // da a la IA como herramientas. Se inicia al abrir la vista (no al cargar el panel, para no sumar peticiones).
    // El texto del usuario se pinta con textContent y el de la IA se escapa antes de dar formato: nada de HTML ajeno.
    const chatLog = document.querySelector("[data-ia-chat]");
    if (chatLog) {
      const chipHost = document.querySelector("[data-ia-acciones]");
      const input = document.querySelector("[data-ia-input]");
      const enviar = document.querySelector("[data-ia-send]");
      const navIA = document.querySelector('.nav-item[data-view="ia"]');
      const historial = [];
      const SUGERENCIAS = ["¿Cómo va el Balance General?", "¿Cuánto hay en bancos y caja?", "¿Cuánto me deben mis clientes y cuánto debo a proveedores?", "¿Cómo va el IVA este mes?", "¿Qué obligaciones fiscales vencen pronto?", "¿Cuánto gané este mes?", "¿Tengo alertas pendientes?", "¿Qué facturas no tienen póliza?", "¿Qué es el IVA?", "¿Cómo registro una venta?"];
      const AV = '<span class="msg__av"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><path d="M12 4l1.4 4L17 9.5l-3.6 1.5L12 15l-1.4-4L7 9.5 10.6 8z"/></svg></span>';
      let iniciada = false, ocupada = false;

      const escIA = function (s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); };
      // Formato mínimo y seguro: negritas con ** y saltos de línea; todo lo demás queda como texto.
      const formatea = function (t) { return escIA(t).replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>"); };
      const burbuja = function (rol, html, esTexto) {
        const m = document.createElement("div");
        m.className = "msg " + (rol === "me" ? "msg--me" : "msg--ai");
        m.innerHTML = (rol === "me" ? '<span class="msg__av">Tú</span>' : AV) + '<div class="msg__bubble"></div>';
        const b = m.querySelector(".msg__bubble");
        if (esTexto) b.textContent = html; else b.innerHTML = html;
        chatLog.appendChild(m); chatLog.scrollTop = chatLog.scrollHeight;
        return b;
      };
      const bloquear = function (mensaje) {
        chatLog.innerHTML = ""; burbuja("ai", "<b>Asistente contable</b><br>" + escIA(mensaje));
        if (chipHost) chipHost.style.display = "none";
        if (input) { input.disabled = true; input.placeholder = "No disponible"; }
        if (enviar) { enviar.disabled = true; enviar.style.opacity = ".4"; enviar.style.cursor = "not-allowed"; }
      };
      const preguntar = async function (texto) {
        const pregunta = String(texto || "").trim();
        if (!pregunta || ocupada) return;
        ocupada = true; if (input) input.value = ""; if (enviar) enviar.disabled = true;
        burbuja("me", pregunta, true);
        const espera = burbuja("ai", "<i>Consultando tus datos…</i>");
        let r;
        try { r = await window.CTPostgres.consultarIA(pregunta, historial.slice(-12)); } catch (e) { r = { ok: false, error: "No se pudo conectar con el servidor." }; }
        if (r && r.ok) {
          espera.innerHTML = formatea(r.respuesta);
          historial.push({ rol: "usuario", texto: pregunta }, { rol: "ia", texto: r.respuesta });
        } else {
          espera.textContent = (r && r.error) || "No se pudo obtener una respuesta.";
        }
        chatLog.scrollTop = chatLog.scrollHeight;
        ocupada = false; if (enviar) enviar.disabled = false; if (input) input.focus();
      };
      const iniciar = async function () {
        if (iniciada) return; iniciada = true;
        for (let i = 0; i < 40 && !window.CONTATECK_SUPABASE_TOKEN; i++) await new Promise(function (r) { setTimeout(r, 150); });
        const e = await window.CTPostgres.estadoIA();
        if (!e || !e.ok) { iniciada = false; bloquear("No se pudo comprobar el estado de la IA. Recarga la página e inténtalo de nuevo."); return; }
        if (!e.rolPermitido) { bloquear("Tu rol no tiene acceso al asistente contable."); return; }
        if (!e.disponible) { bloquear("La IA Contable todavía no está activada en el servidor (falta configurar la llave del proveedor). El resto del sistema funciona con normalidad."); return; }
        chatLog.innerHTML = "";
        burbuja("ai", e.modo === "ia"
          ? "<b>Hola, soy tu asistente contable con IA.</b><br>Consulto los datos de tu empresa (solo lectura): saldos, Balance General, obligaciones fiscales y cuentas por cobrar y pagar. No puedo modificar nada. Verifica las cifras importantes antes de decidir."
          : "<b>Hola, soy el asistente contable de CONTATECK.</b><br>Contesto preguntas frecuentes con los datos reales de tu empresa (solo lectura, no modifico nada). No es inteligencia artificial: reconozco ciertos temas y, si no entiendo, te lo digo. Prueba con una de las sugerencias o escribe tu pregunta.");
        if (chipHost) {
          chipHost.innerHTML = "";
          SUGERENCIAS.forEach(function (s) {
            const c = document.createElement("button"); c.type = "button"; c.className = "chip"; c.textContent = s;
            c.addEventListener("click", function () { preguntar(s); }); chipHost.appendChild(c);
          });
          chipHost.style.display = "";
        }
        if (input) { input.disabled = false; input.placeholder = "Pregúntale algo a tu asistente contable…"; }
        if (enviar) { enviar.disabled = false; enviar.style.opacity = ""; enviar.style.cursor = ""; }
      };
      // Estado inicial seguro: desactivada hasta comprobar que está disponible.
      bloquear("Cargando…");
      if (enviar) enviar.addEventListener("click", function () { preguntar(input && input.value); });
      if (input) input.addEventListener("keydown", function (ev) { if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); preguntar(input.value); } });
      if (navIA) navIA.addEventListener("click", iniciar);
    }
  }

  /* ============================================================
     GENERADORES DE CHARTS (SVG)
     ============================================================ */
  function sparkline(arr, color) {
    const w = 120, h = 36, pad = 3;
    const mn = Math.min.apply(null, arr), mx = Math.max.apply(null, arr);
    const rng = (mx - mn) || 1;
    const pts = arr.map(function (v, i) {
      const x = pad + (i / (arr.length - 1)) * (w - pad * 2);
      const y = h - pad - ((v - mn) / rng) * (h - pad * 2);
      return x.toFixed(1) + "," + y.toFixed(1);
    });
    const last = pts[pts.length - 1].split(",");
    return '<svg viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none">' +
      '<polyline points="' + pts.join(" ") + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="2.6" fill="' + color + '"/></svg>';
  }

  function areaChart(d) {
    const W = 720, H = 280, padL = 46, padR = 14, padT = 18, padB = 34;
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const all = d.ventas.concat(d.gastos);
    const mx = Math.max.apply(null, all) * 1.1, mn = 0;
    const x = function (i) { return padL + (i / (d.meses.length - 1)) * innerW; };
    const y = function (v) { return padT + innerH - ((v - mn) / (mx - mn)) * innerH; };

    // gridlines + labels Y
    let grid = "", ylab = "";
    const steps = 4;
    for (let s = 0; s <= steps; s++) {
      const val = (mx / steps) * s;
      const yy = y(val);
      grid += '<line x1="' + padL + '" y1="' + yy.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + yy.toFixed(1) + '" stroke="var(--line)" stroke-width="1"/>';
      ylab += '<text x="' + (padL - 8) + '" y="' + (yy + 3).toFixed(1) + '" text-anchor="end" font-size="10" fill="var(--faint)" font-family="JetBrains Mono">' + moneyShort(val * 1000) + '</text>';
    }
    // labels X
    let xlab = "";
    d.meses.forEach(function (m, i) {
      xlab += '<text x="' + x(i).toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="10" fill="var(--faint)" font-family="JetBrains Mono">' + m + "</text>";
    });

    const line = function (arr) { return arr.map(function (v, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1); }).join(" "); };
    const area = function (arr) {
      return "M" + x(0).toFixed(1) + " " + (padT + innerH) + " " +
        arr.map(function (v, i) { return "L" + x(i).toFixed(1) + " " + y(v).toFixed(1); }).join(" ") +
        " L" + x(arr.length - 1).toFixed(1) + " " + (padT + innerH) + " Z";
    };

    return '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Ventas vs Gastos por mes">' +
      "<defs>" +
      '<linearGradient id="gv" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--brand)" stop-opacity=".30"/><stop offset="100%" stop-color="var(--brand)" stop-opacity="0"/></linearGradient>' +
      "</defs>" +
      grid + ylab + xlab +
      '<path d="' + area(d.ventas) + '" fill="url(#gv)"/>' +
      '<path d="' + line(d.gastos) + '" fill="none" stroke="var(--gold)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="2 5"/>' +
      '<path d="' + line(d.ventas) + '" fill="none" stroke="var(--brand)" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>' +
      d.ventas.map(function (v, i) { return '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="3" fill="var(--ink-800)" stroke="var(--brand)" stroke-width="2"/>'; }).join("") +
      "</svg>";
  }

  function donut(items) {
    const total = items.reduce(function (a, b) { return a + b.valor; }, 0);
    const r = 46, c = 2 * Math.PI * r, cx = 60, cy = 60;
    let off = 0, segs = "";
    items.forEach(function (it) {
      const frac = it.valor / total;
      const dash = frac * c;
      segs += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + it.color +
        '" stroke-width="15" stroke-dasharray="' + dash.toFixed(2) + " " + (c - dash).toFixed(2) +
        '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 ' + cx + " " + cy + ')" stroke-linecap="butt"/>';
      off += dash;
    });
    return '<svg viewBox="0 0 120 120" width="138" height="138">' + segs +
      '<text x="60" y="56" text-anchor="middle" font-size="9" fill="var(--faint)" font-family="DM Sans">Gastos</text>' +
      '<text x="60" y="72" text-anchor="middle" font-size="14" font-weight="600" fill="var(--text)" font-family="JetBrains Mono">' + moneyShort(total) + "</text></svg>";
  }
})();
