/* ============================================================
   CONTATECK · data-firestore.js  (módulo ES)
   Conecta el panel a Cloud Firestore. CRUD completo:
   - Carga + siembra (una vez) pólizas, CFDI y empleados.
   - Crear, EDITAR y BORRAR con guardado real en Firestore.
   - Búsqueda en vivo por tabla.
   Si no hay config o Firestore falla, degrada a memoria local
   (los datos demo siguen visibles, sin perder nada).
   ============================================================ */
const FB_VER = "12.15.0";
const cfg = window.FIREBASE_CONFIG || {};
const configured = !!cfg.apiKey && cfg.apiKey.indexOf("PEGA") === -1 && cfg.apiKey.indexOf("TU-") === -1;

/* ---------- Utilidades ---------- */
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
function hoyCorto() { const d = new Date(); return String(d.getDate()).padStart(2, "0") + " " + MESES[d.getMonth()]; }
function parseMoney(s) { const n = parseFloat(String(s).replace(/[^0-9.]/g, "")); return isNaN(n) ? 0 : Math.round(n * 100) / 100; }
// OT-mejoras-nomina: mismo criterio que parseMoney (limpiar en automático
// al guardar, no bloquear a media captura) — RFC/CURP no llevan guiones
// ni puntos en la vida real, y NSS/cuenta bancaria son puramente
// numéricos. Si alguien pega "123-456.789" en la CLABE, se guarda
// "123456789", nunca el texto sucio.
function soloAlfanumerico(s) { return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function soloNumeros(s) { return String(s || "").replace(/[^0-9]/g, ""); }
function pad5(n) { return String(n).padStart(5, "0"); }
function hex(n) { let s = ""; for (let i = 0; i < n; i++) s += "0123456789ABCDEF"[Math.floor(Math.random() * 16)]; return s; }
function uuidShort() { return hex(4) + "…" + hex(4); }

/* ---------- Toasts ---------- */
const TICON = {
  ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
  err: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
};
const toastWrap = document.querySelector("[data-toasts]");
function toast(msg, type = "info", ms = 3200) {
  if (!toastWrap) return;
  const el = document.createElement("div");
  el.className = "toast toast--" + type;
  el.innerHTML = (TICON[type] || TICON.info) + "<span>" + msg + "</span>";
  toastWrap.appendChild(el);
  setTimeout(() => { el.classList.add("is-out"); setTimeout(() => el.remove(), 320); }, ms);
}

/* ---------- Estado local (cache) + filtros ---------- */
let localSeq = 0;
const state = {
  polizas: (window.POLIZAS || []).slice(),
  cfdis: [], // OT-0012: se llena solo con datos reales de Postgres (ver cargarCfdisPostgres)
  empleados: [], // Nómina Parte A (OT-0017): se llena solo con datos reales de Postgres (ver cargarEmpleadosPostgres)
  clientes: [],   // catálogo de clientes guardados por el usuario
  productos: [],  // catálogo de productos/servicios guardados
};
const filters = { polizas: "", cfdis: "", empleados: "" };

function ensureIds(coll) { state[coll].forEach((r) => { if (!r.id) r.id = "local-" + (++localSeq); }); }
function searchText(coll, r) {
  if (coll === "polizas") return (r.folio + " " + r.tipo + " " + r.concepto + " " + r.fecha).toLowerCase();
  if (coll === "cfdis") return (r.folio + " " + r.uuid + " " + (r.uuidFull || "") + " " + r.cliente + " " + r.fecha).toLowerCase();
  return (r.nombre + " " + r.puesto).toLowerCase();
}
function refresh(coll) {
  const term = filters[coll];
  const arr = state[coll];
  const shown = term ? arr.filter((r) => searchText(coll, r).indexOf(term) > -1) : arr;
  if (window.CTRender && typeof window.CTRender[coll] === "function") window.CTRender[coll](shown);
}

/* ---------- Esquemas ---------- */
const SCHEMAS = {
  poliza: {
    title: "póliza", coll: "polizas",
    fields: [
      { k: "tipo", label: "Tipo de póliza", type: "seg", opts: ["Diario", "Ingreso", "Egreso"], def: "Diario" },
      { k: "concepto", label: "Concepto", type: "text", ph: "Ej. Pago a proveedor de servicios", req: true },
      { k: "monto", label: "Monto (MXN)", type: "money", ph: "0.00", req: true },
    ],
    editable: (v) => ({ tipo: v.tipo, concepto: v.concepto.trim(), monto: parseMoney(v.monto) }),
    meta: () => ({ folio: "IPC-X-" + pad5(143 + state.polizas.length), fecha: hoyCorto(), estado: "ok", createdAt: Date.now() }),
    fix: (o) => { o.folio = "IPC-" + (o.tipo || "D").charAt(0) + "-" + pad5(143 + state.polizas.length); return o; },
    fill: (o) => ({ tipo: o.tipo, concepto: o.concepto, monto: o.monto }),
  },
  // OT-0012: se quitó el schema genérico "cfdi" — permitía crear/editar
  // "facturas" a mano (solo cliente + total) directo en Firestore, sin
  // pasar por Fiscalapi/SAT. Un CFDI real solo se crea vía /api/facturar
  // (facturacion.js) y solo se cancela vía /api/cancelar.
  empleado: {
    title: "empleado", coll: "empleados",
    fields: [
      { k: "nombre", label: "Nombre completo", type: "text", ph: "Nombre del empleado", req: true },
      { k: "puesto", label: "Puesto", type: "text", ph: "Ej. Contadora", req: true },
      { k: "departamento", label: "Departamento", type: "text", ph: "Ej. Contabilidad" },
      { k: "fecha_ingreso", label: "Fecha de ingreso", type: "date" },
      // OT-nomina: el usuario captura como piensa ("$6,000 al mes") y el
      // sistema traduce a salario diario por dentro — conversión silenciosa
      // en editable(), el usuario nunca ve el divisor. Divisores:
      // mensual/30, quincenal/15, semanal/7, diario/1.
      {
        k: "sueldo_tipo", label: "Tipo de sueldo", type: "seg", def: "mensual",
        opts: [
          { v: "mensual", t: "Mensual" }, { v: "quincenal", t: "Quincenal" },
          { v: "semanal", t: "Semanal" }, { v: "diario", t: "Diario" },
        ],
      },
      { k: "sueldo_monto_original", label: "Monto pactado (MXN)", type: "money", ph: "0.00", req: true },
      { k: "rfc", label: "RFC", type: "text", ph: "Opcional", mask: "alfa", max: 13 },
      { k: "curp", label: "CURP", type: "text", ph: "Opcional", mask: "alfa", max: 18 },
      { k: "nss", label: "NSS (IMSS)", type: "text", ph: "Opcional", mask: "num", max: 11 },
      { k: "cuenta_bancaria", label: "Cuenta bancaria / CLABE", type: "text", ph: "Opcional", mask: "num", max: 18 },
      // OT-nomina-p1: estados de ausencia temporal (incapacidad, maternidad,
      // permiso) — se guardan en minúsculas (consistente con "ok"/"baja" ya
      // existentes en la BD); la etiqueta visible es la bonita. La prenómina
      // (pieza 3) solo pagará a los que estén estrictamente en "ok".
      {
        k: "estado", label: "Estado", type: "seg", def: "ok",
        opts: [
          { v: "ok", t: "Activo" }, { v: "incapacidad", t: "Incapacidad" },
          { v: "maternidad", t: "Maternidad" }, { v: "permiso", t: "Permiso" },
          { v: "baja", t: "Baja" },
        ],
      },
    ],
    editable: (v) => {
      const tipo = v.sueldo_tipo || "mensual";
      const monto = parseMoney(v.sueldo_monto_original);
      // Conversión silenciosa a salario diario — el usuario nunca la ve.
      // OT-nomina-precision: se guarda con 6 decimales (no 2) para evitar
      // el "centavo fantasma". Ej: 4000/7 = 571.428571 (no 571.43). El
      // redondeo a 2 decimales se hace solo al final, en la prenómina.
      const DIVISORES = { mensual: 30, quincenal: 15, semanal: 7, diario: 1 };
      const diario = Math.round((monto / (DIVISORES[tipo] || 30)) * 1e6) / 1e6;
      return {
        nombre: v.nombre.trim(), puesto: v.puesto.trim(),
        sueldo: diario, sueldo_tipo: tipo, sueldo_monto_original: monto,
        departamento: (v.departamento || "").trim() || null,
        fecha_ingreso: (v.fecha_ingreso || "").trim() || null,
        rfc: soloAlfanumerico(v.rfc) || null, curp: soloAlfanumerico(v.curp) || null,
        nss: soloNumeros(v.nss) || null, cuenta_bancaria: soloNumeros(v.cuenta_bancaria) || null,
        estado: v.estado || "ok",
      };
    },
    meta: () => ({ estado: "ok", createdAt: Date.now() }),
    fill: (o) => ({
      nombre: o.nombre, puesto: o.puesto,
      sueldo_tipo: o.sueldo_tipo || "mensual",
      sueldo_monto_original: o.sueldo_monto_original || o.sueldo,
      departamento: o.departamento,
      fecha_ingreso: o.fecha_ingreso, rfc: o.rfc, curp: o.curp, nss: o.nss, cuenta_bancaria: o.cuenta_bancaria,
      estado: o.estado,
    }),
  },
};
const COLL2KEY = { polizas: "poliza", empleados: "empleado" };
function labelOf(coll, o) { return coll === "empleados" ? o.nombre : o.folio; }

/* ---------- Modal ---------- */
const modal = document.querySelector("[data-modal]");
const mTitle = modal && modal.querySelector("[data-modal-title]");
const mBody = modal && modal.querySelector("[data-modal-body]");
const mSave = modal && modal.querySelector("[data-modal-save]");
let current = null; // {mode, schema?, coll, id?, obj?, label?}

function fieldHTML(f, val) {
  const v = val == null ? "" : String(val);
  if (f.type === "seg") {
    // OT-nomina-p1: soporta opciones como string plano ("Diario") o como
    // par { v: valor-interno, t: etiqueta-visible } — retrocompatible con
    // los esquemas ya existentes (pólizas). flex-wrap para que 5 opciones
    // (Estado del empleado) acomoden en 2 filas sin desbordarse del modal.
    const opts = f.opts.map((o) => (typeof o === "string" ? { v: o, t: o } : o));
    const activo = val || f.def;
    return '<div class="fld"><label>' + f.label + '</label><div class="seg" data-seg="' + f.k + '" style="flex-wrap:wrap">' +
      opts.map((o) => '<button type="button" data-val="' + o.v + '" class="' + (o.v === activo ? "is-active" : "") + '">' + o.t + "</button>").join("") +
      "</div></div>";
  }
  if (f.type === "money") {
    return '<div class="fld" data-fld="' + f.k + '"><label>' + f.label + '</label>' +
      '<div class="money-in"><input data-in="' + f.k + '" inputmode="decimal" value="' + v + '" placeholder="' + (f.ph || "") + '"></div>' +
      '<span class="err">Escribe un monto válido.</span></div>';
  }
  // OT-mejoras-nomina: selector nativo de fecha (calendario del propio
  // navegador) en vez de texto libre — antes se pedía "AAAA-MM-DD" a mano,
  // fácil de escribir mal. El valor que entrega este input ya sale en
  // formato ISO (AAAA-MM-DD), exactamente lo que espera la columna `date`
  // en Postgres — no hace falta tocar readForm() ni el backend.
  if (f.type === "date") {
    return '<div class="fld" data-fld="' + f.k + '"><label>' + f.label + '</label>' +
      '<input data-in="' + f.k + '" type="date" value="' + v + '"><span class="err">Este campo es obligatorio.</span></div>';
  }
  // OT-mejoras-nomina: data-mask bloquea EN VIVO (letra por letra) los
  // caracteres que no aplican — "alfa" para RFC/CURP (solo letras y
  // números, mayúsculas), "num" para NSS/cuenta bancaria (solo dígitos).
  // maxlength usa el tope MÁXIMO real (RFC puede ser 12 o 13, CLABE 16 o
  // 18) — nunca fuerza una longitud exacta que rechazaría casos válidos.
  return '<div class="fld" data-fld="' + f.k + '"><label>' + f.label + '</label>' +
    '<input data-in="' + f.k + '" type="text"' + (f.mask ? ' data-mask="' + f.mask + '"' : "") + (f.max ? ' maxlength="' + f.max + '"' : "") +
    ' value="' + v.replace(/"/g, "&quot;") + '" placeholder="' + (f.ph || "") + '"><span class="err">Este campo es obligatorio.</span></div>';
}

function bindSegs() {
  mBody.querySelectorAll(".seg").forEach((seg) => {
    seg.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      seg.querySelectorAll("button").forEach((x) => x.classList.remove("is-active"));
      b.classList.add("is-active");
    }));
  });
}
function resetSaveBtn() { if (mSave) { mSave.textContent = "Guardar"; mSave.classList.remove("btn--danger"); } }

