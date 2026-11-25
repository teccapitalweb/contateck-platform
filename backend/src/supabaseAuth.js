// ============================================================
//  CONTATECK · Backend · Supabase Auth
//  OT-0004 · Reemplaza el middleware de verificación de idToken
//  de Firebase por verificación de JWT de Supabase Auth.
//
//  Importante: este archivo SOLO se encarga de verificar quién es
//  el usuario (auth). Guardar/actualizar CFDIs sigue siendo
//  responsabilidad de firebase.js (saveCfdi, markCfdiCancelled) —
//  Firestore no se toca en esta OT (ver objetivo 5 de OT-0004).
// ============================================================
import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

let supabaseAdmin = null;

if (config.supabase.url && config.supabase.serviceRoleKey) {
  supabaseAdmin = createClient(config.supabase.url, config.supabase.serviceRoleKey);
}

export function isSupabaseAuthReady() {
  return !!supabaseAdmin;
}

// Onboarding (crear empresa / aceptar invitación) necesita privilegios
// elevados: un usuario sin perfil todavía no puede insertar en `empresas`
// ni en `perfiles` bajo su propia RLS (por diseño — el alta de perfiles
// siempre pasa por el backend con service role, nunca por el cliente).
export function obtenerClienteAdmin() {
  return supabaseAdmin;
}

// OT-0056 · Multiempresa: qué empresa tiene ACTIVA cada persona, para avisarle a una pestaña
// desactualizada que ya cambió de empresa en otra (si no, esa pestaña seguiría mostrando la
// empresa vieja mientras la base ya trabaja con la nueva). Caché corta; nunca lanza.
const cacheEmpresaActual = new Map(); // userId -> { empresaId, t }
const TTL_EMPRESA_MS = 3000;

export function olvidarEmpresaActual(userId) { cacheEmpresaActual.delete(userId); }

export async function empresaActualDe(userId) {
  if (!supabaseAdmin || !userId) return null;
  const hit = cacheEmpresaActual.get(userId);
  if (hit && Date.now() - hit.t < TTL_EMPRESA_MS) return hit.empresaId;
  try {
    const { data } = await supabaseAdmin.from('perfiles').select('empresa_id').eq('id', userId).maybeSingle();
    const empresaId = (data && data.empresa_id) || null;
    cacheEmpresaActual.set(userId, { empresaId, t: Date.now() });
    return empresaId;
  } catch (e) {
    return null;
  }
}

// Middleware: exige (o no) un access_token de Supabase Auth en el header.
//   Authorization: Bearer <access_token>
//
// req.user queda con la MISMA forma que antes usaba Firebase ({ uid, email }),
// para no tener que tocar invoices.js / resumenCfdi() (objetivo 1 de OT-0004:
// no modificar lógica de negocio).
export async function verifyAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  // Sin Supabase configurado no podemos verificar nada.
  if (!supabaseAdmin) {
    if (config.requireAuth) {
      return res.status(503).json({
        ok: false,
        error: 'Auth requerida pero Supabase no está configurado en el backend.',
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

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) throw error || new Error('Usuario no encontrado');
    req.user = { uid: data.user.id, email: data.user.email };
    req.token = token; // OT-0011: necesario para escribir en Postgres respetando RLS
  } catch (err) {
    if (config.requireAuth) {
      return res.status(401).json({ ok: false, error: 'Token inválido o expirado.' });
    }
    req.user = null;
    return next();
  }

  // OT-0056: el panel manda la empresa que está mostrando (X-Empresa-Id). Si la persona ya
  // cambió de empresa en otra pestaña, se rechaza con 409 para que esta pestaña se recargue
  // en vez de seguir mostrando (y escribiendo en) una empresa que ya no es la activa.
  const empresaPanel = req.headers['x-empresa-id'];
  if (empresaPanel && req.user) {
    const actual = await empresaActualDe(req.user.uid);
    if (actual && String(empresaPanel).toLowerCase() !== String(actual).toLowerCase()) {
      return res.status(409).json({
        ok: false,
        codigo: 'EMPRESA_CAMBIO',
        error: 'Cambiaste de empresa en otra pestaña o ventana. Vamos a recargar para mostrar la empresa correcta.',
      });
    }
  }
  next();
}
