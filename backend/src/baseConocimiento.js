// ============================================================
//  CONTATECK · Backend · Base de conocimiento del asistente (OT-0056)
//
//  Respuestas FIJAS (no dependen de los datos de la empresa) para dos tipos de pregunta:
//    · "concepto": qué es el IVA, una póliza, un CFDI, el Código Agrupador, la DIOT…
//    · "guia": cómo se hace algo en CONTATECK (registrar una venta, timbrar, cerrar un periodo, invitar a alguien…).
//  Los textos son generales a propósito: explican qué es cada cosa, no dan asesoría fiscal. Los nombres de pantallas y botones
//  y los roles que pueden hacer cada cosa se comprobaron contra el código y la base (OT-0056); si cambian, hay que actualizarlos
//  aquí (la prueba backend/test-asistente.js revisa que las pantallas y botones citados sigan existiendo en el frontend).
// ============================================================
import { normalizar } from './textoUtil.js';

// Las respuestas llevan **negritas** (el frontend las formatea) y viñetas con "- ".
export const ENTRADAS = [
  // ---------------- Conceptos ----------------
  {
    id: 'iva', tipo: 'concepto', titulo: 'IVA', claves: ['iva', 'impuesto al valor agregado', 'iva trasladado', 'iva acreditable'],
    respuesta: [
      'El **IVA** (Impuesto al Valor Agregado) es un impuesto al consumo; la tasa general es 16%.',
      '- Cuando vendes, cobras IVA a tu cliente: es el **IVA trasladado**.',
      '- Cuando compras, pagas IVA a tu proveedor: es el **IVA acreditable**.',
      'Cada mes se comparan: si lo trasladado es mayor, la diferencia se **paga al SAT** (a cargo); si lo acreditable es mayor, queda **a favor**. La declaración mensual normalmente vence el día 17 del mes siguiente.',
    ].join('\n'),
    datos: '¿Cómo va el IVA este mes?',
  },
  {
    id: 'cfdi', tipo: 'concepto', titulo: 'CFDI', claves: ['cfdi', 'factura electronica', 'comprobante fiscal digital', 'comprobante fiscal'],
    respuesta: [
      'Un **CFDI** (Comprobante Fiscal Digital por Internet) es la factura electrónica: un archivo XML con validez fiscal que lleva un folio fiscal único (**UUID**).',
      'Tipos principales: **I** ingreso (factura), **E** egreso (nota de crédito), **P** pago (complemento de pago), **N** nómina y **T** traslado. En CONTATECK se emiten CFDI versión 4.0.',
    ].join('\n'),
  },
  {
    id: 'timbrar', tipo: 'concepto', titulo: 'Timbrar', claves: ['timbrar', 'timbrado', 'timbre fiscal', 'pac', 'uuid', 'folio fiscal'],
    respuesta: '**Timbrar** es enviar tu CFDI a un proveedor autorizado de certificación (**PAC**), que lo valida y le asigna el **UUID** (folio fiscal) y el sello. Sin timbre la factura no tiene validez fiscal. En CONTATECK se hace en **Facturación → Timbrar CFDI**.',
  },
  {
    id: 'complemento_pago', tipo: 'concepto', titulo: 'PUE, PPD y complemento de pago', claves: ['ppd', 'pue', 'complemento de pago', 'metodo de pago', 'parcialidades', 'rep'],
    respuesta: [
      'El **método de pago** de una factura puede ser:',
      '- **PUE**: pago en una sola exhibición (se paga en el momento).',
      '- **PPD**: pago en parcialidades o diferido. Cuando te pagan, hay que emitir un **complemento de pago** (CFDI tipo P) por cada cobro.',
    ].join('\n'),
  },
  {
    id: 'nota_credito', tipo: 'concepto', titulo: 'Nota de crédito', claves: ['nota de credito', 'nota de credito cfdi', 'devolucion', 'devoluciones'],
    respuesta: 'Una **nota de crédito** es un CFDI de egreso que reduce o anula, total o parcialmente, una factura que ya emitiste (por una devolución, descuento o corrección). En CONTATECK se emite desde Facturación.',
  },
  {
    id: 'poliza', tipo: 'concepto', titulo: 'Póliza', claves: ['poliza', 'polizas', 'asiento contable', 'asientos'],
    respuesta: [
      'Una **póliza** es el registro contable de una operación (una venta, un cobro, un gasto…). Tiene **partidas**: cargos (**Debe**) y abonos (**Haber**) a distintas cuentas, y la suma del Debe debe ser **igual** a la del Haber.',
      'En CONTATECK hay pólizas de **Ingreso**, **Egreso** y **Diario**. No se borran: si hay un error se **anulan** (se crea una reversa) o se **corrigen**.',
    ].join('\n'),
  },
  {
    id: 'debe_haber', tipo: 'concepto', titulo: 'Debe y Haber', claves: ['debe', 'haber', 'cargo', 'abono', 'cargos', 'abonos', 'partida doble', 'naturaleza', 'deudora', 'acreedora'],
    respuesta: [
      'En contabilidad cada operación se registra con **partida doble**: lo que se **carga** (Debe) siempre es igual a lo que se **abona** (Haber).',
      '- Cuentas de **naturaleza deudora** (activo, costos y gastos): aumentan con cargos y disminuyen con abonos.',
      '- Cuentas de **naturaleza acreedora** (pasivo, capital e ingresos): aumentan con abonos y disminuyen con cargos.',
    ].join('\n'),
  },
  {
    id: 'catalogo_cuentas', tipo: 'concepto', titulo: 'Catálogo de cuentas', claves: ['catalogo de cuentas', 'cuenta contable', 'cuentas contables', 'plan de cuentas', 'nivel de cuenta'],
    respuesta: 'El **catálogo de cuentas** es la lista ordenada de las cuentas contables de tu empresa (por ejemplo Caja, Bancos, Clientes, Ventas), cada una con su código, nombre, nivel y naturaleza. Las pólizas siempre se registran contra cuentas del catálogo. En CONTATECK está en **Contabilidad → Catálogo de cuentas**.',
  },
  {
    id: 'codigo_agrupador', tipo: 'concepto', titulo: 'Código Agrupador del SAT', claves: ['codigo agrupador', 'agrupador', 'anexo 24'],
    respuesta: [
      'El **Código Agrupador del SAT** (Anexo 24 de la Resolución Miscelánea Fiscal) es el catálogo oficial de códigos con el que ligas **cada cuenta de tu catálogo** a una cuenta del SAT; por ejemplo, "Bancos nacionales" es 102.01. Se usa en el XML del catálogo de la contabilidad electrónica.',
      'En CONTATECK: **Contabilidad → SAT / Declaraciones**: descarga la "Hoja de cuentas para la contadora (CSV)", se llena la última columna y se sube con "Cargar códigos agrupador (CSV)". Conviene que lo valide tu contador.',
    ].join('\n'),
  },
  {
    id: 'contabilidad_electronica', tipo: 'concepto', titulo: 'Contabilidad electrónica', claves: ['contabilidad electronica', 'xml del sat', 'xml catalogo', 'xml balanza', 'envio al sat'],
    respuesta: 'La **contabilidad electrónica** es la obligación (cuando te aplica) de enviar al SAT, en archivos XML, tu **catálogo de cuentas** y tu **balanza de comprobación**, y las pólizas o auxiliares si el SAT los solicita. CONTATECK genera los XML del catálogo y de la balanza (**Contabilidad → SAT / Declaraciones**); el envío se hace en el portal del SAT.',
  },
  {
    id: 'balanza', tipo: 'concepto', titulo: 'Balanza de comprobación', claves: ['balanza', 'balanza de comprobacion'],
    respuesta: 'La **balanza de comprobación** lista todas las cuentas con su **saldo inicial**, los **cargos** (Debe), los **abonos** (Haber) y el **saldo final** de un mes. La suma del Debe debe ser igual a la del Haber; si no cuadra, hay un error en las pólizas. En CONTATECK: **Contabilidad → Balanza**.',
  },
  {
    id: 'balance_general', tipo: 'concepto', titulo: 'Balance General', claves: ['balance general', 'balance', 'estado de situacion financiera', 'situacion financiera'],
    respuesta: 'El **Balance General** (estado de situación financiera) muestra lo que tiene la empresa (**Activo**), lo que debe (**Pasivo**) y lo que es de los dueños (**Capital**). Siempre se cumple: **Activo = Pasivo + Capital** (más el resultado del periodo mientras no se cierra el ejercicio).',
    datos: '¿Cómo va el Balance General?',
  },
  {
    id: 'estado_resultados', tipo: 'concepto', titulo: 'Estado de Resultados', claves: ['estado de resultados', 'utilidad', 'perdida', 'resultado del periodo', 'resultado del ejercicio'],
    respuesta: 'El **Estado de Resultados** dice si la empresa ganó o perdió en un periodo: **Ingresos − Costos − Gastos = Utilidad** (si es negativo, es **pérdida**). En CONTATECK está en **Contabilidad → Estados financieros**.',
    datos: '¿Cuánto gané este año?',
  },
  {
    id: 'activo_pasivo_capital', tipo: 'concepto', titulo: 'Activo, pasivo y capital', claves: ['activo', 'pasivo', 'capital', 'capital contable', 'capital social'],
    respuesta: [
      '- **Activo**: lo que la empresa **tiene** (bancos, clientes que le deben, inventario, equipo).',
      '- **Pasivo**: lo que **debe** (proveedores, impuestos por pagar, sueldos por pagar).',
      '- **Capital**: lo que **pertenece a los dueños** (aportaciones y utilidades acumuladas).',
    ].join('\n'),
    datos: '¿Cómo va el Balance General?',
  },
  {
    id: 'ingresos_costos_gastos', tipo: 'concepto', titulo: 'Ingresos, costos y gastos', claves: ['ingreso', 'ingresos', 'costo', 'costos', 'gasto', 'gastos', 'costo de ventas'],
    respuesta: [
      '- **Ingresos**: dinero que la empresa gana por vender o dar servicios.',
      '- **Costos**: lo que cuesta producir o comprar lo que se vende (por ejemplo, el costo de ventas).',
      '- **Gastos**: lo que cuesta operar el negocio (renta, sueldos de oficina, luz, publicidad).',
    ].join('\n'),
  },
  {
    id: 'libro_mayor', tipo: 'concepto', titulo: 'Libro Mayor', claves: ['libro mayor', 'mayor', 'auxiliar'],
    respuesta: 'El **Libro Mayor** muestra, cuenta por cuenta, todos los movimientos (póliza por póliza) y su saldo. Sirve para ver de dónde sale el saldo de una cuenta. En CONTATECK: **Contabilidad → Libro Mayor**.',
  },
  {
    id: 'causacion', tipo: 'concepto', titulo: 'Causación', claves: ['causacion', 'causar', 'devengado', 'poliza de causacion', 'contabilizar una factura'],
    respuesta: [
      '**Causar** una factura es registrarla en la contabilidad cuando ocurre la operación (al facturar o al recibir la factura de un proveedor), aunque todavía no se cobre o se pague. Después el cobro o el pago se registra aparte, contra **Clientes** o **Proveedores**.',
      'Si se registra un cobro o un pago sin haber contabilizado antes la factura, esas cuentas quedan con saldo negativo y el Balance se distorsiona.',
    ].join('\n'),
  },
  {
    id: 'cuentas_cobrar_pagar', tipo: 'concepto', titulo: 'Cuentas por cobrar y por pagar', claves: ['cuentas por cobrar', 'cuentas por pagar', 'cobranza', 'clientes y proveedores'],
    respuesta: '- **Cuentas por cobrar**: lo que tus clientes todavía te deben por facturas emitidas.\n- **Cuentas por pagar**: lo que tú todavía debes a tus proveedores por facturas recibidas.\nEn CONTATECK el cobro se registra con "Me pagó un cliente" y los pagos a proveedores en **Contabilidad → Cuentas por Pagar**.',
    datos: '¿Cuánto me deben mis clientes y cuánto debo a proveedores?',
  },
  {
    id: 'diot', tipo: 'concepto', titulo: 'DIOT', claves: ['diot', 'operaciones con terceros'],
    respuesta: 'La **DIOT** (Declaración Informativa de Operaciones con Terceros) es una declaración mensual en la que informas al SAT, por **proveedor**, las operaciones del mes y el IVA que pagaste; normalmente vence el día 17 del mes siguiente. En CONTATECK puedes ver la información en **Contabilidad → SAT / Declaraciones** (usa el RFC de las facturas de proveedor importadas).',
  },
  {
    id: 'isr', tipo: 'concepto', titulo: 'ISR', claves: ['isr', 'impuesto sobre la renta', 'pagos provisionales'],
    respuesta: 'El **ISR** (Impuesto Sobre la Renta) es el impuesto a las utilidades o ingresos. Se paga mediante **pagos provisionales** mensuales y una **declaración anual**. Cómo se calcula depende del **régimen fiscal** de cada empresa, por eso CONTATECK **no lo calcula por ti**: consúltalo con tu contador. (En Nómina sí se calcula el ISR de los sueldos.)',
  },
  {
    id: 'rfc', tipo: 'concepto', titulo: 'RFC', claves: ['rfc', 'registro federal de contribuyentes'],
    respuesta: 'El **RFC** (Registro Federal de Contribuyentes) es la clave con la que el SAT identifica a una persona o empresa: 12 caracteres para personas morales (empresas) y 13 para personas físicas.',
  },
  {
    id: 'regimen_fiscal', tipo: 'concepto', titulo: 'Régimen fiscal', claves: ['regimen fiscal', 'regimen', 'resico'],
    respuesta: 'El **régimen fiscal** es el conjunto de reglas con las que una persona o empresa calcula y paga sus impuestos (por ejemplo, régimen general de personas morales o RESICO). Se elige según el tipo de actividad y de contribuyente. Qué conviene en cada caso lo decide tu contador.',
  },
  {
    id: 'periodo_cierre', tipo: 'concepto', titulo: 'Periodo contable y cierre', claves: ['periodo contable', 'cierre de periodo', 'cerrar un periodo', 'cierre contable', 'periodo cerrado'],
    respuesta: 'Un **periodo contable** es un mes. **Cerrarlo** impide registrar o modificar pólizas de ese mes, para que las cifras que ya se declararon no cambien. Si después aparece un error, el ajuste se registra en un periodo abierto. En CONTATECK: **Contabilidad → Periodos**.',
  },
  {
    id: 'nomina', tipo: 'concepto', titulo: 'Nómina', claves: ['nomina', 'prenomina', 'imss', 'subsidio al empleo'],
    respuesta: 'La **nómina** es el pago de sueldos a los empleados. En CONTATECK, **Nómina → Calcular** calcula el **ISR** (con subsidio) y el **IMSS** de los trabajadores y guarda el historial. Después puedes **imprimir los recibos de nómina** de cada periodo desde el historial. También puedes **timbrar el CFDI de nómina** de cada empleado desde el historial (**"Timbrar"**): hoy funciona en el **ambiente de pruebas** del proveedor de timbrado, así que esos timbres no tienen efecto fiscal real, y los criterios fiscales están por validar con un contador. Para timbrar, cada empleado necesita su RFC, CURP, código postal fiscal, tipo de contrato y entidad federativa.',
  },
  {
    id: 'obligaciones_fiscales', tipo: 'concepto', titulo: 'Obligaciones fiscales', claves: ['obligaciones fiscales', 'obligacion fiscal', 'declaracion', 'declaraciones', 'calendario fiscal'],
    respuesta: 'Las **obligaciones fiscales** son lo que debes presentar o pagar al SAT con fecha límite (por ejemplo la declaración mensual de IVA o la DIOT). CONTATECK las lleva en **SAT y Fiscal**: ahí ves el calendario, registras cada declaración y la marcas como presentada. Las fechas son una guía: tu contador confirma las que aplican a tu empresa.',
    datos: '¿Qué obligaciones fiscales vencen pronto?',
  },
  {
    id: 'soy_ia', tipo: 'concepto', directa: true, titulo: 'Sobre el asistente', claves: ['eres una ia', 'eres ia', 'eres inteligencia artificial', 'eres un robot', 'eres un bot', 'quien eres', 'quien te hizo', 'como funcionas', 'inteligencia artificial'],
    respuesta: 'Soy el **asistente contable de CONTATECK**. **No soy inteligencia artificial**: reconozco ciertos temas por palabras clave y contesto con los datos de tu empresa (solo lectura) o con explicaciones fijas. Si no entiendo algo, te lo digo.',
  },
  {
    id: 'contateck', tipo: 'concepto', titulo: 'Qué es CONTATECK', claves: ['contateck', 'para que sirve esta plataforma', 'que hace esta plataforma', 'que es esta plataforma'],
    respuesta: '**CONTATECK** es una plataforma web para administrar una empresa: ventas y cobranza, facturación electrónica (CFDI), contabilidad, nómina y cumplimiento fiscal (SAT y Fiscal), con varias empresas y roles de usuario en un mismo sistema.',
  },

  // ---------------- Guías del sistema ----------------
  {
    id: 'guia_venta', tipo: 'guia', titulo: 'Registrar una venta', claves: ['registrar una venta', 'registro una venta', 'nueva venta', 'dar de alta una venta', 'agregar una venta', 'capturar una venta', 'registrar un pago recibido'],
    respuesta: [
      'En **Ventas → Nueva venta** (pueden vendedor, contador, admin y director). Una venta es el registro de un **pago recibido** con su comprobante.',
      'Pasa por estados: **pendiente → en revisión → confirmado** (o rechazado). Quien la registra no la valida: la revisa un contador, admin o director con "Tomar para revisión" y luego Confirmar o Rechazar. Al confirmarla se genera su póliza.',
    ].join('\n'),
  },
  {
    id: 'guia_timbrar', tipo: 'guia', titulo: 'Timbrar una factura', claves: ['timbrar una factura', 'timbro una factura', 'hacer una factura', 'emitir una factura', 'crear una factura', 'facturar', 'timbrar un cfdi', 'emitir un cfdi', 'hago una factura', 'hacer facturas', 'hago facturas', 'emito una factura', 'emito un cfdi', 'emitir facturas', 'timbro un cfdi', 'crear un cfdi', 'creo una factura'],
    respuesta: 'En **Facturación → Timbrar CFDI** (pueden director, admin y contador). Eliges el cliente, agregas productos o conceptos con sus impuestos y timbras. Después puedes descargar el PDF y el XML. Para que el cliente reciba la factura por correo hay otra opción en la misma pantalla.',
  },
  {
    id: 'guia_cancelar_cfdi', tipo: 'guia', titulo: 'Cancelar o corregir una factura', claves: ['cancelar una factura', 'cancelo una factura', 'cancelar un cfdi', 'cancelar cfdi', 'hacer una nota de credito', 'emitir una nota de credito', 'corregir una factura', 'hago una nota de credito', 'hacer una nota de credito', 'emito una nota de credito', 'cancelo un cfdi', 'corrijo una factura'],
    respuesta: 'En **Facturación**, con **Cancelar CFDI** o emitiendo una **nota de crédito**. El SAT tiene reglas sobre el motivo y, en algunos casos, sobre la aceptación del cliente: si dudas cuál aplica, consúltalo con tu contador.',
  },
  {
    id: 'guia_cobro', tipo: 'guia', titulo: 'Registrar el cobro de un cliente', claves: ['registrar un cobro', 'registro un cobro', 'cobrar una factura', 'cobro una factura', 'me pago un cliente', 'registrar un pago de un cliente', 'confirmar un cobro'],
    respuesta: [
      'Usa **"Me pagó un cliente"** (en Facturación y en Contabilidad): eliges la factura, el monto, la fecha y la cuenta donde entró el dinero. Primero queda **registrado** y luego un contador, admin o director lo **confirma**, y entonces se genera la póliza (Bancos / Clientes).',
      'Antes, la factura debe estar **contabilizada**; si no, Clientes quedará con saldo negativo.',
    ].join('\n'),
  },
  {
    id: 'guia_pago_proveedor', tipo: 'guia', titulo: 'Pagar a un proveedor', claves: ['pagar a un proveedor', 'pago a un proveedor', 'registrar un pago a proveedor', 'pagar una factura de proveedor', 'cuentas por pagar'],
    respuesta: 'En **Contabilidad → Cuentas por Pagar**: eliges la factura del proveedor, registras el pago (monto, fecha y cuenta de donde sale el dinero) y lo confirma un contador, admin o director, lo que genera la póliza (Proveedores / Bancos). La factura del proveedor debe estar contabilizada antes.',
  },
  {
    id: 'guia_contabilizar_cfdi', tipo: 'guia', titulo: 'Contabilizar una factura', claves: ['contabilizar una factura', 'contabilizo una factura', 'contabilizar un cfdi', 'importar un cfdi', 'importar una factura', 'importar factura de proveedor', 'registrar una factura de proveedor', 'poliza de causacion', 'importo una factura', 'importo un cfdi', 'importo una factura de proveedor', 'registro una factura de proveedor', 'contabilizar facturas'],
    respuesta: [
      '- **Factura que tú emitiste**: **Contabilidad → Captura rápida → Venta → "Importar desde factura timbrada"**. Genera la póliza de causación (Clientes / Ventas / IVA).',
      '- **Factura de un proveedor**: en Contabilidad, **"Importar CFDI"** (XML recibido). Genera la póliza del gasto y guarda los datos del proveedor.',
      'Necesitas tener hecha la **Configuración contable** (qué cuenta usa el sistema para bancos, clientes, ventas, IVA…).',
    ].join('\n'),
  },
  {
    id: 'guia_poliza', tipo: 'guia', titulo: 'Crear una póliza', claves: ['crear una poliza', 'creo una poliza', 'registrar una poliza', 'nueva poliza', 'hacer una poliza', 'capturar una poliza', 'agregar una poliza', 'registro una poliza', 'capturo una poliza', 'creo polizas', 'agrego una poliza', 'hago una poliza'],
    respuesta: 'En **Contabilidad → Pólizas → Nueva póliza** (contador, admin o director). Eliges el tipo (Ingreso, Egreso o Diario), la fecha, el concepto y capturas las partidas; el sistema no la guarda si el **Debe no es igual al Haber**. También hay **Captura rápida** para las operaciones comunes. Si te equivocas, la póliza se anula o se corrige, no se borra.',
  },
  {
    id: 'guia_cuenta', tipo: 'guia', titulo: 'Crear una cuenta contable', claves: ['crear una cuenta', 'creo una cuenta', 'agregar una cuenta', 'nueva cuenta', 'dar de alta una cuenta', 'agrego una cuenta', 'creo una cuenta contable', 'doy de alta una cuenta', 'crear cuentas'],
    respuesta: 'En **Contabilidad → Catálogo de cuentas → Nueva cuenta**. Indicas el código, el nombre, el nivel y la naturaleza (deudora o acreedora). Las cuentas no se borran: se pueden **dar de baja** y reactivar. Después, si usas contabilidad electrónica, asígnale su Código Agrupador del SAT.',
  },
  {
    id: 'guia_configuracion', tipo: 'guia', titulo: 'Configuración contable', claves: ['configuracion contable', 'configurar las cuentas', 'configurar la contabilidad', 'configuro la contabilidad', 'cuenta de bancos', 'roles de cuentas'],
    respuesta: 'En **Contabilidad → Configuración contable** indicas qué cuenta de tu catálogo usa el sistema para **bancos, clientes, proveedores, ventas, IVA trasladado, IVA acreditable y gastos**. Sin esto no se pueden generar las pólizas automáticas ni confirmar cobros y pagos.',
  },
  {
    id: 'guia_cerrar_periodo', tipo: 'guia', titulo: 'Cerrar un periodo', claves: ['cerrar un periodo', 'cierro un periodo', 'cerrar el mes', 'cierro el mes', 'cerrar un mes', 'cierre del mes', 'cierre de mes'],
    respuesta: 'En **Contabilidad → Periodos → Cerrar periodo** (contador, admin o director). Antes conviene revisar que la **balanza cuadre** y que las pólizas del mes estén completas. Una vez cerrado, ya no se registran ni modifican pólizas de ese mes.',
  },
  {
    id: 'guia_xml_sat', tipo: 'guia', titulo: 'Generar el XML para el SAT', claves: ['generar el xml', 'descargar el xml', 'descargo el xml', 'xml para el sat', 'xml del catalogo', 'xml de la balanza', 'contabilidad electronica en xml', 'generar la contabilidad electronica'],
    respuesta: [
      'En **Contabilidad → SAT / Declaraciones**: captura el **RFC**, el **mes** y el **año**; luego **"Descargar XML Catálogo"** y **"Descargar XML Balanza"**.',
      '- La **Balanza** es de un solo mes: elige primero el periodo arriba, y debe **cuadrar**.',
      '- Antes de bajar el catálogo, todas las cuentas deben tener su **Código Agrupador**.',
      'El envío se hace en el portal del SAT.',
    ].join('\n'),
  },
  {
    id: 'guia_codigo_agrupador', tipo: 'guia', titulo: 'Cargar los Códigos Agrupador', claves: ['cargar los codigos agrupador', 'cargar codigos agrupador', 'asignar el codigo agrupador', 'subir la hoja de la contadora', 'llenar el codigo agrupador', 'cargo los codigos agrupador', 'cargo codigos agrupador', 'subo la hoja', 'cargar la hoja', 'asignar codigos agrupador', 'asigno el codigo agrupador'],
    respuesta: 'En **Contabilidad → SAT / Declaraciones**: 1) "Hoja de cuentas para la contadora (CSV)"; 2) la contadora llena la **última columna** con el código del SAT de cada cuenta; 3) súbela con **"Cargar códigos agrupador (CSV)"**. El sistema revisa que cada código exista en el catálogo oficial y te muestra un resumen antes de guardar.',
  },
  {
    id: 'guia_declaracion', tipo: 'guia', titulo: 'Registrar una declaración', claves: ['registrar una declaracion', 'registro una declaracion', 'marcar una declaracion', 'marcar presentada', 'agregar una obligacion', 'agregar una declaracion', 'subir un acuse', 'marco una declaracion', 'marcar una declaracion presentada', 'marco una declaracion presentada', 'presento una declaracion', 'subo un acuse'],
    respuesta: 'En **SAT y Fiscal**: **"+ Declaración"** para registrar una (periodo, fecha límite), y **"Marcar presentada"** cuando ya la presentaste (puedes adjuntar el acuse). Registrar declaraciones y documentos lo hacen contador, admin y director; **"+ Obligación"** y **"Cargar comunes"** (las obligaciones del calendario) solo admin y director.',
  },
  {
    id: 'guia_invitar', tipo: 'guia', titulo: 'Invitar a una persona', claves: ['invitar a un usuario', 'invitar a una persona', 'invito a alguien', 'invitar a alguien', 'agregar un usuario', 'dar de alta un usuario', 'crear un usuario', 'agregar un empleado al sistema', 'invitar al equipo', 'invito a un usuario', 'agrego un usuario', 'agrego usuarios', 'doy de alta a un usuario', 'invito a una persona', 'invito a mi equipo'],
    respuesta: 'En **Equipo** (menú de la izquierda): botón de nueva invitación, eliges el **correo** y el **rol**. Pueden invitar rh, admin y director; para invitar con rol Admin o Director se necesita ser Admin o Director. La persona se registra con **ese mismo correo** y queda dentro de tu empresa con el rol elegido.',
  },
  {
    id: 'guia_roles', tipo: 'guia', titulo: 'Roles y permisos', claves: ['roles', 'rol', 'permisos', 'que puede hacer un contador', 'que puede hacer un auditor', 'que puede hacer un vendedor', 'quien puede', 'que roles hay'],
    respuesta: [
      '- **Director y admin**: todo, incluido el equipo.',
      '- **Contador**: contabilidad, facturación, cobros y pagos, y SAT y Fiscal; consulta la nómina.',
      '- **Auditor**: puede **ver** todo pero no cambiar nada (sin botones de escritura).',
      '- **RH**: nómina y equipo.',
      '- **Vendedor**: registrar ventas.',
    ].join('\n'),
  },
  {
    id: 'guia_nomina', tipo: 'guia', titulo: 'Calcular la nómina', claves: ['calcular la nomina', 'calculo la nomina', 'hacer la nomina', 'hago la nomina', 'procesar la nomina', 'pagar la nomina', 'dar de alta un empleado', 'agregar un empleado', 'doy de alta un empleado', 'doy de alta empleados', 'alta de empleados', 'agrego un empleado'],
    respuesta: 'En **Nómina**: **"Empleado"** para dar de alta personal y **"Calcular"** para calcular el ISR y el IMSS del periodo y guardar la nómina (pueden rh, admin y director). Desde el historial de nóminas, **"Recibos"** imprime un recibo informativo por empleado. **"Timbrar"** genera el CFDI de nómina de cada empleado (ambiente de pruebas del proveedor; para timbrar el empleado debe tener capturados RFC, CURP, código postal fiscal, tipo de contrato y entidad federativa).',
  },
  {
    id: 'guia_sesion', tipo: 'guia', titulo: 'Sesión y tema', claves: ['cerrar sesion', 'salir del sistema', 'cierro sesion', 'cambiar el tema', 'modo oscuro', 'modo claro', 'cambiar a modo oscuro', 'cambio el tema', 'cambio a modo oscuro', 'cambiar el color', 'cambio el modo'],
    respuesta: 'Para **cerrar sesión**, pulsa tu nombre en la parte de abajo del menú izquierdo. Para cambiar entre modo claro y oscuro, usa el botón del sol o la luna en la barra de arriba.',
  },
  {
    id: 'guia_dashboard', tipo: 'guia', titulo: 'Qué muestra el Dashboard', claves: ['dashboard', 'tablero', 'pantalla principal', 'que muestra el dashboard', 'alertas del dashboard'],
    respuesta: 'El **Dashboard** resume tu empresa: facturación del mes, ingresos y egresos de pólizas, nómina estimada, Balance General, gastos y **alertas** (por ejemplo CFDI sin póliza o pagos sobre facturas sin contabilizar). Al pulsar una alerta te lleva a la pantalla donde se resuelve.',
    datos: '¿Tengo alertas pendientes?',
  },
];

