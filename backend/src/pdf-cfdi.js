// =====================================================================
//  pdf-cfdi.js — Genera el PDF (representación impresa) de un CFDI 4.0
//  a partir de su XML timbrado. Layout propio, limpio y profesional,
//  con el QR oficial del SAT. NO depende de la plantilla de Fiscalapi.
// =====================================================================
import PrinterPkg from 'pdfmake/js/Printer.js';
import vfsPkg from 'pdfmake/js/virtual-fs.js';
import URLResolverPkg from 'pdfmake/js/URLResolver.js';
import QRCode from 'qrcode';
import { XMLParser } from 'fast-xml-parser';

const PdfPrinter = PrinterPkg.default || PrinterPkg;
const vfs = vfsPkg.default || vfsPkg;
const URLResolver = URLResolverPkg.default || URLResolverPkg;
// Fuentes estándar de PDF (no requieren archivos en disco).
const FONTS = {
  Helvetica: { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' },
};
const printer = new PdfPrinter(FONTS, vfs, new URLResolver(vfs), undefined);

// ---- Mini-catálogos del SAT para mostrar nombres legibles ----
const REGIMENES = {
  '601': 'General de Ley Personas Morales', '603': 'Personas Morales con Fines no Lucrativos',
  '605': 'Sueldos y Salarios e Ingresos Asimilados a Salarios', '606': 'Arrendamiento',
  '607': 'Régimen de Enajenación o Adquisición de Bienes', '608': 'Demás ingresos',
  '610': 'Residentes en el Extranjero sin Establecimiento Permanente', '611': 'Ingresos por Dividendos',
  '612': 'Personas Físicas con Actividades Empresariales y Profesionales', '614': 'Ingresos por intereses',
  '615': 'Régimen de los ingresos por obtención de premios', '616': 'Sin obligaciones fiscales',
  '620': 'Sociedades Cooperativas de Producción', '621': 'Incorporación Fiscal',
  '622': 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras', '623': 'Opcional para Grupos de Sociedades',
  '624': 'Coordinados', '625': 'Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas',
  '626': 'Régimen Simplificado de Confianza',
};
const USOS = {
  'G01': 'Adquisición de mercancías', 'G02': 'Devoluciones, descuentos o bonificaciones', 'G03': 'Gastos en general',
  'I01': 'Construcciones', 'I02': 'Mobiliario y equipo de oficina', 'I04': 'Equipo de cómputo',
  'D01': 'Honorarios médicos, dentales y gastos hospitalarios', 'P01': 'Por definir', 'S01': 'Sin obligaciones fiscales',
  'CP01': 'Pagos', 'CN01': 'Nómina',
};
const FORMAS = {
  '01': 'Efectivo', '02': 'Cheque nominativo', '03': 'Transferencia electrónica de fondos',
  '04': 'Tarjeta de crédito', '05': 'Monedero electrónico', '06': 'Dinero electrónico',
  '08': 'Vales de despensa', '28': 'Tarjeta de débito', '99': 'Por definir',
};
const METODOS = { 'PUE': 'Pago en una sola exhibición', 'PPD': 'Pago en parcialidades o diferido' };
const TIPOS = { 'I': 'Ingreso', 'E': 'Egreso', 'P': 'Pago', 'N': 'Nómina', 'T': 'Traslado' };
const IMPUESTOS = { '001': 'ISR', '002': 'IVA', '003': 'IEPS' };
const EXPORTA = { '01': 'No aplica', '02': 'Definitiva', '03': 'Temporal' };

function num(v) { return Number(v || 0); }
function money(v) {
  return '$' + num(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function asArray(x) { return x == null ? [] : (Array.isArray(x) ? x : [x]); }

// Número a letras (para "TOTAL CON LETRA")
function numeroALetras(n) {
  const ent = Math.floor(n);
  const cent = Math.round((n - ent) * 100);
  const UNI = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE'];
  const DEC = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const CEN = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
  function seccion(x) {
    if (x === 0) return 'CERO';
    if (x === 100) return 'CIEN';
    let t = '';
    const c = Math.floor(x / 100), d = Math.floor((x % 100) / 10), u = x % 10, dd = x % 100;
    if (c) t += CEN[c] + ' ';
    if (dd <= 20) t += UNI[dd];
    else if (dd < 30) t += 'VEINTI' + UNI[u].toLowerCase().toUpperCase();
    else { t += DEC[d]; if (u) t += ' Y ' + UNI[u]; }
    return t.trim();
  }
  function miles(x) {
    if (x < 1000) return seccion(x);
    const m = Math.floor(x / 1000), r = x % 1000;
    let t = (m === 1 ? 'MIL' : seccion(m) + ' MIL');
    if (r) t += ' ' + seccion(r);
    return t;
  }
  function millones(x) {
    if (x < 1000000) return miles(x);
    const m = Math.floor(x / 1000000), r = x % 1000000;
    let t = (m === 1 ? 'UN MILLÓN' : miles(m) + ' MILLONES');
    if (r) t += ' ' + miles(r);
    return t;
  }
  const letras = millones(ent);
  return `${letras} PESOS ${String(cent).padStart(2, '0')}/100 M.N.`;
}

// ---- Parseo del XML del CFDI ----
export function parsearCfdi(xml) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', removeNSPrefix: true });
  const root = parser.parse(xml);
  const comp = root.Comprobante || {};
  const emisor = comp.Emisor || {};
  const receptor = comp.Receptor || {};
  const conceptos = asArray(comp.Conceptos?.Concepto).map((c) => ({
    claveProdServ: c.ClaveProdServ || '', noIdentificacion: c.NoIdentificacion || '',
    cantidad: num(c.Cantidad), claveUnidad: c.ClaveUnidad || '', unidad: c.Unidad || '',
    descripcion: c.Descripcion || '', valorUnitario: num(c.ValorUnitario), importe: num(c.Importe),
    descuento: num(c.Descuento), objetoImp: c.ObjetoImp || '',
    traslados: asArray(c.Impuestos?.Traslados?.Traslado),
    retenciones: asArray(c.Impuestos?.Retenciones?.Retencion),
  }));
  const imp = comp.Impuestos || {};
  const tfd = comp.Complemento?.TimbreFiscalDigital || {};
  return {
    version: comp.Version, serie: comp.Serie || '', folio: comp.Folio || '',
    fecha: comp.Fecha || '', subtotal: num(comp.SubTotal), descuento: num(comp.Descuento),
    total: num(comp.Total), moneda: comp.Moneda || 'MXN', tipo: comp.TipoDeComprobante || 'I',
    exportacion: comp.Exportacion || '', metodoPago: comp.MetodoPago || '', formaPago: comp.FormaPago || '',
    lugarExpedicion: comp.LugarExpedicion || '', noCertificado: comp.NoCertificado || '', sello: comp.Sello || '',
    emisor: { rfc: emisor.Rfc || '', nombre: emisor.Nombre || '', regimen: emisor.RegimenFiscal || '' },
    receptor: {
      rfc: receptor.Rfc || '', nombre: receptor.Nombre || '', cp: receptor.DomicilioFiscalReceptor || '',
      regimen: receptor.RegimenFiscalReceptor || '', uso: receptor.UsoCFDI || '',
    },
    conceptos,
    totalTrasladados: num(imp.TotalImpuestosTrasladados), totalRetenidos: num(imp.TotalImpuestosRetenidos),
    traslados: asArray(imp.Traslados?.Traslado), retenciones: asArray(imp.Retenciones?.Retencion),
    timbre: {
      version: tfd.Version || '1.1', uuid: tfd.UUID || '', fechaTimbrado: tfd.FechaTimbrado || '', rfcProv: tfd.RfcProvCertif || '',
      selloCFD: tfd.SelloCFD || '', selloSAT: tfd.SelloSAT || '', noCertSAT: tfd.NoCertificadoSAT || '',
    },
  };
}

// ---- URL del QR oficial del SAT ----
function urlQrSat(d) {
  const ultimos8 = (d.timbre.selloCFD || '').slice(-8);
  const tt = num(d.total).toFixed(6);
  return `https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=${d.timbre.uuid}&re=${d.emisor.rfc}&rr=${d.receptor.rfc}&tt=${tt}&fe=${ultimos8}`;
}

// ---- Genera el PDF y devuelve un Buffer ----
// ---- Genera el PDF y devuelve un Buffer (layout estilo CFDI tradicional) ----
export async function generarPdfCfdi(xml, opciones = {}) {
  const d = parsearCfdi(xml);
  const color = opciones.bandColor || '#0B2F68';
  const logo = opciones.base64Logo || null;
  const marca = (opciones.marcaNombre || d.emisor.nombre || 'EMISOR').toUpperCase();

  const qrDataUrl = await QRCode.toDataURL(urlQrSat(d), { margin: 0, width: 240, errorCorrectionLevel: 'M' });
  const cadenaOriginal = `||${d.timbre.version}|${d.timbre.uuid}|${d.timbre.fechaTimbrado}|${d.timbre.rfcProv}|${d.timbre.selloCFD}|${d.timbre.noCertSAT}||`;

  // ---- Encabezado: logo a la izquierda + nombre/marca centrado ----
  const header = {
    columns: [
      logo ? { image: logo, fit: [95, 58], width: 105 } : { text: '', width: 105 },
      { text: marca, alignment: 'center', bold: true, fontSize: 17, color: '#1c2430', margin: [0, 14, 0, 0] },
      { text: '', width: 105 },
    ],
    margin: [0, 0, 0, 12],
  };

  // ---- Datos del comprobante: dos columnas etiqueta/valor ----
  const colIzq = [
    lv('RFC emisor', d.emisor.rfc),
    lv('Nombre emisor', d.emisor.nombre),
    lv('RFC receptor', d.receptor.rfc),
    lv('Nombre receptor', d.receptor.nombre),
    lv('Código postal receptor', d.receptor.cp),
    lv('Régimen fiscal receptor', d.receptor.regimen ? `${d.receptor.regimen} · ${REGIMENES[d.receptor.regimen] || ''}` : '—'),
    lv('Uso CFDI', d.receptor.uso ? `${d.receptor.uso} · ${USOS[d.receptor.uso] || ''}` : '—'),
  ];
  const colDer = [
    lv('Folio fiscal', d.timbre.uuid),
    lv('No. de serie del CSD', d.noCertificado),
    lv('C.P., fecha y hora', `${d.lugarExpedicion}  ·  ${fmtFecha(d.fecha)}`),
    lv('Efecto de comprobante', `${d.tipo} · ${TIPOS[d.tipo] || ''}`),
    lv('Régimen fiscal emisor', d.emisor.regimen ? `${d.emisor.regimen} · ${REGIMENES[d.emisor.regimen] || ''}` : '—'),
    lv('Exportación', `${d.exportacion} · ${EXPORTA[d.exportacion] || ''}`),
  ];
  const datosBloque = { columns: [{ width: '52%', stack: colIzq }, { width: '48%', stack: colDer }], columnGap: 16, margin: [0, 0, 0, 14] };

  // ---- Tabla de conceptos ----
  const thRow = [
    th('Clave'), th('Descripción'), th('Cant.', 'center'), th('Unidad'),
    th('Valor unit.', 'right'), th('Descuento', 'right'), th('Importe', 'right'),
  ];
  const bodyConceptos = [thRow];
  d.conceptos.forEach((c) => {
    bodyConceptos.push([
      td(c.claveProdServ), td(c.descripcion), td(String(c.cantidad), 'center'),
      td(`${c.claveUnidad}${c.unidad ? ' · ' + c.unidad : ''}`),
      td(money(c.valorUnitario), 'right'), td(c.descuento ? money(c.descuento) : '—', 'right'), td(money(c.importe), 'right'),
    ]);
  });

  // ---- Mini-tabla de impuestos por concepto (todos juntos) ----
  const impFilas = [];
  d.conceptos.forEach((c) => {
    c.traslados.forEach((t) => impFilas.push(['Traslado', IMPUESTOS[t.Impuesto] || t.Impuesto, money(t.Base), `${(num(t.TasaOCuota) * 100).toFixed(4)}%`, money(t.Importe)]));
    c.retenciones.forEach((t) => impFilas.push(['Retención', IMPUESTOS[t.Impuesto] || t.Impuesto, money(t.Base), `${(num(t.TasaOCuota) * 100).toFixed(4)}%`, money(t.Importe)]));
  });
  const tablaImpuestos = impFilas.length ? {
    table: {
      headerRows: 1, widths: [50, 36, '*', 50, 60],
      body: [
        [th('Tipo'), th('Impuesto'), th('Base', 'right'), th('Tasa/Cuota', 'right'), th('Importe', 'right')],
        ...impFilas.map((f) => [td(f[0]), td(f[1]), td(f[2], 'right'), td(f[3], 'right'), td(f[4], 'right')]),
      ],
    },
    layout: tableLayout(color), margin: [0, 0, 0, 10],
  } : { text: '' };

  // ---- Totales ----
  const totFilas = [['Subtotal', money(d.subtotal)]];
  if (d.descuento > 0) totFilas.push(['Descuento', '-' + money(d.descuento)]);
  if (d.totalTrasladados > 0) totFilas.push(['Impuestos trasladados (IVA 16%)', money(d.totalTrasladados)]);
  d.retenciones.forEach((r) => totFilas.push([`Impuesto retenido ${IMPUESTOS[r.Impuesto] || r.Impuesto}`, '-' + money(r.Importe)]));
  const tablaTotales = {
    table: {
      widths: ['*', 'auto'],
      body: [
        ...totFilas.map(([k, v]) => [{ text: k, style: 'totK' }, { text: v, style: 'totV' }]),
        [{ text: 'TOTAL', style: 'totKBig', fillColor: color, color: '#fff' }, { text: money(d.total), style: 'totVBig', fillColor: color, color: '#fff' }],
      ],
    }, layout: 'noBorders',
  };

  // ---- Pie de pago (izquierda) ----
  const pagoBloque = {
    width: '*',
    stack: [
      lv('Moneda', `${d.moneda} · Peso Mexicano`),
      lv('Forma de pago', d.formaPago ? `${d.formaPago} · ${FORMAS[d.formaPago] || ''}` : '—'),
      lv('Método de pago', d.metodoPago ? `${d.metodoPago} · ${METODOS[d.metodoPago] || ''}` : '—'),
    ],
  };

  const docDefinition = {
    pageSize: 'LETTER',
    pageMargins: [38, 38, 38, 40],
    defaultStyle: { font: 'Helvetica', fontSize: 8, color: '#1c2430', lineHeight: 1.12 },
    content: [
      header,
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 519, y2: 0, lineWidth: 1.4, lineColor: color }], margin: [0, 0, 0, 8] },
      { text: 'FACTURA ELECTRÓNICA · CFDI 4.0', alignment: 'center', bold: true, fontSize: 9.5, color, margin: [0, 0, 0, 10] },
      datosBloque,
      { text: 'CONCEPTOS', style: 'secTitle', color, margin: [0, 0, 0, 4] },
      {
        table: { headerRows: 1, widths: [50, '*', 26, 64, 52, 48, 54], body: bodyConceptos },
        layout: tableLayout(color), margin: [0, 0, 0, 8],
      },
      { text: 'IMPUESTOS', style: 'secTitle', color, margin: [0, 2, 0, 4] },
      tablaImpuestos,
      { columns: [pagoBloque, { width: 240, ...tablaTotales }], columnGap: 18, margin: [0, 4, 0, 4] },
      { text: numeroALetras(d.total), italics: true, fontSize: 8, color: '#3a4453', margin: [0, 4, 0, 12] },
      // Sellos + QR
      {
        columns: [
          { image: qrDataUrl, fit: [108, 108], width: 116 },
          {
            width: '*',
            stack: [
              sello('Folio fiscal (UUID)', d.timbre.uuid),
              sello('No. de serie del CSD del emisor', d.noCertificado),
              sello('No. de serie del certificado del SAT', d.timbre.noCertSAT),
              sello('RFC del proveedor de certificación', d.timbre.rfcProv),
              sello('Fecha y hora de certificación', fmtFecha(d.timbre.fechaTimbrado)),
            ],
          },
        ], columnGap: 12, margin: [0, 0, 0, 8],
      },
      { text: 'Sello digital del CFDI', style: 'selloLabel' },
      { text: d.timbre.selloCFD || '—', style: 'selloVal' },
      { text: 'Sello digital del SAT', style: 'selloLabel' },
      { text: d.timbre.selloSAT || '—', style: 'selloVal' },
      { text: 'Cadena original del complemento de certificación digital del SAT', style: 'selloLabel' },
      { text: cadenaOriginal, style: 'selloVal' },
      { text: 'Este documento es una representación impresa de un CFDI 4.0', alignment: 'center', fontSize: 7, color: '#9aa4b2', margin: [0, 12, 0, 0] },
    ],
    styles: {
      secTitle: { fontSize: 9, bold: true },
      th: { bold: true, fontSize: 7.5, color: '#1c2430' },
      td: { fontSize: 8 },
      totK: { fontSize: 8.5, color: '#5b6677', alignment: 'right', margin: [0, 1.5, 8, 1.5] },
      totV: { fontSize: 8.5, alignment: 'right', margin: [0, 1.5, 4, 1.5] },
      totKBig: { fontSize: 10.5, bold: true, alignment: 'right', margin: [0, 4, 8, 4] },
      totVBig: { fontSize: 10.5, bold: true, alignment: 'right', margin: [0, 4, 4, 4] },
      selloLabel: { fontSize: 7.5, bold: true, color: '#1c2430', margin: [0, 4, 0, 1] },
      selloVal: { fontSize: 6, color: '#5b6677' },
    },
  };

  const pdfDoc = await printer.createPdfKitDocument(docDefinition);
  return await new Promise((resolve, reject) => {
    const chunks = [];
    pdfDoc.on('data', (c) => chunks.push(c));
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
    pdfDoc.on('error', reject);
    pdfDoc.end();
  });
}

