/* ============================================================
   CONTATECK · data.js
   Datos de demostración + configuración.
   Cuando conectes Firebase/Railway, reemplaza estos objetos
   por las respuestas reales de tu API. Nada de la UI cambia.

   Nota: se usa `var` (no const) a propósito: así los objetos
   quedan disponibles como window.* para los scripts que cargan
   después (app.js). Con const/let no se cuelgan de window.
   ============================================================ */

var APP = {
  name: "CONTATECK",
  tagline: "Contabilidad, SAT y nómina con IA, para México.",
};

/* Empresas (Módulo 1 · multiempresa) */
var EMPRESAS = [
  { id: "tec",  nombre: "TEC CAPITAL Group",  rfc: "TCG230118AB9", regimen: "601 · General de Ley PM" },
  { id: "ipci", nombre: "Instituto IPCI",      rfc: "IIP210504QX2", regimen: "603 · PM no Lucrativas" },
  { id: "odon", nombre: "OdonTeck Consulting", rfc: "ODT220915MP4", regimen: "626 · RESICO" },
];

/* Dashboard Ejecutivo (Módulo 14) — cifras del mes en curso, MXN */
var KPIS = [
  { id:"ventas",  label:"Ventas del mes",    valor:1284500, delta:+12.4, ico:"trend",  serie:[62,68,60,72,78,74,83,80,88,92,96,104] },
  { id:"gastos",  label:"Gastos del mes",    valor:742300,  delta:+4.1,  ico:"down",   serie:[40,42,44,41,45,43,48,47,50,49,52,55] },
  { id:"utilidad",label:"Utilidad neta",     valor:542200,  delta:+18.9, ico:"wallet", serie:[20,24,18,28,30,29,33,32,36,40,43,49] },
  { id:"flujo",   label:"Flujo de efectivo", valor:318900,  delta:-3.2,  ico:"flow",   serie:[30,28,33,31,29,34,32,30,35,33,31,29] },
];

/* Indicadores fiscales (Módulo 2) */
var FISCAL = [
  { label:"IVA a pagar (est.)", valor:86420,  estado:"pend" },
  { label:"ISR a pagar (est.)", valor:124800, estado:"pend" },
  { label:"Retenciones",        valor:31250,  estado:"ok"   },
];

/* Indicadores contables (balance) */
var BALANCE = [
  { label:"Activos", valor:4820000, color:"var(--brand)" },
  { label:"Pasivos", valor:1640000, color:"var(--gold)"  },
  { label:"Capital", valor:3180000, color:"var(--up)"    },
];

/* Serie mensual ventas vs gastos (chart principal, miles MXN) */
var SERIE = {
  meses:  ["Jul","Ago","Sep","Oct","Nov","Dic","Ene","Feb","Mar","Abr","May","Jun"],
  ventas: [880, 920, 860, 1010, 1080, 1190, 1040, 980, 1120, 1210, 1248, 1284],
  gastos: [560, 580, 600, 590, 640, 700, 620, 600, 680, 710, 724, 742],
};

/* Composición de gastos (donut) */
var GASTOS_COMP = [
  { label:"Nómina",      valor:312000, color:"var(--brand)" },
  { label:"Proveedores", valor:198000, color:"var(--gold)"  },
  { label:"Servicios",   valor:121000, color:"var(--up)"    },
  { label:"Impuestos",   valor:74300,  color:"var(--down)"  },
  { label:"Otros",       valor:37000,  color:"var(--faint)" },
];

/* Ledger Debe / Haber (firma) */
var LEDGER = { debe: 6460000, haber: 6460000 };

/* Próximas obligaciones SAT (Módulo 2) */
var OBLIGACIONES = [
  { obligacion:"Declaración mensual IVA",  periodo:"Jun 2026", vence:"17 Jul", monto:86420,  estado:"pend" },
  { obligacion:"Declaración mensual ISR",  periodo:"Jun 2026", vence:"17 Jul", monto:124800, estado:"pend" },
  { obligacion:"DIOT",                      periodo:"Jun 2026", vence:"31 Jul", monto:null,   estado:"pend" },
  { obligacion:"Contabilidad electrónica", periodo:"May 2026", vence:"03 Jul", monto:null,   estado:"ok"   },
];