function openCreate(key) {
  const s = SCHEMAS[key]; if (!s || !modal) return;
  current = { mode: "create", schema: s, coll: s.coll };
  mTitle.textContent = "Nuevo " + s.title;
  mBody.innerHTML = s.fields.map((f) => fieldHTML(f, null)).join("");
  bindSegs(); resetSaveBtn();
  modal.classList.add("is-open");
  const first = mBody.querySelector("input"); if (first) setTimeout(() => first.focus(), 50);
}
function openEdit(coll, id) {
  const s = SCHEMAS[COLL2KEY[coll]]; if (!s || !modal) return;
  const obj = state[coll].find((x) => x.id === id); if (!obj) return;
  current = { mode: "edit", schema: s, coll: coll, id: id, obj: obj };
  const vals = s.fill(obj);
  mTitle.textContent = "Editar " + s.title;
  mBody.innerHTML = s.fields.map((f) => fieldHTML(f, vals[f.k])).join("");
  bindSegs(); resetSaveBtn();
  modal.classList.add("is-open");
}
function openConfirm(coll, id) {
  const obj = state[coll].find((x) => x.id === id); if (!obj || !modal) return;
  current = { mode: "del", coll: coll, id: id, label: labelOf(coll, obj) };
  mTitle.textContent = "Eliminar registro";
  mBody.innerHTML = '<p style="color:var(--muted);font-size:.93rem;line-height:1.55">¿Seguro que quieres eliminar <b style="color:var(--text)">' +
    current.label + "</b>? Esta acción no se puede deshacer.</p>";
  mSave.textContent = "Eliminar"; mSave.classList.add("btn--danger");
  modal.classList.add("is-open");
}
function closeModal() { if (modal) { modal.classList.remove("is-open"); current = null; resetSaveBtn(); } }

