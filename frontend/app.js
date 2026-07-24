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
  if (document.querySelector("[data-dashboard]") && window.KPIS) {

    /* Empresas en el selector */
    const empMenu = document.querySelector("[data-empresas]");
    if (empMenu) {
      empMenu.innerHTML = EMPRESAS.map(function (e, i) {
        return '<div class="select__opt ' + (i === 0 ? "is-sel" : "") + '" data-val="' + e.nombre + '">' +
          '<div><div>' + e.nombre + "</div><small>" + e.rfc + " · " + e.regimen + "</small></div>" +
          (i === 0 ? '<span class="ck">' + ICON.check + "</span>" : "") + "</div>";
      }).join("");
      // re-enlazar selección
      empMenu.querySelectorAll(".select__opt").forEach(function (opt) {
        opt.addEventListener("click", function () {
          empMenu.querySelectorAll(".select__opt").forEach(function (o) { o.classList.remove("is-sel"); const c = o.querySelector(".ck"); if (c) c.remove(); });
          opt.classList.add("is-sel");
          opt.insertAdjacentHTML("beforeend", '<span class="ck">' + ICON.check + "</span>");
          document.querySelectorAll("[data-empresa-label]").forEach(function (l) { l.textContent = opt.getAttribute("data-val"); });
          empMenu.closest(".select").classList.remove("is-open");
        });
      });
      document.querySelectorAll("[data-empresa-label]").forEach(function (l) { l.textContent = EMPRESAS[0].nombre; });
    }

    /* KPIs */
    const kpiWrap = document.querySelector("[data-kpis]");
    if (kpiWrap) {
      kpiWrap.innerHTML = KPIS.map(function (k) {
        const up = k.delta >= 0;
        const deltaClass = (k.id === "gastos") ? (up ? "delta--down" : "delta--up") : (up ? "delta--up" : "delta--down");
        return '<div class="kpi rise">' +
          '<div class="kpi__top"><span class="kpi__label">' + k.label + '</span>' +
          '<span class="kpi__ico">' + (ICO_KPI[k.ico] || "") + '</span></div>' +
          '<div class="kpi__val"><span class="cur">$</span>' + money(k.valor) + '</div>' +
          '<div class="kpi__foot"><span class="delta ' + deltaClass + '">' +
          (up ? ICON.up : ICON.down) + Math.abs(k.delta).toFixed(1) + '%</span>' +
          '<span>vs mes anterior</span></div>' +
          '<div class="spark">' + sparkline(k.serie, up ? "var(--up)" : "var(--down)") + '</div></div>';
      }).join("");
    }

    /* Ledger Debe/Haber (firma) */
    const ledgerBar = document.querySelector("[data-ledger-bar]");
    if (ledgerBar) {
      const total = LEDGER.debe + LEDGER.haber;
      ledgerBar.querySelector(".deb").style.width = (LEDGER.debe / total * 100) + "%";
      ledgerBar.querySelector(".hab").style.width = (LEDGER.haber / total * 100) + "%";
      document.querySelector("[data-debe]").textContent = "$" + money(LEDGER.debe);
      document.querySelector("[data-haber]").textContent = "$" + money(LEDGER.haber);
    }

    /* Chart principal ventas vs gastos */
    const chartHost = document.querySelector("[data-chart-main]");
    if (chartHost) chartHost.innerHTML = areaChart(SERIE);

    /* Donut composición de gastos */
    const donutHost = document.querySelector("[data-donut]");
    if (donutHost) {
      donutHost.innerHTML = donut(GASTOS_COMP);
      const lg = document.querySelector("[data-donut-legend]");
      const totalG = GASTOS_COMP.reduce(function (a, b) { return a + b.valor; }, 0);
      lg.innerHTML = GASTOS_COMP.map(function (g) {
        return '<li><span class="nm"><i style="background:' + g.color + '"></i>' + g.label + '</span>' +
          '<span class="vl">' + (g.valor / totalG * 100).toFixed(0) + '%</span></li>';
      }).join("");
    }

    /* Balance (comp bars) */
    const balHost = document.querySelector("[data-balance]");
    if (balHost) {
      const max = Math.max.apply(null, BALANCE.map(function (b) { return b.valor; }));
      balHost.innerHTML = BALANCE.map(function (b, i) {
        return '<div class="comp__row"><div class="t"><span>' + b.label + '</span><b>$' + money(b.valor) + '</b></div>' +
          '<div class="comp__track"><div class="comp__fill ' + (i === 1 ? "g" : "") + '" style="width:' + (b.valor / max * 100) + '%"></div></div></div>';
      }).join("");
    }

    /* Indicadores fiscales */
    const fiscalHost = document.querySelector("[data-fiscal]");
    if (fiscalHost) {
      fiscalHost.innerHTML = FISCAL.map(function (f) {
        const pill = f.estado === "ok" ? "pill--ok" : "pill--pend";
        const txt = f.estado === "ok" ? "Al día" : "Pendiente";
        return '<div class="comp__row"><div class="t"><span>' + f.label + '</span>' +
          '<b>$' + money(f.valor) + '</b></div>' +
          '<div style="margin-top:.15rem"><span class="pill ' + pill + '">' + txt + '</span></div></div>';
      }).join("");
    }

    /* Alertas */
    const alertHost = document.querySelector("[data-alerts]");
    if (alertHost) {
      const ai = {
        danger: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
        warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>',
        info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
      };
      alertHost.innerHTML = ALERTAS.map(function (a) {
        return '<div class="alert alert--' + a.tipo + '"><div class="alert__ico">' + ai[a.tipo] + '</div>' +
          '<div class="alert__body"><b>' + a.titulo + '</b><p>' + a.texto + '</p>' +
          '<span class="when">' + a.when + '</span></div></div>';
      }).join("");
    }

    /* Obligaciones SAT */
    const oblHost = document.querySelector("[data-obligaciones]");
    if (oblHost) {
      oblHost.innerHTML = OBLIGACIONES.map(function (o) {
        const pillCls = o.estado === "ok" ? "pill--ok" : "pill--pend";
        const pillTxt = o.estado === "ok" ? "Presentada" : "Pendiente";
        return "<tr><td>" + o.obligacion + '</td><td class="num">' + o.periodo + "</td>" +
          '<td class="num">' + o.vence + "</td>" +
          '<td class="num">' + (o.monto ? "$" + money(o.monto) : "—") + "</td>" +
          '<td><span class="pill ' + pillCls + '">' + pillTxt + "</span></td></tr>";
      }).join("");
    }

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
    if (window.FACT_STATS) setStats("[data-fact-stats]", FACT_STATS);
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
        return '<tr><td class="num">' + f.folio + '</td><td class="num" style="color:var(--faint)">' + f.uuid +
          "</td><td>" + f.cliente + '</td><td class="num">' + f.fecha + '</td><td class="num" style="text-align:right">$' + money(f.total) +
          '</td><td><span class="pill ' + (ok ? "pill--ok" : "pill--late") + '">' + (ok ? "Vigente" : "Cancelada") + "</span></td>" + rowAct("cfdis", f.id, btns) + "</tr>";
      }).join(""));
    }
    window.CTRender.cfdis = renderCfdis;
    if (window.CFDIS) renderCfdis(CFDIS);

    /* ---------- Módulo 08 · Nómina ---------- */
    if (window.NOMINA_RESUMEN) {
      const n = NOMINA_RESUMEN;
      const setT = function (sel, v) { const e = document.querySelector(sel); if (e) e.textContent = v; };
      setT("[data-nom-periodo]", n.periodo);
      setT("[data-nom-perc]", "$" + money(n.percepciones));
      setT("[data-nom-ded]", "$" + money(n.deducciones));
      setT("[data-nom-neto]", "$" + money(n.neto));
      const max = Math.max.apply(null, n.desglose.map(function (d) { return d.valor; }));
      fill("[data-nom-desglose]", n.desglose.map(function (d) {
        const col = d.tipo === "perc" ? "var(--up)" : "var(--down)";
        return '<div class="comp__row"><div class="t"><span>' + d.label + "</span><b>$" + money(d.valor) +
          '</b></div><div class="comp__track"><div class="comp__fill" style="width:' + (d.valor / max * 100) + "%;background:" + col + '"></div></div></div>';
      }).join(""));
    }
    function renderEmpleados(arr) {
      arr = arr || [];
      const ec = document.querySelector("[data-emp-count]"); if (ec) ec.textContent = arr.length + " registrados";
      fill("[data-empleados]", arr.map(function (e) {
        const ok = e.estado === "ok";
        return "<tr><td>" + e.nombre + "</td><td>" + e.puesto + '</td><td class="num" style="text-align:right">$' + money(e.sueldo) +
          '</td><td><span class="pill ' + (ok ? "pill--ok" : "pill--late") + '">' + (ok ? "Activo" : "Baja") + "</span></td>" + rowAct("empleados", e.id) + "</tr>";
      }).join(""));
    }
    window.CTRender.empleados = renderEmpleados;
    if (window.EMPLEADOS) renderEmpleados(EMPLEADOS);

    /* ---------- Módulo 02 · SAT y Fiscal ---------- */
    if (window.SAT_STATS) setStats("[data-sat-stats]", SAT_STATS);
    if (window.DECLARACIONES) {
      fill("[data-declaraciones]", DECLARACIONES.map(function (d) {
        const ok = d.estado === "ok";
        return "<tr><td>" + d.tipo + '</td><td class="num">' + d.periodo + '</td><td class="num">' + d.presentada +
          '</td><td class="num">' + d.acuse + '</td><td><span class="pill ' + (ok ? "pill--ok" : "pill--pend") + '">' +
          (ok ? "Presentada" : "Pendiente") + "</span></td></tr>";
      }).join(""));
    }
    if (window.BUZON) fill("[data-buzon]", alertList(BUZON));

    /* ---------- Módulo 15 · IA Contable ---------- */
    const chatLog = document.querySelector("[data-ia-chat]");
    if (chatLog && window.IA_CHAT_INICIAL) {
      const avAi = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><path d="M12 4l1.4 4L17 9.5l-3.6 1.5L12 15l-1.4-4L7 9.5 10.6 8z"/></svg>';
      const avMe = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.2"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/></svg>';
      const empresaTxt = (document.querySelector("[data-empresa-label]") || {}).textContent || "tu empresa";

      const appendMsg = function (de, texto) {
        const ai = de === "ai";
        const html = '<div class="msg msg--' + (ai ? "ai" : "me") + '"><span class="msg__av">' + (ai ? avAi : avMe) +
          '</span><div class="msg__bubble">' + texto + "</div></div>";
        chatLog.insertAdjacentHTML("beforeend", html);
        chatLog.scrollTop = chatLog.scrollHeight;
      };
      IA_CHAT_INICIAL.forEach(function (m) { appendMsg(m.de, m.texto); });

      const input = document.querySelector("[data-ia-input]");
      const send = function () {
        const txt = (input.value || "").trim();
        if (!txt) return;
        appendMsg("me", txt);
        input.value = "";
        setTimeout(function () {
          appendMsg("ai", "Anotado. En esta demo todavía no estoy conectado al backend, pero en producción aquí te respondo con los datos reales de <b>" + empresaTxt + "</b> (XML, bancos y declaraciones).");
        }, 650);
      };
      document.querySelector("[data-ia-send]").addEventListener("click", send);
      input.addEventListener("keydown", function (e) { if (e.key === "Enter") send(); });

      const chipIco = {
        file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></svg>',
        flow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h11a4 4 0 0 1 0 8H7"/><polyline points="7 11 4 7 7 3"/></svg>',
        shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 5 6v5c0 4.4 3 7.6 7 8.7 4-1.1 7-4.3 7-8.7V6z"/><path d="m9 12 2 2 4-4"/></svg>',
        doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l5 5v13H7z"/><path d="M9 13h6M9 17h4"/></svg>',
      };
      const chipHost = document.querySelector("[data-ia-acciones]");
      if (chipHost && window.IA_ACCIONES) {
        chipHost.innerHTML = IA_ACCIONES.map(function (a) {
          return '<button class="chip" data-chip="' + a.label + '">' + (chipIco[a.ico] || "") + a.label + "</button>";
        }).join("");
        chipHost.querySelectorAll(".chip").forEach(function (c) {
          c.addEventListener("click", function () {
            // ir a la pestaña IA ya estamos en ella; mandar el texto
            input.value = c.getAttribute("data-chip");
            send();
          });
        });
      }
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