// ---------------- Búsqueda ----------------
const MARCAS_CONCEPTO = ['que es', 'que son', 'que significa', 'significa', 'para que sirve', 'para que sirven', 'definicion', 'definicion de', 'explica', 'explicame', 'en que consiste', 'que quiere decir', 'a que se refiere', 'que es un', 'que es una', 'que es el', 'que es la', 'de que trata', 'que hace', 'que es la diferencia', 'como funciona', 'como funcionan', 'como se calcula', 'como se calculan', 'cual es la diferencia'];
const VERBOS_GUIA = ['registro', 'registrar', 'hago', 'hacer', 'puedo', 'creo', 'crear', 'agrego', 'agregar', 'timbro', 'timbrar', 'cierro', 'cerrar', 'cargo', 'cargar', 'descargo', 'descargar', 'invito', 'invitar', 'genero', 'generar', 'importo', 'importar', 'doy', 'cancelo', 'cancelar', 'corrijo', 'corregir', 'anulo', 'anular', 'confirmo', 'confirmar', 'cobro', 'cobrar', 'pago', 'pagar', 'configuro', 'configurar', 'uso', 'usar', 'entro', 'cambio', 'cambiar', 'emito', 'emitir', 'capturo', 'capturar', 'subo', 'subir', 'llenar', 'lleno', 'contabilizo', 'contabilizar', 'calculo', 'calcular', 'salgo', 'salir', 'asigno', 'asignar', 'marco', 'marcar', 'facturo', 'facturar', 'vendo', 'vender', 'se hace', 'se registra', 'se crea', 'se cierra'];

