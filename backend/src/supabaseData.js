// ============================================================
//  CONTATECK · Backend · Datos en Postgres (Supabase)
//  OT-0006 — Fase A · empresas / perfiles
//
//  Importante: estas consultas se hacen con un cliente autenticado
//  como EL PROPIO USUARIO (su access_token + la anon key), no con
//  la service role. Así las políticas RLS de database/policies.sql
//  se aplican de verdad — este archivo no las evade, las respeta.
//
//  Este servicio es de solo lectura por ahora (Fase A: integrar
//  consultas). Nada aquí escribe datos ni borra Firestore.
// ============================================================
import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

export function isPostgresDataReady() {
  return !!(config.supabase.url && config.supabase.anonKey);
}

function clienteComoUsuario(accessToken) {
  if (!isPostgresDataReady()) return null;
  return createClient(config.supabase.url, config.supabase.anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Devuelve { empresa, perfil } leídos de Postgres para el usuario dueño
// del accessToken, o null si Postgres no está configurado, el usuario
// no tiene perfil todavía, o algo falla (nunca lanza error hacia arriba:
// el llamador decide si usa el respaldo local en ese caso).
export async function obtenerEmpresaYPerfil(accessToken, log = console) {
  const supabase = clienteComoUsuario(accessToken);
  if (!supabase || !accessToken) return null;

  try {
    const { data: perfil, error: errPerfil } = await supabase
      .from('perfiles')
      .select('id, nombre, email, empresa_id, rol_id, roles ( nombre )')
      .single();

    if (errPerfil || !perfil) {
      log.warn('[postgres] Sin perfil en Postgres para este usuario (usará respaldo local).');
      return null;
    }

    const { data: empresa, error: errEmpresa } = await supabase
      .from('empresas')
      .select('id, nombre, rfc, regimen_fiscal, plan, status')
      .eq('id', perfil.empresa_id)
      .single();

    if (errEmpresa || !empresa) {
      log.warn('[postgres] Perfil sin empresa asociada en Postgres (usará respaldo local).');
      return null;
    }

    return {
      perfil: { id: perfil.id, nombre: perfil.nombre, email: perfil.email, rol: perfil.roles?.nombre || null },
      empresa: { id: empresa.id, nombre: empresa.nombre, rfc: empresa.rfc, regimen: empresa.regimen_fiscal },
    };
  } catch (err) {
    log.error('[postgres] Error al consultar empresa/perfil:', err.message);
    return null;
  }
}