function readForm(s) {
  const v = {}; let ok = true;
  s.fields.forEach((f) => {
    if (f.type === "seg") {
      const act = mBody.querySelector('[data-seg="' + f.k + '"] .is-active');
      v[f.k] = act ? act.getAttribute("data-val") : f.def;
    } else {
      const inp = mBody.querySelector('[data-in="' + f.k + '"]');
      const fld = mBody.querySelector('[data-fld="' + f.k + '"]');
      const val = (inp.value || "").trim();
      let bad = false;
      if (f.req && !val) bad = true;
      if (f.type === "money" && parseMoney(val) <= 0) bad = true;
      if (bad) { ok = false; if (fld) fld.classList.add("is-err"); } else if (fld) fld.classList.remove("is-err");
      v[f.k] = val;
    }
  });
  return ok ? v : null;
}

/* Firestore handles */
let db = null, _collection = null, _addDoc = null, _doc = null, _updateDoc = null, _deleteDoc = null;

async function saveCurrent() {
  if (!current) return;
  if (current.mode === "del") return doDelete();
  const s = current.schema;
  const v = readForm(s); if (!v) return;
  const patch = s.editable(v);
  if (mSave) { mSave.disabled = true; mSave.textContent = "Guardando…"; }
  // OT-0008-C: polizas/empleados escriben en Postgres, no en Firestore.
  const usaPostgres = (current.coll === "polizas" || current.coll === "empleados") && window.CTPostgres && window.CONTATECK_SUPABASE_TOKEN;
  try {
    if (current.mode === "create") {
      let obj = Object.assign(s.meta(), patch);
      if (s.fix) obj = s.fix(obj);
      if (usaPostgres) {
        const r = await window.CTPostgres.crear(current.coll, patch);
        if (!r.ok) throw new Error(r.error || "No se pudo guardar en Postgres");
        obj = Object.assign(obj, r.registro);
      } else if (db) { const ref = await _addDoc(_collection(db, current.coll), obj); obj.id = ref.id; }
      else obj.id = "local-" + (++localSeq);
      state[current.coll].unshift(obj);
      refresh(current.coll);
      toast(usaPostgres ? "Guardado en Postgres" : (db ? "Guardado en Firestore" : "Guardado localmente"), usaPostgres || db ? "ok" : "warn");
    } else { // edit
      if (usaPostgres && current.id && !String(current.id).startsWith("local-")) {
        const r = await window.CTPostgres.actualizar(current.coll, current.id, patch);
        if (!r.ok) throw new Error(r.error || "No se pudo actualizar en Postgres");
      } else if (db) {
        await _updateDoc(_doc(db, current.coll, current.id), patch);
      }
      Object.assign(current.obj, patch);
      refresh(current.coll);
      toast("Cambios guardados", "ok");
    }
    closeModal();
  } catch (e) {
    if (current && current.mode === "create") { /* ya unshifteado? no, falló antes */ }
    toast("No se pudo guardar (" + (e.code || e.message || "error") + ")", "err", 4800);
  } finally {
    if (mSave) { mSave.disabled = false; resetSaveBtn(); }
  }
}