/* Alertas (Módulo 14) */
var ALERTAS = [
  { tipo:"danger", titulo:"3 CFDI cancelados sin sustituir", texto:"Facturas a 2 clientes fueron canceladas por el receptor. Revisa para reexpedir.", when:"hace 2 h" },
  { tipo:"warn",   titulo:"Liquidez por debajo del umbral",  texto:"El flujo proyectado a 30 días cae 3.2%. Considera adelantar cobranza.", when:"hoy 09:14" },
  { tipo:"info",   titulo:"DIOT lista para revisar",         texto:"La IA preparó el borrador de la DIOT de junio con 142 proveedores.", when:"ayer" },
];

/* Módulos del MVP (orden del PDF: 1,2,3,8,14,15) */
var MODULOS = [
  { id:"contabilidad", n:"01", nombre:"Contabilidad General", ico:"book",    desc:"Catálogo de cuentas, pólizas, asientos automáticos y reportes. Multiempresa y consolidación." },
  { id:"sat",          n:"02", nombre:"SAT y Fiscal México",  ico:"shield",  desc:"Descarga masiva de XML, validación CFDI, cálculo de IVA/ISR, DIOT y contabilidad electrónica." },
  { id:"facturacion",  n:"03", nombre:"Facturación",          ico:"receipt", desc:"CFDI 4.0, notas de crédito, REP y complementos. Timbrado masivo y facturación recurrente." },
  { id:"nomina",       n:"08", nombre:"Nómina",               ico:"users",   desc:"Sueldos, finiquitos y aguinaldos. ISR, IMSS, INFONAVIT y Fonacot. CFDI Nómina." },
  { id:"dashboard",    n:"14", nombre:"Dashboard Ejecutivo",  ico:"grid",    desc:"Indicadores de ventas, utilidad y liquidez. Comparativos y alertas en tiempo real." },
  { id:"ia",           n:"15", nombre:"IA Contable",          ico:"spark",   desc:"Chat contable, automatización XML → contabilidad, auditor y monitoreo para despachos." },
];

/* Usuario demo */
var USER = { nombre:"Jorge", rol:"Director General", iniciales:"JG", correo:"contateck@teccapital.mx" };

/* ============================================================
   MÓDULO 01 · CONTABILIDAD GENERAL
   ============================================================ */
/* Catálogo de cuentas (código agrupador SAT, naturaleza, saldo) */
var CUENTAS = [
  { nivel:1, codigo:"100",  nombre:"Activo",                  nat:"Deudora",    saldo:4820000 },
  { nivel:2, codigo:"1010", nombre:"Caja",                    nat:"Deudora",    saldo:48500   },
  { nivel:2, codigo:"1020", nombre:"Bancos",                  nat:"Deudora",    saldo:1862000 },
  { nivel:2, codigo:"1050", nombre:"Clientes",                nat:"Deudora",    saldo:984300  },
  { nivel:2, codigo:"1080", nombre:"IVA acreditable",         nat:"Deudora",    saldo:118720  },
  { nivel:1, codigo:"200",  nombre:"Pasivo",                  nat:"Acreedora",  saldo:1640000 },
  { nivel:2, codigo:"2010", nombre:"Proveedores",             nat:"Acreedora",  saldo:742300  },
  { nivel:2, codigo:"2030", nombre:"IVA trasladado",          nat:"Acreedora",  saldo:205140  },
  { nivel:2, codigo:"2040", nombre:"Impuestos por pagar",     nat:"Acreedora",  saldo:211220  },
  { nivel:1, codigo:"300",  nombre:"Capital contable",        nat:"Acreedora",  saldo:3180000 },
  { nivel:2, codigo:"3010", nombre:"Capital social",          nat:"Acreedora",  saldo:2000000 },
  { nivel:2, codigo:"3020", nombre:"Resultado del ejercicio", nat:"Acreedora",  saldo:1180000 },
  { nivel:1, codigo:"400",  nombre:"Ingresos",                nat:"Acreedora",  saldo:1284500 },
  { nivel:2, codigo:"4010", nombre:"Ventas y servicios",      nat:"Acreedora",  saldo:1284500 },
  { nivel:1, codigo:"600",  nombre:"Gastos",                  nat:"Deudora",    saldo:742300  },
  { nivel:2, codigo:"6010", nombre:"Gastos de operación",     nat:"Deudora",    saldo:430300  },
  { nivel:2, codigo:"6020", nombre:"Gastos de administración",nat:"Deudora",    saldo:312000  },
];

