/* ============================================================
   CONTATECK · facturacion-masiva-csv.js  (OT-0061 · Timbrado masivo)

   Lee el archivo CSV del timbrado masivo y lo convierte en facturas con la
   MISMA forma que el cuerpo de POST /api/facturar. Solo lee y ordena: no valida
   fiscalmente (eso lo hace el backend con /api/facturar-masivo/validar y, al
   timbrar, /api/facturar).

   Formato: primera fila = encabezados; separador coma o punto y coma; UTF-8.
     Obligatorias: rfc, nombre, cp, regimen, descripcion, cantidad, precioUnitario
     Opcionales:   usoCfdi (G03), claveProdServ, claveUnidad, tasaIva (16),
                   metodoPago (PUE), formaPago (01), factura
   Una fila = una factura con un concepto. Si varias filas traen el mismo valor en
   la columna "factura", son conceptos de UNA sola factura (mismos datos del
   receptor, tasa, método y forma de pago).

   API (window.CTMasivoCsv, o module.exports en Node para las pruebas):
     parseCsv(texto)            -> { filas:[[...]], delimitador }
     leerFacturas(texto)        -> { facturas:[{ filaCsv, receptor, conceptos, ... }], errores:[...] }
     plantillaCsv()             -> texto de ejemplo para descargar
     resultadoCsv(items)        -> CSV con el resultado del lote
   ============================================================ */