// ---- Helpers de layout ----
function lv(label, value) {
  return {
    columns: [
      { text: label, width: 110, bold: true, fontSize: 7.5, color: '#1c2430' },
      { text: value || '—', width: '*', fontSize: 7.8, color: '#3a4453' },
    ], columnGap: 5, margin: [0, 1, 0, 1],
  };
}
function sello(k, v) {
  return { columns: [{ text: k, width: 165, fontSize: 7, bold: true, color: '#1c2430' }, { text: v || '—', width: '*', fontSize: 7, color: '#5b6677' }], columnGap: 4, margin: [0, 0.4, 0, 0.4] };
}
function th(text, align) { return { text: text || '', style: 'th', alignment: align || 'left', fillColor: '#eef2f8' }; }
function td(text, align) { return { text: text || '', style: 'td', alignment: align || 'left' }; }
function tableLayout(color) {
  return {
    hLineWidth: (i) => (i === 0 || i === 1 ? 0.6 : 0.4),
    vLineWidth: () => 0,
    hLineColor: (i) => (i === 1 ? color : '#d4dbe6'),
    paddingTop: () => 3, paddingBottom: () => 3, paddingLeft: () => 4, paddingRight: () => 4,
  };
}
function fmtFecha(f) {
  if (!f) return '—';
  const dt = new Date(f);
  if (isNaN(dt)) return f;
  return dt.toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
