// ============================================================
//  CONTATECK · Backend de timbrado CFDI 4.0 (Fiscalapi)
//  Punto de entrada. Despliega en Railway con `npm start`.
// ============================================================
import express from 'express';
import cors from 'cors';
import { config, logConfigWarnings } from './src/config.js';
import { initFirebase, isFirebaseReady } from './src/firebase.js';
import { isSupabaseAuthReady } from './src/supabaseAuth.js';
import { isPostgresDataReady } from './src/supabaseData.js';
import { perfilRouter } from './src/routes/perfil.js';
import { catalogoRouter } from './src/routes/catalogo.js';
import { operacionRouter } from './src/routes/operacion.js';
import { crudRouter } from './src/routes/crud.js';
import { polizasCompletasRouter } from './src/routes/polizasCompletas.js';
import { periodosRouter } from './src/routes/periodos.js';
import { pagosProveedorRouter } from './src/routes/pagosProveedor.js';
import { pagosClienteRouter } from './src/routes/pagosCliente.js';
import { configContableRouter } from './src/routes/configContable.js';
import { invoicesRouter } from './src/routes/invoices.js';
import { demoRouter } from './src/routes/demo.js';
import { dashboardRouter } from './src/routes/dashboard.js';
import { ventasRouter } from './src/routes/ventas.js';
import { empleadosRouter } from './src/routes/empleados.js';
import { fiscalRouter } from './src/routes/fiscal.js';
import { onboardingRouter } from './src/routes/onboarding.js';
import { equipoRouter } from './src/routes/equipo.js';
const app = express();
// ---- CORS ----
const corsOptions = {
  origin: config.allowedOrigins.includes('*') ? true : config.allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '5mb' }));
// ---- Healthcheck (Railway lo usa para saber que el servicio vive) ----
app.get('/', (_req, res) => {
  res.json({
    service: 'contateck-backend',
    status: 'ok',
    ambiente: config.fiscalapi.apiUrl.includes('test.') ? 'PRUEBAS' : 'PRODUCCIÓN',
    firebase: isFirebaseReady() ? 'conectado' : 'no-configurado',
    supabaseAuth: isSupabaseAuthReady() ? 'conectado' : 'no-configurado',
    postgresData: isPostgresDataReady() ? 'conectado' : 'no-configurado',
    timbrado: config.fiscalapi.apiKey ? 'listo' : 'faltan-llaves',
    probarTimbrado: '/api/demo/timbrar',
  });
});
app.get('/health', (_req, res) => res.json({ ok: true }));
// ---- API ----
app.use('/api', invoicesRouter);
app.use('/api', perfilRouter);
app.use('/api', catalogoRouter);
app.use('/api', operacionRouter);
app.use('/api', crudRouter);
app.use('/api', polizasCompletasRouter);
app.use('/api', periodosRouter);
app.use('/api', pagosProveedorRouter);
app.use('/api', pagosClienteRouter);
app.use('/api', configContableRouter);
app.use('/api', dashboardRouter);
app.use('/api', ventasRouter);
app.use('/api', empleadosRouter);
app.use('/api', fiscalRouter);
app.use('/api', onboardingRouter);
app.use('/api', equipoRouter);
app.use('/api/demo', demoRouter);
// ---- 404 ----
app.use((_req, res) => res.status(404).json({ ok: false, error: 'Ruta no encontrada.' }));
// ---- Arranque ----
initFirebase(console);
logConfigWarnings(console);
app.listen(config.port, () => {
  console.log(`\n  CONTATECK backend escuchando en el puerto ${config.port}`);
  console.log(`  Fiscalapi: ${config.fiscalapi.apiUrl}`);
  console.log(`  Health:    GET /   ·   Timbrar: POST /api/timbrar\n`);
});