async function doDelete() {
  if (!current) return;
  const { coll, id } = current;
  if (mSave) { mSave.disabled = true; mSave.textContent = "Eliminando…"; }
  // OT-0008-C: polizas/empleados se eliminan (o dan de baja) en Postgres.
  const usaPostgres = (coll === "polizas" || coll === "empleados") && window.CTPostgres && window.CONTATECK_SUPABASE_TOKEN && id && !String(id).startsWith("local-");
  try {
    if (usaPostgres) {
      const r = await window.CTPostgres.eliminar(coll, id);
      if (!r.ok) throw new Error(r.error || "No se pudo eliminar en Postgres");
      if (r.softDelete) {
        // Empleados: no se borra el registro, solo se marca "baja".
        const row = state[coll].find((x) => x.id === id);
        if (row) row.estado = "baja";
        refresh(coll);
        toast("Empleado marcado como baja", "ok");
        closeModal();
        return;
      }
    } else if (db) {
      await _deleteDoc(_doc(db, coll, id));
    }
    state[coll] = state[coll].filter((x) => x.id !== id);
    refresh(coll);
    toast("Registro eliminado", "ok");
    closeModal();
  } catch (e) {
    toast("No se pudo eliminar (" + (e.code || e.message || "error") + ")", "err", 4800);
  } finally {
    if (mSave) { mSave.disabled = false; resetSaveBtn(); }
  }
}

