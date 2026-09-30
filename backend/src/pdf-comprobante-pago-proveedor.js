// =====================================================================
//  pdf-comprobante-pago-proveedor.js — OT-0024
//  Espejo exacto de pdf-comprobante-pago.js (OT-0022), del lado de lo
//  que TÚ le pagaste a un proveedor. Mismo criterio: documento interno
//  administrativo, no es CFDI ni Complemento de Pago, y lo dice.
// =====================================================================
import PrinterPkg from 'pdfmake/js/Printer.js';
import vfsPkg from 'pdfmake/js/virtual-fs.js';
import URLResolverPkg from 'pdfmake/js/URLResolver.js';

const PdfPrinter = PrinterPkg.default || PrinterPkg;
const vfs = vfsPkg.default || vfsPkg;
const URLResolver = URLResolverPkg.default || URLResolverPkg;
const FONTS = {
  Helvetica: { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' },
};
const printer = new PdfPrinter(FONTS, vfs, new URLResolver(vfs), undefined);

const FORMAS_PAGO = {
  '01': 'Efectivo', '02': 'Cheque nominativo', '03': 'Transferencia electrónica',
  '04': 'Tarjeta de crédito', '28': 'Tarjeta de débito', '99': 'Otro',
};

const money = (n) => '$' + (parseFloat(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });
const fechaLarga = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }); }
  catch (e) { return String(iso); }
};
const fechaHora = (iso) => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
      d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  } catch (e) { return String(iso); }
};