/* Pólizas */
var POLIZAS = [
  { folio:"IPC-D-00142", tipo:"Diario",  fecha:"18 Jun", concepto:"Provisión nómina 2a quincena", monto:284600, estado:"ok"   },
  { folio:"IPC-I-00088", tipo:"Ingreso", fecha:"17 Jun", concepto:"Cobro factura A-1043 · Grupo Bimbo", monto:284200, estado:"ok"   },
  { folio:"IPC-E-00091", tipo:"Egreso",  fecha:"16 Jun", concepto:"Pago proveedor servicios cloud", monto:42300,  estado:"ok"   },
  { folio:"IPC-D-00141", tipo:"Diario",  fecha:"15 Jun", concepto:"Depreciación equipo de cómputo", monto:18900,  estado:"rev"  },
  { folio:"IPC-I-00087", tipo:"Ingreso", fecha:"14 Jun", concepto:"Cobro factura A-1042 · Cementos XYZ", monto:58900,  estado:"ok"   },
  { folio:"IPC-E-00090", tipo:"Egreso",  fecha:"12 Jun", concepto:"Pago arrendamiento oficina", monto:65000,  estado:"ok"   },
  { folio:"IPC-D-00140", tipo:"Diario",  fecha:"10 Jun", concepto:"Reclasificación gastos no deducibles", monto:7400,   estado:"rev"  },
];

var CONT_STATS = [
  { label:"Pólizas del mes",  valor:"142" },
  { label:"Cuentas activas",  valor:"86"  },
  { label:"Por revisar",      valor:"2", tono:"warn" },
  { label:"Sin conciliar",    valor:"7", tono:"warn" },
];

/* ============================================================
   MÓDULO 03 · FACTURACIÓN (CFDI 4.0)
   ============================================================ */
var CFDIS = [
  { folio:"A-1043", uuid:"3F2A…9C71", cliente:"Grupo Bimbo SA de CV",  fecha:"17 Jun", total:284200, estado:"ok"   },
  { folio:"A-1042", uuid:"B81D…4E02", cliente:"Cementos XYZ SA",       fecha:"15 Jun", total:58900,  estado:"ok"   },
  { folio:"A-1041", uuid:"77AC…12F9", cliente:"Distribuidora del Sur", fecha:"14 Jun", total:42150,  estado:"late" },
  { folio:"A-1040", uuid:"9E0B…AA37", cliente:"Comercial Tehuacán SA", fecha:"12 Jun", total:96400,  estado:"ok"   },
  { folio:"A-1039", uuid:"C4D2…8810", cliente:"Servicios Puebla SC",   fecha:"10 Jun", total:18750,  estado:"ok"   },
  { folio:"A-1038", uuid:"1A55…6F44", cliente:"Agroindustrias del Valle", fecha:"08 Jun", total:212300, estado:"ok" },
];

var FACT_STATS = [
  { label:"Timbradas (mes)", valor:"38" },
  { label:"Monto facturado", valor:"$1.28M" },
  { label:"Canceladas",      valor:"3", tono:"warn" },
  { label:"Por cobrar",      valor:"$984k", tono:"warn" },
];

/* ============================================================
   MÓDULO 08 · NÓMINA
   ============================================================ */