/* Cerrar / guardar / atajos */
if (modal) {
  modal.querySelectorAll("[data-modal-close]").forEach((el) => el.addEventListener("click", closeModal));
  if (mSave) mSave.addEventListener("click", saveCurrent);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && modal.classList.contains("is-open")) closeModal(); });
}

/* Botones crear / avisar / editar / borrar (delegación) */
document.querySelectorAll("[data-new]").forEach((b) => b.addEventListener("click", () => openCreate(b.getAttribute("data-new"))));
document.querySelectorAll("[data-soon]").forEach((b) => b.addEventListener("click", () => toast(b.getAttribute("data-soon") || "Disponible en la siguiente fase.", "info", 3600)));
document.addEventListener("click", (e) => {
  const ed = e.target.closest("[data-edit]");
  const dl = e.target.closest("[data-del]");
  if (ed) { const p = ed.getAttribute("data-edit").split("::"); openEdit(p[0], p[1]); }
  if (dl) { const p = dl.getAttribute("data-del").split("::"); openConfirm(p[0], p[1]); }
});

/* Búsqueda en vivo */
document.querySelectorAll("[data-search]").forEach((inp) => {
  const coll = inp.getAttribute("data-search");
  inp.addEventListener("input", () => { filters[coll] = (inp.value || "").toLowerCase().trim(); refresh(coll); });
});

// OT-mejoras-nomina: bloqueo EN VIVO de caracteres que no aplican, letra
// por letra mientras se escribe — no deja que aparezcan guiones/puntos
// en RFC/CURP, ni letras en NSS/cuenta bancaria. Delegado en `document`
// (no en el input directo) porque estos campos se crean e se destruyen
// cada vez que se abre/cierra el modal — un listener directo se perdería.
document.addEventListener("input", (e) => {
  const el = e.target;
  const mask = el.getAttribute && el.getAttribute("data-mask");
  if (!mask) return;
  const antes = el.value;
  let despues = antes;
  if (mask === "alfa") despues = antes.toUpperCase().replace(/[^A-Z0-9]/g, "");
  else if (mask === "num") despues = antes.replace(/[^0-9]/g, "");
  if (despues === antes) return;
  const cursor = el.selectionStart == null ? despues.length : el.selectionStart - (antes.length - despues.length);
  el.value = despues;
  try { el.setSelectionRange(cursor, cursor); } catch (e2) { /* algunos navegadores/tipos de input no soportan setSelectionRange */ }
});

/* Pintado inicial con ids asegurados (sirve también en modo demo) */
["polizas", "cfdis", "empleados"].forEach((c) => { ensureIds(c); refresh(c); });

