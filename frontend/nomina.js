/* ============================================================
   CONTATECK · nomina.js · Prenómina interna (Pieza 3)
   Control interno — calcula ISR (con subsidio) e IMSS obrero con el
   Motor Fiscal 2026 (motorFiscal.js), validado por contabilidad. Desde
   OT-0064 el historial permite "Timbrar" el CFDI de nómina de cada
   empleado en el ambiente de PRUEBAS del PAC (sin efecto fiscal real).

   Flujo: [Calcular] → modal de periodo → Generar Prenómina →
   tabla editable (ISR e IMSS calculados; percepciones y otras
   deducciones capturables, neto en vivo) → Aprobar y Pagar (Pieza 4:
   guarda historial en Postgres). ISR + IMSS + otras deducciones se
   guardan sumados en `deducciones` y, desde OT-0064, también desglosados.
   La cuota patronal es solo informativa: no se guarda ni genera póliza.

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

  /* ---------- Motor Fiscal (ISR / IMSS) ---------- */
  const ANIO_FISCAL = 2026;
  // Días que usa el decreto del subsidio por periodo (mensual = 30.4).
  const DIAS_SUBSIDIO = { semanal: 7, catorcenal: 14, quincenal: 15, mensual: 30.4 };
  // Prima de riesgo de trabajo por defecto: Clase I (oficinas). Cada
  // empresa tiene la suya; solo afecta la cuota patronal informativa.
  const CLASE_RIESGO_DEFAULT = "I";
  let motor = null; // módulo motorFiscal.js (carga perezosa)
  function cargarMotor() {
    if (motor) return Promise.resolve(motor);
    // import() dinámico: nomina.js es un script clásico y el motor es módulo ES.
    return import("./motorFiscal.js").then(function (m) { motor = m; return m; });
  }
  // Años completos de servicio al fin del periodo (mínimo 1, como el motor).
  function aniosAntiguedad(fechaIngreso, fechaFin) {
    if (!fechaIngreso) return { anios: 1, sinFecha: true };
    const a = new Date(String(fechaIngreso).slice(0, 10) + "T12:00:00");
    const b = new Date(fechaFin + "T12:00:00");
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return { anios: 1, sinFecha: true };
    let n = b.getFullYear() - a.getFullYear();
    if (b.getMonth() < a.getMonth() || (b.getMonth() === a.getMonth() && b.getDate() < a.getDate())) n--;
    return { anios: Math.max(1, n), sinFecha: false };
  }
  // Calcula ISR retenido, IMSS obrero y cuota patronal de UNA fila y los
  // deja en la propia fila. Si el motor falla, la fila queda en cero y
  // marcada (f.errFiscal) — nunca se inventa una cifra.
  function calcularImpuestos(f) {
    f.isr = 0; f.imss = 0; f.isrBruto = 0; f.subsidio = 0; f.patronal = 0; f.infonavit = 0; f.sdi = 0; f.errFiscal = null;
    if (!motor) { f.errFiscal = "Motor fiscal no disponible"; return; }
    const percepciones = round2(f.base + f.extras);
    if (!(f.salario_diario > 0) || !(percepciones > 0)) return;
    try {
      const sdi = motor.calcularSDI(f.salario_diario, f.anios).sdi;
      f.sdi = sdi;   // OT-0064: el salario diario integrado va al CFDI de nómina
      const isr = motor.calcularISR({
        baseGravable: percepciones, periodo: pre.periodicidad, dias: DIAS_SUBSIDIO[pre.periodicidad],
        ingresoMensualOrdinario: round2(f.salario_diario * 30), anio: ANIO_FISCAL,
      });
      f.isrBruto = isr.isrBruto; f.subsidio = isr.subsidio; f.isr = isr.isrRetenido;
      f.imss = motor.cuotaObreroIMSS({ sdi: sdi, dias: pre.dias, anio: ANIO_FISCAL }).total;
      const pat = motor.cuotaPatronalIMSS({
        sdi: sdi, dias: pre.dias, anio: ANIO_FISCAL, primaRiesgo: motor.PRIMAS_RIESGO_CLASE[CLASE_RIESGO_DEFAULT],
      });
      f.patronal = pat.total; f.infonavit = pat.infonavit;
    } catch (e) {
      f.isr = 0; f.imss = 0; f.patronal = 0; f.infonavit = 0;
      f.errFiscal = e.message;
    }
  }

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
  // Texto de las tarjetas cuando NO hay prenómina activa. El cálculo de
  // ISR/IMSS ya funciona (Motor Fiscal); solo el timbrado sigue pendiente.
  const DESGLOSE_OCIOSO =
    '<div style="padding:1rem;text-align:center;color:var(--faint);font-size:.9rem">' +
    '<b style="display:block;color:var(--text);margin-bottom:.2rem">Sin periodo activo</b>' +
    'Da clic en <b>Calcular</b> para configurar un periodo y generar la prenómina.</div>';

  async function generarPrenomina() {
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

    // El motor fiscal se carga una sola vez. Si no carga, la prenómina
    // sigue funcionando en modo manual (ISR/IMSS en cero, con aviso).
    try { await cargarMotor(); } catch (err) {
      toast("No se pudo cargar el motor fiscal — ISR e IMSS quedan en cero, captúralos a mano en 'Otras deducciones'.", "warn");
    }

    pre = {
      periodicidad: periodicidadElegida(), inicio: ini, fin: fin, dias: dias,
      filas: activos.map(function (e) {
        const ant = aniosAntiguedad(e.fecha_ingreso, fin);
        return {
          empleado_id: e.id, nombre: e.nombre, puesto: e.puesto || null,
          salario_diario: Number(e.sueldo) || 0,
          // Fórmula: salario diario × días del periodo (el campo
          // `sueldo` ya contiene el salario diario desde la migración).
          base: round2((Number(e.sueldo) || 0) * dias),
          extras: 0, deducciones: 0, notas: "",
          // `deducciones` = "otras deducciones" (captura manual). ISR e
          // IMSS se calculan aparte y se suman al guardar.
          anios: ant.anios, sinFechaIngreso: ant.sinFecha,
          isr: 0, imss: 0, isrBruto: 0, subsidio: 0, patronal: 0, infonavit: 0, errFiscal: null,
        };
      }),
    };
    pre.filas.forEach(calcularImpuestos);
    cerrarModal();
    renderPrenomina();
  }

  function deduccionesDe(f) { return round2(f.isr + f.imss + f.deducciones); }
  function netoDe(f) { return round2(f.base + f.extras - deduccionesDe(f)); }
  function notasConDesglose(f) {
    const partes = [];
    if (f.isr || f.imss) partes.push("ISR $" + money(f.isr) + " · IMSS $" + money(f.imss) + " (motor fiscal " + ANIO_FISCAL + ")");
    if (f.deducciones) partes.push("Otras deducciones $" + money(f.deducciones));
    if (f.notas) partes.push(f.notas);
    return partes.length ? partes.join(" | ") : null;
  }
  // Tooltip del ISR: de dónde sale el retenido.
  function tituloIsr(f) {
    return "ISR " + money(f.isrBruto) + " − subsidio " + money(f.subsidio) + " = " + money(f.isr);
  }
  function totales() {
    let perc = 0, ded = 0, neto = 0, isr = 0, imss = 0, otras = 0, pat = 0, inf = 0;
    pre.filas.forEach(function (f) {
      perc += f.base + f.extras; ded += deduccionesDe(f); neto += netoDe(f);
      isr += f.isr; imss += f.imss; otras += f.deducciones; pat += f.patronal; inf += f.infonavit;
    });
    return {
      perc: round2(perc), ded: round2(ded), neto: round2(neto),
      isr: round2(isr), imss: round2(imss), otras: round2(otras), patronal: round2(pat), infonavit: round2(inf),
    };
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
    renderDesglose(t);
  }

  // Desglose bajo los KPIs: retenciones al trabajador y cuota patronal
  // (informativa — no se guarda ni genera póliza).
  function renderDesglose(t) {
    const desg = $("[data-nom-desglose]");
    if (!desg || !pre) return;
    const fila = function (txt, val, extra) {
      return '<div class="comp__row" style="display:flex;justify-content:space-between;gap:1rem;font-size:.88rem">' +
        "<span>" + txt + "</span><b>" + (extra || "") + "$" + money(val) + "</b></div>";
    };
    const conError = pre.filas.some(function (f) { return f.errFiscal; });
    const sinFecha = pre.filas.filter(function (f) { return f.sinFechaIngreso; }).length;
    desg.innerHTML =
      fila("ISR retenido (con subsidio al empleo)", t.isr) +
      fila("IMSS obrero", t.imss) +
      fila("Otras deducciones (captura manual)", t.otras) +
      '<div style="border-top:1px solid var(--line);padding-top:.7rem">' +
      fila("Cuota patronal IMSS (informativa, Clase I)", t.patronal) +
      fila("Infonavit patronal 5% (aparte)", t.infonavit) +
      '<p style="color:var(--faint);font-size:.76rem;margin:.5rem 0 0;line-height:1.5">Reglas ' + ANIO_FISCAL +
      ": ISR y subsidio por decreto vigente; Cesantía y Vejez patronal con protección de salario mínimo. " +
      "La cuota patronal no se guarda ni genera póliza.</p></div>" +
      (sinFecha ? '<p style="color:#ffcf82;font-size:.8rem;margin:0">⚠ ' + sinFecha + " empleado(s) sin fecha de ingreso: se calculó el IMSS con antigüedad de 1 año.</p>" : "") +
      (conError ? '<p style="color:#ff8f9d;font-size:.8rem;margin:0">⚠ El motor fiscal no pudo calcular a algún empleado; sus ISR/IMSS quedaron en cero. Revisa y captura a mano si aplica.</p>' : "");
  }

  function restaurarKpis() {
    const set = function (sel, v) { const el = $(sel); if (el) el.textContent = v; };
    set("[data-nom-perc]", "—"); set("[data-nom-ded]", "—"); set("[data-nom-neto]", "—");
    set("[data-nom-periodo]", "Sin periodo activo");
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
      "<th style=\"text-align:right\">Otras percepciones</th><th style=\"text-align:right\">ISR</th>" +
      "<th style=\"text-align:right\">IMSS</th><th style=\"text-align:right\">Otras deducciones</th>" +
      "<th style=\"text-align:right\">Neto a pagar</th><th>Motivo / Notas</th></tr></thead><tbody>" +
      pre.filas.map(function (f, i) {
        const aviso = f.sinFechaIngreso
          ? ' <span title="Sin fecha de ingreso: IMSS calculado con antigüedad de 1 año" style="color:#ffcf82;cursor:help">⚠</span>' : "";
        return "<tr><td>" + f.nombre + aviso + (f.puesto ? ' <span style="color:var(--faint);font-size:.8rem">· ' + f.puesto + "</span>" : "") + "</td>" +
          '<td class="num" style="text-align:right">$' + money(f.base) + "</td>" +
          '<td style="text-align:right"><input class="pn-inp" type="number" min="0" step="0.01" value="0" data-pn-extra="' + i + '"></td>' +
          '<td class="num" style="text-align:right" data-pn-isr="' + i + '" title="' + tituloIsr(f) + '">$' + money(f.isr) + "</td>" +
          '<td class="num" style="text-align:right" data-pn-imss="' + i + '">$' + money(f.imss) + "</td>" +
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
    if (e.target.closest("[data-hist-exportar]")) { exportarHistorialNominas(); return; }
    if (e.target.closest("[data-nom-det-exportar]")) { exportarDetalleNomina(); return; }
    const histVer = e.target.closest("[data-hist-ver]");
    if (histVer) { verDetalleNomina(histVer.getAttribute("data-hist-ver")); return; }
    const histRec = e.target.closest("[data-hist-recibos]");
    if (histRec) { imprimirRecibosNomina(histRec.getAttribute("data-hist-recibos")); return; }
    const histTim = e.target.closest("[data-hist-timbrar]");
    if (histTim) { timbrarNominaUI(histTim.getAttribute("data-hist-timbrar")); return; }
    const btnXml = e.target.closest("[data-nom-xml]");
    if (btnXml) { descargarXmlNomina(btnXml.getAttribute("data-nom-xml"), btnXml.getAttribute("data-uuid")); return; }
    const btnPdf = e.target.closest("[data-nom-pdf]"); // OT-0069
    if (btnPdf) { descargarPdfNomina(btnPdf.getAttribute("data-nom-pdf"), btnPdf.getAttribute("data-uuid"), btnPdf); return; }
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
    if (ex != null) {
      f.extras = val;
      // Más percepciones cambian la base gravable: se recalculan ISR/IMSS/patronal.
      calcularImpuestos(f);
      const cIsr = $('[data-pn-isr="' + i + '"]');
      if (cIsr) { cIsr.textContent = "$" + money(f.isr); cIsr.title = tituloIsr(f); }
      const cImss = $('[data-pn-imss="' + i + '"]');
      if (cImss) cImss.textContent = "$" + money(f.imss);
    } else f.deducciones = val;
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
        // ISR + IMSS + otras deducciones, sumados (el esquema no cambia).
        deducciones: deduccionesDe(f),
        // OT-0064: desglose por separado (el CFDI de nómina lo necesita). Sin el SQL aplicado en la base, la función lo ignora.
        isr_bruto: f.isrBruto, isr_retenido: f.isr, subsidio: f.subsidio, imss: f.imss, otras_deducciones: f.deducciones, sdi: f.sdi || null,
        // El desglose queda en las notas para poder auditarlo después.
        notas: notasConDesglose(f),
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
    // Una fecha sin hora (AAAA-MM-DD) NO pasa por Date: en México se leería como el día anterior (zona horaria).
    const solo = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
    if (solo) return solo[3] + "/" + solo[2] + "/" + solo[1];
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear();
  }
  const PERIODO_ETIQUETAS = { semanal: "Semanal", catorcenal: "Catorcenal", quincenal: "Quincenal", mensual: "Mensual" };

  let nominasCache = [];
  let ultimoDetalleNomina = null; // OT-0077: lo que muestra la ventana de detalle, para exportarlo
  // OT-0077: exporta a CSV lo que ya ve esta persona (historial o detalle). Solo lee.
  function exportarCsvNomina(prefijo, cols, filas) {
    if (!window.CTExportar) { toast("No se pudo preparar la exportación; recarga la página", "warn"); return; }
    window.CTExportar.descargar(window.CTExportar.nombreArchivo(prefijo), window.CTExportar.csv(cols, filas));
    toast("Exportadas " + filas.length + " fila" + (filas.length === 1 ? "" : "s") + " a CSV");
  }
  function exportarHistorialNominas() {
    if (!nominasCache.length) { toast("No hay nóminas para exportar", "warn"); return; }
    exportarCsvNomina("Nominas", ["Inicio del periodo", "Fin del periodo", "Periodicidad", "Empleados pagados", "Neto pagado", "Procesada"],
      nominasCache.map(function (n) {
        return [String(n.fecha_inicio || "").slice(0, 10), String(n.fecha_fin || "").slice(0, 10), PERIODO_ETIQUETAS[n.periodicidad] || n.periodicidad || "",
          Number(n.empleados_pagados) || 0, Number(n.total_neto) || 0, String(n.created_at || "").slice(0, 10)];
      }));
  }
  function exportarDetalleNomina() {
    const u = ultimoDetalleNomina;
    if (!u || !u.detalle.length) { toast("No hay renglones para exportar", "warn"); return; }
    const n = nominasCache.find(function (x) { return x.id === u.id; });
    const periodo = n ? "_" + String(n.fecha_inicio || "").slice(0, 10) + "_a_" + String(n.fecha_fin || "").slice(0, 10) : "";
    exportarCsvNomina("Nomina_detalle" + periodo, ["Empleado", "Puesto", "Sueldo base", "Otras percepciones", "Deducciones", "Neto", "UUID del CFDI de nómina", "Notas"],
      u.detalle.map(function (d) {
        return [d.nombre, d.puesto || "", Number(d.sueldo_base) || 0, Number(d.otras_percepciones) || 0, Number(d.deducciones) || 0, Number(d.neto) || 0, d.cfdi_uuid || "", d.notas || ""];
      }));
  }
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
    nominasCache = lista;

    if (!lista.length) {
      root.innerHTML =
        '<div class="card"><div class="card__head"><h3>Historial de nóminas</h3></div>' +
        '<p style="padding:1rem;text-align:center;color:var(--faint);font-size:.9rem">Aún no hay nóminas pagadas. Cuando apruebes una, aparecerá aquí.</p></div>';
      return;
    }
    root.innerHTML =
      '<div class="card"><div class="card__head"><h3>Historial de nóminas</h3>' +
      '<span class="sub">' + lista.length + " nómina" + (lista.length === 1 ? "" : "s") + " pagada" + (lista.length === 1 ? "" : "s") + '</span> <button class="btn btn--ghost btn--sm" data-hist-exportar title="Descarga en CSV el historial de nóminas, para abrirlo en Excel">Exportar CSV</button></div>' +
      '<div style="overflow-x:auto"><table class="tbl">' +
      "<thead><tr><th>Periodo</th><th>Periodicidad</th><th style=\"text-align:right\">Empleados</th>" +
      "<th style=\"text-align:right\">Neto pagado</th><th>Procesada</th><th></th></tr></thead><tbody>" +
      lista.map(function (n) {
        const btnVer = '<button class="btn btn--ghost" style="padding:.35rem .7rem;font-size:.82rem" data-hist-ver="' + n.id + '">Ver</button> ' +
          '<button class="btn btn--ghost" style="padding:.35rem .7rem;font-size:.82rem" data-hist-recibos="' + n.id + '">Recibos</button>' +
          (puedeProcesar() ? ' <button class="btn btn--ghost" style="padding:.35rem .7rem;font-size:.82rem" data-hist-timbrar="' + n.id + '">Timbrar</button>' : "");
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
    ultimoDetalleNomina = { id: id, detalle: detalle };

    const cuerpo =
      '<div style="overflow-x:auto"><table class="tbl">' +
      "<thead><tr><th>Empleado</th><th style=\"text-align:right\">Base</th>" +
      "<th style=\"text-align:right\">Percep.</th><th style=\"text-align:right\">Deduc.</th>" +
      "<th style=\"text-align:right\">Neto</th><th>CFDI de nómina</th><th>Notas</th></tr></thead><tbody>" +
      detalle.map(function (d) {
        return "<tr><td>" + escNom(d.nombre) + (d.puesto ? ' <span style="color:var(--faint);font-size:.8rem">· ' + escNom(d.puesto) + "</span>" : "") + "</td>" +
          '<td class="num" style="text-align:right">$' + money(d.sueldo_base) + "</td>" +
          '<td class="num" style="text-align:right">$' + money(d.otras_percepciones) + "</td>" +
          '<td class="num" style="text-align:right">$' + money(d.deducciones) + "</td>" +
          '<td class="num" style="text-align:right;font-weight:600">$' + money(d.neto) + "</td>" +
          "<td>" + celdaCfdi(d) + "</td>" +
          "<td>" + (d.notas ? escNom(d.notas) : '<span style="color:var(--faint)">—</span>') + "</td></tr>";
      }).join("") +
      "</tbody></table></div>" +
      '<p style="text-align:right;margin-top:.8rem;font-size:.95rem">Neto total: <b>$' + money(totNeto) + '</b> &nbsp; <button class="btn btn--ghost btn--sm" data-nom-det-exportar>Exportar CSV</button></p>';

    verDetalleModal("Detalle de nómina · " + detalle.length + " empleado(s)", cuerpo);
  }

  /*RECIBO-INICIO*/
  // OT-0062: recibo de nómina imprimible, uno por empleado. Es un documento INFORMATIVO de la empresa: no es un CFDI de nómina.
  // Todo texto que llegue de la base (nombres, puestos, notas) se escapa.
  function escNom(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function reciboNominaHtml(nomina, detalle, empresa) {
    const periodo = fmtFecha(nomina.fecha_inicio) + " al " + fmtFecha(nomina.fecha_fin);
    const periodicidad = PERIODO_ETIQUETAS[nomina.periodicidad] || nomina.periodicidad || "";
    const fila = function (a, b, fuerte) { return '<tr><td>' + a + '</td><td style="text-align:right;' + (fuerte ? "font-weight:700" : "") + '">' + b + '</td></tr>'; };
    const recibos = (detalle || []).map(function (d) {
      return '<section class="recibo">' +
        '<h1>Recibo de nómina</h1>' +
        '<p class="emp">' + escNom(empresa && empresa.nombre ? empresa.nombre : "") + (empresa && empresa.rfc ? " · RFC " + escNom(empresa.rfc) : "") + '</p>' +
        '<table class="datos">' + fila("Empleado", escNom(d.nombre)) + (d.puesto ? fila("Puesto", escNom(d.puesto)) : "") +
          fila("Periodo", periodo + (periodicidad ? " (" + escNom(periodicidad) + ")" : "")) + fila("Fecha de proceso", fmtFecha(nomina.created_at)) + '</table>' +
        '<table class="importes"><thead><tr><th>Concepto</th><th style="text-align:right">Importe</th></tr></thead><tbody>' +
          fila("Sueldo base", "$" + money(d.sueldo_base)) + fila("Otras percepciones", "$" + money(d.otras_percepciones)) +
          fila("Deducciones (ISR, IMSS y otras)", "-$" + money(d.deducciones)) + fila("Neto pagado", "$" + money(d.neto), true) + '</tbody></table>' +
        (d.notas ? '<p class="notas">Notas: ' + escNom(d.notas) + '</p>' : "") +
        '<div class="firmas"><div>Recibí de conformidad</div><div>Por la empresa</div></div>' +
        (d.cfdi_uuid
          ? '<p class="pie">CFDI de nómina timbrado en el ambiente de PRUEBAS del proveedor de timbrado (sin efecto fiscal). UUID: ' + escNom(d.cfdi_uuid) + '</p>'
          : '<p class="pie">Recibo informativo generado por CONTATECK. No es un CFDI de nómina ni tiene validez fiscal por sí mismo.</p>') +
      '</section>';
    }).join("");
    return '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Recibos de nómina</title><style>' +
      'body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0}.recibo{padding:28px 36px;page-break-after:always}.recibo:last-child{page-break-after:auto}' +
      'h1{font-size:20px;margin:0 0 4px}.emp{margin:0 0 14px;color:#444}table{width:100%;border-collapse:collapse;margin-bottom:14px}' +
      '.datos td{padding:3px 0}.datos td:first-child{color:#555;width:30%}.importes th,.importes td{border-bottom:1px solid #bbb;padding:6px 4px;text-align:left}' +
      '.notas{font-size:12px;color:#444}.firmas{display:flex;gap:40px;margin-top:70px}.firmas div{flex:1;border-top:1px solid #111;padding-top:4px;text-align:center;font-size:12px}' +
      '.pie{margin-top:26px;font-size:10px;color:#666}' +
      '</style></head><body>' + (recibos || '<p style="padding:24px">Esta nómina no tiene empleados.</p>') + '</body></html>';
  }
  /*RECIBO-FIN*/
  /*TIMBRADO-INICIO*/
  // OT-0064: timbrado del CFDI de nómina (ambiente de pruebas del proveedor). Todo texto del servidor se escapa.
  function celdaCfdi(d) {
    if (!d || !d.cfdi_uuid) return '<span style="color:var(--faint)">Sin timbrar</span>';
    return '<span title="' + escNom(d.cfdi_uuid) + '" style="font-size:.8rem">' + escNom(String(d.cfdi_uuid).slice(0, 8)) + "…</span> " +
      '<button class="btn btn--ghost" style="padding:.2rem .5rem;font-size:.75rem" data-nom-xml="' + escNom(d.id) + '" data-uuid="' + escNom(d.cfdi_uuid) + '">XML</button> ' +
      '<button class="btn btn--ghost" style="padding:.2rem .5rem;font-size:.75rem" data-nom-pdf="' + escNom(d.id) + '" data-uuid="' + escNom(d.cfdi_uuid) + '">PDF</button>';
  }
  const ESTADO_TIMBRADO = { timbrado: "Timbrado", ya_timbrado: "Ya estaba timbrado", error: "Error", timbrado_sin_registro: "Timbrado, sin anotar", omitido: "Omitido" };
  function resultadoTimbradoHtml(data) {
    if (!data || !data.ok) return '<p style="color:var(--muted)">' + escNom((data && data.error) || "No se pudo timbrar la nómina.") + "</p>";
    const r = data.resumen || {};
    const filas = (data.resultados || []).map(function (x) {
      const bad = x.estado === "error" || x.estado === "timbrado_sin_registro" || x.estado === "omitido";
      return "<tr><td>" + escNom(x.nombre) + "</td><td>" + escNom(ESTADO_TIMBRADO[x.estado] || x.estado) + "</td>" +
        '<td style="font-size:.82rem;color:' + (bad ? "#ff8f9d" : "var(--muted)") + '">' + escNom(x.error || x.uuid || "") + "</td></tr>";
    }).join("");
    return '<p style="margin:0 0 .8rem">Timbrados: <b>' + Number(r.timbrados || 0) + "</b> · Ya timbrados: <b>" + Number(r.yaTimbrados || 0) +
      "</b> · Con error: <b>" + Number(r.errores || 0) + "</b>" + (r.omitidos ? " · Omitidos: <b>" + Number(r.omitidos) + "</b>" : "") + "</p>" +
      (data.detenido ? '<p style="color:#ffcf82;font-size:.85rem">' + escNom(data.detenido) + "</p>" : "") +
      '<div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Empleado</th><th>Resultado</th><th>UUID o motivo</th></tr></thead><tbody>' + filas + "</tbody></table></div>" +
      '<p style="color:var(--faint);font-size:.8rem;margin-top:.8rem">Ambiente de pruebas del proveedor: estos timbres no tienen efecto fiscal real. Los criterios fiscales del recibo están por validar con un contador.</p>';
  }
  /*TIMBRADO-FIN*/
  async function timbrarNominaUI(id) {
    if (!puedeProcesar()) { toast("Tu rol no permite timbrar nómina.", "warn"); return; }
    const nomina = nominasCache.find(function (n) { return String(n.id) === String(id); });
    if (!nomina) { toast("No se encontró la nómina. Recarga la página.", "warn"); return; }
    const ok = await confirmarBonito(
      "Timbrar nómina",
      '<p style="color:var(--muted);font-size:.92rem;line-height:1.6">Se va a timbrar el CFDI de nómina de cada empleado del periodo <b style="color:var(--text)">' +
      fmtFecha(nomina.fecha_inicio) + " al " + fmtFecha(nomina.fecha_fin) + "</b>.<br>Es el <b>ambiente de pruebas</b> del proveedor: los timbres no tienen efecto fiscal. " +
      "Los empleados que ya están timbrados no se vuelven a timbrar.</p>",
      "Timbrar"
    );
    if (!ok) return;
    toast("Timbrando la nómina…", "ok");
    let data;
    try {
      const resp = await fetch(backendUrl() + "/api/nominas/" + encodeURIComponent(id) + "/timbrar", {
        method: "POST", headers: { Authorization: "Bearer " + window.CONTATECK_SUPABASE_TOKEN },
      });
      data = await resp.json();
    } catch (e) { toast("Error al timbrar: " + e.message, "warn"); return; }
    verDetalleModal("Resultado del timbrado de nómina", resultadoTimbradoHtml(data));
  }
  async function descargarXmlNomina(detalleId, uuid) {
    try {
      const resp = await fetch(backendUrl() + "/api/nominas/detalle/" + encodeURIComponent(detalleId) + "/xml", { headers: { Authorization: "Bearer " + window.CONTATECK_SUPABASE_TOKEN } });
      if (!resp.ok) {
        let m = "No se pudo descargar el XML.";
        try { m = (await resp.json()).error || m; } catch (e) { /* sin cuerpo */ }
        toast(m, "warn"); return;
      }
      const blob = await resp.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "nomina-" + String(uuid || detalleId).replace(/[^\w-]/g, "") + ".xml";
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 1000);
    } catch (e) { toast("Error al descargar el XML: " + e.message, "warn"); }
  }
  // OT-0069: el PDF del CFDI de nómina lo genera el proveedor (puede tardar unos segundos).
  async function descargarPdfNomina(detalleId, uuid, boton) {
    if (boton) { boton.disabled = true; boton.dataset.txt = boton.textContent; boton.textContent = "…"; }
    try {
      const resp = await fetch(backendUrl() + "/api/nominas/detalle/" + encodeURIComponent(detalleId) + "/pdf", { headers: { Authorization: "Bearer " + window.CONTATECK_SUPABASE_TOKEN } });
      if (!resp.ok) {
        let m = "No se pudo generar el PDF.";
        try { m = (await resp.json()).error || m; } catch (e) { /* sin cuerpo */ }
        toast(m, "warn"); return;
      }
      const blob = await resp.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "nomina-" + String(uuid || detalleId).replace(/[^\w-]/g, "") + ".pdf";
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 1000);
    } catch (e) {
      toast("Error al descargar el PDF: " + e.message, "warn");
    } finally {
      if (boton) { boton.disabled = false; boton.textContent = boton.dataset.txt || "PDF"; }
    }
  }
  async function imprimirRecibosNomina(id) {
    const nomina = nominasCache.find(function (n) { return String(n.id) === String(id); });
    if (!nomina) { toast("No se encontró la nómina. Recarga la página.", "warn"); return; }
    let detalle = [];
    try {
      const resp = await fetch(backendUrl() + "/api/nominas/" + id + "/detalle", { headers: { Authorization: "Bearer " + window.CONTATECK_SUPABASE_TOKEN } });
      const data = await resp.json();
      if (!data.ok) { toast("No se pudo cargar el detalle: " + (data.error || "error"), "warn"); return; }
      detalle = data.detalle || [];
    } catch (e) { toast("Error al cargar el detalle: " + e.message, "warn"); return; }
    // Se imprime desde un iframe oculto (no depende de ventanas emergentes).
    const marco = document.createElement("iframe");
    marco.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(marco);
    marco.contentDocument.open(); marco.contentDocument.write(reciboNominaHtml(nomina, detalle, window.CONTATECK_EMPRESA_PG || {})); marco.contentDocument.close();
    setTimeout(function () { marco.contentWindow.focus(); marco.contentWindow.print(); setTimeout(function () { document.body.removeChild(marco); }, 2000); }, 300);
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