const con = (t, frase) => t.includes(' ' + frase + ' ');
export const esPreguntaConceptual = (pregunta) => { const t = normalizar(pregunta); return MARCAS_CONCEPTO.some((m) => con(t, m)); };
export const esPreguntaGuia = (pregunta) => {
  const t = normalizar(pregunta);
  if (['paso a paso', 'en donde', 'donde', 'que puedo hacer', 'que puede hacer', 'que pueden hacer', 'que roles hay', 'quien puede', 'que muestra', 'que me muestra', 'que permisos'].some((m) => con(t, m))) return true;
  return VERBOS_GUIA.some((v) => con(t, 'como ' + v) || con(t, 'como se ' + v) || con(t, 'como puedo ' + v) || con(t, 'como hago para ' + v) || con(t, 'como le hago para ' + v));
};

const puntos = (t, entrada) => entrada.claves.reduce((a, c) => a + (con(t, c) ? c.split(' ').length : 0), 0);

/**
 * Busca en la base de conocimiento. Solo contesta si la pregunta es de tipo concepto ("¿qué es…?") o guía ("¿cómo registro…?");
 * una pregunta de datos ("¿cómo va el IVA?") la deja pasar al asistente de datos. Regresa la entrada ganadora o null.
 */
export function buscarConocimiento(pregunta) {
  const t = normalizar(pregunta);
  // Preguntas sobre el propio asistente ("¿eres una IA?") no llevan "qué es" ni "cómo": sus frases son específicas y se reconocen solas.
  for (const e of ENTRADAS) if (e.directa && puntos(t, e) > 0) return e;
  const guia = esPreguntaGuia(pregunta), concepto = esPreguntaConceptual(pregunta);
  if (!guia && !concepto) return null;
  const tipos = guia ? ['guia'] : ['concepto'];
  let mejor = null, mejorPuntos = 0;
  for (const e of ENTRADAS) {
    if (!tipos.includes(e.tipo)) continue;
    const p = puntos(t, e);
    if (p > mejorPuntos) { mejor = e; mejorPuntos = p; }
  }
  // Una guía que no encontró su tema puede ser en realidad un concepto ("cómo funciona el IVA").
  if (!mejor && guia && concepto) {
    for (const e of ENTRADAS.filter((x) => x.tipo === 'concepto')) { const p = puntos(t, e); if (p > mejorPuntos) { mejor = e; mejorPuntos = p; } }
  }
  return mejor;
}