(function (raiz) {
  "use strict";

  var MAX_FILAS = 500;

  var COLUMNAS = {
    rfc: "rfc", rfcreceptor: "rfc",
    nombre: "nombre", razonsocial: "nombre", cliente: "nombre",
    cp: "cp", codigopostal: "cp",
    regimen: "regimen", regimenfiscal: "regimen",
    usocfdi: "usoCfdi", uso: "usoCfdi",
    descripcion: "descripcion", concepto: "descripcion",
    cantidad: "cantidad",
    preciounitario: "precioUnitario", precio: "precioUnitario", valorunitario: "precioUnitario",
    claveprodserv: "claveProdServ", claveunidad: "claveUnidad",
    tasaiva: "tasaIva", iva: "tasaIva",
    metodopago: "metodoPago", metodo: "metodoPago",
    formapago: "formaPago", forma: "formaPago",
    factura: "factura", grupo: "factura", referencia: "factura",
  };
  var OBLIGATORIAS = ["rfc", "nombre", "cp", "regimen", "descripcion", "cantidad", "precioUnitario"];

  function normalizarEncabezado(t) {
    return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
  }

  // Lector CSV mínimo: comillas, "" como comilla, saltos de línea dentro de comillas.
  function parseCsv(texto) {
    var t = String(texto == null ? "" : texto).replace(/^﻿/, "");
    var primera = t.split(/\r?\n/)[0] || "";
    var delimitador = (primera.split(";").length > primera.split(",").length) ? ";" : ",";
    var filas = [], fila = [], campo = "", enComillas = false, i = 0;
    for (; i < t.length; i++) {
      var c = t[i];
      if (enComillas) {
        if (c === '"') {
          if (t[i + 1] === '"') { campo += '"'; i++; } else enComillas = false;
        } else campo += c;
      } else if (c === '"') enComillas = true;
      else if (c === delimitador) { fila.push(campo); campo = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && t[i + 1] === "\n") i++;
        fila.push(campo); campo = "";
        if (fila.some(function (x) { return String(x).trim() !== ""; })) filas.push(fila);
        fila = [];
      } else campo += c;
    }
    fila.push(campo);
    if (fila.some(function (x) { return String(x).trim() !== ""; })) filas.push(fila);
    return { filas: filas, delimitador: delimitador };
  }

  function numero(texto, delimitador) {
    var s = String(texto == null ? "" : texto).replace(/[$\s]/g, "");
    if (s === "") return NaN;
    if (s.indexOf(".") !== -1 && s.indexOf(",") !== -1) s = s.replace(/,/g, "");
    else if (s.indexOf(",") !== -1) { if (delimitador !== ";") return NaN; s = s.replace(",", "."); }
    return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
  }

  function leerFacturas(texto) {
    var p = parseCsv(texto);
    var errores = [];
    if (p.filas.length < 2) return { facturas: [], errores: ["El archivo no trae filas de datos (solo encabezados o está vacío)."] };
    var cab = p.filas[0].map(function (h) { return COLUMNAS[normalizarEncabezado(h)] || null; });
    var faltan = OBLIGATORIAS.filter(function (c) { return cab.indexOf(c) === -1; });
    if (faltan.length) return { facturas: [], errores: ["Faltan columnas obligatorias: " + faltan.join(", ") + ". Descarga la plantilla para ver el formato."] };
    var datos = p.filas.slice(1);
    if (datos.length > MAX_FILAS) return { facturas: [], errores: ["El archivo trae " + datos.length + " filas; el máximo es " + MAX_FILAS + "."] };

    var facturas = [], porGrupo = {};
    datos.forEach(function (celdas, idx) {
      var filaCsv = idx + 2; // fila en el archivo (1 = encabezados)
      var r = {};
      cab.forEach(function (col, j) { if (col) r[col] = String(celdas[j] == null ? "" : celdas[j]).trim(); });
      var concepto = { descripcion: r.descripcion, cantidad: numero(r.cantidad, p.delimitador), precioUnitario: numero(r.precioUnitario, p.delimitador) };
      if (r.claveProdServ) concepto.claveProdServ = r.claveProdServ;
      if (r.claveUnidad) concepto.claveUnidad = r.claveUnidad;
      var base = {
        receptor: { rfc: (r.rfc || "").toUpperCase(), nombre: (r.nombre || "").toUpperCase(), usoCfdi: (r.usoCfdi || "G03").toUpperCase(), cp: r.cp || "", regimen: r.regimen || "" },
        tasaIva: r.tasaIva ? r.tasaIva.replace(/%/g, "").toLowerCase() : "16",
        metodoPago: (r.metodoPago || "PUE").toUpperCase(),
        formaPago: r.formaPago || "01",
      };
      var grupo = r.factura || "";
      if (grupo && porGrupo[grupo]) {
        var f = porGrupo[grupo];
        var distinto = f.receptor.rfc !== base.receptor.rfc || f.receptor.cp !== base.receptor.cp || f.receptor.regimen !== base.receptor.regimen ||
          f.tasaIva !== base.tasaIva || f.metodoPago !== base.metodoPago || f.formaPago !== base.formaPago;
        if (distinto) errores.push("Fila " + filaCsv + ": la factura \"" + grupo + "\" ya apareció con otros datos de receptor, IVA o forma de pago; todas sus filas deben coincidir.");
        else { f.conceptos.push(concepto); f.filasCsv.push(filaCsv); }
        return;
      }
      var nueva = { filaCsv: filaCsv, filasCsv: [filaCsv], agrupador: grupo, receptor: base.receptor, conceptos: [concepto], tasaIva: base.tasaIva, metodoPago: base.metodoPago, formaPago: base.formaPago };
      if (grupo) porGrupo[grupo] = nueva;
      facturas.push(nueva);
    });

    // Cantidades/precios ilegibles: se avisan con la fila, en vez de mandar NaN al servidor.
    facturas.forEach(function (f) {
      f.conceptos.forEach(function (c, k) {
        if (!isFinite(c.cantidad) || !isFinite(c.precioUnitario)) {
          errores.push("Fila " + f.filasCsv[k] + ": la cantidad o el precio no es un número (usa solo dígitos y punto decimal, sin símbolos).");
          c.cantidad = 0; c.precioUnitario = 0; // el servidor lo rechaza con su mensaje; aquí ya se avisó
        }
      });
    });
    return { facturas: facturas, errores: errores };
  }

  function plantillaCsv() {
    return "﻿" + [
      "factura,rfc,nombre,cp,regimen,usoCfdi,descripcion,cantidad,precioUnitario,claveProdServ,claveUnidad,tasaIva,metodoPago,formaPago",
      "A1,EKU9003173C9,ESCUELA KEMPER URGATE,42501,601,G03,Servicio de consultoría contable,1,1500.00,84111500,E48,16,PUE,03",
      "A1,EKU9003173C9,ESCUELA KEMPER URGATE,42501,601,G03,Declaración mensual,1,800.00,84111500,E48,16,PUE,03",
      ",EKU9003173C9,ESCUELA KEMPER URGATE,42501,601,G03,Capacitación,2,950.00,86101700,E48,16,PUE,03",
    ].join("\r\n") + "\r\n";
  }

  function celdaCsv(v) {
    var s = String(v == null ? "" : v);
    // Un texto que empiece con = + - @ lo interpretaría Excel como fórmula: se antepone una comilla.
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function resultadoCsv(items) {
    var cab = ["fila", "cliente", "rfc", "total", "estado", "folio", "uuid", "detalle"];
    var filas = items.map(function (it) {
      return [it.filaCsv, it.cliente, it.rfc, it.total, it.estado, it.folio || "", it.uuid || "", it.detalle || ""].map(celdaCsv).join(",");
    });
    return "﻿" + [cab.join(",")].concat(filas).join("\r\n") + "\r\n";
  }

  var api = { parseCsv: parseCsv, leerFacturas: leerFacturas, plantillaCsv: plantillaCsv, resultadoCsv: resultadoCsv, MAX_FILAS: MAX_FILAS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.CTMasivoCsv = api;
})(typeof window !== "undefined" ? window : this);
