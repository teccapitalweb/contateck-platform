/* ============================================================
   CONTATECK · empresas-selector.js  (OT-0056 · Multiempresa)

   Selector de empresa de la barra superior. Antes estaba apagado porque
   cada persona pertenecía a una sola empresa; ahora una persona puede
   pertenecer a varias (tabla usuario_empresas) y trabajar en una a la vez.

   - Lista sus empresas reales (GET /api/empresas) y marca la activa.
   - Al elegir otra: POST /api/empresas/cambiar y recarga el panel (la
     base mueve el contexto activo; nada de lo que se ve queda de la otra).
   - Muestra las invitaciones a OTRAS empresas dirigidas a su correo y
     permite aceptarlas (así se agrega a alguien a una segunda empresa).
   - Si el backend o la base aún no tienen OT-0056, el selector dice que
     solo perteneces a esta empresa, como hasta ahora.

   La cabecera X-Empresa-Id (aviso de pestaña desactualizada) la manda
   auth-guard.js dentro de su envoltura de fetch.
   ============================================================ */
(function () {
  "use strict";

  var menu = document.querySelector("[data-empresas]");
  if (!menu) return;

  function backend() { return (window.APP_CONFIG && window.APP_CONFIG.BACKEND_URL) || "https://contateck-backend-production.up.railway.app"; }
  function headers(json) {
    var h = json ? { "Content-Type": "application/json" } : {};
    if (window.CONTATECK_SUPABASE_TOKEN) h.Authorization = "Bearer " + window.CONTATECK_SUPABASE_TOKEN;
    return h;
  }
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function nota(texto, extra) {
    return '<div style="padding:.7rem .85rem;color:var(--faint);font-size:.8rem;line-height:1.4' + (extra || "") + '">' + texto + "</div>";
  }
  function cap(t) { t = String(t || ""); return t ? t[0].toUpperCase() + t.slice(1) : ""; }

  var CK = '<span class="ck"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>';
  var ocupado = false;

  function pintar(datos) {
    var empresas = (datos && datos.empresas) || [];
    var invs = (datos && datos.invitaciones) || [];
    if (!datos || datos.disponible === false || (empresas.length <= 1 && !invs.length)) {
      menu.innerHTML = nota("Perteneces solo a esta empresa.") +
        nota("Para trabajar también en otra, pide que te inviten a ella con este mismo correo.", ";padding-top:0");
      return;
    }
    var html = "";
    empresas.forEach(function (e) {
      var bloqueada = !e.acceso;
      html += '<div class="select__opt' + (e.activa ? " is-sel" : "") + '" data-emp-id="' + esc(e.id) + '"' +
        (bloqueada ? ' style="opacity:.5;cursor:not-allowed" title="Tu acceso a esta empresa está dado de baja"' : "") + ">" +
        "<div>" + esc(e.nombre) + "<small>" + esc(cap(e.rol)) + (bloqueada ? " · acceso dado de baja" : "") + "</small></div>" +
        (e.activa ? CK : "") + "</div>";
    });
    if (invs.length) {
      html += '<div style="padding:.55rem .85rem .2rem;color:var(--faint);font-size:.72rem;text-transform:uppercase;letter-spacing:.04em">Invitaciones</div>';
      invs.forEach(function (i) {
        html += '<div class="select__opt" style="cursor:default" data-inv-row="' + esc(i.id) + '">' +
          "<div>" + esc(i.empresa || "Otra empresa") + "<small>Te invitan como " + esc(i.rol || "—") + "</small></div>" +
          '<button type="button" class="v-mini v-mini--ok" style="margin-left:auto" data-emp-aceptar="' + esc(i.id) + '">Aceptar</button></div>';
      });
    }
    menu.innerHTML = html;
  }

  async function cargar() {
    try {
      var r = await fetch(backend() + "/api/empresas", { headers: headers(false) });
      var d = await r.json();
      if (!d || !d.ok) { menu.innerHTML = nota("No se pudo cargar tu lista de empresas."); return; }
      pintar(d);
    } catch (e) {
      menu.innerHTML = nota("Sin conexión con el backend.");
    }
  }

  async function cambiar(empresaId, fila) {
    if (ocupado) return;
    ocupado = true;
    if (fila) fila.style.opacity = ".6";
    try {
      var r = await fetch(backend() + "/api/empresas/cambiar", { method: "POST", headers: headers(true), body: JSON.stringify({ empresaId: empresaId }) });
      var d = await r.json();
      if (!d || !d.ok) {
        menu.insertAdjacentHTML("afterbegin", nota(esc((d && d.error) || "No se pudo cambiar de empresa."), ";color:#FB7185"));
        if (fila) fila.style.opacity = "";
        ocupado = false;
        return;
      }
      // Todo lo que está en pantalla es de la empresa anterior: se recarga completo.
      window.location.reload();
    } catch (e) {
      menu.insertAdjacentHTML("afterbegin", nota("Sin conexión con el backend.", ";color:#FB7185"));
      if (fila) fila.style.opacity = "";
      ocupado = false;
    }
  }

  async function aceptar(invitacionId, boton) {
    if (ocupado) return;
    ocupado = true;
    if (boton) boton.disabled = true;
    try {
      var r = await fetch(backend() + "/api/empresas/invitaciones/" + encodeURIComponent(invitacionId) + "/aceptar", { method: "POST", headers: headers(true) });
      var d = await r.json();
      ocupado = false;
      if (!d || !d.ok) {
        if (boton) boton.disabled = false;
        menu.insertAdjacentHTML("afterbegin", nota(esc((d && d.error) || "No se pudo aceptar la invitación."), ";color:#FB7185"));
        return;
      }
      await cargar(); // ya aparece como empresa; para entrar, se elige en la lista
    } catch (e) {
      ocupado = false;
      if (boton) boton.disabled = false;
      menu.insertAdjacentHTML("afterbegin", nota("Sin conexión con el backend.", ";color:#FB7185"));
    }
  }

  menu.addEventListener("click", function (ev) {
    var acp = ev.target.closest("[data-emp-aceptar]");
    if (acp) { ev.stopPropagation(); aceptar(acp.getAttribute("data-emp-aceptar"), acp); return; }
    var fila = ev.target.closest("[data-emp-id]");
    if (fila) {
      ev.stopPropagation();
      if (fila.classList.contains("is-sel") || fila.style.cursor === "not-allowed") return;
      cambiar(fila.getAttribute("data-emp-id"), fila);
    }
  });

  // Espera a que auth-guard.js sepa quién es la persona (token + empresa) y entonces carga la lista.
  menu.innerHTML = nota("Cargando tus empresas…");
  (async function () {
    for (var i = 0; i < 100 && !(window.CONTATECK_SUPABASE_TOKEN && window.CONTATECK_EMPRESA_PG); i++) {
      await new Promise(function (r) { setTimeout(r, 150); });
    }
    if (!window.CONTATECK_SUPABASE_TOKEN) { menu.innerHTML = nota("Perteneces solo a esta empresa."); return; }
    cargar();
  })();
})();
