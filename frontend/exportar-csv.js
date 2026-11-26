/* ============================================================
   CONTATECK · exportar-csv.js  (OT-0074 · Exportar listas a CSV/Excel)

   Convierte una lista que el panel ya muestra (con los filtros puestos) en un CSV que
   abre Excel sin sorpresas. Solo da formato y descarga: no consulta nada ni escribe nada.

   - UTF-8 con BOM (Excel muestra bien los acentos), saltos CRLF, coma como separador.
   - Un TEXTO que empiece con = + - @ (o tabulador) se prefija con una comilla para que Excel
     no lo ejecute como fórmula. Un NÚMERO (typeof number) se escribe tal cual, así los
     importes negativos siguen siendo números.
   - Comillas y saltos de línea dentro de un texto se escapan.

   API (window.CTExportar, o module.exports en Node para las pruebas):
     csv(columnas, filas)            columnas: ["Folio", ...]   filas: [[...], ...]  -> texto CSV
     nombreArchivo(prefijo, fecha?)  -> "Ventas_2026-11-26.csv"
     descargar(nombre, texto)        -> baja el archivo desde el navegador
   ============================================================ */
(function (raiz) {
  "use strict";

  function celda(v) {
    if (v == null) return "";
    if (typeof v === "number") return isFinite(v) ? String(v) : "";
    if (typeof v === "boolean") return v ? "Sí" : "No";
    var s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function csv(columnas, filas) {
    var cab = (columnas || []).map(celda).join(",");
    var cuerpo = (filas || []).map(function (f) { return (f || []).map(celda).join(","); });
    return "﻿" + [cab].concat(cuerpo).join("\r\n") + "\r\n";
  }

  function nombreArchivo(prefijo, fecha) {
    var f = fecha instanceof Date ? fecha : new Date();
    var limpio = String(prefijo || "Exportacion").replace(/[^A-Za-z0-9_-]+/g, "_");
    var dia = f.getFullYear() + "-" + String(f.getMonth() + 1).padStart(2, "0") + "-" + String(f.getDate()).padStart(2, "0");
    return limpio + "_" + dia + ".csv";
  }

  function descargar(nombre, texto) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8" }));
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  var api = { csv: csv, nombreArchivo: nombreArchivo, descargar: descargar };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.CTExportar = api;
})(typeof window !== "undefined" ? window : this);