/* ===== Firestore: init + carga + siembra ===== */
if (configured) {
  try {
    const [appMod, fsMod] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-firestore.js`),
    ]);
    const { initializeApp, getApps, getApp } = appMod;
    const { getFirestore, collection, getDocs, addDoc, doc, updateDoc, deleteDoc, query, orderBy } = fsMod;

    const app = getApps().length ? getApp() : initializeApp(cfg);
    db = getFirestore(app);
    _collection = collection; _addDoc = addDoc; _doc = doc; _updateDoc = updateDoc; _deleteDoc = deleteDoc;

    try {
      const start = Date.now();
      while (window.CONTATECK_SUPABASE_TOKEN === undefined && Date.now() - start < 4000) {
        await new Promise((r) => setTimeout(r, 100));
      }
      const supaToken = window.CONTATECK_SUPABASE_TOKEN;
      if (supaToken) {
        const BACKEND = (window.APP_CONFIG && window.APP_CONFIG.BACKEND_URL) || "https://contateck-backend-production.up.railway.app";
        const resp = await fetch(`${BACKEND}/api/firebase-token`, {
          headers: { Authorization: `Bearer ${supaToken}` },
        });
        const data = await resp.json();
        if (data.ok && data.token) {
          const authMod = await import(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-auth.js`);
          const { getAuth, signInWithCustomToken } = authMod;
          await signInWithCustomToken(getAuth(app), data.token);
        }
      }
    } catch (e) {
      // Sin puente de Firebase disponible: las lecturas de abajo
      // fallarán con permission-denied, igual que ya pasaba antes.
    }

    async function loadColl(name, seed) {
      const snap = await getDocs(query(collection(db, name), orderBy("createdAt", "desc")));
      if (snap.empty && seed && seed.length) {
        const base = Date.now();
        for (let i = 0; i < seed.length; i++) {
          await addDoc(collection(db, name), Object.assign({}, seed[i], { createdAt: base - i * 1000 }));
        }
        const snap2 = await getDocs(query(collection(db, name), orderBy("createdAt", "desc")));
        return snap2.docs.map((d) => Object.assign({ id: d.id }, d.data()));
      }
      return snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
    }

    const [pol, cli, prod] = await Promise.all([
      loadColl("polizas", window.POLIZAS),
      loadColl("clientes", null),
      loadColl("productos", null),
    ]);
    state.polizas = pol;
    state.clientes = cli; state.productos = prod;
    refresh("polizas");
    toast("Datos sincronizados con Firestore", "ok", 2400);
  } catch (e) {
    toast("Firestore no disponible (" + (e.code || e.message || "error") + "). Mostrando datos demo.", "warn", 4800);
  }
}

async function esperarOperacionPostgres(maxMs = 5000) {
  const start = Date.now();
  while (
    window.CONTATECK_EMPLEADOS_PG === undefined &&
    window.CONTATECK_POLIZAS_PG === undefined &&
    Date.now() - start < maxMs
  ) {
    await new Promise((r) => setTimeout(r, 150));
  }
}

function mezclarOperacionPostgres() {
  const pgPol = window.CONTATECK_POLIZAS_PG || [];
  if (!pgPol.length) return;
  const foliosLocal = new Set(state.polizas.map((p) => p.folio));
  const nuevasPol = pgPol.filter((p) => !foliosLocal.has(p.folio));
  if (nuevasPol.length) state.polizas = state.polizas.concat(nuevasPol);
  if (nuevasPol.length) {
    ensureIds("polizas");
    refresh("polizas");
  }
}

try {
  await esperarOperacionPostgres();
  mezclarOperacionPostgres();
  setTimeout(mezclarOperacionPostgres, 3000);
} catch (e) {
  console.warn("[CONTATECK][OT-0008] No se pudo mezclar empleados/pólizas de Postgres:", e);
}

function formatFechaCorta(iso) {
  if (!iso) return hoyCorto();
  const d = new Date(iso);
  if (isNaN(d.getTime())) return hoyCorto();
  return String(d.getDate()).padStart(2, "0") + " " + MESES[d.getMonth()];
}
function mapCfdiPostgres(r) {
  const uuidFull = r.uuid_sat || "";
  return {
    id: r.id,
    folio: r.folio || r.serie || r.fiscalapi_id || "—",
    uuid: uuidFull ? (uuidFull.slice(0, 8) + "…" + uuidFull.slice(-4)) : "—",
    uuidFull: uuidFull,
    cliente: r.receptor_nombre || r.receptor_rfc || "—",
    fecha: formatFechaCorta(r.fecha || r.created_at),
    total: typeof r.total === "number" ? r.total : parseMoney(r.total || 0),
    estado: r.estatus === "cancelado" ? "cancelada" : "ok",
    cfdiId: r.fiscalapi_id || null,
    tipo: r.tipo || "I",
    metodoPago: r.metodo_pago || null,
  };
}
async function esperarCfdisPostgres(maxMs = 5000) {
  const start = Date.now();
  while (window.CONTATECK_CFDIS_PG === undefined && Date.now() - start < maxMs) {
    await new Promise((r) => setTimeout(r, 150));
  }
}
function cargarCfdisPostgres() {
  const pg = window.CONTATECK_CFDIS_PG;
  if (!Array.isArray(pg)) return;
  state.cfdis = pg.map(mapCfdiPostgres);
  refresh("cfdis");
}
try {
  await esperarCfdisPostgres();
  cargarCfdisPostgres();
  setTimeout(cargarCfdisPostgres, 3000);
} catch (e) {
  console.warn("[CONTATECK][OT-0012] No se pudieron cargar los CFDIs de Postgres:", e);
}

