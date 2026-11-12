/* ============================================================
   CONTATECK · storage-empresa.js  (OT-0038 · Fase 1)

   Antes, los datos que el panel guarda en el navegador (pólizas, folios,
   catálogo de cuentas, RFC, CFDI ya contabilizados, perfiles de marca)
   usaban una clave igual para TODAS las empresas. Si en el mismo navegador
   entraban dos empresas, la segunda veía las pólizas de la primera.

   Ahora cada clave lleva el id de la empresa: "contateck_polizas:<empresa_id>".
   Mientras no se sabe la empresa (auth-guard.js todavía no termina de leer el
   perfil) NO se lee ni se escribe en el almacenamiento del navegador: se usa
   una memoria temporal de esta pestaña, así nunca se muestra algo de otra
   empresa. En modo local puro (sin Supabase configurado) la empresa es "local".

   Qué pasa con lo que ya estaba guardado SIN empresa (claves viejas):
     - pólizas, folios, cuentas y RFC se APARTAN en "contateck_legacy_<clave>"
       (nadie los lee; se pueden recuperar a mano). No se borran: podría haber
       pólizas locales que nunca llegaron a Postgres. En modo local puro se
       adoptan como datos de "local".
     - CFDI ya contabilizados y perfiles de marca los ADOPTA la primera empresa
       que los lea. Los primeros son solo UUID (inofensivo si otra empresa los
       tiene) y los segundos son logo y color.

   API (window.CTStorage): scope(), getItem(base), setItem(base, valor),
   removeItem(base), limpiarCaches().
   ============================================================ */
(function () {
  "use strict";

  var SE_APARTAN = ["contateck_polizas", "contateck_folios", "contateck_cuentas_cache", "contateck_rfc_emisor"];
  var SE_ADOPTAN = ["contateck_cfdi_contab", "contateck_perfiles"];
  var PREFIJO_APARTADO = "contateck_legacy_";
  var CACHES = ["contateck_cuentas_cache"]; // solo respaldos de lectura: se pueden borrar sin perder nada

  var memoria = {}; // lo que se guarda mientras todavía no se sabe la empresa

  function ls() {
    try { return window.localStorage; } catch (e) { return null; }
  }
  function modoLocal() {
    var c = window.SUPABASE_CONFIG || {};
    return !c.url || !c.anonKey || String(c.url).indexOf("PEGA") !== -1;
  }
  // Identificador de empresa para las claves, o null si todavía no se conoce.
  function scope() {
    if (modoLocal()) return "local";
    var e = window.CONTATECK_EMPRESA_PG;
    return e && e.id ? String(e.id) : null;
  }
  function clave(base, s) { return base + ":" + s; }

  function leerCrudo(k) { try { var st = ls(); return st ? st.getItem(k) : null; } catch (e) { return null; } }
  function escribirCrudo(k, v) { try { var st = ls(); if (!st) return false; st.setItem(k, v); return true; } catch (e) { return false; } }
  function borrarCrudo(k) { try { var st = ls(); if (st) st.removeItem(k); } catch (e) { /* sin acceso */ } }

  // Mueve una clave vieja (sin empresa) a otra. Solo borra la original si la copia quedó bien.
  function mover(origen, destino, sobrescribir) {
    var v = leerCrudo(origen);
    if (v === null) return false;
    if (sobrescribir || leerCrudo(destino) === null) {
      if (!escribirCrudo(destino, v)) return false; // sin espacio: deja la original donde está
    }
    borrarCrudo(origen);
    return true;
  }

  // Se corre una vez al cargar: las claves viejas dejan de estar a la vista de cualquier empresa.
  function apartarLegacy() {
    SE_APARTAN.forEach(function (base) {
      if (modoLocal()) mover(base, clave(base, "local"), false);
      else mover(base, PREFIJO_APARTADO + base, false);
    });
  }

  function getItem(base) {
    var s = scope();
    if (!s) return Object.prototype.hasOwnProperty.call(memoria, base) ? memoria[base] : null;
    var k = clave(base, s), v = leerCrudo(k);
    if (v === null && SE_ADOPTAN.indexOf(base) >= 0 && mover(base, k, false)) v = leerCrudo(k);
    return v;
  }
  function setItem(base, valor) {
    var s = scope();
    if (!s) { memoria[base] = String(valor); return true; }
    return escribirCrudo(clave(base, s), String(valor));
  }
  function removeItem(base) {
    var s = scope();
    if (!s) { delete memoria[base]; return; }
    borrarCrudo(clave(base, s));
  }
  function limpiarCaches() { CACHES.forEach(removeItem); }

  apartarLegacy();

  window.CTStorage = {
    scope: scope,
    getItem: getItem,
    setItem: setItem,
    removeItem: removeItem,
    limpiarCaches: limpiarCaches,
    _apartarLegacy: apartarLegacy, // expuesto para pruebas
  };
})();
