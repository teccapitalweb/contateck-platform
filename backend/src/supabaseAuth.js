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
    next();
  } catch (err) {
    if (config.requireAuth) {
      return res.status(401).json({ ok: false, error: 'Token inválido o expirado.' });
    }
    req.user = null;
    next();
  }
}