var EMPLEADOS = [
  { nombre:"Ana López Mendoza",   puesto:"Contadora",      sueldo:28000, estado:"ok" },
  { nombre:"Luis Ramírez Soto",   puesto:"Desarrollador",  sueldo:42000, estado:"ok" },
  { nombre:"María José Cruz",     puesto:"Coordinadora",   sueldo:35000, estado:"ok" },
  { nombre:"Jorge Hernández R.",  puesto:"Vendedor",       sueldo:22000, estado:"ok" },
  { nombre:"Diana Torres Vega",   puesto:"Soporte",        sueldo:19500, estado:"baja" },
];

var NOMINA_RESUMEN = {
  periodo: "2a quincena · junio 2026",
  percepciones: 142600,
  deducciones: 31480,
  neto: 111120,
  desglose: [
    { label:"Sueldos y salarios", valor:142600, tipo:"perc" },
    { label:"ISR retenido",       valor:18940,  tipo:"ded"  },
    { label:"IMSS (obrero)",      valor:8240,   tipo:"ded"  },
    { label:"INFONAVIT",          valor:4300,   tipo:"ded"  },
  ],
};

/* ============================================================
   MÓDULO 02 · SAT Y FISCAL
   ============================================================ */
var SAT_STATS = [
  { label:"XML descargados (mes)", valor:"412" },
  { label:"CFDI validados",        valor:"398" },
  { label:"Por validar",           valor:"14", tono:"warn" },
  { label:"Cancelados detectados", valor:"3",  tono:"warn" },
];

var DECLARACIONES = [
  { tipo:"IVA mensual",            periodo:"Mayo 2026", presentada:"14 Jun", acuse:"OK", estado:"ok"   },
  { tipo:"ISR provisional",        periodo:"Mayo 2026", presentada:"14 Jun", acuse:"OK", estado:"ok"   },
  { tipo:"DIOT",                   periodo:"Mayo 2026", presentada:"28 Jun", acuse:"OK", estado:"ok"   },
  { tipo:"IVA mensual",            periodo:"Junio 2026", presentada:"—",     acuse:"—",  estado:"pend" },
  { tipo:"ISR provisional",        periodo:"Junio 2026", presentada:"—",     acuse:"—",  estado:"pend" },
];

var BUZON = [
  { tipo:"warn",   titulo:"Diferencia en IVA acreditable", texto:"El XML del proveedor PROV-204 no coincide con tu registro contable por $2,310.", when:"hoy" },
  { tipo:"info",   titulo:"Nuevo CFDI recibido",           texto:"12 facturas de proveedores descargadas y listas para contabilizar.", when:"hace 4 h" },
  { tipo:"danger", titulo:"CFDI cancelado por emisor",     texto:"La factura PROV-198 fue cancelada. Revisa el efecto en tu DIOT.", when:"ayer" },
];

/* ============================================================
   MÓDULO 15 · IA CONTABLE
   ============================================================ */
var IA_ACCIONES = [
  { id:"xml",     label:"Clasificar XML del mes",      ico:"file" },
  { id:"bancos",  label:"Conciliar bancos",            ico:"flow" },
  { id:"auditor", label:"Auditar riesgos fiscales",    ico:"shield" },
  { id:"diot",    label:"Preparar DIOT de junio",      ico:"doc" },
];

var IA_CHAT_INICIAL = [
  { de:"ai", texto:"Hola Jorge. Soy tu asistente contable. Puedo clasificar tus XML, conciliar bancos, revisar riesgos fiscales o explicarte cualquier movimiento. ¿En qué te ayudo?" },
  { de:"me", texto:"¿Cómo va el IVA de junio?" },
  { de:"ai", texto:"De momento llevas un IVA trasladado de $205,140 y un IVA acreditable de $118,720, lo que da un IVA a pagar estimado de $86,420. Faltan 14 CFDI por validar que podrían bajar ese saldo. ¿Quieres que los revise?" },
];