async function esperarEmpleadosPostgres(maxMs = 5000) {
  const start = Date.now();
  while (window.CONTATECK_EMPLEADOS_REAL_PG === undefined && Date.now() - start < maxMs) {
    await new Promise((r) => setTimeout(r, 150));
  }
}
function cargarEmpleadosPostgres() {
  const pg = window.CONTATECK_EMPLEADOS_REAL_PG;
  if (!Array.isArray(pg)) return;
  state.empleados = pg;
  ensureIds("empleados");
  refresh("empleados");
}
try {
  await esperarEmpleadosPostgres();
  cargarEmpleadosPostgres();
  setTimeout(cargarEmpleadosPostgres, 3000);
} catch (e) {
  console.warn("[CONTATECK][OT-0017] No se pudieron cargar los empleados de Postgres:", e);
}

async function addCfdiTimbrado(parcial) {
  parcial = parcial || {};
  const uuidFull = String(parcial.uuid || "");
  const obj = {
    id: "local-" + (++localSeq),
    folio: parcial.folio || "—",
    uuid: uuidFull ? (uuidFull.slice(0, 8) + "…" + uuidFull.slice(-4)) : "—",
    uuidFull: uuidFull,
    cliente: parcial.cliente || "—",
    total: typeof parcial.total === "number" ? parcial.total : parseMoney(parcial.total || 0),
    fecha: parcial.fecha || hoyCorto(),
    estado: parcial.estado || "ok",
    cfdiId: parcial.cfdiId || null,
    metodoPago: parcial.metodoPago || "PUE",
    tipo: parcial.tipo || "I",
    receptorRfc: parcial.receptorRfc || "",
    perfilId: parcial.perfilId || "",
    saldo: typeof parcial.total === "number" ? parcial.total : parseMoney(parcial.total || 0),
    createdAt: Date.now(),
  };
  state.cfdis.unshift(obj);
  refresh("cfdis");
  return obj;
}

window.CTData = window.CTData || {};
window.CTData.addCfdi = addCfdiTimbrado;

async function markCfdiCancelledLocal(rowId) {
  const f = state.cfdis.find((x) => x.id === rowId);
  if (!f) return null;
  f.estado = "cancelada";
  refresh("cfdis");
  return f;
}
window.CTData.markCfdiCancelled = markCfdiCancelledLocal;

function getClientes() { return state.clientes.slice(); }
function getProductos() { return state.productos.slice(); }

async function saveClienteLocal(c) {
  const obj = {
    rfc: String(c.rfc || "").toUpperCase().trim(),
    nombre: String(c.nombre || "").trim(),
    usoCfdi: c.usoCfdi || "G03",
    createdAt: Date.now(),
  };
  if (!obj.rfc || !obj.nombre) return null;
  const existe = state.clientes.find((x) => x.rfc === obj.rfc);
  if (existe) return existe;
  try {
    if (window.CTPostgres && window.CONTATECK_SUPABASE_TOKEN) {
      const r = await window.CTPostgres.crear("clientes", { nombre: obj.nombre, rfc: obj.rfc, uso_cfdi: obj.usoCfdi });
      if (r.ok) obj.id = r.registro.id;
      else if (db) { const ref = await _addDoc(_collection(db, "clientes"), obj); obj.id = ref.id; }
      else obj.id = "local-" + (++localSeq);
    } else if (db) { const ref = await _addDoc(_collection(db, "clientes"), obj); obj.id = ref.id; }
    else obj.id = "local-" + (++localSeq);
  } catch (e) { obj.id = "local-" + (++localSeq); }
  state.clientes.unshift(obj);
  return obj;
}

