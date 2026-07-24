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
  cfdis: (window.CFDIS || []).slice(),
  empleados: (window.EMPLEADOS || []).slice(),
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
  cfdi: {
    title: "CFDI 4.0", coll: "cfdis",
    fields: [
      { k: "cliente", label: "Cliente (receptor)", type: "text", ph: "Razón social del cliente", req: true },
      { k: "total", label: "Total (MXN)", type: "money", ph: "0.00", req: true },
    ],
    editable: (v) => ({ cliente: v.cliente.trim(), total: parseMoney(v.total) }),
    meta: () => ({ folio: "A-" + (1044 + state.cfdis.length), uuid: uuidShort(), fecha: hoyCorto(), estado: "ok", createdAt: Date.now() }),
    fill: (o) => ({ cliente: o.cliente, total: o.total }),
  },
  empleado: {
    title: "empleado", coll: "empleados",
    fields: [
      { k: "nombre", label: "Nombre completo", type: "text", ph: "Nombre del empleado", req: true },
      { k: "puesto", label: "Puesto", type: "text", ph: "Ej. Contadora", req: true },
      { k: "sueldo", label: "Sueldo mensual (MXN)", type: "money", ph: "0.00", req: true },
    ],
    editable: (v) => ({ nombre: v.nombre.trim(), puesto: v.puesto.trim(), sueldo: parseMoney(v.sueldo) }),
    meta: () => ({ estado: "ok", createdAt: Date.now() }),
    fill: (o) => ({ nombre: o.nombre, puesto: o.puesto, sueldo: o.sueldo }),
  },
};
const COLL2KEY = { polizas: "poliza", cfdis: "cfdi", empleados: "empleado" };
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
    return '<div class="fld"><label>' + f.label + '</label><div class="seg" data-seg="' + f.k + '">' +
      f.opts.map((o) => '<button type="button" data-val="' + o + '" class="' + ((val ? o === val : o === f.def) ? "is-active" : "") + '">' + o + "</button>").join("") +
      "</div></div>";
  }
  if (f.type === "money") {
    return '<div class="fld" data-fld="' + f.k + '"><label>' + f.label + '</label>' +
      '<div class="money-in"><input data-in="' + f.k + '" inputmode="decimal" value="' + v + '" placeholder="' + (f.ph || "") + '"></div>' +
      '<span class="err">Escribe un monto válido.</span></div>';
  }
  return '<div class="fld" data-fld="' + f.k + '"><label>' + f.label + '</label>' +
    '<input data-in="' + f.k + '" type="text" value="' + v.replace(/"/g, "&quot;") + '" placeholder="' + (f.ph || "") + '"><span class="err">Este campo es obligatorio.</span></div>';
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
  try {
    if (current.mode === "create") {
      let obj = Object.assign(s.meta(), patch);
      if (s.fix) obj = s.fix(obj);
      if (db) { const ref = await _addDoc(_collection(db, current.coll), obj); obj.id = ref.id; }
      else obj.id = "local-" + (++localSeq);
      state[current.coll].unshift(obj);
      refresh(current.coll);
      toast(db ? "Guardado en Firestore" : "Guardado localmente", db ? "ok" : "warn");
    } else { // edit
      if (db) await _updateDoc(_doc(db, current.coll, current.id), patch);
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
  try {
    if (db) await _deleteDoc(_doc(db, coll, id));
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

    const [pol, cf, emp, cli, prod] = await Promise.all([
      loadColl("polizas", window.POLIZAS),
      loadColl("cfdis", window.CFDIS),
      loadColl("empleados", window.EMPLEADOS),
      loadColl("clientes", null),
      loadColl("productos", null),
    ]);
    state.polizas = pol; state.cfdis = cf; state.empleados = emp;
    state.clientes = cli; state.productos = prod;
    refresh("polizas"); refresh("cfdis"); refresh("empleados");
    toast("Datos sincronizados con Firestore", "ok", 2400);
  } catch (e) {
    toast("Firestore no disponible (" + (e.code || e.message || "error") + "). Mostrando datos demo.", "warn", 4800);
  }
}

/* ============================================================
   API pública para otros módulos (facturacion.js).
   Agrega un CFDI ya timbrado a la tabla y lo guarda en Firestore.
   ============================================================ */
async function addCfdiTimbrado(parcial) {
  parcial = parcial || {};
  const uuidFull = String(parcial.uuid || "");
  const obj = {
    folio: parcial.folio || ((parcial.serie || "CT") + "-" + (1044 + state.cfdis.length)),
    uuid: uuidFull ? (uuidFull.slice(0, 8) + "…" + uuidFull.slice(-4)) : "—",
    uuidFull: uuidFull, // folio fiscal completo (para copiar/buscar)
    cliente: parcial.cliente || "—",
    total: typeof parcial.total === "number" ? parcial.total : parseMoney(parcial.total || 0),
    fecha: parcial.fecha || hoyCorto(),
    estado: parcial.estado || "ok",
    cfdiId: parcial.cfdiId || null,         // id interno de Fiscalapi (para PDF/XML/cancelar)
    metodoPago: parcial.metodoPago || "PUE", // PUE o PPD (PPD habilita el REP)
    tipo: parcial.tipo || "I",               // I factura, E nota de crédito, P pago (REP)
    receptorRfc: parcial.receptorRfc || "",  // RFC del cliente (para nota de crédito / REP en producción)
    perfilId: parcial.perfilId || "",        // marca/consultora usada (perfil de branding)
    saldo: typeof parcial.total === "number" ? parcial.total : parseMoney(parcial.total || 0), // saldo pendiente (para REP parcial)
    createdAt: Date.now(),
  };
  try {
    if (db) { const ref = await _addDoc(_collection(db, "cfdis"), obj); obj.id = ref.id; }
    else obj.id = "local-" + (++localSeq);
  } catch (e) {
    obj.id = "local-" + (++localSeq);
    toast("Timbrada, pero no se guardó en Firestore (" + (e.code || e.message || "error") + ")", "warn", 4800);
  }
  state.cfdis.unshift(obj);
  refresh("cfdis");
  return obj;
}

window.CTData = window.CTData || {};
window.CTData.addCfdi = addCfdiTimbrado;

// Marca un CFDI como cancelado en la tabla y en Firestore (rowId = id del documento).
async function markCfdiCancelledLocal(rowId) {
  const f = state.cfdis.find((x) => x.id === rowId);
  if (!f) return null;
  f.estado = "cancelada";
  try {
    if (db && rowId && String(rowId).indexOf("local-") !== 0) {
      await _updateDoc(_doc(db, "cfdis", rowId), { estado: "cancelada" });
    }
  } catch (e) {
    toast("Cancelada en el SAT, pero no se actualizó la tabla (" + (e.code || e.message || "error") + ")", "warn", 4800);
  }
  refresh("cfdis");
  return f;
}
window.CTData.markCfdiCancelled = markCfdiCancelledLocal;

/* ---------- Catálogo de clientes y productos guardados ---------- */
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
  if (existe) return existe; // no duplicar por RFC
  try {
    if (db) { const ref = await _addDoc(_collection(db, "clientes"), obj); obj.id = ref.id; }
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
    if (db) { const ref = await _addDoc(_collection(db, "productos"), obj); obj.id = ref.id; }
    else obj.id = "local-" + (++localSeq);
  } catch (e) { obj.id = "local-" + (++localSeq); }
  state.productos.unshift(obj);
  return obj;
}

window.CTData.getClientes = getClientes;
window.CTData.getProductos = getProductos;
window.CTData.saveCliente = saveClienteLocal;
window.CTData.saveProducto = saveProductoLocal;

/* ---------- Lectura de CFDIs y saldos (para nota de crédito / REP) ---------- */
window.CTData.getCfdis = () => state.cfdis.slice();

// Actualiza el saldo pendiente de una factura tras registrar un pago (REP parcial).
async function updateCfdiSaldoLocal(rowId, nuevoSaldo) {
  const f = state.cfdis.find((x) => x.id === rowId);
  if (!f) return;
  f.saldo = Number(nuevoSaldo);
  try {
    if (db && !String(rowId).startsWith("local-")) await _updateDoc(_doc(db, "cfdis", rowId), { saldo: f.saldo });
  } catch (e) { /* el saldo local ya quedó actualizado */ }
  refresh("cfdis");
}
window.CTData.updateCfdiSaldo = updateCfdiSaldoLocal;

/* ---------- Perfiles de marca (logo + color por consultora) ---------- */
// Todas tus consultoras facturan con el MISMO RFC (persona física), pero cada
// una con su propio branding en el PDF/correo. Se guardan en el navegador.
const PERFILES_KEY = "contateck_perfiles";

function _leerPerfiles() {
  try {
    const raw = JSON.parse(localStorage.getItem(PERFILES_KEY) || "null");
    if (raw && Array.isArray(raw.perfiles)) return raw;
  } catch (e) { /* sigue a migración */ }
  // Migración: si existía la config vieja de un solo logo, conviértela en perfil.
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
// Compatibilidad: el logo/color que usan PDF y correo = un perfil dado o el activo.
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
