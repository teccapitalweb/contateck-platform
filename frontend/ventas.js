// ============================================================
//  CONTATECK · Módulo Ventas y Pagos
//  - El vendedor registra la venta + sube comprobante -> "En revisión"
//  - Administración valida (Confirmar / Rechazar) desde la bandeja
//  - Alimenta comisiones, facturación y reporte semanal
//  Datos en localStorage (clave contateck_ventas)
// ============================================================
(function () {
  "use strict";

  const K_VENTAS = "contateck_ventas";
  const METODOS = ["SPEI / Transferencia", "Efectivo", "Tarjeta de crédito", "Tarjeta de débito", "Depósito en efectivo", "Otro"];
  const BANCOS = ["BBVA", "Santander", "Banorte", "Citibanamex", "HSBC", "Scotiabank", "Banco Azteca", "Otro"];
  const ESTADOS = {
    revision: { txt: "En revisión", cls: "v-badge--warn" },
    confirmado: { txt: "Confirmado", cls: "v-badge--ok" },
    rechazado: { txt: "Rechazado", cls: "v-badge--bad" },
  };

  // ---------- Datos ----------
  function load() { try { return JSON.parse(localStorage.getItem(K_VENTAS) || "[]"); } catch (e) { return []; } }
  function save(arr) { localStorage.setItem(K_VENTAS, JSON.stringify(arr)); }
  function uid() { return "v" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function money(n) { return "$" + Number(n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function hoy() { return new Date().toISOString().slice(0, 10); }
  function nextFolio() {
    const arr = load();
    let max = 0;
    arr.forEach((v) => { const n = parseInt(String(v.folio || "").replace(/\D/g, ""), 10); if (n > max) max = n; });
    return "P-" + String(max + 1).padStart(4, "0");
  }
  function vendedorActual() {
    const el = document.querySelector("[data-user-name]");
    if (el && el.textContent) return el.textContent.split("·")[0].trim();
    return "Vendedor";
  }
  function fmtFecha(f) {
    if (!f) return "—";
    const d = new Date(f + (f.length === 10 ? "T12:00:00" : ""));
    if (isNaN(d)) return f;
    return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
  }

  // ---------- Toast ----------
  function toast(msg, tipo) {
    let t = document.createElement("div");
    t.className = "v-toast v-toast--" + (tipo || "ok");
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add("show"), 10);
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 2600);
  }

  // ---------- Render principal ----------
  let filtroActual = "todos";
  function render() {
    const root = document.querySelector("[data-ventas-root]");
    if (!root) return;
    root.innerHTML = `
      <div class="page-head">
        <div><h1>Ventas y Pagos</h1><p>Registro de pagos y validación de comprobantes</p></div>
        <div class="page-head__actions">
          <button class="btn btn--primary" data-v-nueva><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>Nueva venta</button>
        </div>
      </div>
      <div class="v-kpis" data-v-kpis></div>
      <div class="card">
        <div class="card__head">
          <h3>Bandeja de pagos</h3>
          <div class="v-filtros" data-v-filtros>
            <button class="v-chip is-on" data-f="todos">Todos</button>
            <button class="v-chip" data-f="revision">En revisión</button>
            <button class="v-chip" data-f="confirmado">Confirmados</button>
            <button class="v-chip" data-f="rechazado">Rechazados</button>
          </div>
        </div>
        <div style="overflow-x:auto">
          <table class="tbl v-tbl">
            <thead><tr><th>Folio</th><th>Alumno</th><th>Curso</th><th>Consultora</th><th style="text-align:right">Importe</th><th>Vendedor</th><th>Fecha</th><th>Estado</th><th></th></tr></thead>
            <tbody data-v-rows></tbody>
          </table>
        </div>
      </div>`;
    renderKpis();
    renderRows();
  }

  function renderKpis() {
    const cont = document.querySelector("[data-v-kpis]");
    if (!cont) return;
    const arr = load();
    const enRev = arr.filter((v) => v.estado === "revision");
    const conf = arr.filter((v) => v.estado === "confirmado");
    const montoConf = conf.reduce((s, v) => s + Number(v.importe || 0), 0);
    const montoRev = enRev.reduce((s, v) => s + Number(v.importe || 0), 0);
    cont.innerHTML = `
      <div class="v-kpi"><span class="v-kpi__l">En revisión</span><b class="v-kpi__n">${enRev.length}</b><span class="v-kpi__s">${money(montoRev)} por validar</span></div>
      <div class="v-kpi"><span class="v-kpi__l">Confirmados</span><b class="v-kpi__n">${conf.length}</b><span class="v-kpi__s">${money(montoConf)} ingresado</span></div>
      <div class="v-kpi"><span class="v-kpi__l">Total registros</span><b class="v-kpi__n">${arr.length}</b><span class="v-kpi__s">esta operación</span></div>
      <div class="v-kpi v-kpi--accent"><span class="v-kpi__l">Ingreso confirmado</span><b class="v-kpi__n">${money(montoConf)}</b><span class="v-kpi__s">pagos validados</span></div>`;
  }

  function renderRows() {
    const tb = document.querySelector("[data-v-rows]");
    if (!tb) return;
    let arr = load().sort((a, b) => (b.creado || 0) - (a.creado || 0));
    if (filtroActual !== "todos") arr = arr.filter((v) => v.estado === filtroActual);
    if (!arr.length) {
      tb.innerHTML = `<tr><td colspan="9" class="v-empty">Sin pagos registrados. Da clic en "Nueva venta" para empezar.</td></tr>`;
      return;
    }
    tb.innerHTML = arr.map((v) => {
      const e = ESTADOS[v.estado] || ESTADOS.revision;
      let acciones = `<button class="v-mini" data-v-ver="${v.id}">Ver</button>`;
      if (v.estado === "revision") {
        acciones += `<button class="v-mini v-mini--ok" data-v-conf="${v.id}">Confirmar</button><button class="v-mini v-mini--bad" data-v-rech="${v.id}">Rechazar</button>`;
      }
      return `<tr>
        <td><b>${v.folio}</b></td>
        <td>${v.alumno || "—"}</td>
        <td>${v.curso || "—"}</td>
        <td>${v.consultora || "—"}</td>
        <td style="text-align:right">${money(v.importe)}</td>
        <td>${v.vendedor || "—"}</td>
        <td>${fmtFecha(v.fechaPago)}</td>
        <td><span class="v-badge ${e.cls}">${e.txt}</span></td>
        <td><div class="v-acc">${acciones}</div></td>
      </tr>`;
    }).join("");
  }

  // ---------- Modal genérico ----------
  let modal = null;
  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement("div");
    modal.className = "v-modal";
    modal.innerHTML = `<div class="v-modal__box"><button class="v-modal__x" data-v-close>&times;</button><div data-v-content></div></div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", (e) => { if (e.target === modal || e.target.closest("[data-v-close]")) closeModal(); });
    return modal;
  }
  function openModal(html) { ensureModal(); modal.querySelector("[data-v-content]").innerHTML = html; modal.classList.add("show"); }
  function closeModal() { if (modal) modal.classList.remove("show"); }

  // ---------- Nueva venta ----------
  let comprobanteB64 = null;
  function openNuevaVenta() {
    comprobanteB64 = null;
    openModal(`
      <h2 class="v-h2">Nueva venta / Registro de pago</h2>
      <p class="v-sub">El pago quedará <b>En revisión</b> hasta que administración lo confirme.</p>
      <div class="v-grid2">
        <div class="v-field"><label>Alumno</label><input class="v-inp" id="v-alumno" placeholder="Nombre del alumno" list="v-alumnos-dl"></div>
        <div class="v-field"><label>Curso</label><input class="v-inp" id="v-curso" placeholder="Nombre del curso"></div>
      </div>
      <div class="v-grid2">
        <div class="v-field"><label>Consultora</label><input class="v-inp" id="v-consultora" placeholder="Ej. IMDAC"></div>
        <div class="v-field"><label>Importe</label><input class="v-inp" id="v-importe" type="number" min="0" step="0.01" placeholder="0.00"></div>
      </div>
      <div class="v-grid2">
        <div class="v-field"><label>Fecha de pago</label><input class="v-inp" id="v-fecha" type="date" value="${hoy()}"></div>
        <div class="v-field"><label>Método de pago</label><select class="v-inp" id="v-metodo">${METODOS.map((m) => `<option>${m}</option>`).join("")}</select></div>
      </div>
      <div class="v-grid2">
        <div class="v-field"><label>Referencia / Folio</label><input class="v-inp" id="v-ref" placeholder="0001234567"></div>
        <div class="v-field"><label>Banco emisor</label><select class="v-inp" id="v-banco">${BANCOS.map((b) => `<option>${b}</option>`).join("")}</select></div>
      </div>
      <div class="v-field"><label>Vendedor</label><input class="v-inp" id="v-vendedor" value="${vendedorActual()}"></div>
      <div class="v-field">
        <label>Comprobante (imagen o PDF)</label>
        <div class="v-file" data-v-file><svg viewBox="0 0 24 24" width="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M5 20h14"/></svg><span data-v-file-txt>Adjuntar imagen, PDF o captura</span><input type="file" id="v-comprobante" accept="image/*,application/pdf" hidden></div>
      </div>
      <div class="v-field"><label>Notas (opcional)</label><textarea class="v-inp" id="v-notas" rows="2" placeholder="Comentarios..."></textarea></div>
      <div class="v-modal__foot">
        <button class="btn btn--ghost" data-v-close>Cancelar</button>
        <button class="btn btn--primary" data-v-guardar>Guardar registro</button>
      </div>
      <datalist id="v-alumnos-dl">${[...new Set(load().map((v) => v.alumno).filter(Boolean))].map((a) => `<option value="${a}">`).join("")}</datalist>`);
  }

  function guardarVenta() {
    const g = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
    const alumno = g("v-alumno"), curso = g("v-curso"), importe = parseFloat(g("v-importe")) || 0;
    if (!alumno) { toast("Captura el nombre del alumno", "warn"); return; }
    if (!importe) { toast("Captura el importe del pago", "warn"); return; }
    const arr = load();
    arr.push({
      id: uid(), folio: nextFolio(), alumno, curso, consultora: g("v-consultora"),
      importe, fechaPago: g("v-fecha"), metodoPago: g("v-metodo"), referencia: g("v-ref"),
      banco: g("v-banco"), vendedor: g("v-vendedor"), notas: g("v-notas"),
      comprobante: comprobanteB64, estado: "revision", creado: Date.now(),
    });
    save(arr);
    closeModal();
    toast("Pago registrado · queda En revisión");
    renderKpis(); renderRows();
  }

  // ---------- Ver detalle ----------
  function verDetalle(id) {
    const v = load().find((x) => x.id === id);
    if (!v) return;
    const e = ESTADOS[v.estado] || ESTADOS.revision;
    let evidencia = `<p class="v-noevi">Sin comprobante adjunto</p>`;
    if (v.comprobante) {
      if (v.comprobante.startsWith("data:application/pdf")) {
        evidencia = `<a class="btn btn--ghost" href="${v.comprobante}" target="_blank">Abrir comprobante PDF</a>`;
      } else {
        evidencia = `<img class="v-evi" src="${v.comprobante}" alt="comprobante">`;
      }
    }
    let acciones = "";
    if (v.estado === "revision") {
      acciones = `<button class="btn btn--ghost v-btn-bad" data-v-rech="${v.id}">Rechazar</button><button class="btn btn--primary" data-v-conf="${v.id}">Confirmar pago</button>`;
    }
    openModal(`
      <h2 class="v-h2">Pago ${v.folio}</h2>
      <span class="v-badge ${e.cls}" style="margin-bottom:.8rem;display:inline-block">${e.txt}</span>
      <div class="v-det">
        ${detRow("Alumno", v.alumno)}${detRow("Curso", v.curso)}${detRow("Consultora", v.consultora)}
        ${detRow("Importe", money(v.importe))}${detRow("Fecha de pago", fmtFecha(v.fechaPago))}${detRow("Método", v.metodoPago)}
        ${detRow("Referencia", v.referencia)}${detRow("Banco", v.banco)}${detRow("Vendedor", v.vendedor)}
        ${v.notas ? detRow("Notas", v.notas) : ""}
      </div>
      <div class="v-evi-wrap"><label class="v-evi-lbl">Comprobante</label>${evidencia}</div>
      <div class="v-modal__foot">${acciones || '<button class="btn btn--ghost" data-v-close>Cerrar</button>'}</div>`);
  }
  function detRow(k, v) { return `<div class="v-det__row"><span>${k}</span><b>${v || "—"}</b></div>`; }

  function confirmar(id) {
    const arr = load(); const v = arr.find((x) => x.id === id);
    if (!v) return;
    v.estado = "confirmado"; v.validado = Date.now();
    save(arr); closeModal();
    toast("Pago confirmado ✓");
    renderKpis(); renderRows();
    // Notificar a otros módulos (comisiones/reporte) que hubo cambio
    document.dispatchEvent(new CustomEvent("contateck:ventas-cambio"));
  }
  function rechazar(id) {
    const arr = load(); const v = arr.find((x) => x.id === id);
    if (!v) return;
    v.estado = "rechazado"; v.validado = Date.now();
    save(arr); closeModal();
    toast("Pago rechazado", "warn");
    renderKpis(); renderRows();
    document.dispatchEvent(new CustomEvent("contateck:ventas-cambio"));
  }

  // ---------- API pública para otros módulos ----------
  window.CTVentas = {
    getVentas: () => load(),
    getConfirmadas: () => load().filter((v) => v.estado === "confirmado"),
  };

  // ---------- Eventos ----------
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-v-nueva]")) { openNuevaVenta(); return; }
    if (e.target.closest("[data-v-guardar]")) { guardarVenta(); return; }
    const ver = e.target.closest("[data-v-ver]"); if (ver) { verDetalle(ver.getAttribute("data-v-ver")); return; }
    const conf = e.target.closest("[data-v-conf]"); if (conf) { confirmar(conf.getAttribute("data-v-conf")); return; }
    const rech = e.target.closest("[data-v-rech]"); if (rech) { rechazar(rech.getAttribute("data-v-rech")); return; }
    const chip = e.target.closest("[data-f]");
    if (chip) {
      filtroActual = chip.getAttribute("data-f");
      document.querySelectorAll("[data-v-filtros] .v-chip").forEach((c) => c.classList.toggle("is-on", c === chip));
      renderRows();
      return;
    }
    const file = e.target.closest("[data-v-file]");
    if (file) { const inp = document.getElementById("v-comprobante"); if (inp) inp.click(); return; }
  });

  document.addEventListener("change", (e) => {
    if (e.target.id === "v-comprobante") {
      const f = e.target.files[0];
      if (!f) return;
      if (f.size > 3 * 1024 * 1024) { toast("El archivo no debe pasar de 3 MB", "warn"); e.target.value = ""; return; }
      const reader = new FileReader();
      reader.onload = () => {
        comprobanteB64 = reader.result;
        const txt = document.querySelector("[data-v-file-txt]");
        if (txt) txt.textContent = f.name + " ✓";
      };
      reader.readAsDataURL(f);
    }
  });

  // Render cuando se entra a la vista (el nav cambia las clases)
  function maybeRender() {
    const sec = document.querySelector('section[data-view="ventas"]');
    if (sec && sec.classList.contains("is-active")) render();
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest('.nav-item[data-view="ventas"]')) setTimeout(render, 30);
  });

  // Primer render por si ya está activa o para tener la data lista
  if (document.readyState !== "loading") setTimeout(maybeRender, 50);
  else document.addEventListener("DOMContentLoaded", () => setTimeout(maybeRender, 50));

  // ---------- CSS ----------
  const css = document.createElement("style");
  css.textContent = `
    [data-ventas-root] .v-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:1.2rem}
    @media(max-width:900px){[data-ventas-root] .v-kpis{grid-template-columns:repeat(2,1fr)}}
    .v-kpi{background:var(--card,#10151f);border:1px solid var(--line,rgba(255,255,255,.07));border-radius:14px;padding:1rem 1.1rem;display:flex;flex-direction:column;gap:.2rem}
    .v-kpi__l{font-size:.78rem;color:var(--muted,#8b98ad)}
    .v-kpi__n{font-size:1.6rem;font-weight:700;color:var(--text,#fff);line-height:1.1}
    .v-kpi__s{font-size:.72rem;color:var(--faint,#5b6677)}
    .v-kpi--accent{background:linear-gradient(135deg,rgba(110,139,255,.16),rgba(110,139,255,.04));border-color:rgba(110,139,255,.3)}
    .v-filtros{display:flex;gap:.4rem;flex-wrap:wrap}
    .v-chip{padding:.35rem .8rem;border-radius:999px;border:1px solid var(--line,rgba(255,255,255,.1));background:transparent;color:var(--muted,#8b98ad);font-size:.8rem;cursor:pointer;font-family:inherit;transition:.15s}
    .v-chip.is-on{background:var(--brand,#6E8BFF);color:#fff;border-color:var(--brand,#6E8BFF)}
    .v-tbl td{vertical-align:middle}
    .v-badge{display:inline-block;padding:.22rem .6rem;border-radius:999px;font-size:.74rem;font-weight:600}
    .v-badge--warn{background:rgba(242,184,75,.16);color:#F2B84B}
    .v-badge--ok{background:rgba(52,211,153,.16);color:#34D399}
    .v-badge--bad{background:rgba(251,113,133,.16);color:#FB7185}
    .v-acc{display:flex;gap:.35rem;justify-content:flex-end}
    .v-mini{padding:.3rem .6rem;border-radius:8px;border:1px solid var(--line,rgba(255,255,255,.12));background:transparent;color:var(--text,#cfd6e2);font-size:.76rem;cursor:pointer;font-family:inherit;white-space:nowrap}
    .v-mini--ok{border-color:rgba(52,211,153,.4);color:#34D399}
    .v-mini--bad{border-color:rgba(251,113,133,.4);color:#FB7185}
    .v-mini:hover{filter:brightness(1.2)}
    .v-empty{text-align:center;color:var(--faint,#5b6677);padding:2rem!important}
    /* Modal */
    .v-modal{position:fixed;inset:0;background:rgba(4,8,15,.66);backdrop-filter:blur(5px);z-index:9000;display:flex;align-items:flex-start;justify-content:center;padding:3vh 1rem;opacity:0;pointer-events:none;transition:.2s;overflow-y:auto}
    .v-modal.show{opacity:1;pointer-events:auto}
    .v-modal__box{background:var(--card,#0e1420);border:1px solid var(--line,rgba(255,255,255,.09));border-radius:18px;max-width:620px;width:100%;padding:1.6rem;position:relative;box-shadow:0 30px 80px rgba(0,0,0,.5)}
    .v-modal__x{position:absolute;top:1rem;right:1.1rem;background:none;border:none;color:var(--muted,#8b98ad);font-size:1.6rem;cursor:pointer;line-height:1}
    .v-h2{font-size:1.25rem;margin:0 0 .2rem;color:var(--text,#fff)}
    .v-sub{font-size:.85rem;color:var(--muted,#8b98ad);margin:0 0 1.1rem}
    .v-grid2{display:grid;grid-template-columns:1fr 1fr;gap:.8rem;margin-bottom:.2rem}
    @media(max-width:560px){.v-grid2{grid-template-columns:1fr}}
    .v-field{margin-bottom:.8rem;display:flex;flex-direction:column;gap:.3rem}
    .v-field label{font-size:.78rem;color:var(--muted,#8b98ad);font-weight:500}
    .v-inp{background:var(--inp,rgba(255,255,255,.04));border:1px solid var(--line,rgba(255,255,255,.1));border-radius:10px;padding:.6rem .75rem;color:var(--text,#fff);font-family:inherit;font-size:.9rem;width:100%}
    .v-inp:focus{outline:none;border-color:var(--brand,#6E8BFF);box-shadow:0 0 0 3px rgba(110,139,255,.14)}
    select.v-inp{cursor:pointer}
    .v-file{display:flex;align-items:center;gap:.6rem;padding:.7rem .8rem;border:1.5px dashed var(--line,rgba(255,255,255,.18));border-radius:10px;color:var(--muted,#8b98ad);cursor:pointer;font-size:.86rem;transition:.15s}
    .v-file:hover{border-color:var(--brand,#6E8BFF);color:var(--text,#fff)}
    .v-modal__foot{display:flex;gap:.6rem;justify-content:flex-end;margin-top:1.2rem}
    .v-det{display:grid;grid-template-columns:1fr 1fr;gap:.5rem .9rem;margin-bottom:1rem}
    @media(max-width:560px){.v-det{grid-template-columns:1fr}}
    .v-det__row{display:flex;flex-direction:column;gap:.1rem;padding:.4rem .6rem;background:rgba(255,255,255,.025);border-radius:8px}
    .v-det__row span{font-size:.72rem;color:var(--faint,#5b6677)}
    .v-det__row b{font-size:.88rem;color:var(--text,#e8edf6);font-weight:600}
    .v-evi-wrap{margin-bottom:.5rem}
    .v-evi-lbl{font-size:.78rem;color:var(--muted,#8b98ad);display:block;margin-bottom:.4rem}
    .v-evi{max-width:100%;border-radius:10px;border:1px solid var(--line,rgba(255,255,255,.1))}
    .v-noevi{color:var(--faint,#5b6677);font-size:.85rem;font-style:italic}
    .v-btn-bad{color:#FB7185;border-color:rgba(251,113,133,.4)}
    /* Toast */
    .v-toast{position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%) translateY(20px);background:var(--card,#10151f);border:1px solid var(--line,rgba(255,255,255,.12));color:var(--text,#fff);padding:.8rem 1.2rem;border-radius:12px;font-size:.88rem;z-index:9500;opacity:0;transition:.3s;box-shadow:0 16px 40px rgba(0,0,0,.4)}
    .v-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
    .v-toast--ok{border-left:3px solid #34D399}
    .v-toast--warn{border-left:3px solid #F2B84B}`;
  document.head.appendChild(css);
})();
