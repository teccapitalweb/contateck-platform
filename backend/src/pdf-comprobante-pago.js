// =====================================================================
//  pdf-comprobante-pago.js — OT-0022
//  Genera el COMPROBANTE INTERNO DE PAGO en PDF: documento limpio y
//  profesional con los datos reales de la operación (pagos_cliente en
//  Postgres). Es un comprobante administrativo de que el pago quedó
//  registrado en CONTATECK — NO es el CFDI, NO es el complemento de
//  pago, y NO sustituye a ningún documento fiscal (el propio PDF lo
//  dice). El archivo adjunto por el usuario (evidencia) es otra cosa
//  y se maneja por separado.
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

// datos = { pago, cfdi, empresaNombre, saldoPosterior }
export async function generarPdfComprobantePago(datos) {
  const { pago, cfdi, empresaNombre, saldoPosterior } = datos;
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
        { text: 'Documento interno generado por CONTATECK. No es un comprobante fiscal: no sustituye al CFDI ni al Complemento de Pago (REP) ante el SAT.',
          fontSize: 7, color: '#8a93a0', width: '*' },
        { text: `Página ${page} de ${total}`, fontSize: 7, color: '#8a93a0', alignment: 'right', width: 80 },
      ],
      margin: [46, 14, 46, 0],
    }),
    content: [
      // Encabezado
      {
        columns: [
          { text: (empresaNombre || 'CONTATECK').toUpperCase(), bold: true, fontSize: 15, color: '#1c2430' },
          { text: 'COMPROBANTE INTERNO DE PAGO', alignment: 'right', bold: true, fontSize: 11, color, margin: [0, 3, 0, 0] },
        ],
      },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 520, y2: 0, lineWidth: 2, lineColor: color }], margin: [0, 8, 0, 2] },
      { text: 'Constancia de registro de cobranza en el sistema administrativo', fontSize: 8, color: '#5b6470', margin: [0, 0, 0, 14] },

      // Identificación del pago
      {
        table: {
          widths: [120, '*', 120, '*'],
          body: [
            [...fila('Folio de pago', pago.folio_pago || ('P-' + String(pago.id).slice(0, 8))), ...fila('Estado', estadoTxt)],
            [...fila('Fecha del pago', fechaLarga(pago.fecha_pago)), ...fila('Registrado el', fechaHora(pago.creado_en))],
          ],
        },
        layout: 'noBorders',
        margin: [0, 0, 0, 10],
      },

      // Datos de la operación
      { text: 'DATOS DE LA OPERACIÓN', bold: true, fontSize: 9, color, margin: [0, 6, 0, 4] },
      {
        table: {
          widths: [120, '*'],
          body: [
            fila('Cliente', cfdi.receptor_nombre),
            fila('RFC', cfdi.receptor_rfc || '—'),
            fila('Concepto', 'Cobranza de la factura ' + (cfdi.folio || 's/folio')),
            fila('Importe recibido', money(pago.monto)),
            fila('Forma de pago', FORMAS_PAGO[pago.forma_pago] || pago.forma_pago || '—'),
            fila('Cuenta destino', pago.cuenta_destino_txt || '—'),
            fila('Referencia', pago.referencia || '—'),
            fila('Notas', pago.notas || '—'),
          ],
        },
        layout: {
          hLineWidth: (i) => (i === 0 ? 0 : 0.5), hLineColor: () => '#e3e7ee',
          vLineWidth: () => 0,
        },
        margin: [0, 0, 0, 10],
      },

      // Documento fiscal relacionado
      { text: 'DOCUMENTO FISCAL RELACIONADO', bold: true, fontSize: 9, color, margin: [0, 6, 0, 4] },
      {
        table: {
          widths: [120, '*'],
          body: [
            fila('Factura (CFDI)', (cfdi.folio || 's/folio') + (cfdi.uuid_sat ? '  ·  UUID ' + cfdi.uuid_sat : '')),
            fila('Método de pago del CFDI', cfdi.metodo_pago || '—'),
            fila('Total de la factura', money(cfdi.total)),
            ...(saldoPosterior != null ? [fila('Saldo posterior a este pago', money(saldoPosterior))] : []),
            fila('Complemento de Pago (REP)',
              pago.complemento_pago_estado === 'timbrado' ? 'Timbrado'
                : pago.complemento_pago_estado === 'pendiente' ? 'Pendiente de emisión ante el SAT'
                : 'No aplica (factura PUE)'),
          ],
        },
        layout: {
          hLineWidth: (i) => (i === 0 ? 0 : 0.5), hLineColor: () => '#e3e7ee',
          vLineWidth: () => 0,
        },
        margin: [0, 0, 0, 10],
      },

      // Registro
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

      // Aviso
      {
        table: {
          widths: ['*'],
          body: [[{
            text: 'Este documento acredita únicamente el registro interno del pago en CONTATECK con fines administrativos y de control. ' +
              'No es un comprobante fiscal digital (CFDI) ni un Complemento de Recepción de Pagos, y no tiene efectos fiscales ante el SAT.',
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
