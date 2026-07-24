/* ============================================================
   CONTATECK · Módulo 01 · Contabilidad General
   Catálogo de cuentas · Pólizas (Debe/Haber) · Libro Mayor · Balanza
   Datos en el navegador (localStorage). Toma control del módulo
   "contabilidad" del dashboard, reemplazando los datos de ejemplo.
   ============================================================ */
(function () {
  "use strict";

  /* ---------- Helpers ---------- */
  const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const fmt = (n) => num(n).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const hoyISO = () => {
    try { return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" }); }
    catch (e) { return new Date().toISOString().slice(0, 10); }
  };
  const fechaCorta = (iso) => {
    const m = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const p = String(iso || "").split("-");
    if (p.length !== 3) return iso || "";
    return `${parseInt(p[2], 10)} ${m[parseInt(p[1], 10) - 1] || ""}`;
  };

  /* ---------- Catálogo base (código agrupador SAT, simplificado) ---------- */
  // nivel 1 = cuenta de mayor (acumula, no afectable) · nivel 2 = detalle (afectable)
  const CATALOGO_BASE = [
    { codigo: "100", nombre: "Activo",                  nat: "Deudora",   nivel: 1, padre: null  },
    { codigo: "101", nombre: "Caja",                    nat: "Deudora",   nivel: 2, padre: "100" },
    { codigo: "102", nombre: "Bancos",                  nat: "Deudora",   nivel: 2, padre: "100" },
    { codigo: "105", nombre: "Clientes",                nat: "Deudora",   nivel: 2, padre: "100" },
    { codigo: "115", nombre: "Inventarios",             nat: "Deudora",   nivel: 2, padre: "100" },
    { codigo: "118", nombre: "IVA acreditable",         nat: "Deudora",   nivel: 2, padre: "100" },
    { codigo: "151", nombre: "Equipo de cómputo",       nat: "Deudora",   nivel: 2, padre: "100" },
    { codigo: "200", nombre: "Pasivo",                  nat: "Acreedora", nivel: 1, padre: null  },
    { codigo: "201", nombre: "Proveedores",             nat: "Acreedora", nivel: 2, padre: "200" },
    { codigo: "205", nombre: "Acreedores diversos",     nat: "Acreedora", nivel: 2, padre: "200" },
    { codigo: "209", nombre: "IVA trasladado",          nat: "Acreedora", nivel: 2, padre: "200" },
    { codigo: "213", nombre: "Impuestos por pagar",     nat: "Acreedora", nivel: 2, padre: "200" },
    { codigo: "216", nombre: "Sueldos por pagar",       nat: "Acreedora", nivel: 2, padre: "200" },
    { codigo: "300", nombre: "Capital contable",        nat: "Acreedora", nivel: 1, padre: null  },
    { codigo: "301", nombre: "Capital social",          nat: "Acreedora", nivel: 2, padre: "300" },
    { codigo: "305", nombre: "Resultado del ejercicio", nat: "Acreedora", nivel: 2, padre: "300" },
    { codigo: "400", nombre: "Ingresos",                nat: "Acreedora", nivel: 1, padre: null  },
    { codigo: "401", nombre: "Ventas y servicios",      nat: "Acreedora", nivel: 2, padre: "400" },
    { codigo: "402", nombre: "Productos financieros",   nat: "Acreedora", nivel: 2, padre: "400" },
    { codigo: "500", nombre: "Costos y gastos",         nat: "Deudora",   nivel: 1, padre: null  },
    { codigo: "501", nombre: "Costo de ventas",         nat: "Deudora",   nivel: 2, padre: "500" },
    { codigo: "601", nombre: "Gastos de operación",     nat: "Deudora",   nivel: 2, padre: "500" },
    { codigo: "602", nombre: "Gastos de administración",nat: "Deudora",   nivel: 2, padre: "500" },
    { codigo: "603", nombre: "Gastos de venta",         nat: "Deudora",   nivel: 2, padre: "500" },
  ];

  /* ---------- Persistencia (localStorage) ---------- */
  const K_CUENTAS = "contateck_cuentas";
  const K_POLIZAS = "contateck_polizas";
  const K_FOLIOS  = "contateck_folios";

  function leerCuentas() {
    try {
      const raw = JSON.parse(localStorage.getItem(K_CUENTAS) || "null");
      if (Array.isArray(raw) && raw.length) return raw;
    } catch (e) { /* siembra abajo */ }
    // Primera vez: sembrar catálogo base con id.
    const sembrado = CATALOGO_BASE.map((c, i) => ({ id: "c" + (i + 1), ...c }));
    guardarCuentas(sembrado);
    return sembrado;
  }
  function guardarCuentas(arr) {
    try { localStorage.setItem(K_CUENTAS, JSON.stringify(arr || [])); return true; }
    catch (e) { return false; }
  }
  function leerPolizas() {
    try {
      const raw = JSON.parse(localStorage.getItem(K_POLIZAS) || "null");
      if (Array.isArray(raw)) return raw;
    } catch (e) {}
    return [];
  }
  function guardarPolizas(arr) {
    try { localStorage.setItem(K_POLIZAS, JSON.stringify(arr || [])); return true; }
    catch (e) { return false; }
  }
  function siguienteFolio(tipo) {
    let folios = {};
    try { folios = JSON.parse(localStorage.getItem(K_FOLIOS) || "{}") || {}; } catch (e) {}
    const letra = tipo === "Ingreso" ? "I" : tipo === "Egreso" ? "E" : "D";
    const n = (folios[letra] || 0) + 1;
    folios[letra] = n;
    try { localStorage.setItem(K_FOLIOS, JSON.stringify(folios)); } catch (e) {}
    return `${letra}-${String(n).padStart(5, "0")}`;
  }

  /* ---------- API de datos ---------- */
  function getCuentas() { return leerCuentas().slice(); }
  function getCuentasAfectables() { return getCuentas().filter((c) => c.nivel === 2); }
  function getCuentaPorCodigo(codigo) { return getCuentas().find((c) => c.codigo === codigo) || null; }
  function saveCuenta(cuenta) {
    const arr = leerCuentas();
    cuenta = cuenta || {};
    if (cuenta.id) {
      const i = arr.findIndex((c) => c.id === cuenta.id);
      if (i >= 0) arr[i] = { ...arr[i], ...cuenta };
      else arr.push(cuenta);
    } else {
      cuenta.id = "c" + Date.now() + Math.floor(Math.random() * 1000);
      arr.push(cuenta);
    }
    arr.sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), "es", { numeric: true }));
    guardarCuentas(arr);
    return cuenta;
  }
  function deleteCuenta(id) {
    const arr = leerCuentas().filter((c) => c.id !== id);
    return guardarCuentas(arr);
  }
  function getPolizas() {
    return leerPolizas().slice().sort((a, b) => (b.creada || 0) - (a.creada || 0));
  }
  function savePoliza(poliza) {
    const arr = leerPolizas();
    poliza = poliza || {};
    if (!poliza.id) {
      poliza.id = "p" + Date.now() + Math.floor(Math.random() * 1000);
      poliza.creada = Date.now();
      if (!poliza.folio) poliza.folio = siguienteFolio(poliza.tipo);
      arr.push(poliza);
    } else {
      const i = arr.findIndex((p) => p.id === poliza.id);
      if (i >= 0) arr[i] = { ...arr[i], ...poliza };
      else arr.push(poliza);
    }
    guardarPolizas(arr);
    return poliza;
  }
  function deletePoliza(id) {
    const arr = leerPolizas().filter((p) => p.id !== id);
    return guardarPolizas(arr);
  }

  /* ---------- Cálculos contables ---------- */
  // Movimientos (cargos/abonos) de una cuenta de detalle, de las pólizas del periodo.
  function movimientosCuenta(codigo) {
    let debe = 0, haber = 0; const movs = [];
    polizasDelPeriodo().forEach((p) => {
      (p.asientos || []).forEach((a) => {
        if (a.codigo === codigo) {
          const d = num(a.debe), h = num(a.haber);
          debe += d; haber += h;
          movs.push({ fecha: p.fecha, folio: p.folio, concepto: p.concepto, debe: d, haber: h });
        }
      });
    });
    movs.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
    return { debe: round2(debe), haber: round2(haber), movs };
  }
  // Saldo de una cuenta según su naturaleza.
  function saldoCuenta(cuenta) {
    if (cuenta.nivel === 1) {
      // Mayor: suma de los saldos de sus cuentas hijas.
      return round2(getCuentas()
        .filter((c) => c.padre === cuenta.codigo)
        .reduce((s, c) => s + saldoCuenta(c), 0));
    }
    const { debe, haber } = movimientosCuenta(cuenta.codigo);
    return round2(cuenta.nat === "Deudora" ? debe - haber : haber - debe);
  }
  // Balanza de comprobación: una fila por cuenta afectable con cargos/abonos/saldo.
  function balanza() {
    const filas = getCuentasAfectables().map((c) => {
      const { debe, haber } = movimientosCuenta(c.codigo);
      const saldo = c.nat === "Deudora" ? debe - haber : haber - debe;
      return {
        codigo: c.codigo, nombre: c.nombre, nat: c.nat,
        debe: round2(debe), haber: round2(haber),
        saldoDeudor: c.nat === "Deudora" ? round2(Math.max(saldo, 0)) : (saldo < 0 ? round2(-saldo) : 0),
        saldoAcreedor: c.nat === "Acreedora" ? round2(Math.max(saldo, 0)) : (saldo < 0 ? round2(-saldo) : 0),
      };
    });
    const tot = filas.reduce((t, f) => ({
      debe: t.debe + f.debe, haber: t.haber + f.haber,
      saldoDeudor: t.saldoDeudor + f.saldoDeudor, saldoAcreedor: t.saldoAcreedor + f.saldoAcreedor,
    }), { debe: 0, haber: 0, saldoDeudor: 0, saldoAcreedor: 0 });
    Object.keys(tot).forEach((k) => (tot[k] = round2(tot[k])));
    return { filas, tot, cuadra: Math.abs(tot.debe - tot.haber) < 0.01 };
  }

  /* ============================================================
     BLOQUE 1 · Pólizas automáticas desde CFDI
     Conecta el módulo de Facturación con la Contabilidad.
     ============================================================ */
  const K_CONTAB = "contateck_cfdi_contab"; // CFDIs ya contabilizados (evita duplicar)

  // Deriva subtotal/IVA/total de un CFDI. El sistema factura al 16%,
  // así que si no viene desglosado se calcula de forma exacta.
  function montosCfdi(cfdi) {
    const total = round2(num(cfdi.total));
    let subtotal = round2(num(cfdi.subtotal)), iva = round2(num(cfdi.iva));
    if (!subtotal && !iva && total) {
      subtotal = round2(total / 1.16);
      iva = round2(total - subtotal);
    }
    return { subtotal, iva, total };
  }
  function fechaISOcfdi(cfdi) {
    if (cfdi && cfdi.createdAt) {
      try { return new Date(cfdi.createdAt).toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" }); } catch (e) {}
    }
    return hoyISO();
  }
  function cfdiKey(cfdi) { return String(cfdi.uuidFull || cfdi.id || cfdi.folio || ""); }

  // Genera el objeto póliza (sin guardar) a partir de un CFDI emitido.
  function cfdiAPoliza(cfdi) {
    const { subtotal, iva, total } = montosCfdi(cfdi);
    const folioRef = cfdi.folio || (cfdi.uuidFull ? cfdi.uuidFull.slice(0, 8) : "CFDI");
    const cli = cfdi.cliente || "Cliente";
    const base = { fecha: fechaISOcfdi(cfdi), cfdiUuid: cfdi.uuidFull || "", origen: "cfdi" };
    if (cfdi.tipo === "P") { // REP: pago recibido → Bancos / Clientes
      return Object.assign(base, { tipo: "Ingreso", concepto: `Cobro CFDI ${folioRef} · ${cli}`,
        asientos: [
          { codigo: "102", nombre: "Bancos",   debe: total, haber: 0 },
          { codigo: "105", nombre: "Clientes", debe: 0, haber: total },
        ] });
    }
    if (cfdi.tipo === "E") { // Nota de crédito: reversa de venta
      return Object.assign(base, { tipo: "Egreso", concepto: `Nota de crédito ${folioRef} · ${cli}`,
        asientos: [
          { codigo: "401", nombre: "Ventas y servicios", debe: subtotal, haber: 0 },
          { codigo: "209", nombre: "IVA trasladado",      debe: iva, haber: 0 },
          { codigo: "105", nombre: "Clientes",            debe: 0, haber: total },
        ] });
    }
    // Factura de ingreso (tipo I): Clientes / Ventas + IVA trasladado
    return Object.assign(base, { tipo: "Ingreso", concepto: `Factura ${folioRef} · ${cli}`,
      asientos: [
        { codigo: "105", nombre: "Clientes",            debe: total, haber: 0 },
        { codigo: "401", nombre: "Ventas y servicios",  debe: 0, haber: subtotal },
        { codigo: "209", nombre: "IVA trasladado",      debe: 0, haber: iva },
      ] });
  }

  function getContabilizados() {
    try { const a = JSON.parse(localStorage.getItem(K_CONTAB) || "[]"); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function marcarContabilizado(key) {
    const arr = getContabilizados();
    if (key && arr.indexOf(key) < 0) { arr.push(key); try { localStorage.setItem(K_CONTAB, JSON.stringify(arr)); } catch (e) {} }
  }
  function leerCfdis() {
    try { return (window.CTData && window.CTData.getCfdis) ? window.CTData.getCfdis() : []; }
    catch (e) { return []; }
  }
  function cfdisPendientes() {
    const cont = getContabilizados();
    return leerCfdis().filter((c) => c && c.estado !== "cancelada" && cont.indexOf(cfdiKey(c)) < 0);
  }
  function contabilizarCfdi(cfdi) {
    savePoliza(cfdiAPoliza(cfdi));
    marcarContabilizado(cfdiKey(cfdi));
  }

  /* ---------- Importar CFDI recibido (XML de proveedor) ---------- */
  function findByLocal(root, local) {
    const all = root.getElementsByTagName("*");
    for (let i = 0; i < all.length; i++) if (all[i].localName === local) return all[i];
    return null;
  }
  function parsearCfdiXml(xmlText) {
    let doc;
    try { doc = new DOMParser().parseFromString(xmlText, "text/xml"); } catch (e) { return null; }
    if (!doc || doc.getElementsByTagName("parsererror").length) return null;
    const comp = findByLocal(doc, "Comprobante");
    if (!comp) return null;
    const ga = (el, a) => (el ? el.getAttribute(a) || "" : "");
    const emisor = findByLocal(doc, "Emisor");
    const tfd = findByLocal(doc, "TimbreFiscalDigital");
    const impTotal = findByLocal(doc, "Impuestos");
    const total = round2(num(ga(comp, "Total")));
    let subtotal = round2(num(ga(comp, "SubTotal")));
    const descuento = round2(num(ga(comp, "Descuento")));
    if (descuento) subtotal = round2(subtotal - descuento);
    let iva = round2(num(ga(impTotal, "TotalImpuestosTrasladados")));
    if (!iva && total && subtotal) iva = round2(total - subtotal);
    if (!subtotal && total) { subtotal = round2(total / 1.16); iva = round2(total - subtotal); }
    return {
      total, subtotal, iva,
      rfcEmisor: ga(emisor, "Rfc"), nombreEmisor: ga(emisor, "Nombre"),
      uuid: ga(tfd, "UUID"), fecha: (ga(comp, "Fecha") || "").slice(0, 10) || hoyISO(),
    };
  }
  function xmlAPolizaGasto(d) {
    const total = d.total, subtotal = d.subtotal, iva = d.iva;
    const ref = d.uuid ? d.uuid.slice(0, 8) : (d.rfcEmisor || "XML");
    return {
      tipo: "Egreso", fecha: d.fecha || hoyISO(), cfdiUuid: d.uuid || "", origen: "cfdi-recibido",
      proveedorRfc: d.rfcEmisor || "", proveedorNombre: d.nombreEmisor || "",
      concepto: `Gasto CFDI ${ref} · ${d.nombreEmisor || d.rfcEmisor || "Proveedor"}`,
      asientos: [
        { codigo: "601", nombre: "Gastos de operación", debe: subtotal, haber: 0 },
        { codigo: "118", nombre: "IVA acreditable",     debe: iva, haber: 0 },
        { codigo: "201", nombre: "Proveedores",         debe: 0, haber: total },
      ],
    };
  }

  /* ============================================================
     BLOQUE 4 (parte) · Periodos contables
     Filtra los cálculos por mes/ejercicio. null = todo el ejercicio.
     ============================================================ */
  let periodoActivo = null; // { mes:1-12, anio } o null
  function setPeriodo(p) { periodoActivo = p; }
  function getPeriodo() { return periodoActivo; }
  function polizasDelPeriodo() {
    const all = leerPolizas();
    if (!periodoActivo) return all;
    return all.filter((p) => {
      const parts = String(p.fecha || "").split("-");
      return parts.length === 3 && parseInt(parts[0], 10) === periodoActivo.anio && parseInt(parts[1], 10) === periodoActivo.mes;
    });
  }
  function periodosDisponibles() {
    const meses = {};
    leerPolizas().forEach((p) => {
      const parts = String(p.fecha || "").split("-");
      if (parts.length === 3) meses[parts[0] + "-" + parts[1]] = { anio: parseInt(parts[0], 10), mes: parseInt(parts[1], 10) };
    });
    return Object.keys(meses).sort().reverse().map((k) => meses[k]);
  }

  /* ============================================================
     BLOQUE 2 · Estados financieros
     ============================================================ */
  function grupoDetalle(codMayor) {
    return getCuentas().filter((c) => c.padre === codMayor)
      .map((c) => ({ codigo: c.codigo, nombre: c.nombre, saldo: Math.abs(saldoCuenta(c)) }))
      .filter((x) => x.saldo !== 0);
  }
  // Estado de Resultados: Ingresos − Costos y gastos = Utilidad
  function estadoResultados() {
    const ingresos = grupoDetalle("400");
    const gastos = grupoDetalle("500");
    const totalIngresos = round2(ingresos.reduce((s, x) => s + x.saldo, 0));
    const totalGastos = round2(gastos.reduce((s, x) => s + x.saldo, 0));
    return { ingresos, gastos, totalIngresos, totalGastos, utilidad: round2(totalIngresos - totalGastos) };
  }
  // Balance General: Activo = Pasivo + Capital (+ utilidad del ejercicio)
  function balanceGeneral() {
    const activo = grupoDetalle("100");
    const pasivo = grupoDetalle("200");
    const capital = grupoDetalle("300");
    const totalActivo = round2(activo.reduce((s, x) => s + x.saldo, 0));
    const totalPasivo = round2(pasivo.reduce((s, x) => s + x.saldo, 0));
    const utilidad = estadoResultados().utilidad;
    const totalCapital = round2(capital.reduce((s, x) => s + x.saldo, 0) + utilidad);
    const totalPasivoCapital = round2(totalPasivo + totalCapital);
    return { activo, pasivo, capital, totalActivo, totalPasivo, totalCapital, utilidad,
      totalPasivoCapital, cuadra: Math.abs(totalActivo - totalPasivoCapital) < 0.01 };
  }

  /* ============================================================
     BLOQUE 3 · Contabilidad Electrónica SAT · IVA · DIOT
     ============================================================ */
  const K_RFC = "contateck_rfc_emisor";
  function getRfcEmisor() { try { return localStorage.getItem(K_RFC) || ""; } catch (e) { return ""; } }
  function setRfcEmisor(v) { try { localStorage.setItem(K_RFC, String(v || "")); } catch (e) {} }

  // XML Catálogo de cuentas (esquema SAT catalogocuentas 1.3)
  function xmlCatalogoSAT(rfc, mes, anio) {
    const ctas = getCuentas().map((c) =>
      `    <catalogocuentas:Ctas CodAgrup="${esc(c.codigo)}" NumCta="${esc(c.codigo)}" Desc="${esc(c.nombre)}" Nivel="${c.nivel}" Natur="${c.nat === "Deudora" ? "D" : "A"}"${c.padre ? ` SubCtaDe="${esc(c.padre)}"` : ""}/>`
    ).join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>
<catalogocuentas:Catalogo xmlns:catalogocuentas="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/CatalogoCuentas" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" Version="1.3" RFC="${esc(rfc)}" Mes="${String(mes).padStart(2, "0")}" Anio="${anio}">
${ctas}
</catalogocuentas:Catalogo>`;
  }
  // XML Balanza de comprobación (esquema SAT BCE 1.3)
  function xmlBalanzaSAT(rfc, mes, anio) {
    const b = balanza();
    const ctas = b.filas.map((f) => {
      const saldoFin = round2(f.saldoDeudor + f.saldoAcreedor); // uno de los dos es 0
      return `    <BCE:Ctas NumCta="${esc(f.codigo)}" SaldoIni="0.00" Debe="${f.debe.toFixed(2)}" Haber="${f.haber.toFixed(2)}" SaldoFin="${saldoFin.toFixed(2)}"/>`;
    }).join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>
<BCE:Balanza xmlns:BCE="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/BalanzaComprobacion" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" Version="1.3" RFC="${esc(rfc)}" Mes="${String(mes).padStart(2, "0")}" Anio="${anio}" TipoEnvio="N">
${ctas}
</BCE:Balanza>`;
  }

  // Determinación de IVA del periodo
  function determinacionIVA() {
    const cT = getCuentaPorCodigo("209"), cA = getCuentaPorCodigo("118");
    const trasladado = cT ? Math.abs(saldoCuenta(cT)) : 0;
    const acreditable = cA ? Math.abs(saldoCuenta(cA)) : 0;
    const resultado = round2(trasladado - acreditable);
    return { trasladado: round2(trasladado), acreditable: round2(acreditable), resultado,
      aCargo: resultado > 0 ? resultado : 0, aFavor: resultado < 0 ? round2(-resultado) : 0 };
  }

  // DIOT: operaciones con proveedores (de pólizas de gasto contabilizadas desde CFDI recibido)
  function diot() {
    const provs = {};
    polizasDelPeriodo().forEach((p) => {
      if (p.origen !== "cfdi-recibido") return;
      const rfc = p.proveedorRfc || "—";
      const nom = p.proveedorNombre || (p.concepto || "").split("·").pop().trim();
      const ivaA = (p.asientos || []).filter((a) => a.codigo === "118").reduce((s, a) => s + num(a.debe), 0);
      const base = (p.asientos || []).filter((a) => a.codigo === "601" || a.codigo === "602" || a.codigo === "603" || a.codigo === "501").reduce((s, a) => s + num(a.debe), 0);
      if (!provs[rfc]) provs[rfc] = { rfc, nombre: nom, base: 0, iva: 0, ops: 0 };
      provs[rfc].base = round2(provs[rfc].base + base);
      provs[rfc].iva = round2(provs[rfc].iva + ivaA);
      provs[rfc].ops += 1;
    });
    return Object.keys(provs).map((k) => provs[k]);
  }

  // Exponer API por si otros módulos la necesitan.
  window.CTCont = {
    getCuentas, getCuentasAfectables, getCuentaPorCodigo, saveCuenta, deleteCuenta,
    getPolizas, savePoliza, deletePoliza, movimientosCuenta, saldoCuenta, balanza,
    cfdiAPoliza, cfdisPendientes, contabilizarCfdi, parsearCfdiXml, xmlAPolizaGasto,
    estadoResultados, balanceGeneral, xmlCatalogoSAT, xmlBalanzaSAT, determinacionIVA, diot,
    setPeriodo, getPeriodo, periodosDisponibles, getRfcEmisor, setRfcEmisor,
  };

  /* ====================== PARTE 2 · UI ====================== */

  const ICO_EDIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
  const ICO_DEL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';
  const ICO_EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
  const ICO_BOOK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>';

  /* ---------- CSS ---------- */
  const css = `
    .cont-modal{position:fixed;inset:0;z-index:120;display:none;align-items:center;justify-content:center;padding:1.2rem;background:rgba(2,6,15,.6);backdrop-filter:blur(4px)}
    .cont-modal.is-open{display:flex}
    .cont-modal__card{background:var(--ink-800,#0d1322);border:1px solid var(--line,#1a2540);border-radius:18px;
      width:100%;max-width:680px;max-height:90vh;overflow:auto;box-shadow:0 30px 80px -20px rgba(0,0,0,.7)}
    .cont-modal__head{display:flex;align-items:center;justify-content:space-between;padding:1.1rem 1.3rem;border-bottom:1px solid var(--line,#1a2540);position:sticky;top:0;background:var(--ink-800,#0d1322);z-index:2}
    .cont-modal__head h3{margin:0;font-size:1.05rem}
    .cont-modal__x{background:none;border:0;color:var(--muted,#8a93a6);cursor:pointer;padding:.3rem;border-radius:8px;width:30px;height:30px;font-size:1rem}
    .cont-modal__x:hover{background:var(--line,#1a2540);color:var(--text,#e8ecf3)}
    .cont-modal__body{padding:1.3rem}
    .cont-modal .field{margin-bottom:.8rem}
    .cont-modal .field label{display:block;font-size:.78rem;color:var(--muted,#8a93a6);margin-bottom:.35rem;font-weight:500}
    .cont-grid3{display:grid;grid-template-columns:1fr 1fr;gap:.7rem}
    .cont-asientos-head{display:grid;grid-template-columns:1fr 120px 120px 32px;gap:.5rem;margin:.6rem 0 .35rem;
      font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--faint,#5b6680)}
    .cont-asientos-head span:nth-child(2),.cont-asientos-head span:nth-child(3){text-align:right;padding-right:.4rem}
    .cont-asiento{display:grid;grid-template-columns:1fr 120px 120px 32px;gap:.5rem;margin-bottom:.45rem;align-items:center}
    .cont-as-debe,.cont-as-haber{text-align:right}
    .cont-as-debe::-webkit-outer-spin-button,.cont-as-debe::-webkit-inner-spin-button,
    .cont-as-haber::-webkit-outer-spin-button,.cont-as-haber::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
    .cont-as-debe,.cont-as-haber{-moz-appearance:textfield;appearance:textfield}
    .cont-as-x{background:none;border:0;color:var(--down,#FB7185);cursor:pointer;font-size:1rem;border-radius:7px;height:38px}
    .cont-as-x:hover{background:rgba(251,113,133,.12)}
    .cont-totales{margin-top:1rem;padding:1rem;border:1px solid var(--line,#1a2540);border-radius:12px;background:var(--ink-900,rgba(255,255,255,.02))}
    .cont-totales-row{display:flex;justify-content:space-between;align-items:center;font-size:.9rem;margin-bottom:.4rem}
    .cont-totales-row b{font-family:var(--mono,monospace);font-size:1.05rem}
    .cont-cuadre{text-align:center;font-weight:700;font-size:.9rem;padding:.55rem;border-radius:9px;margin-top:.5rem}
    .cont-cuadre.is-ok{color:var(--up,#34D399);background:var(--up-soft,rgba(52,211,153,.12))}
    .cont-cuadre.is-bad{color:var(--gold,#F2B84B);background:var(--gold-soft,rgba(242,184,75,.12))}
    .cont-foot{display:flex;justify-content:flex-end;gap:.6rem;margin-top:1.2rem}
    .cont-modal .btn:disabled,.cont-modal .btn[disabled]{opacity:.4;cursor:not-allowed;filter:grayscale(.4);box-shadow:none}
    .cont-modo-tabs{display:flex;gap:.4rem;margin-bottom:1.1rem;background:var(--ink-900,rgba(255,255,255,.03));padding:.3rem;border-radius:11px}
    .cont-modo{flex:1;padding:.6rem;border:none;background:transparent;color:var(--muted,#9aa);font-weight:600;border-radius:8px;cursor:pointer;font-size:.86rem;transition:.15s}
    .cont-modo.is-active{background:var(--brand,#6E8BFF);color:#fff}
    .cont-hint{color:var(--muted,#9aa);font-size:.88rem;margin:0 0 1rem}
    .cont-plantillas{display:grid;grid-template-columns:1fr 1fr;gap:.7rem}
    @media(max-width:560px){.cont-plantillas{grid-template-columns:1fr}}
    .cont-plantilla{text-align:left;padding:1rem;border:1px solid var(--line,#1a2540);border-radius:12px;background:var(--ink-900,rgba(255,255,255,.02));cursor:pointer;transition:.15s;display:flex;flex-direction:column;gap:.25rem}
    .cont-plantilla:hover{border-color:var(--brand,#6E8BFF);background:var(--brand-soft,rgba(110,139,255,.08));transform:translateY(-1px)}
    .cont-plantilla b{font-size:.94rem}
    .cont-plantilla span{font-size:.78rem;color:var(--muted,#9aa)}
    .cont-rapido-card{margin-top:1rem;padding:1.1rem;border:1px solid var(--brand,#6E8BFF);border-radius:12px;background:var(--brand-soft,rgba(110,139,255,.05))}
    .cont-rapido-titulo{font-weight:700;font-size:1.02rem;margin-bottom:.8rem;color:var(--brand,#6E8BFF)}
    .cont-check{display:flex;align-items:center;gap:.5rem;font-size:.88rem;cursor:pointer;margin:.5rem 0}
    .cont-check input{width:auto;margin:0}
    .cont-err{background:rgba(251,113,133,.12);border:1px solid rgba(251,113,133,.3);color:var(--down,#FB7185);
      padding:.7rem .9rem;border-radius:10px;font-size:.85rem;margin-top:.7rem}
    .cont-verhead,.cont-mayor-head{display:flex;gap:1.5rem;align-items:flex-end;flex-wrap:wrap}
    .cont-verhead div span,.cont-mayor-saldo span{display:block;font-size:.74rem;color:var(--faint,#5b6680);text-transform:uppercase;letter-spacing:.05em}
    .cont-verhead div b{font-size:1rem}
    .cont-mayor-head{justify-content:space-between}
    .cont-mayor-saldo{text-align:right}
    .cont-mayor-saldo b{font-family:var(--mono,monospace);font-size:1.3rem;color:var(--brand,#6E8BFF)}
    .cont-balanza-estado{margin-top:1rem;text-align:center;font-weight:700;padding:.6rem;border-radius:10px}
    .cont-balanza-estado.is-ok{color:var(--up,#34D399);background:var(--up-soft,rgba(52,211,153,.12))}
    .cont-balanza-estado.is-bad{color:var(--gold,#F2B84B);background:var(--gold-soft,rgba(242,184,75,.12))}
    .tbl tfoot td{border-top:2px solid var(--line-strong,#22304d);padding:.7rem;font-family:var(--mono,monospace)}
    .btn--sm{padding:.45rem .8rem;font-size:.82rem}
    .cont-ef-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
    @media(max-width:900px){.cont-ef-grid{grid-template-columns:1fr}}
    .cont-ef-titulo{margin:0 0 .8rem;font-size:1rem}
    .cont-ef-sec td{font-weight:700;color:var(--brand,#6E8BFF);padding-top:.9rem!important;text-transform:uppercase;font-size:.72rem;letter-spacing:.05em}
    .cont-ef-sub td{font-weight:600;border-top:1px solid var(--line,#1a2540)}
    .cont-ef-total td{font-weight:700;font-size:1rem;border-top:2px solid var(--line-strong,#22304d);padding-top:.7rem;font-family:var(--mono,monospace)}
    .cont-ef-total td:first-child{font-family:inherit}
    .cont-sat-row{display:flex;gap:.7rem;flex-wrap:wrap;align-items:flex-end}
    .cont-xml-drop{border:2px dashed var(--line-strong,#22304d);border-radius:12px;padding:1.6rem;text-align:center}`;
  const styleEl = document.createElement("style");
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ---------- Modal propio ---------- */
  const modal = document.createElement("div");
  modal.className = "cont-modal";
  modal.innerHTML = `<div class="cont-modal__card">
    <div class="cont-modal__head"><h3 data-cont-title>Registro</h3>
      <button class="cont-modal__x" data-cont-close aria-label="Cerrar">✕</button></div>
    <div class="cont-modal__body" data-cont-body></div></div>`;
  document.body.appendChild(modal);
  const cbody = modal.querySelector("[data-cont-body]");
  const ctitle = modal.querySelector("[data-cont-title]");
  const openModal = (t) => { ctitle.textContent = t; modal.classList.add("is-open"); };
  const closeModal = () => modal.classList.remove("is-open");

  /* ---------- Render: KPIs ---------- */
  function renderStats() {
    const el = document.querySelector("[data-cont-stats]");
    if (!el) return;
    const b = balanza();
    const cards = [
      { label: "Pólizas registradas", valor: String(getPolizas().length) },
      { label: "Cuentas afectables", valor: String(getCuentasAfectables().length) },
      { label: "Movimiento (cargos)", valor: "$" + fmt(b.tot.debe) },
      { label: "Balanza", valor: b.cuadra ? "Cuadra" : "Descuadre", tono: b.cuadra ? "" : "warn" },
    ];
    el.innerHTML = cards.map((s) => `<div class="stat${s.tono === "warn" ? " is-warn" : ""}"><span>${s.label}</span><b>${s.valor}</b></div>`).join("");
  }

  /* ---------- Render: catálogo de cuentas ---------- */
  function renderCatalogo() {
    const el = document.querySelector("[data-cuentas]");
    if (!el) return;
    el.innerHTML = getCuentas().map((c) => {
      const esMayor = c.nivel === 1;
      const acciones = esMayor ? "" :
        `<button class="ract" data-cont-mayor="${c.codigo}" title="Libro mayor">${ICO_BOOK}</button>` +
        `<button class="ract" data-cont-edit-cta="${c.id}" title="Editar">${ICO_EDIT}</button>` +
        `<button class="ract ract--del" data-cont-del-cta="${c.id}" title="Eliminar">${ICO_DEL}</button>`;
      return `<tr${esMayor ? ' style="background:var(--ink-900,rgba(255,255,255,.02))"' : ""}>
        <td class="num"${esMayor ? ' style="font-weight:700"' : ""}>${esc(c.codigo)}</td>
        <td style="${esMayor ? "font-weight:700" : "padding-left:1.7rem"}">${esc(c.nombre)}</td>
        <td>${c.nat}</td>
        <td class="num" style="text-align:right${esMayor ? ";font-weight:700" : ""}">$${fmt(saldoCuenta(c))}</td>
        <td class="row-act">${acciones}</td></tr>`;
    }).join("");
  }

  /* ---------- Render: tabla de pólizas ---------- */
  function renderPolizasTabla() {
    const el = document.querySelector("[data-polizas]");
    if (!el) return;
    const pol = getPolizas();
    if (!pol.length) { el.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--faint);padding:2.2rem">Aún no hay pólizas. Crea la primera con <b>Nueva póliza</b>.</td></tr>`; return; }
    el.innerHTML = pol.map((p) => {
      const monto = (p.asientos || []).reduce((s, a) => s + num(a.debe), 0);
      return `<tr>
        <td class="num">${esc(p.folio)}</td>
        <td>${esc(p.tipo)}</td>
        <td>${esc(fechaCorta(p.fecha))}</td>
        <td>${esc(p.concepto)}</td>
        <td class="num" style="text-align:right">$${fmt(monto)}</td>
        <td><span class="pill pill--ok">Cuadrada</span></td>
        <td class="row-act">
          <button class="ract" data-cont-ver="${p.id}" title="Ver">${ICO_EYE}</button>
          <button class="ract ract--del" data-cont-del-pol="${p.id}" title="Eliminar">${ICO_DEL}</button></td></tr>`;
    }).join("");
  }

  /* ---------- Render: Libro Mayor ---------- */
  function renderMayor(codigoSel) {
    const pane = document.querySelector('[data-pane="mayor"]');
    if (!pane) return;
    const ctas = getCuentasAfectables();
    const sel = codigoSel || (ctas[0] && ctas[0].codigo) || "";
    const opts = ctas.map((c) => `<option value="${c.codigo}"${c.codigo === sel ? " selected" : ""}>${esc(c.codigo)} · ${esc(c.nombre)}</option>`).join("");
    const cta = getCuentaPorCodigo(sel);
    let saldoAcum = 0;
    const movs = sel ? movimientosCuenta(sel).movs : [];
    const filas = movs.length ? movs.map((m) => {
      saldoAcum += (cta && cta.nat === "Deudora") ? (m.debe - m.haber) : (m.haber - m.debe);
      return `<tr><td>${esc(fechaCorta(m.fecha))}</td><td class="num">${esc(m.folio)}</td><td>${esc(m.concepto)}</td>
        <td class="num" style="text-align:right">${m.debe ? "$" + fmt(m.debe) : "—"}</td>
        <td class="num" style="text-align:right">${m.haber ? "$" + fmt(m.haber) : "—"}</td>
        <td class="num" style="text-align:right;font-weight:600">$${fmt(round2(saldoAcum))}</td></tr>`;
    }).join("") : `<tr><td colspan="6" style="text-align:center;color:var(--faint);padding:2rem">Esta cuenta no tiene movimientos.</td></tr>`;
    pane.innerHTML = `<div class="card">
      <div class="cont-mayor-head">
        <div class="field" style="margin:0;max-width:360px"><label>Cuenta</label>
          <select class="input" data-mayor-cuenta>${opts || '<option value="">Sin cuentas</option>'}</select></div>
        ${cta ? `<div class="cont-mayor-saldo"><span>Saldo actual</span><b>$${fmt(saldoCuenta(cta))}</b></div>` : ""}
      </div>
      <div style="overflow-x:auto;margin-top:1rem">
        <table class="tbl"><thead><tr><th>Fecha</th><th>Folio</th><th>Concepto</th>
          <th style="text-align:right">Debe</th><th style="text-align:right">Haber</th><th style="text-align:right">Saldo</th></tr></thead>
        <tbody>${filas}</tbody></table></div></div>`;
  }

  /* ---------- Render: Balanza de comprobación ---------- */
  function renderBalanza() {
    const pane = document.querySelector('[data-pane="balanza"]');
    if (!pane) return;
    const b = balanza();
    const filas = b.filas.map((f) => `<tr>
      <td class="num">${esc(f.codigo)}</td><td>${esc(f.nombre)}</td>
      <td class="num" style="text-align:right">$${fmt(f.debe)}</td>
      <td class="num" style="text-align:right">$${fmt(f.haber)}</td>
      <td class="num" style="text-align:right">${f.saldoDeudor ? "$" + fmt(f.saldoDeudor) : "—"}</td>
      <td class="num" style="text-align:right">${f.saldoAcreedor ? "$" + fmt(f.saldoAcreedor) : "—"}</td></tr>`).join("");
    pane.innerHTML = `<div class="card">
      <div style="overflow-x:auto">
        <table class="tbl"><thead><tr><th>Código</th><th>Cuenta</th>
          <th style="text-align:right">Cargos</th><th style="text-align:right">Abonos</th>
          <th style="text-align:right">Saldo deudor</th><th style="text-align:right">Saldo acreedor</th></tr></thead>
        <tbody>${filas || `<tr><td colspan="6" style="text-align:center;color:var(--faint);padding:2rem">Sin movimientos todavía.</td></tr>`}</tbody>
        <tfoot><tr style="font-weight:700"><td colspan="2" style="text-align:right">Totales</td>
          <td class="num" style="text-align:right">$${fmt(b.tot.debe)}</td>
          <td class="num" style="text-align:right">$${fmt(b.tot.haber)}</td>
          <td class="num" style="text-align:right">$${fmt(b.tot.saldoDeudor)}</td>
          <td class="num" style="text-align:right">$${fmt(b.tot.saldoAcreedor)}</td></tr></tfoot></table></div>
      <div class="cont-balanza-estado ${b.cuadra ? "is-ok" : "is-bad"}">${b.cuadra ? "✓ La balanza cuadra" : "⚠ La balanza no cuadra"}</div></div>`;
  }

  /* ---------- Descargar archivo (XML/texto) ---------- */
  function descargarTexto(nombre, contenido, mime) {
    try {
      const blob = new Blob([contenido], { type: mime || "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = nombre;
      document.body.appendChild(a); a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 120);
    } catch (e) {}
  }

  /* ---------- Render: Estados financieros (Bloque 2) ---------- */
  function renderEstados() {
    const pane = document.querySelector('[data-pane="estados"]');
    if (!pane) return;
    const er = estadoResultados(), bg = balanceGeneral();
    const fila = (x) => `<tr><td class="num">${esc(x.codigo)}</td><td>${esc(x.nombre)}</td><td class="num" style="text-align:right">$${fmt(x.saldo)}</td></tr>`;
    pane.innerHTML = `<div class="cont-ef-grid">
      <div class="card">
        <h3 class="cont-ef-titulo">Estado de Resultados</h3>
        <table class="tbl"><tbody>
          <tr class="cont-ef-sec"><td colspan="3">Ingresos</td></tr>
          ${er.ingresos.map(fila).join("") || '<tr><td colspan="3" style="color:var(--faint)">Sin ingresos en el periodo</td></tr>'}
          <tr class="cont-ef-sub"><td colspan="2">Total de ingresos</td><td class="num" style="text-align:right">$${fmt(er.totalIngresos)}</td></tr>
          <tr class="cont-ef-sec"><td colspan="3">Costos y gastos</td></tr>
          ${er.gastos.map(fila).join("") || '<tr><td colspan="3" style="color:var(--faint)">Sin gastos en el periodo</td></tr>'}
          <tr class="cont-ef-sub"><td colspan="2">Total de gastos</td><td class="num" style="text-align:right">$${fmt(er.totalGastos)}</td></tr>
        </tbody><tfoot><tr class="cont-ef-total"><td colspan="2">${er.utilidad >= 0 ? "Utilidad" : "Pérdida"} del ejercicio</td>
          <td class="num" style="text-align:right">$${fmt(Math.abs(er.utilidad))}</td></tr></tfoot></table>
      </div>
      <div class="card">
        <h3 class="cont-ef-titulo">Balance General</h3>
        <table class="tbl"><tbody>
          <tr class="cont-ef-sec"><td colspan="3">Activo</td></tr>
          ${bg.activo.map(fila).join("") || '<tr><td colspan="3" style="color:var(--faint)">—</td></tr>'}
          <tr class="cont-ef-sub"><td colspan="2">Total activo</td><td class="num" style="text-align:right">$${fmt(bg.totalActivo)}</td></tr>
          <tr class="cont-ef-sec"><td colspan="3">Pasivo</td></tr>
          ${bg.pasivo.map(fila).join("") || '<tr><td colspan="3" style="color:var(--faint)">—</td></tr>'}
          <tr class="cont-ef-sub"><td colspan="2">Total pasivo</td><td class="num" style="text-align:right">$${fmt(bg.totalPasivo)}</td></tr>
          <tr class="cont-ef-sec"><td colspan="3">Capital</td></tr>
          ${bg.capital.map(fila).join("")}
          <tr><td class="num">305</td><td>Resultado del ejercicio</td><td class="num" style="text-align:right">$${fmt(bg.utilidad)}</td></tr>
          <tr class="cont-ef-sub"><td colspan="2">Total capital</td><td class="num" style="text-align:right">$${fmt(bg.totalCapital)}</td></tr>
        </tbody><tfoot><tr class="cont-ef-total"><td colspan="2">Pasivo + Capital</td>
          <td class="num" style="text-align:right">$${fmt(bg.totalPasivoCapital)}</td></tr></tfoot></table>
        <div class="cont-balanza-estado ${bg.cuadra ? "is-ok" : "is-bad"}">${bg.cuadra ? "✓ Activo = Pasivo + Capital" : "⚠ El balance no cuadra"}</div>
      </div></div>`;
  }

  /* ---------- Render: SAT / Declaraciones (Bloque 3) ---------- */
  function renderSAT() {
    const pane = document.querySelector('[data-pane="sat"]');
    if (!pane) return;
    const iva = determinacionIVA(), dt = diot(), rfc = getRfcEmisor(), per = getPeriodo();
    const mes = per ? per.mes : (new Date().getMonth() + 1), anio = per ? per.anio : new Date().getFullYear();
    const diotFilas = dt.length ? dt.map((d) => `<tr><td class="num">${esc(d.rfc)}</td><td>${esc(d.nombre)}</td>
      <td class="num" style="text-align:right">$${fmt(d.base)}</td><td class="num" style="text-align:right">$${fmt(d.iva)}</td></tr>`).join("")
      : '<tr><td colspan="4" style="text-align:center;color:var(--faint);padding:1.5rem">Importa CFDI de proveedores (en Pólizas) para poblar la DIOT.</td></tr>';
    pane.innerHTML = `
      <div class="card" style="margin-bottom:1rem">
        <h3 class="cont-ef-titulo">Contabilidad Electrónica · XML para el SAT</h3>
        <p style="color:var(--muted);font-size:.88rem;margin:.3rem 0 1rem">Genera los archivos que el SAT exige mensualmente: catálogo de cuentas y balanza de comprobación.</p>
        <div class="cont-sat-row">
          <div class="field" style="margin:0"><label>RFC del emisor</label><input class="input" data-sat-rfc placeholder="XAXX010101000" value="${esc(rfc)}"></div>
          <div class="field" style="margin:0;max-width:110px"><label>Mes</label><input class="input" data-sat-mes type="number" min="1" max="12" value="${mes}"></div>
          <div class="field" style="margin:0;max-width:120px"><label>Año</label><input class="input" data-sat-anio type="number" min="2020" max="2035" value="${anio}"></div>
        </div>
        <div class="cont-foot" style="justify-content:flex-start;margin-top:.8rem">
          <button class="btn btn--primary" data-sat-xml-cat>Descargar XML Catálogo</button>
          <button class="btn btn--primary" data-sat-xml-bal>Descargar XML Balanza</button>
        </div>
      </div>
      <div class="cont-ef-grid">
        <div class="card">
          <h3 class="cont-ef-titulo">Determinación de IVA</h3>
          <table class="tbl"><tbody>
            <tr><td>IVA trasladado (cobrado)</td><td class="num" style="text-align:right">$${fmt(iva.trasladado)}</td></tr>
            <tr><td>IVA acreditable (pagado)</td><td class="num" style="text-align:right">$${fmt(iva.acreditable)}</td></tr>
          </tbody><tfoot><tr class="cont-ef-total"><td>${iva.aCargo > 0 ? "IVA a cargo del periodo" : "IVA a favor del periodo"}</td>
            <td class="num" style="text-align:right">$${fmt(iva.aCargo > 0 ? iva.aCargo : iva.aFavor)}</td></tr></tfoot></table>
        </div>
        <div class="card">
          <h3 class="cont-ef-titulo">DIOT · Operaciones con terceros</h3>
          <div style="overflow-x:auto"><table class="tbl">
            <thead><tr><th>RFC</th><th>Proveedor</th><th style="text-align:right">Base</th><th style="text-align:right">IVA</th></tr></thead>
            <tbody>${diotFilas}</tbody></table></div>
        </div>
      </div>`;
  }

  /* ---------- Selector de periodo (Bloque 4) ---------- */
  function renderPeriodoSelector() {
    const host = document.querySelector("[data-cont-periodo]");
    if (!host) return;
    const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const per = getPeriodo();
    const opts = periodosDisponibles().map((p) => {
      const val = p.anio + "-" + p.mes, sel = per && per.anio === p.anio && per.mes === p.mes;
      return `<option value="${val}"${sel ? " selected" : ""}>${meses[p.mes - 1]} ${p.anio}</option>`;
    }).join("");
    host.innerHTML = `<select class="input" data-periodo-sel style="min-width:170px">
      <option value=""${!per ? " selected" : ""}>Todo el ejercicio</option>${opts}</select>`;
  }

  function renderTodo() {
    renderPeriodoSelector();
    renderStats(); renderCatalogo(); renderPolizasTabla(); renderBalanza(); renderMayor();
    renderEstados(); renderSAT();
  }

  /* ---------- Modal: cuenta ---------- */
  function mayorOptions(sel) {
    return `<option value="">— es cuenta de mayor —</option>` + getCuentas().filter((c) => c.nivel === 1)
      .map((c) => `<option value="${c.codigo}"${c.codigo === sel ? " selected" : ""}>${esc(c.codigo)} · ${esc(c.nombre)}</option>`).join("");
  }
  function openCuentaForm(id) {
    const c = id ? (getCuentas().find((x) => x.id === id) || {}) : {};
    openModal(id ? "Editar cuenta" : "Nueva cuenta");
    cbody.innerHTML = `
      <div class="cont-grid3">
        <div class="field"><label>Código</label><input class="input" id="cta-codigo" placeholder="Ej. 103" value="${esc(c.codigo || "")}"></div>
        <div class="field"><label>Naturaleza</label><select class="input" id="cta-nat">
          <option${c.nat === "Deudora" ? " selected" : ""}>Deudora</option>
          <option${c.nat === "Acreedora" ? " selected" : ""}>Acreedora</option></select></div>
      </div>
      <div class="field"><label>Nombre de la cuenta</label><input class="input" id="cta-nombre" placeholder="Ej. Bancos USD" value="${esc(c.nombre || "")}"></div>
      <div class="field"><label>Pertenece a (cuenta de mayor)</label><select class="input" id="cta-padre">${mayorOptions(c.padre || "")}</select></div>
      <div data-cont-msg></div>
      <div class="cont-foot">
        <button class="btn btn--ghost" data-cont-close>Cancelar</button>
        <button class="btn btn--primary" data-cont-guardar-cta="${id || ""}">Guardar cuenta</button></div>`;
  }
  function guardarCuentaForm(id) {
    const codigo = cbody.querySelector("#cta-codigo").value.trim();
    const nombre = cbody.querySelector("#cta-nombre").value.trim();
    const nat = cbody.querySelector("#cta-nat").value;
    const padre = cbody.querySelector("#cta-padre").value || null;
    const msg = cbody.querySelector("[data-cont-msg]");
    if (!codigo || !nombre) { msg.innerHTML = `<div class="cont-err">Captura código y nombre.</div>`; return; }
    const dup = getCuentas().find((x) => x.codigo === codigo && x.id !== id);
    if (dup) { msg.innerHTML = `<div class="cont-err">Ya existe una cuenta con el código ${esc(codigo)}.</div>`; return; }
    const cuenta = { codigo, nombre, nat, nivel: padre ? 2 : 1, padre };
    if (id) cuenta.id = id;
    saveCuenta(cuenta);
    closeModal();
    renderTodo();
  }

  /* ---------- Modal: póliza ---------- */
  function cuentaOptions(sel) {
    return `<option value="">— cuenta —</option>` + getCuentasAfectables()
      .map((c) => `<option value="${c.codigo}"${c.codigo === sel ? " selected" : ""}>${esc(c.codigo)} · ${esc(c.nombre)}</option>`).join("");
  }
  function asientoRow(a) {
    a = a || {};
    return `<div class="cont-asiento">
      <select class="input cont-as-cta">${cuentaOptions(a.codigo)}</select>
      <input class="input cont-as-debe" type="number" min="0" step="0.01" placeholder="0.00" value="${a.debe || ""}">
      <input class="input cont-as-haber" type="number" min="0" step="0.01" placeholder="0.00" value="${a.haber || ""}">
      <button class="cont-as-x" data-cont-as-del title="Quitar línea">✕</button></div>`;
  }
  function recalcCuadre() {
    let debe = 0, haber = 0;
    cbody.querySelectorAll(".cont-asiento").forEach((row) => {
      debe += num(row.querySelector(".cont-as-debe").value);
      haber += num(row.querySelector(".cont-as-haber").value);
    });
    debe = round2(debe); haber = round2(haber);
    const dif = round2(debe - haber);
    const elD = cbody.querySelector("[data-tot-debe]"), elH = cbody.querySelector("[data-tot-haber]");
    const elE = cbody.querySelector("[data-cuadre]"), btn = cbody.querySelector("[data-cont-guardar-pol]");
    if (elD) elD.textContent = "$" + fmt(debe);
    if (elH) elH.textContent = "$" + fmt(haber);
    const cuadra = Math.abs(dif) < 0.01 && debe > 0;
    if (elE) {
      elE.textContent = cuadra ? "✓ Cuadrada · lista para guardar" : (debe === 0 && haber === 0 ? "Captura los importes" : `Diferencia $${fmt(Math.abs(dif))} — iguala Debe y Haber`);
      elE.className = "cont-cuadre " + (cuadra ? "is-ok" : "is-bad");
    }
    if (btn) btn.disabled = !cuadra;
  }
  /* ---------- Plantillas de captura rápida (sin saber Debe/Haber) ---------- */
  const PLANTILLAS = [
    { id: "venta",    label: "Vendí / cobré de contado", desc: "Entró dinero por una venta",        iva: true },
    { id: "cobro",    label: "Me pagó un cliente",        desc: "Cobro de una factura anterior",      iva: false },
    { id: "gasto",    label: "Pagué un gasto",            desc: "Salió dinero por un gasto o compra", iva: true },
    { id: "pagoprov", label: "Le pagué a un proveedor",   desc: "Pago de una factura de proveedor",   iva: false },
  ];
  function plantillaAPoliza(tipoId, total, concepto, conIva, fecha) {
    total = round2(total);
    const sub = conIva ? round2(total / 1.16) : total, iva = conIva ? round2(total - sub) : 0;
    const base = { fecha: fecha || hoyISO(), concepto: concepto, origen: "rapida" };
    const A = (codigo, nombre, debe, haber) => ({ codigo, nombre, debe, haber });
    if (tipoId === "venta") return Object.assign(base, { tipo: "Ingreso", asientos: conIva
      ? [A("102", "Bancos", total, 0), A("401", "Ventas y servicios", 0, sub), A("209", "IVA trasladado", 0, iva)]
      : [A("102", "Bancos", total, 0), A("401", "Ventas y servicios", 0, total)] });
    if (tipoId === "cobro") return Object.assign(base, { tipo: "Ingreso",
      asientos: [A("102", "Bancos", total, 0), A("105", "Clientes", 0, total)] });
    if (tipoId === "gasto") return Object.assign(base, { tipo: "Egreso", asientos: conIva
      ? [A("601", "Gastos de operación", sub, 0), A("118", "IVA acreditable", iva, 0), A("102", "Bancos", 0, total)]
      : [A("601", "Gastos de operación", total, 0), A("102", "Bancos", 0, total)] });
    if (tipoId === "pagoprov") return Object.assign(base, { tipo: "Egreso",
      asientos: [A("201", "Proveedores", total, 0), A("102", "Bancos", 0, total)] });
    return null;
  }

  /* ---------- Modal: registrar movimiento (rápido + avanzado) ---------- */
  function openPolizaForm() {
    openModal("Registrar movimiento");
    cbody.innerHTML = `
      <div class="cont-modo-tabs">
        <button class="cont-modo is-active" data-modo="rapido">Captura rápida</button>
        <button class="cont-modo" data-modo="avanzado">Avanzado · Debe / Haber</button>
      </div>
      <div data-modo-body></div>`;
    renderModoRapido();
  }
  function renderModoRapido() {
    const body = cbody.querySelector("[data-modo-body]");
    body.innerHTML = `
      <p class="cont-hint">Elige qué pasó y pon el monto. El sistema arma la contabilidad por ti — sin Debe ni Haber.</p>
      <div class="cont-plantillas">
        ${PLANTILLAS.map((t) => `<button class="cont-plantilla" data-plantilla="${t.id}"><b>${t.label}</b><span>${t.desc}</span></button>`).join("")}
      </div>
      <div data-rapido-form></div>`;
  }
  function renderRapidoForm(tipoId) {
    const t = PLANTILLAS.find((x) => x.id === tipoId);
    if (!t) return;
    const ph = tipoId === "gasto" ? "Pago de renta de oficina" : tipoId === "venta" ? "Venta de consultoría" : "Factura A-123";
    cbody.querySelector("[data-rapido-form]").innerHTML = `
      <div class="cont-rapido-card">
        <div class="cont-rapido-titulo">${t.label}</div>
        <div class="field"><label>Monto total ($)</label><input class="input" id="rap-monto" type="number" min="0" step="0.01" placeholder="0.00"></div>
        <div class="field"><label>Concepto (¿de qué fue?)</label><input class="input" id="rap-concepto" placeholder="Ej. ${ph}"></div>
        <div class="field"><label>Fecha</label><input class="input" id="rap-fecha" type="date" value="${hoyISO()}"></div>
        ${t.iva ? `<label class="cont-check"><input type="checkbox" id="rap-iva" checked> El monto incluye IVA 16%</label>` : ""}
        <div data-cont-msg></div>
        <div class="cont-foot">
          <button class="btn btn--ghost" data-rapido-volver>← Cambiar</button>
          <button class="btn btn--primary" data-rapido-guardar="${tipoId}">Guardar movimiento</button></div>
      </div>`;
    const mi = cbody.querySelector("#rap-monto"); if (mi) mi.focus();
  }
  function guardarRapido(tipoId) {
    const monto = num(cbody.querySelector("#rap-monto").value);
    const concepto = cbody.querySelector("#rap-concepto").value.trim();
    const fecha = cbody.querySelector("#rap-fecha").value || hoyISO();
    const ivaChk = cbody.querySelector("#rap-iva"), conIva = ivaChk ? ivaChk.checked : false;
    const msg = cbody.querySelector("[data-cont-msg]");
    if (monto <= 0) { msg.innerHTML = `<div class="cont-err">Pon un monto mayor a cero.</div>`; return; }
    if (!concepto) { msg.innerHTML = `<div class="cont-err">Escribe de qué fue el movimiento.</div>`; return; }
    const pol = plantillaAPoliza(tipoId, monto, concepto, conIva, fecha);
    if (!pol) { msg.innerHTML = `<div class="cont-err">No se pudo crear el movimiento.</div>`; return; }
    savePoliza(pol); closeModal(); renderTodo();
  }
  function renderModoAvanzado() {
    cbody.querySelector("[data-modo-body]").innerHTML = `
      <div class="cont-grid3">
        <div class="field"><label>Tipo</label><select class="input" id="pol-tipo">
          <option>Ingreso</option><option>Egreso</option><option selected>Diario</option></select></div>
        <div class="field"><label>Fecha</label><input class="input" id="pol-fecha" type="date" value="${hoyISO()}"></div>
      </div>
      <div class="field"><label>Concepto</label><input class="input" id="pol-concepto" placeholder="Ej. Provisión de nómina 2a quincena"></div>
      <div class="cont-asientos-head"><span>Cuenta</span><span>Debe</span><span>Haber</span><span></span></div>
      <div data-cont-asientos>${asientoRow()}${asientoRow()}</div>
      <button class="btn btn--ghost btn--sm" data-cont-as-add style="margin-top:.4rem">+ Agregar línea</button>
      <div class="cont-totales">
        <div class="cont-totales-row"><span>Total Debe</span><b data-tot-debe>$0.00</b></div>
        <div class="cont-totales-row"><span>Total Haber</span><b data-tot-haber>$0.00</b></div>
        <button class="btn btn--ghost btn--sm" data-cont-cuadrar style="width:100%;margin:.4rem 0 .2rem">Cuadrar automáticamente</button>
        <div class="cont-cuadre is-bad" data-cuadre>Captura los importes</div></div>
      <div data-cont-msg></div>
      <div class="cont-foot">
        <button class="btn btn--ghost" data-cont-close>Cancelar</button>
        <button class="btn btn--primary" data-cont-guardar-pol disabled>Guardar póliza</button></div>`;
    recalcCuadre();
  }
  // Pone la diferencia en una línea vacía para cuadrar al instante.
  function cuadrarAuto() {
    let debe = 0, haber = 0;
    cbody.querySelectorAll(".cont-asiento").forEach((row) => {
      debe += num(row.querySelector(".cont-as-debe").value);
      haber += num(row.querySelector(".cont-as-haber").value);
    });
    const dif = round2(debe - haber);
    if (Math.abs(dif) < 0.01) return;
    let target = null;
    cbody.querySelectorAll(".cont-asiento").forEach((row) => {
      const d = num(row.querySelector(".cont-as-debe").value), h = num(row.querySelector(".cont-as-haber").value);
      if (!target && d === 0 && h === 0) target = row;
    });
    if (!target) {
      const cont = cbody.querySelector("[data-cont-asientos]");
      cont.insertAdjacentHTML("beforeend", asientoRow());
      target = cont.lastElementChild;
    }
    if (dif > 0) target.querySelector(".cont-as-haber").value = dif.toFixed(2);
    else target.querySelector(".cont-as-debe").value = Math.abs(dif).toFixed(2);
    recalcCuadre();
  }
  function guardarPolizaForm() {
    const tipo = cbody.querySelector("#pol-tipo").value;
    const fecha = cbody.querySelector("#pol-fecha").value || hoyISO();
    const concepto = cbody.querySelector("#pol-concepto").value.trim();
    const msg = cbody.querySelector("[data-cont-msg]");
    if (!concepto) { msg.innerHTML = `<div class="cont-err">Escribe un concepto para la póliza.</div>`; return; }
    const asientos = []; let debe = 0, haber = 0, faltaCuenta = false;
    cbody.querySelectorAll(".cont-asiento").forEach((row) => {
      const cod = row.querySelector(".cont-as-cta").value;
      const d = num(row.querySelector(".cont-as-debe").value), h = num(row.querySelector(".cont-as-haber").value);
      if (d === 0 && h === 0) return;
      if (!cod) { faltaCuenta = true; return; }
      const cta = getCuentaPorCodigo(cod);
      asientos.push({ codigo: cod, nombre: cta ? cta.nombre : "", debe: round2(d), haber: round2(h) });
      debe += d; haber += h;
    });
    if (faltaCuenta) { msg.innerHTML = `<div class="cont-err">Hay líneas con importe pero sin cuenta seleccionada.</div>`; return; }
    if (asientos.length < 2) { msg.innerHTML = `<div class="cont-err">Una póliza necesita al menos 2 movimientos.</div>`; return; }
    if (Math.abs(round2(debe - haber)) >= 0.01) { msg.innerHTML = `<div class="cont-err">La póliza no cuadra: Debe ≠ Haber.</div>`; return; }
    if (round2(debe) <= 0) { msg.innerHTML = `<div class="cont-err">El importe debe ser mayor a cero.</div>`; return; }
    savePoliza({ tipo, fecha, concepto, asientos });
    closeModal(); renderTodo();
  }

  /* ---------- Modal: ver póliza ---------- */
  function verPoliza(id) {
    const p = getPolizas().find((x) => x.id === id);
    if (!p) return;
    openModal(`Póliza ${p.folio}`);
    const filas = (p.asientos || []).map((a) => `<tr>
      <td class="num">${esc(a.codigo)}</td><td>${esc(a.nombre)}</td>
      <td class="num" style="text-align:right">${num(a.debe) ? "$" + fmt(a.debe) : "—"}</td>
      <td class="num" style="text-align:right">${num(a.haber) ? "$" + fmt(a.haber) : "—"}</td></tr>`).join("");
    const debe = (p.asientos || []).reduce((s, a) => s + num(a.debe), 0);
    const haber = (p.asientos || []).reduce((s, a) => s + num(a.haber), 0);
    cbody.innerHTML = `
      <div class="cont-verhead">
        <div><span>Tipo</span><b>${esc(p.tipo)}</b></div>
        <div><span>Fecha</span><b>${esc(fechaCorta(p.fecha))}</b></div>
        <div><span>Folio</span><b>${esc(p.folio)}</b></div></div>
      <p style="margin:.6rem 0 1rem;color:var(--muted)">${esc(p.concepto)}</p>
      <div style="overflow-x:auto">
      <table class="tbl"><thead><tr><th>Cuenta</th><th>Nombre</th><th style="text-align:right">Debe</th><th style="text-align:right">Haber</th></tr></thead>
      <tbody>${filas}</tbody>
      <tfoot><tr style="font-weight:700"><td colspan="2" style="text-align:right">Totales</td>
        <td class="num" style="text-align:right">$${fmt(debe)}</td><td class="num" style="text-align:right">$${fmt(haber)}</td></tr></tfoot></table></div>
      <div class="cont-foot"><button class="btn btn--ghost" data-cont-close>Cerrar</button></div>`;
  }

  /* ---------- Modal: Contabilizar CFDI emitidos (Bloque 1) ---------- */
  function openContabilizarCfdi() {
    const pend = cfdisPendientes();
    openModal("Contabilizar facturas (CFDI)");
    if (!pend.length) {
      cbody.innerHTML = `<p style="color:var(--muted);text-align:center;padding:1.8rem">No hay CFDI pendientes. Todas tus facturas timbradas ya tienen su póliza. ✓</p>
        <div class="cont-foot"><button class="btn btn--ghost" data-cont-close>Cerrar</button></div>`;
      return;
    }
    const filas = pend.map((c, i) => {
      const m = montosCfdi(c);
      const tipoTxt = c.tipo === "P" ? "Pago (REP)" : c.tipo === "E" ? "Nota crédito" : "Factura";
      return `<tr>
        <td><input type="checkbox" class="cont-chk" data-idx="${i}" checked></td>
        <td class="num">${esc(c.folio || "—")}</td>
        <td>${esc(c.cliente || "—")}</td>
        <td>${tipoTxt}</td>
        <td class="num" style="text-align:right">$${fmt(m.total)}</td></tr>`;
    }).join("");
    cbody.innerHTML = `
      <p style="color:var(--muted);font-size:.88rem;margin-bottom:.8rem">Estas facturas timbradas aún no tienen póliza. Genera sus asientos automáticamente (Clientes / Ventas + IVA trasladado).</p>
      <div style="overflow:auto;max-height:340px"><table class="tbl">
        <thead><tr><th style="width:30px"></th><th>Folio</th><th>Cliente</th><th>Tipo</th><th style="text-align:right">Total</th></tr></thead>
        <tbody>${filas}</tbody></table></div>
      <div data-cont-msg></div>
      <div class="cont-foot">
        <button class="btn btn--ghost" data-cont-close>Cancelar</button>
        <button class="btn btn--primary" data-cont-contab-go>Contabilizar seleccionadas</button></div>`;
    cbody._pendientes = pend;
  }
  function ejecutarContabilizar() {
    const pend = cbody._pendientes || []; let n = 0;
    cbody.querySelectorAll(".cont-chk").forEach((chk) => {
      if (chk.checked) { const c = pend[parseInt(chk.getAttribute("data-idx"), 10)]; if (c) { contabilizarCfdi(c); n++; } }
    });
    closeModal(); renderTodo();
  }

  /* ---------- Modal: Importar CFDI recibido (XML de proveedor) ---------- */
  function openImportarXml() {
    openModal("Importar CFDI recibido (XML)");
    cbody.innerHTML = `
      <p style="color:var(--muted);font-size:.88rem;margin-bottom:.8rem">Sube los XML de las facturas que te emitieron tus proveedores. Cada uno genera su póliza de gasto (Gastos + IVA acreditable / Proveedores).</p>
      <div class="cont-xml-drop">
        <input type="file" accept=".xml,text/xml" multiple data-xml-file style="display:none">
        <button class="btn btn--ghost" data-xml-pick>Seleccionar archivos XML</button>
        <p style="font-size:.78rem;color:var(--faint);margin-top:.5rem">Puedes elegir varios a la vez.</p>
      </div>
      <div data-xml-preview></div>
      <div data-cont-msg></div>
      <div class="cont-foot">
        <button class="btn btn--ghost" data-cont-close>Cerrar</button>
        <button class="btn btn--primary" data-xml-go disabled>Contabilizar</button></div>`;
    cbody._xmlPolizas = [];
  }
  function procesarArchivosXml(files) {
    if (!files || !files.length) return;
    const polizas = []; let pendientes = files.length, errores = 0;
    Array.prototype.forEach.call(files, (file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const parsed = parsearCfdiXml(reader.result);
        if (parsed && parsed.total > 0) polizas.push({ parsed, poliza: xmlAPolizaGasto(parsed), nombre: file.name });
        else errores++;
        if (--pendientes === 0) mostrarPreviewXml(polizas, errores);
      };
      reader.onerror = () => { errores++; if (--pendientes === 0) mostrarPreviewXml(polizas, errores); };
      reader.readAsText(file);
    });
  }
  function mostrarPreviewXml(polizas, errores) {
    const preview = cbody.querySelector("[data-xml-preview]"), btn = cbody.querySelector("[data-xml-go]");
    cbody._xmlPolizas = polizas;
    if (!polizas.length) {
      if (preview) preview.innerHTML = `<div class="cont-err">No se pudo leer ningún CFDI válido${errores ? ` (${errores} con error)` : ""}.</div>`;
      if (btn) btn.disabled = true; return;
    }
    const filas = polizas.map((x) => `<tr>
      <td>${esc(x.parsed.nombreEmisor || x.parsed.rfcEmisor || "—")}</td>
      <td class="num" style="text-align:right">$${fmt(x.parsed.subtotal)}</td>
      <td class="num" style="text-align:right">$${fmt(x.parsed.iva)}</td>
      <td class="num" style="text-align:right">$${fmt(x.parsed.total)}</td></tr>`).join("");
    if (preview) preview.innerHTML = `<div style="margin-top:1rem;overflow-x:auto"><table class="tbl">
      <thead><tr><th>Proveedor</th><th style="text-align:right">Base</th><th style="text-align:right">IVA</th><th style="text-align:right">Total</th></tr></thead>
      <tbody>${filas}</tbody></table></div>
      ${errores ? `<p style="color:var(--gold);font-size:.8rem;margin-top:.5rem">${errores} archivo(s) no se pudieron leer.</p>` : ""}`;
    if (btn) btn.disabled = false;
  }
  function ejecutarImportarXml() {
    (cbody._xmlPolizas || []).forEach((x) => savePoliza(x.poliza));
    closeModal(); renderTodo();
  }

  /* ---------- Eventos ---------- */
  modal.addEventListener("click", (e) => {
    if (e.target === modal || e.target.closest("[data-cont-close]")) { closeModal(); return; }
    if (e.target.closest("[data-cont-as-add]")) {
      const cont = cbody.querySelector("[data-cont-asientos]");
      if (cont) { cont.insertAdjacentHTML("beforeend", asientoRow()); recalcCuadre(); }
      return;
    }
    const asDel = e.target.closest("[data-cont-as-del]");
    if (asDel) {
      const rows = cbody.querySelectorAll(".cont-asiento");
      const row = asDel.closest(".cont-asiento");
      if (rows.length > 2) row.remove();
      else { row.querySelector(".cont-as-debe").value = ""; row.querySelector(".cont-as-haber").value = ""; }
      recalcCuadre();
      return;
    }
    if (e.target.closest("[data-cont-guardar-pol]")) { guardarPolizaForm(); return; }
    const modoBtn = e.target.closest("[data-modo]");
    if (modoBtn) {
      cbody.querySelectorAll(".cont-modo").forEach((b) => b.classList.toggle("is-active", b === modoBtn));
      if (modoBtn.getAttribute("data-modo") === "rapido") renderModoRapido(); else renderModoAvanzado();
      return;
    }
    const plant = e.target.closest("[data-plantilla]");
    if (plant) { renderRapidoForm(plant.getAttribute("data-plantilla")); return; }
    if (e.target.closest("[data-rapido-volver]")) { renderModoRapido(); return; }
    const rapGuardar = e.target.closest("[data-rapido-guardar]");
    if (rapGuardar) { guardarRapido(rapGuardar.getAttribute("data-rapido-guardar")); return; }
    if (e.target.closest("[data-cont-cuadrar]")) { cuadrarAuto(); return; }
    const gCta = e.target.closest("[data-cont-guardar-cta]");
    if (gCta) { guardarCuentaForm(gCta.getAttribute("data-cont-guardar-cta")); return; }
    if (e.target.closest("[data-cont-contab-go]")) { ejecutarContabilizar(); return; }
    if (e.target.closest("[data-xml-pick]")) { const inp = cbody.querySelector("[data-xml-file]"); if (inp) inp.click(); return; }
    if (e.target.closest("[data-xml-go]")) { ejecutarImportarXml(); return; }
  });
  // Archivos XML seleccionados dentro del modal de importación.
  cbody.addEventListener("change", (e) => {
    if (e.target.matches("[data-xml-file]")) procesarArchivosXml(e.target.files);
  });
  // Enter en la captura rápida = guardar al instante (más veloz).
  cbody.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const rapBtn = cbody.querySelector("[data-rapido-guardar]");
    if (rapBtn && (e.target.id === "rap-monto" || e.target.id === "rap-concepto")) {
      e.preventDefault();
      guardarRapido(rapBtn.getAttribute("data-rapido-guardar"));
    }
  });

  // Descarga de XML para el SAT (lee RFC/mes/año del panel SAT).
  function descargarXmlSAT(tipo) {
    const pane = document.querySelector('[data-pane="sat"]');
    if (!pane) return;
    const rfc = (pane.querySelector("[data-sat-rfc]").value || "XAXX010101000").toUpperCase().trim();
    const mes = parseInt(pane.querySelector("[data-sat-mes]").value, 10) || 1;
    const anio = parseInt(pane.querySelector("[data-sat-anio]").value, 10) || new Date().getFullYear();
    setRfcEmisor(rfc);
    const suf = `${rfc}_${anio}${String(mes).padStart(2, "0")}.xml`;
    if (tipo === "catalogo") descargarTexto("Catalogo_" + suf, xmlCatalogoSAT(rfc, mes, anio), "application/xml");
    else descargarTexto("Balanza_" + suf, xmlBalanzaSAT(rfc, mes, anio), "application/xml");
  }
  cbody.addEventListener("input", (e) => {
    if (e.target.classList.contains("cont-as-debe") || e.target.classList.contains("cont-as-haber")) {
      const row = e.target.closest(".cont-asiento");
      if (row) {
        if (e.target.classList.contains("cont-as-debe") && num(e.target.value) > 0) row.querySelector(".cont-as-haber").value = "";
        if (e.target.classList.contains("cont-as-haber") && num(e.target.value) > 0) row.querySelector(".cont-as-debe").value = "";
      }
      recalcCuadre();
    }
  });
  // El selector del Libro Mayor y el de periodo viven en el dashboard (fuera del modal).
  document.addEventListener("change", (e) => {
    if (!e.target || !e.target.matches) return;
    if (e.target.matches("[data-mayor-cuenta]")) { renderMayor(e.target.value); return; }
    if (e.target.matches("[data-periodo-sel]")) {
      const v = e.target.value;
      if (!v) setPeriodo(null);
      else { const parts = v.split("-"); setPeriodo({ anio: parseInt(parts[0], 10), mes: parseInt(parts[1], 10) }); }
      renderTodo(); return;
    }
    if (e.target.matches("[data-sat-rfc]")) { setRfcEmisor(e.target.value); return; }
  });

  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-cont-nueva-pol]")) { e.preventDefault(); openPolizaForm(); return; }
    if (e.target.closest("[data-cont-nueva-cta]")) { e.preventDefault(); openCuentaForm(); return; }
    const ver = e.target.closest("[data-cont-ver]");
    if (ver) { verPoliza(ver.getAttribute("data-cont-ver")); return; }
    const delPol = e.target.closest("[data-cont-del-pol]");
    if (delPol) {
      if (confirm("¿Eliminar esta póliza? Sus movimientos dejarán de afectar los saldos.")) { deletePoliza(delPol.getAttribute("data-cont-del-pol")); renderTodo(); }
      return;
    }
    const editCta = e.target.closest("[data-cont-edit-cta]");
    if (editCta) { openCuentaForm(editCta.getAttribute("data-cont-edit-cta")); return; }
    const delCta = e.target.closest("[data-cont-del-cta]");
    if (delCta) {
      if (confirm("¿Eliminar esta cuenta del catálogo?")) { deleteCuenta(delCta.getAttribute("data-cont-del-cta")); renderTodo(); }
      return;
    }
    const verMayor = e.target.closest("[data-cont-mayor]");
    if (verMayor) {
      const grupo = document.querySelector('[data-tabs="cont"]');
      if (grupo) {
        grupo.querySelectorAll(".tab").forEach((t) => t.classList.toggle("is-active", t.getAttribute("data-tab") === "mayor"));
        const view = grupo.closest(".view") || document;
        view.querySelectorAll(".tabpane").forEach((p) => p.classList.toggle("is-active", p.getAttribute("data-pane") === "mayor"));
      }
      renderMayor(verMayor.getAttribute("data-cont-mayor"));
      return;
    }
    if (e.target.closest("[data-cont-contabilizar]")) { openContabilizarCfdi(); return; }
    if (e.target.closest("[data-cont-importar-xml]")) { openImportarXml(); return; }
    if (e.target.closest("[data-sat-xml-cat]")) { descargarXmlSAT("catalogo"); return; }
    if (e.target.closest("[data-sat-xml-bal]")) { descargarXmlSAT("balanza"); return; }
    const nav = e.target.closest('.nav-item[data-view="contabilidad"]');
    if (nav) setTimeout(renderTodo, 30);
  });

  /* ---------- Init ---------- */
  // Render inmediato: el script va al final del body, así que las tablas ya
  // existen y este render gana sobre el de ejemplo de app.js (sin parpadeo).
  // Tomar el control de la tabla de pólizas: antes app.js la pintaba con datos
  // de ejemplo; ahora cualquier refresh muestra las pólizas contables reales.
  if (window.CTRender) window.CTRender.polizas = function () { renderPolizasTabla(); };
  function init() { renderTodo(); }
  init();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);

  window.CTCont.render = renderTodo;
  window.__CT_CONT_READY = true;
})();
