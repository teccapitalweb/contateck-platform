/* ============================================================
   CONTATECK · nomina.js · Prenómina interna (Pieza 3)
   Control interno — NO calcula ISR/IMSS ni timbra ante el SAT
   (eso sigue en "Timbrar nómina", bloqueado hasta que el
   responsable contable defina las reglas fiscales y el alta IMSS).

   Flujo: [Calcular] → modal de periodo → Generar Prenómina →
   tabla editable (percepciones/deducciones por empleado, neto en
   vivo) → Aprobar y Pagar (Pieza 4: guarda historial en Postgres).

   Regla de negocio: SOLO empleados con estado "ok" (Activo) entran
   al cálculo — baja, incapacidad, maternidad y permiso se ignoran.
   ============================================================ */
(function () {
  "use strict";

  /* ---------- Utilidades ---------- */
  function $(sel) { return document.querySelector(sel); }
  function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function money(n) {
    return (Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function toast(msg, tipo) {
    const wrap = $("[data-toasts]");
    if (!wrap) { alert(msg); return; }
    const el = document.createElement("div");
    el.className = "toast toast--" + (tipo || "info");
    el.innerHTML = "<span>" + msg + "</span>";
    wrap.appendChild(el);
    setTimeout(function () { el.classList.add("is-out"); setTimeout(function () { el.remove(); }, 320); }, 3400);
  }
  function miRol() { const p = window.CONTATECK_PERFIL_PG; return p ? p.rol : null; }
  const ROLES_PROCESAN = ["rh", "admin", "director"];
  function puedeProcesar() { return ROLES_PROCESAN.indexOf(miRol()) !== -1; }

  const PERIODOS = [
    { v: "semanal", t: "Semanal", dias: 7 },
    { v: "catorcenal", t: "Catorcenal", dias: 14 },
    { v: "quincenal", t: "Quincenal", dias: 15 },
    { v: "mensual", t: "Mensual", dias: 30 },
  ];

  /* ---------- Estilos propios (prefijo pn-) ---------- */
  const css = document.createElement("style");
  css.textContent = [
    ".pn-inp{width:110px;background:var(--ink-900,#0b101b);border:1px solid var(--line,rgba(255,255,255,.12));",
    "  border-radius:8px;color:var(--text,#e2e8f2);padding:.4rem .55rem;font-size:.86rem;text-align:right;font-variant-numeric:tabular-nums}",
    ".pn-inp:focus{outline:none;border-color:var(--brand,#6E8BFF)}",
    ".pn-inp::-webkit-outer-spin-button,.pn-inp::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}",
    ".pn-inp{-moz-appearance:textfield}",
    ".pn-neto{font-variant-numeric:tabular-nums;font-weight:600}",
    ".pn-nota{width:100%;min-width:150px;background:var(--ink-900,#0b101b);border:1px solid var(--line,rgba(255,255,255,.12));",
    "  border-radius:8px;color:var(--text,#e2e8f2);padding:.4rem .55rem;font-size:.84rem}",
    ".pn-nota:focus{outline:none;border-color:var(--brand,#6E8BFF)}",
  ].join("\n");
  document.head.appendChild(css);

  /* ---------- Modal propio (usa las clases .modal de styles.css) ---------- */
  let modal = null;
  function ensureModal() {
    if (modal) return;
    modal = document.createElement("div");
    modal.className = "modal";
    modal.innerHTML =
      '<div class="modal__scrim" data-pn-cerrar></div>' +
      '<div class="modal__card"><div class="modal__head"><h3>Configurar periodo</h3>' +
      '<button class="modal__x" data-pn-cerrar aria-label="Cerrar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>' +
      '<div class="modal__body" data-pn-body></div>' +
      '<div class="modal__foot"><button class="btn btn--ghost" data-pn-cerrar>Cancelar</button>' +
      '<button class="btn btn--primary" data-pn-generar>Generar Prenómina</button></div></div>';
    document.body.appendChild(modal);
  }
  function abrirModal() {
    ensureModal();
    const hoy = new Date().toISOString().slice(0, 10);
    $("[data-pn-body]").innerHTML =
      '<div class="fld"><label>Periodicidad</label><div class="seg" data-pn-seg style="flex-wrap:wrap">' +
      PERIODOS.map(function (p, i) {
        return '<button type="button" data-val="' + p.v + '" class="' + (p.v === "quincenal" ? "is-active" : "") + '">' + p.t + "</button>";
      }).join("") +
      "</div></div>" +
      '<div class="fld"><label>Fecha de inicio</label><input type="date" data-pn-inicio value="' + hoy + '"></div>' +
      '<div class="fld"><label>Fecha de fin</label><input type="date" data-pn-fin></div>' +
      '<p style="color:var(--faint);font-size:.8rem;margin-top:.4rem">Solo se incluyen empleados <b>Activos</b> — baja, incapacidad, maternidad y permiso quedan fuera del cálculo.</p>';
    sugerirFin();
    modal.classList.add("is-open");
  }
  function cerrarModal() { if (modal) modal.classList.remove("is-open"); }

  // Modal de confirmación propio (mismas clases .modal del sistema) —
  // reemplaza al window.confirm() feo del navegador. Devuelve una promesa
  // que resuelve true/false según el botón que se presione.
  let modalConf = null;
  function confirmarBonito(titulo, cuerpoHtml, textoOk) {
    return new Promise(function (resolve) {
      if (!modalConf) {
        modalConf = document.createElement("div");
        modalConf.className = "modal";
        modalConf.innerHTML =
          '<div class="modal__scrim" data-cf-no></div>' +
          '<div class="modal__card"><div class="modal__head"><h3 data-cf-title></h3>' +
          '<button class="modal__x" data-cf-no aria-label="Cerrar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>' +
          '<div class="modal__body" data-cf-body></div>' +
          '<div class="modal__foot"><button class="btn btn--ghost" data-cf-no>Cancelar</button>' +
          '<button class="btn btn--primary" data-cf-si></button></div></div>';
        document.body.appendChild(modalConf);
      }
      modalConf.querySelector("[data-cf-title]").textContent = titulo;
      modalConf.querySelector("[data-cf-body]").innerHTML = cuerpoHtml;
      modalConf.querySelector("[data-cf-si]").textContent = textoOk || "Confirmar";
      modalConf.classList.add("is-open");

      function limpiar() {
        modalConf.classList.remove("is-open");
        modalConf.removeEventListener("click", onClick);
      }
      function onClick(e) {
        if (e.target.closest("[data-cf-si]")) { limpiar(); resolve(true); }
        else if (e.target.closest("[data-cf-no]")) { limpiar(); resolve(false); }
      }
      modalConf.addEventListener("click", onClick);
    });
  }

  function periodicidadElegida() {
    const act = modal && modal.querySelector("[data-pn-seg] .is-active");
    return act ? act.getAttribute("data-val") : "quincenal";
  }
  // Comodidad: al elegir periodicidad o fecha de inicio, se sugiere la
  // fecha de fin automáticamente (inicio + días del periodo - 1). El
  // usuario puede cambiarla a mano si quiere — solo es sugerencia.
  function sugerirFin() {
    const ini = modal && modal.querySelector("[data-pn-inicio]");
    const fin = modal && modal.querySelector("[data-pn-fin]");
    if (!ini || !fin || !ini.value) return;
    const p = PERIODOS.find(function (x) { return x.v === periodicidadElegida(); });
    const d = new Date(ini.value + "T12:00:00");
    d.setDate(d.getDate() + (p ? p.dias : 15) - 1);
    fin.value = d.toISOString().slice(0, 10);
  }

  /* ---------- Estado de la prenómina activa ---------- */
  let pre = null; // { periodicidad, inicio, fin, dias, filas: [...] }
  let desgloseOriginal = null; // para restaurar el desglose al cancelar
  // Texto de las tarjetas cuando NO hay prenómina activa — antes decía
  // "Próximamente / Cálculo de nómina (ISR/IMSS)", impreciso ahora que
  // el cálculo interno sí funciona. Solo lo fiscal queda pendiente.
  const DESGLOSE_OCIOSO =
    '<div style="padding:1rem;text-align:center;color:var(--faint);font-size:.9rem">' +
    '<b style="display:block;color:var(--text);margin-bottom:.2rem">Sin periodo activo</b>' +
    'Da clic en <b>Calcular</b> para configurar un periodo y generar la prenómina.</div>';

  function generarPrenomina() {
    const ini = modal.querySelector("[data-pn-inicio]").value;
    const fin = modal.querySelector("[data-pn-fin]").value;
    if (!ini || !fin) { toast("Captura las dos fechas del periodo", "warn"); return; }
    if (fin < ini) { toast("La fecha de fin no puede ser antes que la de inicio", "warn"); return; }
    const dias = Math.round((new Date(fin + "T12:00:00") - new Date(ini + "T12:00:00")) / 86400000) + 1;

    const todos = window.CONTATECK_EMPLEADOS_REAL_PG;
    if (!Array.isArray(todos)) { toast("Los empleados aún no terminan de cargar — espera unos segundos.", "warn"); return; }
    const periodo = periodicidadElegida();
    // Doble filtro:
    //  1) SOLO estado "ok" (baja/incapacidad/maternidad/permiso fuera).
    //  2) Coincidencia EXACTA de periodicidad — un empleado quincenal NO
    //     aparece en la corrida semanal ni al revés. Así no se revuelven
    //     la nómina operativa y la administrativa. `sueldo_tipo` puede
    //     venir vacío en empleados viejos: se asume "mensual" (default
    //     con el que se migraron) para que no se pierdan.
    const activos = todos.filter(function (e) {
      return e.estado === "ok" && (e.sueldo_tipo || "mensual") === periodo;
    });
    if (!activos.length) {
      const etq = (PERIODOS.find(function (x) { return x.v === periodo; }) || {}).t || periodo;
      toast("No hay empleados Activos con periodicidad " + etq + ". Revisa el tipo de sueldo de cada empleado o cambia la periodicidad del periodo.", "warn");
      return;
    }

    pre = {
      periodicidad: periodicidadElegida(), inicio: ini, fin: fin, dias: dias,
      filas: activos.map(function (e) {
        return {
          empleado_id: e.id, nombre: e.nombre, puesto: e.puesto || null,
          salario_diario: Number(e.sueldo) || 0,
          // Fórmula: salario diario × días del periodo (el campo
          // `sueldo` ya contiene el salario diario desde la migración).
          base: round2((Number(e.sueldo) || 0) * dias),
          extras: 0, deducciones: 0, notas: "",
        };
      }),
    };
    cerrarModal();
    renderPrenomina();
  }

  function netoDe(f) { return round2(f.base + f.extras - f.deducciones); }
  function totales() {
    let perc = 0, ded = 0, neto = 0;
    pre.filas.forEach(function (f) { perc += f.base + f.extras; ded += f.deducciones; neto += netoDe(f); });
    return { perc: round2(perc), ded: round2(ded), neto: round2(neto) };
  }

  function etiquetaPeriodo() {
    const p = PERIODOS.find(function (x) { return x.v === pre.periodicidad; });
    return (p ? p.t : pre.periodicidad) + " · " + pre.inicio + " → " + pre.fin + " (" + pre.dias + " días)";
  }

  function renderKpis() {
    const t = totales();
    const set = function (sel, v) { const el = $(sel); if (el) el.textContent = v; };
    set("[data-nom-perc]", "$" + money(t.perc));
    set("[data-nom-ded]", "$" + money(t.ded));
    set("[data-nom-neto]", "$" + money(t.neto));
    set("[data-nom-periodo]", etiquetaPeriodo());
  }

  function restaurarKpis() {
    const set = function (sel, v) { const el = $(sel); if (el) el.textContent = v; };
    set("[data-nom-perc]", "—"); set("[data-nom-ded]", "—"); set("[data-nom-neto]", "—");
    set("[data-nom-periodo]", "Pendiente de definir");
    const desg = $("[data-nom-desglose]");
    if (desg) desg.innerHTML = DESGLOSE_OCIOSO;
  }

  function renderPrenomina() {
    const root = $("[data-prenomina-root]");
    const cardEmp = $("[data-empleados-card]");
    const cardHist = $("[data-historial-nominas-root]");
    if (!root) return;
    // El "Próximamente" del desglose se guarda para restaurarlo al salir.
    const desg = $("[data-nom-desglose]");
    if (desg && desgloseOriginal == null) desgloseOriginal = desg.innerHTML;
    if (desg) desg.innerHTML = "";
    // Se ocultan empleados E historial mientras la prenómina está activa,
    // para que el usuario se concentre solo en el panel de captura.
    if (cardEmp) cardEmp.style.display = "none";
    if (cardHist) cardHist.style.display = "none";

    root.innerHTML =
      '<div class="card" style="margin-bottom:1.2rem">' +
      '<div class="card__head"><h3>Prenómina · ' + etiquetaPeriodo() + "</h3>" +
      '<span class="sub">' + pre.filas.length + " empleado" + (pre.filas.length === 1 ? "" : "s") + " activos</span></div>" +
      '<div style="overflow-x:auto"><table class="tbl">' +
      "<thead><tr><th>Empleado</th><th style=\"text-align:right\">Sueldo base</th>" +
      "<th style=\"text-align:right\">Otras percepciones</th><th style=\"text-align:right\">Deducciones</th>" +
      "<th style=\"text-align:right\">Neto a pagar</th><th>Motivo / Notas</th></tr></thead><tbody>" +
      pre.filas.map(function (f, i) {
        return "<tr><td>" + f.nombre + (f.puesto ? ' <span style="color:var(--faint);font-size:.8rem">· ' + f.puesto + "</span>" : "") + "</td>" +
          '<td class="num" style="text-align:right">$' + money(f.base) + "</td>" +
          '<td style="text-align:right"><input class="pn-inp" type="number" min="0" step="0.01" value="0" data-pn-extra="' + i + '"></td>' +
          '<td style="text-align:right"><input class="pn-inp" type="number" min="0" step="0.01" value="0" data-pn-ded="' + i + '"></td>' +
          '<td class="num pn-neto" style="text-align:right" data-pn-neto="' + i + '">$' + money(netoDe(f)) + "</td>" +
          '<td><input class="pn-nota" type="text" value="" placeholder="Opcional" data-pn-nota="' + i + '"></td></tr>';
      }).join("") +
      "</tbody></table></div>" +
      '<div style="display:flex;justify-content:flex-end;gap:.8rem;margin-top:1rem">' +
      '<button class="btn btn--ghost" data-pn-descartar>Descartar prenómina</button>' +
      '<button class="btn btn--primary" data-pn-aprobar>Aprobar y Pagar Nómina</button></div></div>';

    renderKpis();
  }

  function salirPrenomina() {
    pre = null;
    const root = $("[data-prenomina-root]");
    const cardEmp = $("[data-empleados-card]");
    const cardHist = $("[data-historial-nominas-root]");
    if (root) root.innerHTML = "";
    if (cardEmp) cardEmp.style.display = "";
    if (cardHist) cardHist.style.display = "";
    restaurarKpis();
  }

  /* ---------- Eventos ---------- */
  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-nom-calcular]")) {
      if (!puedeProcesar()) { toast("Tu rol no permite procesar nómina.", "warn"); return; }
      abrirModal(); return;
    }
    if (e.target.closest("[data-pn-cerrar]")) { cerrarModal(); return; }
    if (e.target.closest("[data-pn-generar]")) { generarPrenomina(); return; }
    if (e.target.closest("[data-pn-descartar]")) { salirPrenomina(); return; }
    if (e.target.closest("[data-pn-aprobar]")) { aprobarNomina(); return; }
    const histVer = e.target.closest("[data-hist-ver]");
    if (histVer) { verDetalleNomina(histVer.getAttribute("data-hist-ver")); return; }
    // Periodicidad (seg propio del modal)
    const segBtn = e.target.closest("[data-pn-seg] button");
    if (segBtn) {
      segBtn.parentElement.querySelectorAll("button").forEach(function (b) { b.classList.remove("is-active"); });
      segBtn.classList.add("is-active");
      sugerirFin();
      return;
    }
  });
  document.addEventListener("change", function (e) {
    if (e.target.matches("[data-pn-inicio]")) sugerirFin();
  });
  // Edición en vivo de percepciones/deducciones → recalcula fila y KPIs.
  document.addEventListener("input", function (e) {
    if (!pre) return;
    // Notas: solo se guardan en el estado, no recalculan nada.
    const nt = e.target.getAttribute && e.target.getAttribute("data-pn-nota");
    if (nt != null) {
      const fn = pre.filas[parseInt(nt, 10)];
      if (fn) fn.notas = e.target.value;
      return;
    }
    const ex = e.target.getAttribute && e.target.getAttribute("data-pn-extra");
    const dd = e.target.getAttribute && e.target.getAttribute("data-pn-ded");
    if (ex == null && dd == null) return;
    const i = parseInt(ex != null ? ex : dd, 10);
    const f = pre.filas[i]; if (!f) return;
    const val = round2(parseFloat(e.target.value) || 0);
    if (ex != null) f.extras = val; else f.deducciones = val;
    const celda = $('[data-pn-neto="' + i + '"]');
    if (celda) celda.textContent = "$" + money(netoDe(f));
    renderKpis();
  });

  /* ---------- Aprobar y Pagar (Pieza 4) ---------- */
  function backendUrl() {
    return (window.APP_CONFIG && window.APP_CONFIG.BACKEND_URL) || "https://contateck-backend-production.up.railway.app";
  }
  async function aprobarNomina() {
    if (!pre || !pre.filas.length) return;
    if (!puedeProcesar()) { toast("Tu rol no permite procesar nómina.", "warn"); return; }
    const t = totales();
    // Confirmación explícita — es un registro histórico que no se edita
    // ni se borra después (tabla inmutable), así que se avisa claro.
    const ok = await confirmarBonito(
      "Aprobar y pagar nómina",
      '<p style="color:var(--muted);font-size:.92rem;line-height:1.6">' +
      "Se va a registrar el pago de <b style=\"color:var(--text)\">" + pre.filas.length + " empleado(s)</b> " +
      'con un neto total de <b style="color:var(--text)">$' + money(t.neto) + "</b>.<br>" +
      "Periodo: <b style=\"color:var(--text)\">" + etiquetaPeriodo() + "</b>.<br><br>" +
      '<span style="color:var(--faint);font-size:.85rem">Este registro quedará en el histórico y no se puede editar después.</span></p>',
      "Aprobar y Pagar"
    );
    if (!ok) return;

    const btn = document.querySelector("[data-pn-aprobar]");
    if (btn) { btn.disabled = true; btn.textContent = "Guardando..."; }

    const detalle = pre.filas.map(function (f) {
      return {
        empleado_id: f.empleado_id || null,
        nombre: f.nombre,
        puesto: f.puesto || null,
        salario_diario: f.salario_diario,
        sueldo_base: f.base,
        otras_percepciones: f.extras,
        deducciones: f.deducciones,
        notas: f.notas || null,
      };
    });

    try {
      const token = window.CONTATECK_SUPABASE_TOKEN;
      const resp = await fetch(backendUrl() + "/api/nominas", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({
          periodicidad: pre.periodicidad,
          fechaInicio: pre.inicio,
          fechaFin: pre.fin,
          dias: pre.dias,
          detalle: detalle,
        }),
      });
      const data = await resp.json();
      if (!data.ok) { toast("No se pudo guardar la nómina: " + (data.error || "error"), "warn"); return; }
      toast("Nómina aprobada y guardada · " + pre.filas.length + " empleado(s)", "ok");
      // Conexión Nómina↔Contabilidad: si la nómina se guardó pero la
      // póliza no se pudo generar, se avisa para registrarla a mano.
      if (data.polizaWarning) {
        setTimeout(function () { toast("⚠ Póliza no generada: " + data.polizaWarning, "warn"); }, 500);
      }
      salirPrenomina();
      cargarHistorial();
      // Avisar a Contabilidad para que traiga la póliza recién generada
      // sin que el usuario tenga que recargar la página.
      document.dispatchEvent(new CustomEvent("contateck:nominas-cambio"));
    } catch (e) {
      toast("Error al guardar la nómina: " + e.message, "warn");
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Aprobar y Pagar Nómina"; }
    }
  }

  // ============================================================
  //  Historial de nóminas pagadas (lista + detalle en modal)
  // ============================================================
  function fmtFecha(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear();
  }
  const PERIODO_ETIQUETAS = { semanal: "Semanal", catorcenal: "Catorcenal", quincenal: "Quincenal", mensual: "Mensual" };

  async function cargarHistorial() {
    const root = $("[data-historial-nominas-root]");
    if (!root) return;
    let lista = [];
    try {
      const resp = await fetch(backendUrl() + "/api/nominas", {
        headers: { Authorization: "Bearer " + window.CONTATECK_SUPABASE_TOKEN },
      });
      const data = await resp.json();
      if (data.ok) lista = data.nominas || [];
    } catch (e) { /* sin backend: historial vacío, no rompe la pantalla */ }

    if (!lista.length) {
      root.innerHTML =
        '<div class="card"><div class="card__head"><h3>Historial de nóminas</h3></div>' +
        '<p style="padding:1rem;text-align:center;color:var(--faint);font-size:.9rem">Aún no hay nóminas pagadas. Cuando apruebes una, aparecerá aquí.</p></div>';
      return;
    }
    root.innerHTML =
      '<div class="card"><div class="card__head"><h3>Historial de nóminas</h3>' +
      '<span class="sub">' + lista.length + " nómina" + (lista.length === 1 ? "" : "s") + " pagada" + (lista.length === 1 ? "" : "s") + "</span></div>" +
      '<div style="overflow-x:auto"><table class="tbl">' +
      "<thead><tr><th>Periodo</th><th>Periodicidad</th><th style=\"text-align:right\">Empleados</th>" +
      "<th style=\"text-align:right\">Neto pagado</th><th>Procesada</th><th></th></tr></thead><tbody>" +
      lista.map(function (n) {
        const btnVer = '<button class="btn btn--ghost" style="padding:.35rem .7rem;font-size:.82rem" data-hist-ver="' + n.id + '">Ver</button>';
        return "<tr><td>" + fmtFecha(n.fecha_inicio) + " a " + fmtFecha(n.fecha_fin) + "</td>" +
          "<td>" + (PERIODO_ETIQUETAS[n.periodicidad] || n.periodicidad) + "</td>" +
          '<td class="num" style="text-align:right">' + n.empleados_pagados + "</td>" +
          '<td class="num" style="text-align:right">$' + money(n.total_neto) + "</td>" +
          "<td>" + fmtFecha(n.created_at) + "</td>" +
          '<td style="text-align:right">' + btnVer + "</td></tr>";
      }).join("") +
      "</tbody></table></div></div>";
  }

  async function verDetalleNomina(id) {
    let detalle = [];
    try {
      const resp = await fetch(backendUrl() + "/api/nominas/" + id + "/detalle", {
        headers: { Authorization: "Bearer " + window.CONTATECK_SUPABASE_TOKEN },
      });
      const data = await resp.json();
      if (!data.ok) { toast("No se pudo cargar el detalle: " + (data.error || "error"), "warn"); return; }
      detalle = data.detalle || [];
    } catch (e) { toast("Error al cargar el detalle: " + e.message, "warn"); return; }

    let totNeto = 0;
    detalle.forEach(function (d) { totNeto += Number(d.neto) || 0; });

    const cuerpo =
      '<div style="overflow-x:auto"><table class="tbl">' +
      "<thead><tr><th>Empleado</th><th style=\"text-align:right\">Base</th>" +
      "<th style=\"text-align:right\">Percep.</th><th style=\"text-align:right\">Deduc.</th>" +
      "<th style=\"text-align:right\">Neto</th><th>Notas</th></tr></thead><tbody>" +
      detalle.map(function (d) {
        return "<tr><td>" + d.nombre + (d.puesto ? ' <span style="color:var(--faint);font-size:.8rem">· ' + d.puesto + "</span>" : "") + "</td>" +
          '<td class="num" style="text-align:right">$' + money(d.sueldo_base) + "</td>" +
          '<td class="num" style="text-align:right">$' + money(d.otras_percepciones) + "</td>" +
          '<td class="num" style="text-align:right">$' + money(d.deducciones) + "</td>" +
          '<td class="num" style="text-align:right;font-weight:600">$' + money(d.neto) + "</td>" +
          "<td>" + (d.notas ? d.notas : '<span style="color:var(--faint)">—</span>') + "</td></tr>";
      }).join("") +
      "</tbody></table></div>" +
      '<p style="text-align:right;margin-top:.8rem;font-size:.95rem">Neto total: <b>$' + money(totNeto) + "</b></p>";

    verDetalleModal("Detalle de nómina · " + detalle.length + " empleado(s)", cuerpo);
  }

  // Modal de solo lectura (reutiliza clases .modal). Distinto del de
  // confirmación porque este solo muestra info y se cierra.
  let modalVer = null;
  function verDetalleModal(titulo, cuerpoHtml) {
    if (!modalVer) {
      modalVer = document.createElement("div");
      modalVer.className = "modal";
      modalVer.innerHTML =
        '<div class="modal__scrim" data-ver-cerrar></div>' +
        '<div class="modal__card" style="max-width:760px"><div class="modal__head"><h3 data-ver-title></h3>' +
        '<button class="modal__x" data-ver-cerrar aria-label="Cerrar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>' +
        '<div class="modal__body" data-ver-body></div>' +
        '<div class="modal__foot"><button class="btn btn--primary" data-ver-cerrar>Cerrar</button></div></div>';
      document.body.appendChild(modalVer);
      modalVer.addEventListener("click", function (e) {
        if (e.target.closest("[data-ver-cerrar]")) modalVer.classList.remove("is-open");
      });
    }
    modalVer.querySelector("[data-ver-title]").textContent = titulo;
    modalVer.querySelector("[data-ver-body]").innerHTML = cuerpoHtml;
    modalVer.classList.add("is-open");
  }

  /* ---------- Permisos al cargar: ocultar Calcular si no procesa ---------- */
  (function ocultarSiNoProcesa() {
    let intentos = 0;
    const t = setInterval(function () {
      const btn = $("[data-nom-calcular]");
      if (window.CONTATECK_PERFIL_PG !== undefined || intentos++ > 40) {
        clearInterval(t);
        if (btn && !puedeProcesar()) btn.style.display = "none";
      }
    }, 150);
  })();

  // Al cargar: reemplazar el "Próximamente" que viene en el HTML por el
  // texto nuevo (más preciso). Se hace una sola vez, si no hay prenómina.
  (function pintarDesgloseInicial() {
    let intentos = 0;
    const t = setInterval(function () {
      const desg = $("[data-nom-desglose]");
      if (desg || intentos++ > 40) {
        clearInterval(t);
        if (desg && !pre) desg.innerHTML = DESGLOSE_OCIOSO;
      }
    }, 150);
  })();

  // Cargar el historial al inicio (espera a que exista el token de sesión).
  (function cargarHistorialInicial() {
    let intentos = 0;
    const t = setInterval(function () {
      if (window.CONTATECK_SUPABASE_TOKEN || intentos++ > 40) {
        clearInterval(t);
        if (window.CONTATECK_SUPABASE_TOKEN) cargarHistorial();
      }
    }, 150);
  })();
})();
