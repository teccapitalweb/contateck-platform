// ============================================================
//  CONTATECK · Simulador Fiscal (módulo Nómina)
//
//  Interfaz visual del Motor Fiscal: captura sueldo, antigüedad,
//  periodicidad y prima de riesgo → muestra en vivo el desglose
//  completo (SDI, ISR, subsidio, IMSS obrero, NETO del trabajador
//  y costo patronal de la empresa).
//
//  SOLO SIMULA — no guarda nada en la base de datos. Sirve como
//  cotizador ("¿cuánto cuesta realmente un empleado?") y para
//  validar el motor con contabilidad antes del timbrado real.
//
//  Importa el motor desde frontend/motorFiscal.js (espejo del
//  backend — ver nota en su encabezado).
// ============================================================
import {
  calcularSDI, calcularISR, cuotaObreroIMSS, cuotaPatronalIMSS,
  PRIMAS_RIESGO_CLASE, SALARIO_MINIMO_DIARIO, UMA_DIARIA,
} from "./motorFiscal.js";

(function () {
  "use strict";

  const ANIO = 2026;
  const DIVISORES = { mensual: 30, quincenal: 15, semanal: 7, diario: 1 };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function money(n) {
    return (Number(n) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

  /* ---------- Estilos propios (prefijo sf-) ---------- */
  const css = document.createElement("style");
  css.textContent = [
    ".sf-grid{display:grid;grid-template-columns:1fr 1fr;gap:.9rem 1.1rem}",
    "@media(max-width:640px){.sf-grid{grid-template-columns:1fr}}",
    ".sf-inp{width:100%;background:var(--ink-900,#0b101b);border:1px solid var(--line,rgba(255,255,255,.12));",
    "  border-radius:8px;color:var(--text,#e2e8f2);padding:.5rem .65rem;font-size:.9rem;font-variant-numeric:tabular-nums}",
    ".sf-inp:focus{outline:none;border-color:var(--brand,#6E8BFF)}",
    ".sf-inp::-webkit-outer-spin-button,.sf-inp::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}",
    ".sf-inp{-moz-appearance:textfield}",
    ".sf-res{margin-top:1.1rem;border-top:1px solid var(--line,rgba(255,255,255,.12));padding-top:1rem}",
    ".sf-sec{font-size:.72rem;letter-spacing:.09em;text-transform:uppercase;color:var(--faint);margin:.85rem 0 .35rem}",
    ".sf-row{display:flex;justify-content:space-between;gap:1rem;padding:.28rem 0;font-size:.9rem}",
    ".sf-row span:last-child{font-variant-numeric:tabular-nums}",
    ".sf-row--neg span:last-child{color:#ff8f9d}",
    ".sf-row--big{border-top:1px solid var(--line,rgba(255,255,255,.12));margin-top:.45rem;padding-top:.55rem;font-weight:700;font-size:.98rem}",
    ".sf-row--big.sf-ok span:last-child{color:#57e39c}",
    ".sf-row--big.sf-emp span:last-child{color:var(--brand,#6E8BFF)}",
    ".sf-chip{display:block;margin-top:.7rem;padding:.5rem .7rem;border-radius:8px;font-size:.8rem;",
    "  background:rgba(255,193,84,.09);border:1px solid rgba(255,193,84,.3);color:#ffcf82}",
    ".sf-cmp{margin-top:.7rem;padding:.55rem .7rem;border-radius:8px;font-size:.8rem;color:var(--muted);",
    "  background:rgba(110,139,255,.07);border:1px dashed rgba(110,139,255,.35)}",
    ".sf-note{color:var(--faint);font-size:.76rem;margin-top:.8rem;line-height:1.5}",
    ".sf-tgl{display:flex;align-items:center;gap:.5rem;font-size:.82rem;color:var(--muted);margin-top:.9rem;cursor:pointer;user-select:none}",
    ".sf-tgl input{accent-color:var(--brand,#6E8BFF)}",
  ].join("\n");
  document.head.appendChild(css);

  /* ---------- Modal ---------- */
  let modal = null;
  function ensureModal() {
    if (modal) return;
    modal = document.createElement("div");
    modal.className = "modal";
    modal.innerHTML =
      '<div class="modal__scrim" data-sf-cerrar></div>' +
      '<div class="modal__card" style="max-width:680px"><div class="modal__head"><h3>Simulador fiscal · ' + ANIO + "</h3>" +
      '<button class="modal__x" data-sf-cerrar aria-label="Cerrar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>' +
      '<div class="modal__body">' +
      '<div class="sf-grid">' +
      '<div class="fld"><label>Monto pactado (MXN)</label><input class="sf-inp" type="number" min="0" step="0.01" value="6000" data-sf-monto></div>' +
      '<div class="fld"><label>Tipo de sueldo</label><div class="seg" data-sf-seg="tipo" style="flex-wrap:wrap">' +
      segBtns([["mensual", "Mensual"], ["quincenal", "Quincenal"], ["semanal", "Semanal"], ["diario", "Diario"]], "mensual") +
      "</div></div>" +
      '<div class="fld"><label>Antigüedad (años cumplidos)</label><input class="sf-inp" type="number" min="1" step="1" value="1" data-sf-anios></div>' +
      '<div class="fld"><label>Periodicidad de pago</label><div class="seg" data-sf-seg="periodo" style="flex-wrap:wrap">' +
      segBtns([["semanal", "Semanal"], ["catorcenal", "Catorcenal"], ["quincenal", "Quincenal"], ["mensual", "Mensual"]], "quincenal") +
      "</div></div>" +
      '<div class="fld" style="grid-column:1/-1"><label>Prima de riesgo de trabajo (clase IMSS)</label><div class="seg" data-sf-seg="clase" style="flex-wrap:wrap">' +
      segBtns([["I", "Clase I"], ["II", "Clase II"], ["III", "Clase III"], ["IV", "Clase IV"], ["V", "Clase V"]], "I") +
      '</div><p style="color:var(--faint);font-size:.74rem;margin:.35rem 0 0">Nivel de riesgo del giro de la empresa (I: oficinas/consultorios · V: construcción pesada). Este seguro lo paga 100% el patrón — cambiar la clase solo mueve el costo de la Empresa, no el neto del trabajador.</p></div>' +
      "</div>" +
      '<label class="sf-tgl"><input type="checkbox" data-sf-cmp> Comparar con la tabla de subsidio anterior (derogada may-2024)</label>' +
      '<div class="sf-res" data-sf-res></div>' +
      '<p class="sf-note">Cálculo con las disposiciones fiscales vigentes ' + ANIO + ' (SAT, IMSS y LFT). Esta herramienta es un simulador de referencia — no guarda información ni sustituye el cálculo oficial de tu nómina.</p>' +
      "</div>" +
      '<div class="modal__foot"><button class="btn btn--primary" data-sf-cerrar>Cerrar</button></div></div>';
    document.body.appendChild(modal);

    modal.addEventListener("click", function (e) {
      if (e.target.closest("[data-sf-cerrar]")) { modal.classList.remove("is-open"); return; }
      const b = e.target.closest("[data-sf-seg] button");
      if (b) {
        b.parentElement.querySelectorAll("button").forEach(function (x) { x.classList.remove("is-active"); });
        b.classList.add("is-active");
        recalcular();
      }
    });
    modal.addEventListener("input", recalcular);
  }

  function segBtns(pares, def) {
    return pares.map(function (p) {
      return '<button type="button" data-val="' + p[0] + '" class="' + (p[0] === def ? "is-active" : "") + '">' + p[1] + "</button>";
    }).join("");
  }
  function segVal(nombre) {
    const b = modal.querySelector('[data-sf-seg="' + nombre + '"] .is-active');
    return b ? b.getAttribute("data-val") : null;
  }

  /* ---------- Cálculo y render ---------- */
  function recalcular() {
    const res = $("[data-sf-res]", modal);
    const monto = parseFloat($("[data-sf-monto]", modal).value) || 0;
    const anios = Math.max(1, parseInt($("[data-sf-anios]", modal).value, 10) || 1);
    const tipo = segVal("tipo") || "mensual";
    const periodo = segVal("periodo") || "quincenal";
    const clase = segVal("clase") || "I";
    const comparar = $("[data-sf-cmp]", modal).checked;

    if (monto <= 0) { res.innerHTML = '<p style="color:var(--faint);font-size:.9rem">Captura el monto pactado para simular.</p>'; return; }

    const DIAS_PERIODO = { semanal: 7, catorcenal: 14, quincenal: 15, mensual: 30 };
    const DIAS_SUBSIDIO = { semanal: 7, catorcenal: 14, quincenal: 15, mensual: 30.4 };
    const diario = monto / DIVISORES[tipo];
    const dias = DIAS_PERIODO[periodo];
    const ingresoMensual = round2(diario * 30);
    const sdiR = calcularSDI(diario, anios);
    const bruto = round2(diario * dias);

    // ISR: base gravable del periodo; el subsidio del periodo mensual
    // usa 30.4 días (mes completo del decreto), quincenal 15, semanal 7.
    const isr = calcularISR({
      baseGravable: bruto, periodo: periodo, dias: DIAS_SUBSIDIO[periodo],
      ingresoMensualOrdinario: ingresoMensual, anio: ANIO,
    });
    const obrero = cuotaObreroIMSS({ sdi: sdiR.sdi, dias: dias, anio: ANIO });
    const patronal = cuotaPatronalIMSS({ sdi: sdiR.sdi, dias: dias, anio: ANIO, primaRiesgo: PRIMAS_RIESGO_CLASE[clase] });

    const neto = round2(bruto - isr.isrRetenido - obrero.total);
    const costoEmpresa = round2(bruto + patronal.total + patronal.infonavit);

    const sm = SALARIO_MINIMO_DIARIO[ANIO];
    const bajoSM = diario < sm;

    let html = "";
    html += '<div class="sf-sec">Trabajador</div>';
    html += fila("Salario diario", "$" + money(diario));
    html += fila("SDI (factor " + sdiR.factor + " · " + sdiR.vacaciones + " días vac.)", "$" + money(sdiR.sdi));
    html += fila("Bruto del periodo (" + dias + " días)", "$" + money(bruto));
    html += fila("ISR según tarifa", "$" + money(isr.isrBruto));
    html += fila("Subsidio al empleo", "− $" + money(isr.subsidio));
    html += fila("ISR retenido", "$" + money(isr.isrRetenido), isr.isrRetenido > 0 ? "sf-row--neg" : "");
    html += fila("IMSS cuota obrera (2.375%" + (obrero.cuotaExcedente > 0 ? " + excedente" : "") + ")", "$" + money(obrero.total), "sf-row--neg");
    html += fila("Neto que recibe", "$" + money(neto), "sf-row--big sf-ok");

    html += '<div class="sf-sec">Empresa (costo patronal)</div>';
    html += fila("IMSS patronal (CEAV " + (patronal.ceavPct * 100).toFixed(3) + "%)", "$" + money(patronal.total));
    html += fila("Infonavit (5%)", "$" + money(patronal.infonavit));
    html += fila("Costo total del periodo", "$" + money(costoEmpresa), "sf-row--big sf-emp");

    if (bajoSM) {
      html += '<span class="sf-chip">⚠ Este sueldo ($' + money(diario) + '/día) está por debajo del salario mínimo ' + ANIO + ' ($' + money(sm) + '). No sería legal en la realidad — la tabla de Cesantía y Vejez aplica la protección de salario mínimo (3.150%).</span>';
    }

    if (comparar) {
      if (periodo === "quincenal") {
        const viejo = calcularISR({
          baseGravable: bruto, periodo: "quincenal", dias: 15,
          ingresoMensualOrdinario: ingresoMensual, anio: ANIO, mecanicaSubsidio: "tabla-2023",
        });
        const netoViejo = round2(bruto - viejo.isrRetenido - obrero.total);
        html += '<div class="sf-cmp"><b>Con la tabla anterior (derogada):</b> subsidio $' + money(viejo.subsidio) +
          " · ISR retenido $" + money(viejo.isrRetenido) + " · neto $" + money(netoViejo) +
          ". Diferencia de neto contra la regla vigente: $" + money(round2(neto - netoViejo)) + ".</div>";
      } else {
        html += '<div class="sf-cmp">La comparación con la tabla anterior está disponible solo en periodicidad Quincenal.</div>';
      }
    }

    res.innerHTML = html;
  }

  function fila(etq, val, extra) {
    return '<div class="sf-row ' + (extra || "") + '"><span>' + etq + "</span><span>" + val + "</span></div>";
  }

  /* ---------- Abrir ---------- */
  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-simfiscal]")) {
      ensureModal();
      modal.classList.add("is-open");
      recalcular();
    }
  });
})();
