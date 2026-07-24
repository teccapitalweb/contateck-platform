// ============================================================
//  CONTATECK · Prueba de conectividad con Fiscalapi
//  Corre con:  npm test     (necesita el .env con tus llaves)
//  Verifica que: (1) las llaves autentican y (2) hay suscripción activa.
// ============================================================
import { getFiscalapi, unwrap } from './src/fiscalapi.js';
import { config } from './src/config.js';

console.log('\n── Prueba de conectividad Fiscalapi ──');
console.log('URL:   ', config.fiscalapi.apiUrl);
console.log('Tenant:', config.fiscalapi.tenant || '(vacío)');
console.log('ApiKey:', config.fiscalapi.apiKey ? config.fiscalapi.apiKey.slice(0, 14) + '…' : '(vacío)');

if (!config.fiscalapi.apiKey || !config.fiscalapi.tenant) {
  console.error('\n❌ Faltan FISCALAPI_KEY o FISCALAPI_TENANT en el .env\n');
  process.exit(1);
}

const api = getFiscalapi();

try {
  const r = unwrap(await api.persons.getList(1, 5));
  if (r.ok) {
    console.log('\n✅ TODO BIEN: las llaves autentican y la suscripción está activa.');
    console.log('   Ya puedes timbrar. Siguiente: crear un emisor de pruebas y mandar POST /api/timbrar.\n');
  } else if (r.status === 403) {
    console.log('\n⚠️  Las llaves son correctas, pero el PAC respondió 403 (sin autorización).');
    console.log('   Causa típica: falta ACTIVAR la suscripción de prueba en el dashboard de Fiscalapi.');
    console.log('   Ve a: Compras en línea → Suscripciones → activa la de prueba (gratis, tarjetas ficticias).\n');
  } else if (r.status === 401) {
    console.log('\n❌ 401: llaves inválidas. Revisa FISCALAPI_KEY y FISCALAPI_TENANT.\n');
  } else {
    console.log(`\n⚠️  Respuesta inesperada (${r.status}): ${r.message}\n`);
  }
} catch (err) {
  console.error('\n❌ Error de red al contactar Fiscalapi:', err.message, '\n');
  process.exit(1);
}
