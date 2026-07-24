// ============================================================
//  CONTATECK · Backend · Firebase Admin
//  - Inicializa firebase-admin SOLO si hay service account.
//  - Expone un middleware de verificación de idToken.
//  - Expone helpers para guardar/actualizar CFDIs en Firestore.
//  Todo es opcional: si no hay credenciales, el backend sigue
//  funcionando para timbrar (con avisos), sin tocar Firestore.
// ============================================================
import admin from 'firebase-admin';
import { config } from './config.js';

let initialized = false;
let db = null;

export function initFirebase(log = console) {
  if (initialized) return;
  if (!config.firebaseServiceAccount) {
    log.warn('[firebase] No inicializado (sin service account).');
    return;
  }
  try {
    const creds = JSON.parse(config.firebaseServiceAccount);
    admin.initializeApp({ credential: admin.credential.cert(creds) });
    db = admin.firestore();
    initialized = true;
    log.info(`[firebase] Inicializado para el proyecto: ${creds.project_id}`);
  } catch (err) {
    log.error('[firebase] Error al inicializar (¿el JSON está bien pegado?):', err.message);
  }
}

export function isFirebaseReady() {
  return initialized;
}

// Middleware: exige (o no) un idToken de Firebase en el header Authorization.
//   Authorization: Bearer <idToken>
export function verifyAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  // Sin Firebase no podemos verificar nada.
  if (!initialized) {
    if (config.requireAuth) {
      return res.status(503).json({
        ok: false,
        error: 'Auth requerida pero Firebase no está configurado en el backend.',
      });
    }
    req.user = null; // modo dev
    return next();
  }

  if (!token) {
    if (config.requireAuth) {
      return res.status(401).json({ ok: false, error: 'Falta el token de autenticación.' });
    }
    req.user = null;
    return next();
  }

  admin
    .auth()
    .verifyIdToken(token)
    .then((decoded) => {
      req.user = decoded; // { uid, email, ... }
      next();
    })
    .catch(() => {
      if (config.requireAuth) {
        return res.status(401).json({ ok: false, error: 'Token inválido o expirado.' });
      }
      req.user = null;
      next();
    });
}

// Guarda un CFDI timbrado en la colección `cfdis`. No-op si no hay Firestore.
export async function saveCfdi(doc, log = console) {
  if (!initialized || !db) return null;
  try {
    const ref = db.collection('cfdis').doc(doc.id || undefined);
    const payload = { ...doc, createdAt: admin.firestore.FieldValue.serverTimestamp() };
    await ref.set(payload, { merge: true });
    return ref.id;
  } catch (err) {
    log.error('[firestore] No se pudo guardar el CFDI:', err.message);
    return null;
  }
}

// Marca un CFDI como cancelado en Firestore. No-op si no hay Firestore.
export async function markCfdiCancelled(id, extra = {}, log = console) {
  if (!initialized || !db || !id) return;
  try {
    await db.collection('cfdis').doc(id).set(
      { estatus: 'cancelado', cancelledAt: admin.firestore.FieldValue.serverTimestamp(), ...extra },
      { merge: true }
    );
  } catch (err) {
    log.error('[firestore] No se pudo marcar cancelado:', err.message);
  }
}