// datos = { pago, cfdiProveedor, empresaNombre, saldoPosterior }
export async function generarPdfComprobantePagoProveedor(datos) {
  const { pago, cfdiProveedor, empresaNombre, saldoPosterior } = datos;
  const color = '#0B2F68';

  const fila = (etiqueta, valor) => [
    { text: etiqueta, color: '#5b6470', fontSize: 8.5, margin: [0, 3, 0, 3] },
    { text: valor == null || valor === '' ? '—' : String(valor), fontSize: 9.5, margin: [0, 3, 0, 3] },
  ];

  const estadoTxt = pago.estado === 'confirmado' ? 'CONFIRMADO'
    : pago.estado === 'cancelado' ? 'CANCELADO' : 'REGISTRADO (pendiente de confirmación)';

  const doc = {
    pageSize: 'LETTER',
    pageMargins: [46, 46, 46, 58],
    defaultStyle: { font: 'Helvetica', fontSize: 9.5, color: '#1c2430' },
    footer: (page, total) => ({
      columns: [
        { text: 'Documento interno generado por CONTATECK. No es un comprobante fiscal: no sustituye al CFDI ni al Complemento de Pago (REP) que el proveedor debe emitir.',
          fontSize: 7, color: '#8a93a0', width: '*' },
        { text: `Página ${page} de ${total}`, fontSize: 7, color: '#8a93a0', alignment: 'right', width: 80 },
      ],
      margin: [46, 14, 46, 0],
    }),
    content: [
      {
        columns: [
          { text: (empresaNombre || 'CONTATECK').toUpperCase(), bold: true, fontSize: 15, color: '#1c2430' },
          { text: 'COMPROBANTE INTERNO DE PAGO A PROVEEDOR', alignment: 'right', bold: true, fontSize: 11, color, margin: [0, 3, 0, 0] },
        ],
      },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 520, y2: 0, lineWidth: 2, lineColor: color }], margin: [0, 8, 0, 2] },
      { text: 'Constancia de registro de pago a proveedor en el sistema administrativo', fontSize: 8, color: '#5b6470', margin: [0, 0, 0, 14] },

      {
        table: {
          widths: [120, '*', 120, '*'],
          body: [
            [...fila('Folio de pago', pago.folio_pago || ('PP-' + String(pago.id).slice(0, 8))), ...fila('Estado', estadoTxt)],
            [...fila('Fecha del pago', fechaLarga(pago.fecha_pago)), ...fila('Registrado el', fechaHora(pago.creado_en))],
          ],
        },
        layout: 'noBorders',
        margin: [0, 0, 0, 10],
      },

      { text: 'DATOS DE LA OPERACIÓN', bold: true, fontSize: 9, color, margin: [0, 6, 0, 4] },
      {
        table: {
          widths: [120, '*'],
          body: [
            fila('Proveedor', cfdiProveedor.emisor_nombre),
            fila('RFC', cfdiProveedor.emisor_rfc),
            fila('Concepto', 'Pago de la factura ' + (cfdiProveedor.folio || 's/folio')),
            fila('Importe pagado', money(pago.monto)),
            fila('Forma de pago', FORMAS_PAGO[pago.forma_pago] || pago.forma_pago || '—'),
            fila('Cuenta de origen', pago.cuenta_origen_txt || '—'),
            fila('Referencia', pago.referencia || '—'),
            fila('Notas', pago.notas || '—'),
          ],
        },
        layout: { hLineWidth: (i) => (i === 0 ? 0 : 0.5), hLineColor: () => '#e3e7ee', vLineWidth: () => 0 },
        margin: [0, 0, 0, 10],
      },

      { text: 'DOCUMENTO FISCAL RELACIONADO', bold: true, fontSize: 9, color, margin: [0, 6, 0, 4] },
      {
        table: {
          widths: [120, '*'],
          body: [
            fila('Factura (CFDI) del proveedor', (cfdiProveedor.folio || 's/folio') + (cfdiProveedor.uuid_sat ? '  ·  UUID ' + cfdiProveedor.uuid_sat : '')),
            fila('Método de pago del CFDI', cfdiProveedor.metodo_pago || '—'),
            fila('Total de la factura', money(cfdiProveedor.total)),
            ...(saldoPosterior != null ? [fila('Saldo posterior a este pago', money(saldoPosterior))] : []),
          ],
        },
        layout: { hLineWidth: (i) => (i === 0 ? 0 : 0.5), hLineColor: () => '#e3e7ee', vLineWidth: () => 0 },
        margin: [0, 0, 0, 10],
      },

      { text: 'REGISTRO', bold: true, fontSize: 9, color, margin: [0, 6, 0, 4] },
      {
        table: {
          widths: [120, '*', 120, '*'],
          body: [
            [...fila('Registrado por', pago.registrado_por_txt || '—'), ...fila('Fecha/hora', fechaHora(pago.creado_en))],
            [...fila('Confirmado por', pago.confirmado_por_txt || 'Aún sin confirmar'), ...fila('Fecha/hora', pago.confirmado_en ? fechaHora(pago.confirmado_en) : '—')],
            [...fila('Póliza contable', pago.poliza_folio || 'Pendiente (se genera al confirmar)'), ...fila('Evidencia adjunta', pago.comprobante_url ? 'Sí (archivo en expediente digital)' : 'Sin evidencia adjunta')],
          ],
        },
        layout: 'noBorders',
        margin: [0, 0, 0, 16],
      },

      {
        table: {
          widths: ['*'],
          body: [[{
            text: 'Este documento acredita únicamente el registro interno del pago a proveedor en CONTATECK con fines administrativos y de control. ' +
              'No es un comprobante fiscal digital (CFDI) ni el Complemento de Recepción de Pagos que el proveedor debe emitir, y no tiene efectos fiscales ante el SAT.',
            fontSize: 8, color: '#5b6470', margin: [10, 8, 10, 8],
          }]],
        },
        layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => '#e3e7ee', vLineColor: () => '#e3e7ee' },
      },
    ],
  };

  // FIX: createPdfKitDocument() regresa una PROMESA en esta versión de
  // pdfmake — sin el await, "pdf" era la promesa, no el documento, y
  // pdf.on(...) tronaba con "pdf.on is not a function". Mismo patrón
  // que ya usa correctamente pdf-cfdi.js (que sí funciona).
  const pdf = await printer.createPdfKitDocument(doc);
  return new Promise((resolve, reject) => {
    try {
      const chunks = [];
      pdf.on('data', (c) => chunks.push(c));
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
      pdf.on('error', (e) => reject(e));
      pdf.end();
    } catch (e) { reject(e); }
  });
}
