// ============================================================
//  CONTATECK · Pruebas de los mensajes de error del inicio de sesión (OT-0048)
//  Sin red ni base de datos: carga el bloque real de mensajes de frontend/auth-login.js
//  en un contexto aislado, con un `navigator` simulado.
//  Ejecutar:  npm run test:login
// ============================================================
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const frontend = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'frontend');
const fuente = fs.readFileSync(path.join(frontend, 'auth-login.js'), 'utf8').replace(/\r\n/g, '\n');
const html = fs.readFileSync(path.join(frontend, 'login.html'), 'utf8');

let pruebas = 0;
const ok = (nombre, fn) => { fn(); pruebas++; console.log('  ✔ ' + nombre); };

// Del archivo real: desde la lista de errores hasta el comentario que sigue a msgFor.
const inicio = fuente.indexOf('const ERR_MATCH = [');
const fin = fuente.indexOf('// Si ya hay sesión activa');
assert.ok(inicio > 0 && fin > inicio, 'no se encontró el bloque de mensajes en auth-login.js');
const bloque = fuente.slice(inicio, fin);

function crear(onLine) {
  const avisos = [];
  const ctx = vm.createContext({ navigator: { onLine }, console: { warn: (...a) => avisos.push(a.join(' ')) } });
  vm.runInContext(bloque + '\nthis.msgFor = msgFor; this.MSG_SIN_INTERNET = MSG_SIN_INTERNET; this.MSG_SERVIDOR = MSG_SERVIDOR;', ctx);
  return { msgFor: ctx.msgFor, SIN: ctx.MSG_SIN_INTERNET, SERV: ctx.MSG_SERVIDOR, avisos };
}

console.log('\nMensajes del inicio de sesión (OT-0048)\n');

ok('con internet y "Failed to fetch": dice que el servidor no responde, no que falte internet', () => {
  const t = crear(true);
  const m = t.msgFor('Failed to fetch');
  assert.equal(m, t.SERV);
  assert.match(m, /servidor/i);
  assert.doesNotMatch(m, /Revisa tu internet/i);
});

ok('sin internet en el navegador: dice que no hay conexión', () => {
  const t = crear(false);
  assert.equal(t.msgFor('Failed to fetch'), t.SIN);
  assert.match(t.SIN, /internet/i);
});

ok('todas las formas del error de red se reconocen igual', () => {
  const t = crear(true);
  for (const m of ['Failed to fetch', 'TypeError: Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed', 'net::ERR_NAME_NOT_RESOLVED', 'Network request failed']) {
    assert.equal(t.msgFor(m), t.SERV, m);
  }
});

ok('el error de red deja un aviso en la consola para diagnosticar, con el estado del navegador', () => {
  const t = crear(true); t.msgFor('Failed to fetch');
  assert.equal(t.avisos.length, 1);
  assert.match(t.avisos[0], /en línea: true/);
  const s = crear(false); s.msgFor('Failed to fetch');
  assert.match(s.avisos[0], /en línea: false/);
});

ok('los demás mensajes siguen igual (credenciales, correo sin confirmar, límite de intentos…)', () => {
  const t = crear(true);
  assert.equal(t.msgFor('Invalid login credentials'), 'Correo o contraseña incorrectos.');
  assert.equal(t.msgFor('Email not confirmed'), 'Confirma tu correo antes de entrar.');
  assert.match(t.msgFor('too many requests'), /Demasiados intentos/);
  assert.match(t.msgFor('User already registered'), /ya tiene una cuenta/);
  assert.equal(t.msgFor('algo raro', 'texto por defecto'), 'texto por defecto');
  assert.match(t.msgFor(''), /No se pudo iniciar sesión/);
});

ok('los dos mensajes de red son distintos y ninguno deja un error técnico a la vista', () => {
  const t = crear(true);
  assert.notEqual(t.SIN, t.SERV);
  for (const m of [t.SIN, t.SERV]) assert.doesNotMatch(m, /fetch|TypeError|ERR_/i);
});

ok('login.html carga la versión nueva de auth-login.js (para saltar el caché)', () => {
  assert.match(html, /auth-login\.js\?v=3/);
});

console.log(`\n✔ ${pruebas} pruebas de mensajes del inicio de sesión pasaron\n`);