async function saveProductoLocal(p) {
  const obj = {
    descripcion: String(p.descripcion || "").trim(),
    precioUnitario: Number(p.precioUnitario || 0),
    createdAt: Date.now(),
  };
  if (!obj.descripcion || obj.precioUnitario <= 0) return null;
  const existe = state.productos.find((x) => x.descripcion === obj.descripcion && x.precioUnitario === obj.precioUnitario);
  if (existe) return existe;
  try {
    if (window.CTPostgres && window.CONTATECK_SUPABASE_TOKEN) {
      const r = await window.CTPostgres.crear("productos", { descripcion: obj.descripcion, precio_unitario: obj.precioUnitario });
      if (r.ok) obj.id = r.registro.id;
      else if (db) { const ref = await _addDoc(_collection(db, "productos"), obj); obj.id = ref.id; }
      else obj.id = "local-" + (++localSeq);
    } else if (db) { const ref = await _addDoc(_collection(db, "productos"), obj); obj.id = ref.id; }
    else obj.id = "local-" + (++localSeq);
  } catch (e) { obj.id = "local-" + (++localSeq); }
  state.productos.unshift(obj);
  return obj;
}

window.CTData.getClientes = getClientes;
window.CTData.getProductos = getProductos;
window.CTData.saveCliente = saveClienteLocal;
window.CTData.saveProducto = saveProductoLocal;

window.CTData.getCfdis = () => state.cfdis.slice();

async function updateCfdiSaldoLocal(rowId, nuevoSaldo) {
  const f = state.cfdis.find((x) => x.id === rowId);
  if (!f) return;
  f.saldo = Number(nuevoSaldo);
  refresh("cfdis");
}
window.CTData.updateCfdiSaldo = updateCfdiSaldoLocal;

const PERFILES_KEY = "contateck_perfiles";

function _leerPerfiles() {
  try {
    const raw = JSON.parse(localStorage.getItem(PERFILES_KEY) || "null");
    if (raw && Array.isArray(raw.perfiles)) return raw;
  } catch (e) { /* sigue a migración */ }
  try {
    const viejo = JSON.parse(localStorage.getItem("contateck_empresa") || "null");
    if (viejo && (viejo.logo || viejo.color)) {
      const p = { id: "p" + Date.now(), nombre: "Mi marca", logo: viejo.logo || "", color: viejo.color || "#6E8BFF" };
      const data = { perfiles: [p], activoId: p.id };
      _guardarPerfiles(data);
      return data;
    }
  } catch (e) { /* sin config previa */ }
  return { perfiles: [], activoId: "" };
}
function _guardarPerfiles(data) {
  try { localStorage.setItem(PERFILES_KEY, JSON.stringify(data)); return true; }
  catch (e) { return false; }
}
function getPerfiles() { return _leerPerfiles().perfiles.slice(); }
function getPerfilActivo() {
  const d = _leerPerfiles();
  return d.perfiles.find((p) => p.id === d.activoId) || d.perfiles[0] || null;
}
function getPerfilById(id) {
  if (!id) return null;
  return _leerPerfiles().perfiles.find((p) => p.id === id) || null;
}
function setPerfilActivo(id) {
  const d = _leerPerfiles();
  d.activoId = id;
  return _guardarPerfiles(d);
}
function savePerfil(perfil) {
  const d = _leerPerfiles();
  perfil = perfil || {};
  if (perfil.id) {
    const i = d.perfiles.findIndex((p) => p.id === perfil.id);
    if (i >= 0) d.perfiles[i] = { ...d.perfiles[i], ...perfil };
    else d.perfiles.push(perfil);
  } else {
    perfil.id = "p" + Date.now() + Math.floor(Math.random() * 1000);
    d.perfiles.push(perfil);
    if (!d.activoId) d.activoId = perfil.id;
  }
  _guardarPerfiles(d);
  return perfil;
}
function deletePerfil(id) {
  const d = _leerPerfiles();
  d.perfiles = d.perfiles.filter((p) => p.id !== id);
  if (d.activoId === id) d.activoId = d.perfiles[0] ? d.perfiles[0].id : "";
  return _guardarPerfiles(d);
}
function getConfigEmpresa(perfilId) {
  const p = (perfilId && getPerfilById(perfilId)) || getPerfilActivo();
  return p ? { logo: p.logo || "", color: p.color || "" } : {};
}

window.CTData.getPerfiles = getPerfiles;
window.CTData.getPerfilActivo = getPerfilActivo;
window.CTData.getPerfilById = getPerfilById;
window.CTData.setPerfilActivo = setPerfilActivo;
window.CTData.savePerfil = savePerfil;
window.CTData.deletePerfil = deletePerfil;
window.CTData.getConfigEmpresa = getConfigEmpresa;
