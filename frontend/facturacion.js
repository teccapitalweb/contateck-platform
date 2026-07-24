/* ============================================================
   CONTATECK · Facturación CFDI 4.0 (conexión con el backend)
   - Abre un formulario para capturar receptor + conceptos.
   - Llama al backend en Railway para timbrar de verdad.
   - Muestra el UUID (folio fiscal) y permite ver el PDF/XML.
   ============================================================ */
(function () {
  "use strict";

  // URL del backend de timbrado en Railway.
  const BACKEND = "https://contateck-backend-production.up.railway.app";

  // Catálogo corto de Uso de CFDI (los más comunes).
  const USOS = [
    ["G03", "G03 · Gastos en general"],
    ["G01", "G01 · Adquisición de mercancías"],
    ["P01", "P01 · Por definir"],
    ["S01", "S01 · Sin obligaciones fiscales"],
    ["I01", "I01 · Construcciones"],
    ["D01", "D01 · Honorarios médicos"],
  ];

  // Catálogo c_RegimenFiscal del SAT. [clave, etiqueta, aplicaFísica, aplicaMoral]
  // El SAT valida que el régimen corresponda al tipo de persona del RFC.
  const REGIMENES_SAT = [
    ["601", "601 · General de Ley Personas Morales", false, true],
    ["603", "603 · Personas Morales con Fines no Lucrativos", false, true],
    ["605", "605 · Sueldos y Salarios", true, false],
    ["606", "606 · Arrendamiento", true, false],
    ["607", "607 · Enajenación o Adquisición de Bienes", true, false],
    ["608", "608 · Demás ingresos", true, false],
    ["610", "610 · Residentes en el Extranjero", true, true],
    ["611", "611 · Ingresos por Dividendos", true, false],
    ["612", "612 · Personas Físicas con Actividades Empresariales", true, false],
    ["614", "614 · Ingresos por intereses", true, false],
    ["615", "615 · Ingresos por obtención de premios", true, false],
    ["616", "616 · Sin obligaciones fiscales", true, false],
    ["620", "620 · Sociedades Cooperativas de Producción", false, true],
    ["621", "621 · Incorporación Fiscal", true, false],
    ["622", "622 · Actividades Agrícolas, Ganaderas, Pesqueras", true, true],
    ["623", "623 · Opcional para Grupos de Sociedades", false, true],
    ["624", "624 · Coordinados", false, true],
    ["625", "625 · Actividades Empresariales con ingresos por Plataformas", true, false],
    ["626", "626 · Régimen Simplificado de Confianza (RESICO)", true, true],
  ];
  // Muestra TODOS los regímenes, agrupados por tipo de persona para guiar la elección.
  // El SAT igual valida que el régimen corresponda al RFC, por eso van etiquetados.
  function regimenOptions(rfc, selected) {
    const len = (rfc || "").trim().length;
    const def = selected || (len === 13 ? "612" : "601");
    const opt = (r) => `<option value="${r[0]}"${r[0] === def ? " selected" : ""}>${r[1]}</option>`;
    const morales = REGIMENES_SAT.filter((r) => r[3] && !r[2]);
    const fisicas = REGIMENES_SAT.filter((r) => r[2] && !r[3]);
    const ambos = REGIMENES_SAT.filter((r) => r[2] && r[3]);
    return `<optgroup label="— Personas Morales (RFC 12 letras) —">${morales.map(opt).join("")}</optgroup>` +
           `<optgroup label="— Personas Físicas (RFC 13 letras) —">${fisicas.map(opt).join("")}</optgroup>` +
           `<optgroup label="— Física o Moral —">${ambos.map(opt).join("")}</optgroup>`;
  }

  // Catálogo c_FormaPago del SAT (completo). Los más usados van primero.
  const FORMAS_PAGO_SAT = [
    ["01", "01 · Efectivo"],
    ["03", "03 · Transferencia electrónica"],
    ["04", "04 · Tarjeta de crédito"],
    ["28", "28 · Tarjeta de débito"],
    ["02", "02 · Cheque nominativo"],
    ["99", "99 · Por definir"],
    ["05", "05 · Monedero electrónico"],
    ["06", "06 · Dinero electrónico"],
    ["08", "08 · Vales de despensa"],
    ["12", "12 · Dación en pago"],
    ["13", "13 · Pago por subrogación"],
    ["14", "14 · Pago por consignación"],
    ["15", "15 · Condonación"],
    ["17", "17 · Compensación"],
    ["23", "23 · Novación"],
    ["24", "24 · Confusión"],
    ["25", "25 · Remisión de deuda"],
    ["26", "26 · Prescripción o caducidad"],
    ["27", "27 · A satisfacción del acreedor"],
    ["29", "29 · Tarjeta de servicios"],
    ["30", "30 · Aplicación de anticipos"],
    ["31", "31 · Intermediario pagos"],
  ];

  // ---- Estilos propios mínimos (lo demás reusa las clases de CONTATECK) ----
  const css = `
    .fac-modal{position:fixed;inset:0;z-index:120;display:none;align-items:center;justify-content:center;padding:1.2rem}
    .fac-modal.is-open{display:flex}
    .fac-scrim{position:absolute;inset:0;background:rgba(3,6,15,.66);backdrop-filter:blur(5px)}
    .fac-card{position:relative;width:min(680px,100%);max-height:90vh;overflow:auto;background:var(--surface,#0d1322);
      border:1px solid var(--line-strong,#22304d);border-radius:18px;box-shadow:0 40px 90px -30px rgba(0,0,0,.7)}
    .fac-head{display:flex;align-items:center;justify-content:space-between;padding:1.15rem 1.4rem;border-bottom:1px solid var(--line,#1a2540)}
    .fac-head h3{margin:0;font-size:1.12rem}
    .fac-x{width:34px;height:34px;border-radius:9px;display:grid;place-items:center;border:1px solid var(--line,#1a2540);
      background:transparent;color:var(--muted,#8a96ad);cursor:pointer}
    .fac-x:hover{color:var(--text,#fff);border-color:var(--brand,#6E8BFF)}
    .fac-body{padding:1.3rem 1.4rem}
    .fac-foot{display:flex;gap:.7rem;justify-content:flex-end;padding:1.1rem 1.4rem;border-top:1px solid var(--line,#1a2540)}
    .fac-grid{display:grid;grid-template-columns:1fr 1fr;gap:.9rem}
    .fac-grid--rfc{grid-template-columns:1.4fr .8fr 1.4fr}
    .fac-grid--3{grid-template-columns:1fr 1fr 1fr}
    @media(max-width:560px){.fac-grid--rfc,.fac-grid--3{grid-template-columns:1fr 1fr}}
    .fac-concepto{display:flex;flex-direction:column;gap:.5rem;margin-bottom:.9rem;padding-bottom:.8rem;border-bottom:1px dashed var(--line,#1a2540)}
    .fac-concepto-main{display:grid;grid-template-columns:1fr 88px 116px 34px;gap:.55rem;align-items:end}
    .fac-cant,.fac-precio{text-align:center;padding-left:.5rem;padding-right:.5rem}
    .fac-cant::-webkit-outer-spin-button,.fac-cant::-webkit-inner-spin-button,
    .fac-precio::-webkit-outer-spin-button,.fac-precio::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
    .fac-cant,.fac-precio{-moz-appearance:textfield;appearance:textfield}
    .fac-concepto-sat{display:grid;grid-template-columns:1fr 1fr;gap:.6rem}
    .fac-sat-field{position:relative}
    .fac-sat-field label{font-size:.74rem;color:var(--faint,#5b6680)}
    .fac-sat-results{position:absolute;top:100%;left:0;right:0;z-index:30;margin-top:2px;background:var(--surface,#0d1322);
      border:1px solid var(--line-strong,#22304d);border-radius:10px;max-height:200px;overflow:auto;box-shadow:0 18px 40px -12px rgba(0,0,0,.6);display:none}
    .fac-sat-results.is-open{display:block}
    .fac-sat-opt{padding:.55rem .75rem;cursor:pointer;font-size:.82rem;border-bottom:1px solid var(--line,#1a2540);line-height:1.3}
    .fac-sat-opt:last-child{border-bottom:0}
    .fac-sat-opt:hover{background:var(--brand-soft,rgba(110,139,255,.1))}
    .fac-sat-opt b{color:var(--brand,#6E8BFF);font-family:var(--mono,monospace);font-size:.78rem}
    .fac-sat-hint{padding:.55rem .75rem;font-size:.78rem;color:var(--faint,#5b6680)}
    .fac-concepto .fac-del{height:42px;border-radius:9px;border:1px solid var(--line,#1a2540);background:transparent;
      color:var(--neg,#FB7185);cursor:pointer;display:grid;place-items:center}
    .fac-add{margin-top:.2rem;font-size:.86rem;background:transparent;border:1px dashed var(--line-strong,#22304d);
      color:var(--brand,#6E8BFF);padding:.6rem;border-radius:10px;width:100%;cursor:pointer}
    .fac-add:hover{background:var(--brand-soft,rgba(110,139,255,.08))}
    .fac-reten{margin-top:.9rem;padding:.9rem 1rem;border:1px solid var(--line,#1a2540);border-radius:12px;background:var(--ink-900,rgba(255,255,255,.02))}
    .fac-reten-head{display:flex;align-items:center;gap:.4rem;font-weight:600;font-size:.9rem;margin-bottom:.7rem}
    .fac-reten-head span{font-weight:400;color:var(--faint,#6b7a99);font-size:.76rem}
    .fac-reten-row{display:flex;justify-content:space-between;align-items:center;gap:.7rem;margin-bottom:.5rem}
    .fac-check{display:flex;align-items:center;gap:.5rem;font-size:.88rem;cursor:pointer}
    .fac-check input{width:auto;margin:0;cursor:pointer}
    .fac-ret-tasa{display:flex;align-items:center;gap:.35rem}
    .fac-ret-tasa input{width:100px;text-align:right}
    .fac-ret-tasa input:disabled{opacity:.4}
    .fac-ret-tasa span{color:var(--muted,#8a93a6);font-size:.88rem}
    .fac-reten-hint{font-size:.74rem;color:var(--faint,#6b7a99);margin:.5rem 0 0;line-height:1.4}
    .fac-total{display:flex;justify-content:space-between;align-items:baseline;margin-top:1rem;padding-top:.9rem;
      border-top:1px dashed var(--line,#1a2540);font-family:var(--mono,monospace)}
    .fac-total b{font-size:1.3rem}
    .fac-result{text-align:center;padding:.5rem 0}
    .fac-result .uuid{font-family:var(--mono,monospace);font-size:.95rem;background:var(--brand-soft,rgba(110,139,255,.1));
      padding:.7rem 1rem;border-radius:10px;word-break:break-all;margin:.7rem 0;color:var(--text,#fff)}
    .fac-badge{display:inline-block;padding:.3rem .8rem;border-radius:999px;font-size:.8rem;font-weight:600;
      background:rgba(52,211,153,.14);color:var(--pos,#34D399);margin-bottom:.4rem}
    .fac-logo-tip{display:flex;gap:.55rem;text-align:left;align-items:flex-start;margin-top:1rem;padding:.8rem .9rem;
      border-radius:12px;background:rgba(242,184,75,.1);border:1px solid rgba(242,184,75,.28);
      color:var(--text,#e8edf6);font-size:.84rem;line-height:1.4}
    .fac-logo-tip svg{color:var(--gold,#F2B84B)}
    .btn--sm{padding:.4rem .8rem;font-size:.8rem}
    .fac-spin{display:inline-block;width:18px;height:18px;border:2.5px solid rgba(255,255,255,.25);
      border-top-color:#fff;border-radius:50%;animation:facspin .7s linear infinite;vertical-align:middle}
    @keyframes facspin{to{transform:rotate(360deg)}}
    .fac-err{background:rgba(251,113,133,.12);border:1px solid rgba(251,113,133,.3);color:var(--neg,#FB7185);
      padding:.8rem 1rem;border-radius:10px;font-size:.88rem;margin-top:.8rem}
    .perfil-lista{display:flex;flex-direction:column;gap:.6rem;margin:.4rem 0}
    .perfil-row{display:flex;align-items:center;gap:.8rem;padding:.7rem .85rem;border:1px solid var(--line,#1a2540);
      border-radius:12px;background:var(--surface-2,rgba(255,255,255,.02))}
    .perfil-row.is-activo{border-color:var(--brand,#6E8BFF);box-shadow:0 0 0 1px var(--brand,#6E8BFF) inset}
    .perfil-logo{width:46px;height:46px;border-radius:9px;flex-shrink:0;display:grid;place-items:center;overflow:hidden;
      background:var(--surface,#0d1322);border:1px solid var(--line,#1a2540);color:var(--faint,#5b6680);font-size:.8rem}
    .perfil-logo img{width:100%;height:100%;object-fit:contain}
    .perfil-info{flex:1;display:flex;flex-direction:column;gap:.25rem;min-width:0}
    .perfil-info b{font-size:.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .perfil-color{width:16px;height:16px;border-radius:5px;display:inline-block;border:1px solid rgba(255,255,255,.2)}
    .perfil-badge{font-size:.7rem;font-weight:700;color:var(--brand,#6E8BFF);background:var(--brand-soft,rgba(110,139,255,.12));
      padding:.12rem .5rem;border-radius:999px}
    .perfil-acts{display:flex;gap:.35rem;flex-shrink:0}
    .perfil-btn{padding:.4rem .7rem!important;font-size:.78rem!important}
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  // ---- Inyectar el modal ----
  const modal = document.createElement("div");
  modal.className = "fac-modal";
  modal.innerHTML = `
    <div class="fac-scrim" data-fac-close></div>
    <div class="fac-card">
      <div class="fac-head">
        <h3 data-fac-title>Timbrar CFDI 4.0</h3>
        <button class="fac-x" data-fac-close aria-label="Cerrar">✕</button>
      </div>
      <div class="fac-body" data-fac-content></div>
    </div>`;
  document.body.appendChild(modal);
  const content = modal.querySelector("[data-fac-content]");

  const money = (n) => "$" + Number(n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ---- Catálogo de clientes/productos guardados (desde Firestore) ----
  function getClientesList() { return (window.CTData && window.CTData.getClientes) ? window.CTData.getClientes() : []; }
  function getProductosList() { return (window.CTData && window.CTData.getProductos) ? window.CTData.getProductos() : []; }
  function clienteOptions() {
    return getClientesList().map((c, i) => `<option value="${i}">${(c.nombre || "").slice(0, 40)} · ${c.rfc}</option>`).join("");
  }
  function productoOptions() {
    return getProductosList().map((p, i) => `<option value="${i}">${(p.descripcion || "").slice(0, 45)} · $${Number(p.precioUnitario || 0).toFixed(2)}</option>`).join("");
  }

  function conceptoRow(c = {}) {
    const claveProd = c.claveProdServ || "";
    const claveProdTxt = c.claveProdServTxt || "";
    const claveUnidad = c.claveUnidad || "E48";
    const claveUnidadTxt = c.claveUnidadTxt || "E48 · Unidad de servicio";
    return `
      <div class="fac-concepto">
        <div class="fac-concepto-main">
          <div class="field" style="margin:0">
            <label>Descripción</label>
            <input class="input fac-desc" placeholder="Ej. Consultoría contable" value="${c.descripcion || ""}">
          </div>
          <div class="field" style="margin:0">
            <label>Cant.</label>
            <input class="input fac-cant" type="number" min="1" step="1" value="${c.cantidad || 1}">
          </div>
          <div class="field" style="margin:0">
            <label>P. unitario</label>
            <input class="input fac-precio" type="number" min="0" step="0.01" placeholder="0.00" value="${c.precioUnitario || ""}">
          </div>
          <button class="fac-del" title="Quitar">✕</button>
        </div>
        <div class="fac-concepto-sat">
          <div class="field fac-sat-field" style="margin:0">
            <label>Clave SAT producto/servicio</label>
            <input class="input fac-clave-busca" data-cat="SatProductCodes" placeholder="Escribe para buscar… (ej. capacitación)" autocomplete="off" value="${claveProdTxt}">
            <input type="hidden" class="fac-clave-val" value="${claveProd}">
            <div class="fac-sat-results"></div>
          </div>
          <div class="field fac-sat-field" style="margin:0">
            <label>Unidad</label>
            <input class="input fac-unidad-busca" data-cat="SatUnitMeasurements" placeholder="Ej. servicio, pieza, kg…" autocomplete="off" value="${claveUnidadTxt}">
            <input type="hidden" class="fac-unidad-val" value="${claveUnidad}">
            <div class="fac-sat-results"></div>
          </div>
        </div>
      </div>`;
  }

  function leerRetenciones(sub) {
    let retIva = 0, retIsr = 0, tasaIva = 0, tasaIsr = 0;
    const ivaOn = content.querySelector(".fac-ret-iva-on");
    const isrOn = content.querySelector(".fac-ret-isr-on");
    if (ivaOn && ivaOn.checked) { tasaIva = parseFloat(content.querySelector(".fac-ret-iva-tasa").value) || 0; retIva = sub * (tasaIva / 100); }
    if (isrOn && isrOn.checked) { tasaIsr = parseFloat(content.querySelector(".fac-ret-isr-tasa").value) || 0; retIsr = sub * (tasaIsr / 100); }
    return { retIva, retIsr, tasaIva, tasaIsr };
  }

  function recalcTotal() {
    const r2 = (n) => Math.round(n * 100) / 100;
    let sub = 0;
    content.querySelectorAll(".fac-concepto").forEach((row) => {
      const cant = parseFloat(row.querySelector(".fac-cant").value) || 0;
      const precio = parseFloat(row.querySelector(".fac-precio").value) || 0;
      sub += cant * precio;
    });
    sub = r2(sub);
    const iva = r2(sub * 0.16);
    const r = leerRetenciones(sub);
    const retIva = r2(r.retIva), retIsr = r2(r.retIsr);
    const tot = r2(sub + iva - retIva - retIsr); // cada componente ya redondeado (regla SAT)
    const el = content.querySelector("[data-fac-total]");
    if (el) el.textContent = money(tot);
    const elSub = content.querySelector("[data-fac-sub]");
    if (elSub) {
      let txt = money(sub) + " + IVA " + money(iva);
      if (retIva > 0) txt += " − Ret.IVA " + money(retIva);
      if (retIsr > 0) txt += " − ISR " + money(retIsr);
      elSub.textContent = txt;
    }
  }

  function renderForm() {
    content.innerHTML = `
      <div class="field" style="margin-bottom:.6rem">
        <label>Marca / Consultora <span style="color:var(--faint);font-weight:400;font-size:.76rem">— logo del PDF</span></label>
        <select class="input" id="fac-marca">${marcaOptions()}</select>
      </div>
      <div class="field" style="margin-bottom:.6rem">
        <label>Cliente guardado <span style="color:var(--faint);font-weight:400;font-size:.76rem">— opcional</span></label>
        <div style="display:flex;gap:.5rem;align-items:stretch">
          <select class="input" id="fac-cliente-sel" style="flex:1">
            <option value="">— Capturar nuevo o elegir guardado —</option>
            ${clienteOptions()}
          </select>
          <button type="button" class="btn btn--ghost" id="fac-guardar-cliente" style="white-space:nowrap;padding:0 .9rem" title="Guardar el receptor actual como cliente">＋ Guardar</button>
        </div>
      </div>
      <div class="fac-grid fac-grid--rfc">
        <div class="field">
          <label>RFC del receptor</label>
          <input class="input" id="fac-rfc" placeholder="XAXX010101000" value="EKU9003173C9" style="text-transform:uppercase">
        </div>
        <div class="field">
          <label>C.P. fiscal</label>
          <input class="input" id="fac-cp" placeholder="42501" value="42501" maxlength="5" inputmode="numeric">
        </div>
        <div class="field">
          <label>Régimen fiscal</label>
          <select class="input" id="fac-regimen">
            ${regimenOptions("EKU9003173C9", "601")}
          </select>
        </div>
      </div>
      <div class="field">
        <label>Nombre / Razón social del receptor</label>
        <input class="input" id="fac-nombre" placeholder="Razón social" value="ESCUELA KEMPER URGATE" style="text-transform:uppercase">
      </div>
      <div class="fac-grid fac-grid--3">
        <div class="field">
          <label>Uso de CFDI</label>
          <select class="input" id="fac-uso">
            ${USOS.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>Método de pago</label>
          <select class="input" id="fac-metodo">
            <option value="PUE">PUE · Pago en una sola exhibición</option>
            <option value="PPD">PPD · Pago en parcialidades/diferido (REP)</option>
          </select>
        </div>
        <div class="field">
          <label>Forma de pago</label>
          <select class="input" id="fac-forma">
            ${FORMAS_PAGO_SAT.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}
          </select>
        </div>
      </div>

      <div class="field" style="margin-bottom:.5rem">
        <label>Conceptos</label>
        <select class="input" id="fac-prod-add" style="margin-top:.35rem">
          <option value="">＋ Agregar desde producto guardado…</option>
          ${productoOptions()}
        </select>
      </div>
      <div data-fac-conceptos>${conceptoRow()}</div>
      <button class="fac-add" data-fac-add>+ Agregar concepto</button>

      <div class="fac-reten">
        <div class="fac-reten-head">
          <svg viewBox="0 0 24 24" width="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          Retenciones <span>— opcional, para servicios profesionales</span>
        </div>
        <div class="fac-reten-row">
          <label class="fac-check"><input type="checkbox" class="fac-ret-iva-on"> Retención de IVA</label>
          <div class="fac-ret-tasa"><input class="input fac-ret-iva-tasa" type="number" step="0.0001" min="0" max="100" value="10.6667" disabled><span>%</span></div>
        </div>
        <div class="fac-reten-row">
          <label class="fac-check"><input type="checkbox" class="fac-ret-isr-on"> Retención de ISR</label>
          <div class="fac-ret-tasa"><input class="input fac-ret-isr-tasa" type="number" step="0.0001" min="0" max="100" value="10" disabled><span>%</span></div>
        </div>
        <p class="fac-reten-hint">Servicios profesionales (persona física): IVA 10.6667% · ISR 10%. RESICO: ISR 1.25%.</p>
      </div>

      <div class="fac-total">
        <span style="color:var(--muted)">Subtotal: <span data-fac-sub>$0.00</span></span>
        <span>Total: <b data-fac-total>$0.00</b></span>
      </div>

      <div data-fac-msg></div>

      <div class="fac-foot" style="border:0;padding:1.2rem 0 0">
        <button class="btn btn--ghost" data-fac-close>Cancelar</button>
        <button class="btn btn--primary" data-fac-timbrar>
          <svg viewBox="0 0 24 24" width="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l4 4L19 6"/></svg>
          Timbrar factura
        </button>
      </div>`;

    // Nota de pruebas
    const nota = document.createElement("p");
    nota.style.cssText = "font-size:.78rem;color:var(--faint,#6b7a99);margin-top:.9rem;text-align:center";
    nota.textContent = "Ambiente de pruebas · emisor de prueba del SAT · sin validez fiscal";
    content.appendChild(nota);

    recalcTotal();
  }

  async function timbrar() {
    const rfc = content.querySelector("#fac-rfc").value.trim().toUpperCase();
    const nombre = content.querySelector("#fac-nombre").value.trim().toUpperCase();
    const usoCfdi = content.querySelector("#fac-uso").value;
    const cpEl = content.querySelector("#fac-cp");
    const cp = cpEl ? cpEl.value.trim() : "";
    const regEl = content.querySelector("#fac-regimen");
    const regimen = regEl ? regEl.value : "";
    const metodoEl = content.querySelector("#fac-metodo");
    const metodoPago = metodoEl ? metodoEl.value : "PUE";
    const formaEl = content.querySelector("#fac-forma");
    const formaPago = formaEl ? formaEl.value : "01";
    const marcaEl = content.querySelector("#fac-marca");
    const perfilId = marcaEl ? marcaEl.value : "";

    const conceptos = [];
    content.querySelectorAll(".fac-concepto").forEach((row) => {
      const descripcion = row.querySelector(".fac-desc").value.trim();
      const cantidad = parseFloat(row.querySelector(".fac-cant").value) || 0;
      const precioUnitario = parseFloat(row.querySelector(".fac-precio").value) || 0;
      const claveProdServ = (row.querySelector(".fac-clave-val") || {}).value || "";
      const claveUnidad = (row.querySelector(".fac-unidad-val") || {}).value || "";
      if (descripcion && cantidad > 0 && precioUnitario > 0) {
        const cpt = { descripcion, cantidad, precioUnitario };
        if (claveProdServ) cpt.claveProdServ = claveProdServ;
        if (claveUnidad) cpt.claveUnidad = claveUnidad;
        conceptos.push(cpt);
      }
    });

    const msg = content.querySelector("[data-fac-msg]");
    if (!rfc) { msg.innerHTML = `<div class="fac-err">Falta el RFC del receptor.</div>`; return; }
    if (!conceptos.length) { msg.innerHTML = `<div class="fac-err">Agrega al menos un concepto con descripción, cantidad y precio.</div>`; return; }

    // Retenciones (se mandan como decimal al backend para el timbrado)
    const retenciones = {};
    const _ri = content.querySelector(".fac-ret-iva-on");
    const _rs = content.querySelector(".fac-ret-isr-on");
    if (_ri && _ri.checked) { const t = parseFloat(content.querySelector(".fac-ret-iva-tasa").value) || 0; if (t > 0) retenciones.iva = t / 100; }
    if (_rs && _rs.checked) { const t = parseFloat(content.querySelector(".fac-ret-isr-tasa").value) || 0; if (t > 0) retenciones.isr = t / 100; }

    const btn = content.querySelector("[data-fac-timbrar]");
    btn.disabled = true;
    btn.innerHTML = `<span class="fac-spin"></span> Timbrando…`;
    msg.innerHTML = "";

    try {
      const resp = await fetch(BACKEND + "/api/facturar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receptor: { rfc, nombre, usoCfdi, cp, regimen }, conceptos, metodoPago, formaPago, retenciones }),
      });
      const data = await resp.json();

      if (data.ok) {
        // Recordar la marca elegida como activa (para PDF/correo por defecto)
        if (perfilId && window.CTData && window.CTData.setPerfilActivo) {
          try { window.CTData.setPerfilActivo(perfilId); } catch (e) {}
        }
        // Persistir la factura timbrada en la tabla de CFDIs (Firestore).
        try {
          if (window.CTData && typeof window.CTData.addCfdi === "function") {
            window.CTData.addCfdi({
              uuid: data.uuid,
              cliente: nombre || (data.cfdi && data.cfdi.receptorNombre) || rfc,
              total: data.total,
              serie: (data.cfdi && data.cfdi.serie) || "CT",
              cfdiId: data.id,
              metodoPago: metodoPago,
              tipo: "I",
              receptorRfc: rfc,
              perfilId: perfilId,
            });
          }
        } catch (e) { /* la persistencia no debe romper el flujo de timbrado */ }
        // Acumular cliente y productos en el catálogo (silencioso, sin duplicar).
        try {
          if (window.CTData) {
            if (window.CTData.saveCliente) window.CTData.saveCliente({ rfc, nombre, usoCfdi, cp, regimen });
            if (window.CTData.saveProducto) conceptos.forEach((c) => window.CTData.saveProducto({ descripcion: c.descripcion, precioUnitario: c.precioUnitario }));
          }
        } catch (e) { /* el catálogo no debe romper el flujo */ }
        renderResult(data);
      } else {
        btn.disabled = false;
        btn.innerHTML = "Timbrar factura";
        msg.innerHTML = `<div class="fac-err"><b>El PAC rechazó la factura:</b><br>${data.error || "Error desconocido"}${data.details ? "<br><small>" + String(data.details).slice(0, 300) + "</small>" : ""}</div>`;
      }
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = "Timbrar factura";
      msg.innerHTML = `<div class="fac-err">No se pudo conectar con el servidor de timbrado.<br><small>${err.message}</small></div>`;
    }
  }

  function renderResult(data) {
    const id = data.id;
    const perfilId = perfilDeCfdi(id);
    const cfg = (window.CTData && window.CTData.getConfigEmpresa) ? window.CTData.getConfigEmpresa(perfilId) : {};
    const sinLogo = !cfg.logo;
    content.innerHTML = `
      <div class="fac-result">
        <div class="fac-badge">✓ TIMBRADO</div>
        <h3 style="margin:.3rem 0">¡Factura timbrada con éxito!</h3>
        <p style="color:var(--muted);font-size:.9rem">Folio fiscal (UUID) asignado por el SAT:</p>
        <div class="uuid">${data.uuid || "—"}</div>
        <p style="font-size:.95rem">Total: <b>${money(data.total)}</b></p>
        <div style="display:flex;gap:.6rem;justify-content:center;margin-top:1.2rem;flex-wrap:wrap">
          <button class="btn btn--ghost" data-fac-pdf>Ver PDF</button>
          <button class="btn btn--ghost" data-fac-pdf-dl>Descargar PDF</button>
          <button class="btn btn--ghost" data-fac-xml>Ver XML</button>
          <button class="btn btn--primary" data-fac-otra>Timbrar otra</button>
        </div>
        ${sinLogo ? `<div class="fac-logo-tip">
          <svg viewBox="0 0 24 24" width="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
          <div>Tu PDF saldría sin logo. Sube el logo de tu marca para que salga con tu identidad, como una factura profesional.
          <button class="btn btn--ghost btn--sm" data-config-empresa style="margin-top:.5rem;display:block">Configurar logo de marca</button></div>
        </div>` : ""}
        <div data-fac-dl style="margin-top:.8rem"></div>
        <p style="font-size:.76rem;color:var(--faint);margin-top:1rem">Sin validez fiscal (ambiente de pruebas)</p>
      </div>`;

    content.querySelector("[data-fac-otra]").onclick = renderForm;
    content.querySelector("[data-fac-pdf]").onclick = () => verPdfConLogo(id);
    content.querySelector("[data-fac-pdf-dl]").onclick = () => verPdfConLogo(id, "download");
    content.querySelector("[data-fac-xml]").onclick = () => descargar(id, "xml");
  }

  function descargar(id, tipo) {
    const dl = content.querySelector("[data-fac-dl]");
    if (!id) {
      if (dl) dl.innerHTML = `<div class="fac-err">No llegó el ID de la factura; no se puede abrir el ${tipo.toUpperCase()}.</div>`;
      return;
    }
    // El backend devuelve el archivo directo; el navegador lo abre en otra pestaña.
    // Si algo falla, esa pestaña mostrará el error exacto de Fiscalapi.
    window.open(`${BACKEND}/api/cfdi/${id}/${tipo}`, "_blank");
  }

  // ---- Abrir / cerrar ----
  function open() { setTitle("Timbrar CFDI 4.0"); renderForm(); modal.classList.add("is-open"); }
  function close() { modal.classList.remove("is-open"); }
  function setTitle(t) { const el = modal.querySelector("[data-fac-title]"); if (el) el.textContent = t; }

  // ---------- Cancelación de CFDI ----------
  const MOTIVOS = [
    ["02", "02 · Comprobante emitido con errores sin relación"],
    ["03", "03 · No se llevó a cabo la operación"],
    ["04", "04 · Operación nominativa relacionada en factura global"],
    ["01", "01 · Comprobante con errores con relación (requiere sustituto)"],
  ];

  function openCancel(uuid, rowId) {
    setTitle("Cancelar CFDI");
    content.innerHTML = `
      <p style="color:var(--muted);font-size:.9rem;margin-top:0">
        Cancelar este CFDI ante el SAT. Elige el motivo según el catálogo oficial.
      </p>
      <div class="field">
        <label>Motivo de cancelación</label>
        <select class="input" id="fac-motivo">
          ${MOTIVOS.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}
        </select>
      </div>
      <div class="field" id="fac-sustituto-wrap" style="display:none">
        <label>UUID de la factura que lo sustituye</label>
        <input class="input" id="fac-sustituto" placeholder="UUID del CFDI que reemplaza a éste">
      </div>
      <div data-fac-msg></div>
      <div class="fac-foot" style="border:0;padding:1.2rem 0 0">
        <button class="btn btn--ghost" data-fac-close>Volver</button>
        <button class="btn btn--primary" style="background:#FB7185;border-color:#FB7185" data-fac-cancelar="${uuid}::${rowId}">
          Cancelar CFDI
        </button>
      </div>`;
    // Mostrar campo de sustituto solo si el motivo es 01
    const sel = content.querySelector("#fac-motivo");
    const wrap = content.querySelector("#fac-sustituto-wrap");
    sel.addEventListener("change", () => { wrap.style.display = sel.value === "01" ? "" : "none"; });
    modal.classList.add("is-open");
  }

  async function ejecutarCancelacion(uuid, rowId) {
    const motivo = content.querySelector("#fac-motivo").value;
    const sustituto = (content.querySelector("#fac-sustituto") || {}).value || "";
    const msg = content.querySelector("[data-fac-msg]");

    if (motivo === "01" && !sustituto.trim()) {
      msg.innerHTML = `<div class="fac-err">El motivo 01 requiere el UUID de la factura que lo sustituye.</div>`;
      return;
    }

    const btn = content.querySelector("[data-fac-cancelar]");
    btn.disabled = true;
    btn.innerHTML = `<span class="fac-spin"></span> Cancelando…`;
    msg.innerHTML = "";

    try {
      const resp = await fetch(BACKEND + "/api/cancelar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceUuid: uuid, cancellationReasonCode: motivo, replacementUuid: sustituto.trim() || undefined }),
      });
      const data = await resp.json();

      if (data.ok) {
        // Marcar como cancelada en la tabla y Firestore
        try {
          if (window.CTData && typeof window.CTData.markCfdiCancelled === "function") {
            await window.CTData.markCfdiCancelled(rowId);
          }
        } catch (e) { /* no romper el flujo */ }
        content.innerHTML = `
          <div class="fac-result">
            <div class="fac-badge" style="background:rgba(251,113,133,.14);color:#FB7185">✓ CANCELADO</div>
            <h3 style="margin:.3rem 0">CFDI cancelado</h3>
            <p style="color:var(--muted);font-size:.9rem">El comprobante quedó cancelado ante el SAT y se actualizó en tu tabla.</p>
            <div style="margin-top:1.2rem"><button class="btn btn--primary" data-fac-close>Cerrar</button></div>
          </div>`;
      } else {
        btn.disabled = false;
        btn.innerHTML = "Cancelar CFDI";
        msg.innerHTML = `<div class="fac-err"><b>No se pudo cancelar:</b><br>${data.error || "Error desconocido"}${data.details ? "<br><small>" + String(data.details).slice(0, 300) + "</small>" : ""}</div>`;
      }
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = "Cancelar CFDI";
      msg.innerHTML = `<div class="fac-err">No se pudo conectar con el servidor.<br><small>${err.message}</small></div>`;
    }
  }

  // ============================================================
  //  PIEZA 5 y 6 · Nota de crédito, REP, correo y logo de empresa
  // ============================================================
  function getCfdiById(id) {
    const list = (window.CTData && window.CTData.getCfdis) ? window.CTData.getCfdis() : [];
    return list.find((c) => c.id === id) || null;
  }
  function resultadoOK(titulo, uuid, texto) {
    return `<div class="fac-result">
      <div class="fac-badge">✓ LISTO</div>
      <h3 style="margin:.3rem 0">${titulo}</h3>
      ${uuid ? `<div class="uuid">${uuid}</div>` : ""}
      <p style="color:var(--muted);font-size:.9rem">${texto}</p>
      <div style="margin-top:1.2rem"><button class="btn btn--primary" data-fac-close>Cerrar</button></div>
    </div>`;
  }
  function errBox(titulo, data) {
    return `<div class="fac-err"><b>${titulo}:</b><br>${(data && data.error) || "Error desconocido"}${data && data.details ? "<br><small>" + String(data.details).slice(0, 300) + "</small>" : ""}</div>`;
  }

  // ---------- Nota de crédito (CFDI de Egreso) ----------
  const REL_NC = [
    ["01", "01 · Descuento o bonificación"],
    ["03", "03 · Devolución de mercancía"],
  ];
  function openNotaCredito(uuid, rowId) {
    const f = getCfdiById(rowId) || {};
    setTitle("Nota de crédito");
    content.innerHTML = `
      <p style="color:var(--muted);font-size:.9rem;margin-top:0">
        Emitir una nota de crédito sobre la factura <b>${f.folio || ""}</b> (${f.cliente || "—"}).
        Aplica un descuento, devolución o bonificación sin cancelar la factura.
      </p>
      <div class="fac-grid">
        <div class="field">
          <label>Motivo</label>
          <select class="input" id="nc-motivo">${REL_NC.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select>
        </div>
        <div class="field">
          <label>Monto sin IVA</label>
          <input class="input" id="nc-monto" type="number" min="0" step="0.01" placeholder="0.00">
        </div>
      </div>
      <div class="field">
        <label>Concepto</label>
        <input class="input" id="nc-desc" value="Descuento, devolución o bonificación">
      </div>
      <p style="font-size:.78rem;color:var(--faint);margin:.2rem 0 0">El IVA 16% se calcula automáticamente sobre el monto.</p>
      <div data-fac-msg></div>
      <div class="fac-foot" style="border:0;padding:1.2rem 0 0">
        <button class="btn btn--ghost" data-fac-close>Volver</button>
        <button class="btn btn--primary" data-nc-emitir="${uuid}::${rowId}">Emitir nota de crédito</button>
      </div>`;
    modal.classList.add("is-open");
  }
  async function ejecutarNotaCredito(uuid, rowId) {
    const f = getCfdiById(rowId) || {};
    const motivo = content.querySelector("#nc-motivo").value;
    const monto = parseFloat(content.querySelector("#nc-monto").value) || 0;
    const desc = content.querySelector("#nc-desc").value.trim() || "Descuento, devolución o bonificación";
    const msg = content.querySelector("[data-fac-msg]");
    if (!(monto > 0)) { msg.innerHTML = `<div class="fac-err">Captura un monto mayor a cero.</div>`; return; }

    const btn = content.querySelector("[data-nc-emitir]");
    btn.disabled = true; btn.innerHTML = `<span class="fac-spin"></span> Emitiendo…`;
    msg.innerHTML = "";
    try {
      const resp = await fetch(BACKEND + "/api/nota-credito", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receptor: { rfc: f.receptorRfc || "EKU9003173C9", nombre: f.cliente || "ESCUELA KEMPER URGATE" },
          conceptos: [{ descripcion: desc, cantidad: 1, precioUnitario: monto }],
          uuidRelacionado: uuid,
          tipoRelacion: motivo,
        }),
      });
      const data = await resp.json();
      if (data.ok) {
        if (window.CTData && window.CTData.addCfdi) {
          window.CTData.addCfdi({ uuid: data.uuid, cliente: f.cliente || "—", total: data.total, serie: "NC", cfdiId: data.id, tipo: "E" });
        }
        content.innerHTML = resultadoOK("Nota de crédito emitida", data.uuid, "Quedó timbrada y relacionada con la factura original.");
      } else {
        btn.disabled = false; btn.innerHTML = "Emitir nota de crédito";
        msg.innerHTML = errBox("No se pudo emitir la nota de crédito", data);
      }
    } catch (err) {
      btn.disabled = false; btn.innerHTML = "Emitir nota de crédito";
      msg.innerHTML = `<div class="fac-err">No se pudo conectar con el servidor.<br><small>${err.message}</small></div>`;
    }
  }

  // ---------- REP · Complemento de Pago (CFDI de Pago) ----------
  const FORMAS_PAGO = [
    ["03", "03 · Transferencia electrónica"],
    ["01", "01 · Efectivo"],
    ["02", "02 · Cheque nominativo"],
    ["04", "04 · Tarjeta de crédito"],
    ["28", "28 · Tarjeta de débito"],
  ];
  function openREP(uuid, rowId) {
    const f = getCfdiById(rowId) || {};
    const saldo = typeof f.saldo === "number" ? f.saldo : (f.total || 0);
    setTitle("Registrar pago (REP)");
    content.innerHTML = `
      <p style="color:var(--muted);font-size:.9rem;margin-top:0">
        Registrar un pago recibido sobre la factura PPD <b>${f.folio || ""}</b> (${f.cliente || "—"}).
        Se emitirá el Complemento para Recepción de Pagos.
      </p>
      <div style="background:var(--brand-soft,rgba(110,139,255,.08));padding:.7rem 1rem;border-radius:10px;font-size:.86rem;margin-bottom:1rem">
        Saldo pendiente: <b>${money(saldo)}</b>
      </div>
      <div class="fac-grid">
        <div class="field">
          <label>Monto del pago</label>
          <input class="input" id="rep-monto" type="number" min="0" step="0.01" value="${saldo.toFixed(2)}">
        </div>
        <div class="field">
          <label>Forma de pago</label>
          <select class="input" id="rep-forma">${FORMAS_PAGO.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select>
        </div>
      </div>
      <div data-fac-msg></div>
      <div class="fac-foot" style="border:0;padding:1.2rem 0 0">
        <button class="btn btn--ghost" data-fac-close>Volver</button>
        <button class="btn btn--primary" data-rep-emitir="${uuid}::${rowId}">Emitir REP</button>
      </div>`;
    modal.classList.add("is-open");
  }
  async function ejecutarREP(uuid, rowId) {
    const f = getCfdiById(rowId) || {};
    const saldoActual = typeof f.saldo === "number" ? f.saldo : (f.total || 0);
    const monto = parseFloat(content.querySelector("#rep-monto").value) || 0;
    const forma = content.querySelector("#rep-forma").value;
    const msg = content.querySelector("[data-fac-msg]");
    if (!(monto > 0)) { msg.innerHTML = `<div class="fac-err">Captura un monto mayor a cero.</div>`; return; }
    if (monto > saldoActual + 0.01) { msg.innerHTML = `<div class="fac-err">El monto no puede ser mayor al saldo pendiente (${money(saldoActual)}).</div>`; return; }

    const btn = content.querySelector("[data-rep-emitir]");
    btn.disabled = true; btn.innerHTML = `<span class="fac-spin"></span> Emitiendo REP…`;
    msg.innerHTML = "";
    const serie = String(f.folio || "CT").split("-")[0] || "CT";
    const folio = String(f.folio || "1").split("-").pop();
    try {
      const resp = await fetch(BACKEND + "/api/rep", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receptor: { rfc: f.receptorRfc || "EKU9003173C9", nombre: f.cliente || "ESCUELA KEMPER URGATE" },
          pago: { monto, formaPago: forma },
          facturaPagada: { uuid, serie, folio, saldoAnterior: saldoActual, montoPagado: monto, parcialidad: 1, conIva: true },
        }),
      });
      const data = await resp.json();
      if (data.ok) {
        const nuevoSaldo = Math.max(saldoActual - monto, 0);
        if (window.CTData && window.CTData.updateCfdiSaldo) await window.CTData.updateCfdiSaldo(rowId, nuevoSaldo);
        if (window.CTData && window.CTData.addCfdi) {
          window.CTData.addCfdi({ uuid: data.uuid, cliente: f.cliente || "—", total: monto, serie: "PAGO", cfdiId: data.id, tipo: "P" });
        }
        content.innerHTML = resultadoOK("Complemento de pago emitido", data.uuid,
          nuevoSaldo > 0 ? `Pago registrado. Saldo pendiente: ${money(nuevoSaldo)}.` : "Pago registrado. La factura quedó liquidada.");
      } else {
        btn.disabled = false; btn.innerHTML = "Emitir REP";
        msg.innerHTML = errBox("No se pudo emitir el REP", data);
      }
    } catch (err) {
      btn.disabled = false; btn.innerHTML = "Emitir REP";
      msg.innerHTML = `<div class="fac-err">No se pudo conectar con el servidor.<br><small>${err.message}</small></div>`;
    }
  }

  // ---------- Enviar por correo (Fiscalapi manda PDF + XML) ----------
  function openCorreo(cfdiId, rowId) {
    const f = getCfdiById(rowId) || {};
    setTitle("Enviar por correo");
    content.innerHTML = `
      <p style="color:var(--muted);font-size:.9rem;margin-top:0">
        Enviar la factura <b>${f.folio || ""}</b> (PDF + XML) por correo al cliente.
        Se incluye el logo y color de tu empresa si los configuraste.
      </p>
      <div class="field">
        <label>Correo del destinatario</label>
        <input class="input" id="correo-email" type="email" placeholder="cliente@correo.com">
      </div>
      <div data-fac-msg></div>
      <div class="fac-foot" style="border:0;padding:1.2rem 0 0">
        <button class="btn btn--ghost" data-fac-close>Volver</button>
        <button class="btn btn--primary" data-correo-enviar="${cfdiId}::${rowId}">Enviar</button>
      </div>`;
    modal.classList.add("is-open");
  }
  async function ejecutarCorreo(cfdiId) {
    const email = content.querySelector("#correo-email").value.trim();
    const msg = content.querySelector("[data-fac-msg]");
    if (!/.+@.+\..+/.test(email)) { msg.innerHTML = `<div class="fac-err">Captura un correo válido.</div>`; return; }
    const perfilId = perfilDeCfdi(cfdiId);
    const cfg = (window.CTData && window.CTData.getConfigEmpresa) ? window.CTData.getConfigEmpresa(perfilId) : {};

    const btn = content.querySelector("[data-correo-enviar]");
    btn.disabled = true; btn.innerHTML = `<span class="fac-spin"></span> Enviando…`;
    msg.innerHTML = "";
    try {
      const resp = await fetch(BACKEND + "/api/enviar-correo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cfdiId, email, base64Logo: cfg.logo || undefined, bandColor: cfg.color || undefined }),
      });
      const data = await resp.json();
      if (data.ok) content.innerHTML = resultadoOK("Correo enviado", "", `La factura se envió a ${email}.`);
      else { btn.disabled = false; btn.innerHTML = "Enviar"; msg.innerHTML = errBox("No se pudo enviar el correo", data); }
    } catch (err) {
      btn.disabled = false; btn.innerHTML = "Enviar";
      msg.innerHTML = `<div class="fac-err">No se pudo conectar con el servidor.<br><small>${err.message}</small></div>`;
    }
  }

  // ---------- Ver PDF (con logo/color de la marca con que se timbró) ----------
  function perfilDeCfdi(cfdiId) {
    if (window.CTData && window.CTData.getCfdis) {
      const f = window.CTData.getCfdis().find((c) => c.cfdiId === cfdiId);
      if (f) return f.perfilId || "";
    }
    return "";
  }
  async function verPdfConLogo(cfdiId, modo) {
    const perfilId = perfilDeCfdi(cfdiId);
    const cfg = (window.CTData && window.CTData.getConfigEmpresa) ? window.CTData.getConfigEmpresa(perfilId) : {};
    const descargar = modo === "download";
    const conMarca = !!(cfg.logo || cfg.color || cfg.nombre);
    // Ver (no descargar) y sin marca -> abrir directo el PDF propio
    if (!descargar && !conMarca) {
      window.open(`${BACKEND}/api/cfdi/${cfdiId}/pdf-pro`, "_blank");
      return;
    }
    try {
      const resp = conMarca
        ? await fetch(`${BACKEND}/api/cfdi/${cfdiId}/pdf-pro`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ base64Logo: cfg.logo || undefined, bandColor: cfg.color || undefined, marcaNombre: cfg.nombre || undefined }),
          })
        : await fetch(`${BACKEND}/api/cfdi/${cfdiId}/pdf-pro`);
      if (!resp.ok) throw new Error("PDF no disponible");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      if (descargar) {
        const a = document.createElement("a");
        a.href = url; a.download = `CFDI_${cfdiId}.pdf`;
        document.body.appendChild(a); a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
      } else {
        window.open(url, "_blank");
      }
    } catch (e) {
      window.open(`${BACKEND}/api/cfdi/${cfdiId}/pdf`, "_blank"); // respaldo: PDF de Fiscalapi
    }
  }

  // ---------- Marcas / Consultoras (perfiles de branding) ----------
  function openConfigEmpresa() {
    setTitle("Marcas / Consultoras");
    renderListaPerfiles();
    modal.classList.add("is-open");
  }
  function renderListaPerfiles() {
    const perfiles = (window.CTData && window.CTData.getPerfiles) ? window.CTData.getPerfiles() : [];
    const activo = (window.CTData && window.CTData.getPerfilActivo) ? window.CTData.getPerfilActivo() : null;
    const activoId = activo ? activo.id : "";
    const filas = perfiles.length ? perfiles.map((p) => `
      <div class="perfil-row${p.id === activoId ? " is-activo" : ""}">
        <div class="perfil-logo">${p.logo ? `<img src="${p.logo}">` : "—"}</div>
        <div class="perfil-info">
          <b>${escHtml(p.nombre || "Sin nombre")}</b>
          <span style="display:inline-flex;align-items:center;gap:.4rem">
            <span class="perfil-color" style="background:${p.color || "#6E8BFF"}"></span>
            ${p.id === activoId ? '<span class="perfil-badge">Activa</span>' : ""}
          </span>
        </div>
        <div class="perfil-acts">
          ${p.id === activoId ? "" : `<button class="btn btn--ghost perfil-btn" data-perfil-activar="${p.id}">Usar</button>`}
          <button class="btn btn--ghost perfil-btn" data-perfil-editar="${p.id}">Editar</button>
          <button class="btn btn--ghost perfil-btn" data-perfil-borrar="${p.id}" style="color:#FB7185">Borrar</button>
        </div>
      </div>`).join("") : `<p style="color:var(--muted);font-size:.9rem">Aún no tienes marcas. Agrega la primera para ponerle logo y color a tus facturas.</p>`;
    content.innerHTML = `
      <p style="color:var(--muted);font-size:.9rem;margin-top:0">
        Cada marca usa tu mismo RFC, pero su propio logo y color en el PDF y el correo.
        La marca <b>Activa</b> es la que se usa por defecto al facturar.
      </p>
      <div class="perfil-lista">${filas}</div>
      <div class="fac-foot" style="border:0;padding:1.2rem 0 0">
        <button class="btn btn--ghost" data-fac-close>Cerrar</button>
        <button class="btn btn--primary" data-perfil-nuevo>+ Agregar marca</button>
      </div>`;
  }
  function openPerfilForm(id) {
    const p = (id && window.CTData.getPerfilById) ? (window.CTData.getPerfilById(id) || {}) : {};
    setTitle(id ? "Editar marca" : "Nueva marca");
    content.innerHTML = `
      <div class="field">
        <label>Nombre de la marca / consultora</label>
        <input class="input" id="perfil-nombre" placeholder="Ej. AgroTec, OdonTeck, Synova…" value="${escHtml(p.nombre || "")}">
      </div>
      <div class="field">
        <label>Logo (PNG o JPG, máx. 1 MB)</label>
        <input class="input" id="perfil-logo" type="file" accept="image/png,image/jpeg">
        <div id="perfil-logo-prev" style="margin-top:.6rem">${p.logo ? `<img src="${p.logo}" style="max-height:54px;border-radius:8px">` : '<span style="color:var(--faint);font-size:.8rem">Sin logo</span>'}</div>
      </div>
      <div class="field">
        <label>Color de la banda</label>
        <input class="input" id="perfil-color" type="color" value="${p.color || "#6E8BFF"}" style="height:44px;padding:.3rem;width:80px">
      </div>
      <div data-fac-msg></div>
      <div class="fac-foot" style="border:0;padding:1.2rem 0 0">
        <button class="btn btn--ghost" data-perfil-volver>Volver</button>
        <button class="btn btn--primary" data-perfil-guardar="${id || ""}">Guardar marca</button>
      </div>`;
    const fileInput = content.querySelector("#perfil-logo");
    fileInput.addEventListener("change", () => {
      const file = fileInput.files[0];
      if (!file) return;
      if (file.size > 1024 * 1024) {
        content.querySelector("[data-fac-msg]").innerHTML = `<div class="fac-err">El logo no debe pesar más de 1 MB.</div>`;
        fileInput.value = ""; return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const prev = content.querySelector("#perfil-logo-prev");
        prev.innerHTML = `<img src="${reader.result}" style="max-height:54px;border-radius:8px">`;
        prev.dataset.b64 = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }
  function guardarPerfil(id) {
    const nombre = content.querySelector("#perfil-nombre").value.trim();
    const msg = content.querySelector("[data-fac-msg]");
    if (!nombre) { msg.innerHTML = `<div class="fac-err">Ponle un nombre a la marca.</div>`; return; }
    const prev = content.querySelector("#perfil-logo-prev");
    const prevData = (id && window.CTData.getPerfilById) ? (window.CTData.getPerfilById(id) || {}) : {};
    const logo = (prev && prev.dataset.b64) ? prev.dataset.b64 : (prevData.logo || "");
    const color = content.querySelector("#perfil-color").value || "#6E8BFF";
    const perfil = { nombre, logo, color };
    if (id) perfil.id = id;
    if (window.CTData && window.CTData.savePerfil) window.CTData.savePerfil(perfil);
    renderListaPerfiles();
  }
  function marcaOptions() {
    const perfiles = (window.CTData && window.CTData.getPerfiles) ? window.CTData.getPerfiles() : [];
    const activo = (window.CTData && window.CTData.getPerfilActivo) ? window.CTData.getPerfilActivo() : null;
    const activoId = activo ? activo.id : "";
    if (!perfiles.length) return `<option value="">— sin marca (config. arriba) —</option>`;
    return perfiles.map((p) => `<option value="${p.id}"${p.id === activoId ? " selected" : ""}>${escHtml(p.nombre || "Sin nombre")}</option>`).join("");
  }
  function refrescarSelectMarca() {
    const sel = content.querySelector("#fac-marca");
    if (sel) sel.innerHTML = marcaOptions();
  }

  // ---------- Buscador de catálogos del SAT (Pieza 4) ----------
  const escHtml = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  let satSearchTimer = null;
  async function buscarCatalogo(input) {
    const cat = input.getAttribute("data-cat");
    const q = input.value.trim();
    const field = input.closest(".fac-sat-field");
    if (!field) return;
    const box = field.querySelector(".fac-sat-results");
    if (q.length < 3) { box.classList.remove("is-open"); box.innerHTML = ""; return; }
    box.innerHTML = `<div class="fac-sat-hint">Buscando…</div>`;
    box.classList.add("is-open");
    try {
      const resp = await fetch(`${BACKEND}/api/catalogo/${cat}/${encodeURIComponent(q)}`);
      const data = await resp.json();
      if (data.ok && data.items && data.items.length) {
        box.innerHTML = data.items.map((it) => {
          const txt = it.clave + " · " + it.descripcion;
          return `<div class="fac-sat-opt" data-clave="${escHtml(it.clave)}" data-txt="${escHtml(txt)}"><b>${escHtml(it.clave)}</b> · ${escHtml(it.descripcion)}</div>`;
        }).join("");
      } else {
        box.innerHTML = `<div class="fac-sat-hint">Sin resultados para "${escHtml(q)}".</div>`;
      }
    } catch (e) {
      box.innerHTML = `<div class="fac-sat-hint">No se pudo buscar (revisa la conexión).</div>`;
    }
  }
  function cerrarResultadosSat(except) {
    content.querySelectorAll(".fac-sat-results.is-open").forEach((b) => {
      if (!except || !except.contains(b)) b.classList.remove("is-open");
    });
  }

  modal.addEventListener("click", (e) => {
    if (e.target.closest("[data-fac-close]")) close();
    if (e.target.closest("[data-fac-add]")) {
      const cont = content.querySelector("[data-fac-conceptos]");
      cont.insertAdjacentHTML("beforeend", conceptoRow());
      recalcTotal();
    }
    if (e.target.closest(".fac-del")) {
      const rows = content.querySelectorAll(".fac-concepto");
      if (rows.length > 1) { e.target.closest(".fac-concepto").remove(); recalcTotal(); }
    }
    if (e.target.closest("[data-fac-timbrar]")) timbrar();
    if (e.target.closest("#fac-guardar-cliente")) guardarClienteActual();
    const cancelarBtn = e.target.closest("[data-fac-cancelar]");
    if (cancelarBtn) {
      const parts = cancelarBtn.getAttribute("data-fac-cancelar").split("::");
      ejecutarCancelacion(parts[0], parts[1]);
    }
    const ncBtn = e.target.closest("[data-nc-emitir]");
    if (ncBtn) { const p = ncBtn.getAttribute("data-nc-emitir").split("::"); ejecutarNotaCredito(p[0], p[1]); }
    const repBtn = e.target.closest("[data-rep-emitir]");
    if (repBtn) { const p = repBtn.getAttribute("data-rep-emitir").split("::"); ejecutarREP(p[0], p[1]); }
    const correoBtn = e.target.closest("[data-correo-enviar]");
    if (correoBtn) { const p = correoBtn.getAttribute("data-correo-enviar").split("::"); ejecutarCorreo(p[0]); }
    // Gestión de marcas / consultoras
    if (e.target.closest("[data-perfil-nuevo]")) { openPerfilForm(); return; }
    if (e.target.closest("[data-perfil-volver]")) { setTitle("Marcas / Consultoras"); renderListaPerfiles(); return; }
    const pEditar = e.target.closest("[data-perfil-editar]");
    if (pEditar) { openPerfilForm(pEditar.getAttribute("data-perfil-editar")); return; }
    const pGuardar = e.target.closest("[data-perfil-guardar]");
    if (pGuardar) { guardarPerfil(pGuardar.getAttribute("data-perfil-guardar")); return; }
    const pActivar = e.target.closest("[data-perfil-activar]");
    if (pActivar) { if (window.CTData.setPerfilActivo) window.CTData.setPerfilActivo(pActivar.getAttribute("data-perfil-activar")); renderListaPerfiles(); return; }
    const pBorrar = e.target.closest("[data-perfil-borrar]");
    if (pBorrar) { if (window.CTData.deletePerfil) window.CTData.deletePerfil(pBorrar.getAttribute("data-perfil-borrar")); renderListaPerfiles(); return; }
    // Elegir un resultado del buscador de catálogos SAT
    const satOpt = e.target.closest(".fac-sat-opt");
    if (satOpt) {
      const field = satOpt.closest(".fac-sat-field");
      const input = field.querySelector(".fac-clave-busca, .fac-unidad-busca");
      const hidden = field.querySelector(".fac-clave-val, .fac-unidad-val");
      if (input) input.value = satOpt.getAttribute("data-txt");
      if (hidden) hidden.value = satOpt.getAttribute("data-clave");
      field.querySelector(".fac-sat-results").classList.remove("is-open");
      return;
    }
    // Click fuera de un buscador -> cerrar dropdowns abiertos
    if (!e.target.closest(".fac-sat-field")) cerrarResultadosSat();
  });
  modal.addEventListener("input", (e) => {
    // Al cambiar el RFC, filtrar los regímenes válidos (12=moral, 13=física).
    if (e.target.id === "fac-rfc") {
      const rfc = e.target.value.trim().toUpperCase();
      const regSel = content.querySelector("#fac-regimen");
      if (regSel) {
        const prev = regSel.value, fis = rfc.length === 13, mor = rfc.length === 12;
        const valido = REGIMENES_SAT.some((r) => r[0] === prev && ((fis && r[2]) || (mor && r[3]) || (!fis && !mor)));
        if (!valido) regSel.value = fis ? "612" : "601"; // sugiere el correcto; todos siguen disponibles
      }
    }
    if (e.target.classList.contains("fac-cant") || e.target.classList.contains("fac-precio") ||
        e.target.classList.contains("fac-ret-iva-tasa") || e.target.classList.contains("fac-ret-isr-tasa")) recalcTotal();
    if (e.target.classList.contains("fac-clave-busca") || e.target.classList.contains("fac-unidad-busca")) {
      const input = e.target;
      clearTimeout(satSearchTimer);
      satSearchTimer = setTimeout(() => buscarCatalogo(input), 350);
    }
  });

  modal.addEventListener("change", (e) => {
    // Activar/desactivar retenciones
    if (e.target.classList.contains("fac-ret-iva-on")) {
      const t = content.querySelector(".fac-ret-iva-tasa"); if (t) t.disabled = !e.target.checked;
      recalcTotal(); return;
    }
    if (e.target.classList.contains("fac-ret-isr-on")) {
      const t = content.querySelector(".fac-ret-isr-tasa"); if (t) t.disabled = !e.target.checked;
      recalcTotal(); return;
    }
    // Elegir cliente guardado -> autocompletar receptor
    if (e.target.id === "fac-cliente-sel") {
      if (e.target.value === "") return;
      const c = getClientesList()[Number(e.target.value)];
      if (c) {
        const rfcEl = content.querySelector("#fac-rfc");
        const nomEl = content.querySelector("#fac-nombre");
        const usoEl = content.querySelector("#fac-uso");
        if (rfcEl) rfcEl.value = c.rfc || "";
        if (nomEl) nomEl.value = c.nombre || "";
        if (usoEl && c.usoCfdi) usoEl.value = c.usoCfdi;
        const cpEl = content.querySelector("#fac-cp");
        if (cpEl && c.cp) cpEl.value = c.cp;
        const regEl = content.querySelector("#fac-regimen");
        if (regEl && c.regimen) regEl.value = c.regimen;
      }
    }
    // Elegir producto guardado -> agregar un concepto con sus datos
    if (e.target.id === "fac-prod-add") {
      if (e.target.value === "") return;
      const p = getProductosList()[Number(e.target.value)];
      if (p) {
        // Reusar una fila vacía si existe; así no se amontonan conceptos en blanco.
        let vacia = null;
        content.querySelectorAll(".fac-concepto").forEach((row) => {
          const d = row.querySelector(".fac-desc").value.trim();
          const pr = parseFloat(row.querySelector(".fac-precio").value) || 0;
          if (!vacia && !d && !pr) vacia = row;
        });
        if (vacia) {
          vacia.querySelector(".fac-desc").value = p.descripcion || "";
          vacia.querySelector(".fac-precio").value = p.precioUnitario || "";
          vacia.querySelector(".fac-cant").value = 1;
          if (p.claveProdServ) {
            const cv = vacia.querySelector(".fac-clave-val"); if (cv) cv.value = p.claveProdServ;
            const cb = vacia.querySelector(".fac-clave-busca"); if (cb && p.claveProdServTxt) cb.value = p.claveProdServTxt;
          }
        } else {
          const cont = content.querySelector("[data-fac-conceptos]");
          cont.insertAdjacentHTML("beforeend", conceptoRow({ descripcion: p.descripcion, precioUnitario: p.precioUnitario, cantidad: 1 }));
        }
        recalcTotal();
      }
      e.target.value = ""; // resetear para poder reusar el mismo producto
    }
  });

  // ---- Guardado de catálogo ----
  function facToast(text, kind) {
    const t = document.createElement("div");
    t.textContent = text;
    t.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:99999;padding:.7rem 1.1rem;border-radius:12px;font:600 .85rem 'DM Sans',system-ui,sans-serif;color:#0b1220;box-shadow:0 10px 30px rgba(0,0,0,.35);background:" + (kind === "warn" ? "#F2B84B" : "#34D399");
    document.body.appendChild(t);
    setTimeout(() => { t.style.transition = "opacity .4s"; t.style.opacity = "0"; setTimeout(() => t.remove(), 400); }, 1800);
  }
  function refrescarSelectCliente() {
    const sel = content.querySelector("#fac-cliente-sel");
    if (sel) { const v = sel.value; sel.innerHTML = `<option value="">— Capturar nuevo o elegir guardado —</option>${clienteOptions()}`; sel.value = v && getClientesList()[Number(v)] ? v : ""; }
  }
  function refrescarSelectProducto() {
    const sel = content.querySelector("#fac-prod-add");
    if (sel) sel.innerHTML = `<option value="">＋ Agregar desde producto guardado…</option>${productoOptions()}`;
  }
  async function guardarClienteActual() {
    const rfcEl = content.querySelector("#fac-rfc");
    const nomEl = content.querySelector("#fac-nombre");
    const usoEl = content.querySelector("#fac-uso");
    const rfc = rfcEl ? rfcEl.value.trim().toUpperCase() : "";
    const nombre = nomEl ? nomEl.value.trim() : "";
    const usoCfdi = usoEl ? usoEl.value : "G03";
    const cpEl = content.querySelector("#fac-cp");
    const cp = cpEl ? cpEl.value.trim() : "";
    const regEl = content.querySelector("#fac-regimen");
    const regimen = regEl ? regEl.value : "";
    if (!rfc || !nombre) { facToast("Captura RFC y nombre antes de guardar", "warn"); return; }
    if (!window.CTData || !window.CTData.saveCliente) { facToast("Catálogo no disponible", "warn"); return; }
    const saved = await window.CTData.saveCliente({ rfc, nombre, usoCfdi, cp, regimen });
    refrescarSelectCliente();
    facToast(saved ? "Cliente guardado" : "Ese cliente ya estaba guardado");
  }

  // ---- Conectar el botón "Timbrar CFDI" del módulo de Facturación ----
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-facturar]")) { e.preventDefault(); open(); }
    const cancelTrigger = e.target.closest("[data-cancelar-cfdi]");
    if (cancelTrigger) {
      e.preventDefault();
      const parts = cancelTrigger.getAttribute("data-cancelar-cfdi").split("::");
      openCancel(parts[0], parts[1]);
    }
    const ncTrig = e.target.closest("[data-nc-cfdi]");
    if (ncTrig) { e.preventDefault(); const p = ncTrig.getAttribute("data-nc-cfdi").split("::"); openNotaCredito(p[0], p[1]); }
    const repTrig = e.target.closest("[data-rep-cfdi]");
    if (repTrig) { e.preventDefault(); const p = repTrig.getAttribute("data-rep-cfdi").split("::"); openREP(p[0], p[1]); }
    const correoTrig = e.target.closest("[data-correo-cfdi]");
    if (correoTrig) { e.preventDefault(); const p = correoTrig.getAttribute("data-correo-cfdi").split("::"); openCorreo(p[0], p[1]); }
    const pdfTrig = e.target.closest("[data-pdf-cfdi]");
    if (pdfTrig) { e.preventDefault(); verPdfConLogo(pdfTrig.getAttribute("data-pdf-cfdi")); }
    if (e.target.closest("[data-config-empresa]")) { e.preventDefault(); openConfigEmpresa(); }
  });

  console.log("[CONTATECK] Módulo de facturación cargado · backend:", BACKEND);
})();
