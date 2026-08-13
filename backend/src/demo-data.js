// ============================================================
//  CONTATECK · Datos de PRUEBA para timbrado de demostración
//  Certificado de Sello Digital (CSD) PÚBLICO del SAT para
//  el ambiente de pruebas: "ESCUELA KEMPER URGATE" (EKU9003173C9).
//  Vigencia: mayo 2023 – mayo 2027. Contraseña: 12345678a.
//  Estos archivos son públicos y SOLO sirven en sandbox.
//  En producción, cada RFC usa su propio CSD real (nunca este).
// ============================================================
import { config } from './config.js';


const CSD_CER_BASE64 = 'MIIFsDCCA5igAwIBAgIUMzAwMDEwMDAwMDA1MDAwMDM0MTYwDQYJKoZIhvcNAQELBQAwggErMQ8wDQYDVQQDDAZBQyBVQVQxLjAsBgNVBAoMJVNFUlZJQ0lPIERFIEFETUlOSVNUUkFDSU9OIFRSSUJVVEFSSUExGjAYBgNVBAsMEVNBVC1JRVMgQXV0aG9yaXR5MSgwJgYJKoZIhvcNAQkBFhlvc2Nhci5tYXJ0aW5lekBzYXQuZ29iLm14MR0wGwYDVQQJDBQzcmEgY2VycmFkYSBkZSBjYWxpejEOMAwGA1UEEQwFMDYzNzAxCzAJBgNVBAYTAk1YMRkwFwYDVQQIDBBDSVVEQUQgREUgTUVYSUNPMREwDwYDVQQHDAhDT1lPQUNBTjERMA8GA1UELRMIMi41LjQuNDUxJTAjBgkqhkiG9w0BCQITFnJlc3BvbnNhYmxlOiBBQ0RNQS1TQVQwHhcNMjMwNTE4MTE0MzUxWhcNMjcwNTE4MTE0MzUxWjCB1zEnMCUGA1UEAxMeRVNDVUVMQSBLRU1QRVIgVVJHQVRFIFNBIERFIENWMScwJQYDVQQpEx5FU0NVRUxBIEtFTVBFUiBVUkdBVEUgU0EgREUgQ1YxJzAlBgNVBAoTHkVTQ1VFTEEgS0VNUEVSIFVSR0FURSBTQSBERSBDVjElMCMGA1UELRMcRUtVOTAwMzE3M0M5IC8gVkFEQTgwMDkyN0RKMzEeMBwGA1UEBRMVIC8gVkFEQTgwMDkyN0hTUlNSTDA1MRMwEQYDVQQLEwpTdWN1cnNhbCAxMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtmecO6n2GS0zL025gbHGQVxznPDICoXzR2uUngz4DqxVUC/w9cE6FxSiXm2ap8Gcjg7wmcZfm85EBaxCx/0J2u5CqnhzIoGCdhBPuhWQnIh5TLgj/X6uNquwZkKChbNe9aeFirU/JbyN7Egia9oKH9KZUsodiM/pWAH00PCtoKJ9OBcSHMq8Rqa3KKoBcfkg1ZrgueffwRLws9yOcRWLb02sDOPzGIm/jEFicVYt2Hw1qdRE5xmTZ7AGG0UHs+unkGjpCVeJ+BEBn0JPLWVvDKHZAQMj6s5Bku35+d/MyATkpOPsGT/VTnsouxekDfikJD1f7A1ZpJbqDpkJnss3vQIDAQABox0wGzAMBgNVHRMBAf8EAjAAMAsGA1UdDwQEAwIGwDANBgkqhkiG9w0BAQsFAAOCAgEAFaUgj5PqgvJigNMgtrdXZnbPfVBbukAbW4OGnUhNrA7SRAAfv2BSGk16PI0nBOr7qF2mItmBnjgEwk+DTv8Zr7w5qp7vleC6dIsZFNJoa6ZndrE/f7KO1CYruLXr5gwEkIyGfJ9NwyIagvHHMszzyHiSZIA850fWtbqtythpAliJ2jF35M5pNS+YTkRB+T6L/c6m00ymN3q9lT1rB03YywxrLreRSFZOSrbwWfg34EJbHfbFXpCSVYdJRfiVdvHnewN0r5fUlPtR9stQHyuqewzdkyb5jTTw02D2cUfL57vlPStBj7SEi3uOWvLrsiDnnCIxRMYJ2UA2ktDKHk+zWnsDmaeleSzonv2CHW42yXYPCvWi88oE1DJNYLNkIjua7MxAnkNZbScNw01A6zbLsZ3y8G6eEYnxSTRfwjd8EP4kdiHNJftm7Z4iRU7HOVh79/lRWB+gd171s3d/mI9kte3MRy6V8MMEMCAnMboGpaooYwgAmwclI2XZCczNWXfhaWe0ZS5PmytD/GDpXzkX0oEgY9K/uYo5V77NdZbGAjmyi8cE2B2ogvyaN2XfIInrZPgEffJ4AB7kFA2mwesdLOCh0BLD9itmCve3A1FGR4+stO2ANUoiI3w3Tv2yQSg4bjeDlJ08lXaaFCLW2peEXMXjQUk7fmpb5MNuOUTW6BE=';
const CSD_KEY_BASE64 = 'MIIFDjBABgkqhkiG9w0BBQ0wMzAbBgkqhkiG9w0BBQwwDgQIAgEAAoIBAQACAggAMBQGCCqGSIb3DQMHBAgwggS/AgEAMASCBMh4EHl7aNSCaMDA1VlRoXCZ5UUmqErAbucoZQObOaLUEm+I+QZ7Y8Giupo+F1XWkLvAsdk/uZlJcTfKLJyJbJwsQYbSpLOCLataZ4O5MVnnmMbfG//NKJn9kSMvJQZhSwAwoGLYDm1ESGezrvZabgFJnoQv8Si1nAhVGTk9FkFBesxRzq07dmZYwFCnFSX4xt2fDHs1PMpQbeq83aL/PzLCce3kxbYSB5kQlzGtUYayiYXcu0cVRu228VwBLCD+2wTDDoCmRXtPesgrLKUR4WWWb5N2AqAU1mNDC+UEYsENAerOFXWnmwrcTAu5qyZ7GsBMTpipW4Dbou2yqQ0lpA/aB06n1kz1aL6mNqGPaJ+OqoFuc8Ugdhadd+MmjHfFzoI20SZ3b2geCsUMNCsAd6oXMsZdWm8lzjqCGWHFeol0ik/xHMQvuQkkeCsQ28PBxdnUgf7ZGer+TN+2ZLd2kvTBOk6pIVgy5yC6cZ+o1Tloql9hYGa6rT3xcMbXlW+9e5jM2MWXZliVW3ZhaPjptJFDbIfWxJPjz4QvKyJk0zok4muv13Iiwj2bCyefUTRz6psqI4cGaYm9JpscKO2RCJN8UluYGbbWmYQU+Int6LtZj/lv8p6xnVjWxYI+rBPdtkpfFYRp+MJiXjgPw5B6UGuoruv7+vHjOLHOotRo+RdjZt7NqL9dAJnl1Qb2jfW6+d7NYQSI/bAwxO0sk4taQIT6Gsu/8kfZOPC2xk9rphGqCSS/4q3Os0MMjA1bcJLyoWLp13pqhK6bmiiHw0BBXH4fbEp4xjSbpPx4tHXzbdn8oDsHKZkWh3pPC2J/nVl0k/yF1KDVowVtMDXE47k6TGVcBoqe8PDXCG9+vjRpzIidqNo5qebaUZu6riWMWzldz8x3Z/jLWXuDiM7/Yscn0Z2GIlfoeyz+GwP2eTdOw9EUedHjEQuJY32bq8LICimJ4Ht+zMJKUyhwVQyAER8byzQBwTYmYP5U0wdsyIFitphw+/IH8+v08Ia1iBLPQAeAvRfTTIFLCs8foyUrj5Zv2B/wTYIZy6ioUM+qADeXyo45uBLLqkN90Rf6kiTqDld78NxwsfyR5MxtJLVDFkmf2IMMJHTqSfhbi+7QJaC11OOUJTD0v9wo0X/oO5GvZhe0ZaGHnm9zqTopALuFEAxcaQlc4R81wjC4wrIrqWnbcl2dxiBtD73KW+wcC9ymsLf4I8BEmiN25lx/OUc1IHNyXZJYSFkEfaxCEZWKcnbiyf5sqFSSlEqZLc4lUPJFAoP6s1FHVcyO0odWqdadhRZLZC9RCzQgPlMRtji/OXy5phh7diOBZv5UYp5nb+MZ2NAB/eFXm2JLguxjvEstuvTDmZDUb6Uqv++RdhO5gvKf/AcwU38ifaHQ9uvRuDocYwVxZS2nr9rOwZ8nAh+P2o4e0tEXjxFKQGhxXYkn75H3hhfnFYjik/2qunHBBZfcdG148MaNP6DjX33M238T9Zw/GyGx00JMogr2pdP4JAErv9a5yt4YR41KGf8guSOUbOXVARw6+ybh7+meb7w4BeTlj3aZkv8tVGdfIt3lrwVnlbzhLjeQY6PplKp3/a5Kr5yM0T4wJoKQQ6v3vSNmrhpbuAtKxpMILe8CQoo=';
const CSD_PASSWORD = '12345678a';

// Fecha en hora de México (Centro) en formato SAT. El SAT NO acepta fechas
// futuras, y toISOString() da hora UTC (6 h adelantada). Restamos 2 min de
// margen para que nunca quede en el futuro aunque los relojes difieran.
export function fechaMexico() {
  const base = new Date(Date.now() - 2 * 60 * 1000);
  const fmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Mexico_City',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  // 'sv-SE' produce "YYYY-MM-DD HH:mm:ss"; el SAT quiere la "T" en medio.
  return fmt.format(base).replace(' ', 'T');
}

// Emisor: usa el REAL (variables de producción EMISOR_*) si está completo;
// si no, el CSD público de pruebas (ESCUELA KEMPER URGATE). Así, para pasar
// a producción solo defines las variables en Railway, sin tocar el código.
const _e = config.emisor || {};
const _emisorReal = _e.rfc && _e.csdCerBase64 && _e.csdKeyBase64 && _e.csdPassword;

export const EMISOR_PRUEBA = _emisorReal
  ? {
      tin: _e.rfc,
      legalName: _e.nombre,
      taxRegimeCode: _e.regimen || '612', // persona física por defecto
      taxCredentials: [
        { base64File: _e.csdCerBase64, fileType: 0, password: _e.csdPassword }, // .cer
        { base64File: _e.csdKeyBase64, fileType: 1, password: _e.csdPassword }, // .key
      ],
    }
  : {
      tin: 'EKU9003173C9',
      legalName: 'ESCUELA KEMPER URGATE',
      taxRegimeCode: '601',
      taxCredentials: [
        { base64File: CSD_CER_BASE64, fileType: 0, password: CSD_PASSWORD }, // .cer
        { base64File: CSD_KEY_BASE64, fileType: 1, password: CSD_PASSWORD }, // .key
      ],
    };

// Código postal del emisor (lugar de expedición). En producción, el de tu CSD.
export const CP_EMISOR = _e.cp || '42501';

// Construye una factura de ingreso CFDI 4.0 a partir de datos capturados
// en el frontend. El emisor y su CSD se ponen del lado del backend (seguro);
// el frontend solo manda receptor y conceptos.
//   datos = {
//     receptor: { rfc, nombre, usoCfdi?, cp?, regimen?, email? },
//     conceptos: [ { descripcion, cantidad, precioUnitario } ],
//     serie?, formaPago?, metodoPago?
//   }
export function construirFactura(datos = {}) {
  const r = datos.receptor || {};
  const conceptos = Array.isArray(datos.conceptos) && datos.conceptos.length
    ? datos.conceptos
    : [{ descripcion: 'Servicio', cantidad: 1, precioUnitario: 100 }];

  // Retenciones opcionales (tasas como decimal: 0.106667 = 10.6667%).
  const ret = datos.retenciones || {};
  const retIva = Number(ret.iva) || 0;
  const retIsr = Number(ret.isr) || 0;

  // Tasa de IVA trasladado — las 4 únicas que existen en la ley mexicana:
  // 16% (general), 8% (estímulo zona fronteriza), 0% (tasa cero, art. 2-A)
  // y Exento (art. 9, sin traslado de impuesto). Por default sigue siendo
  // 16% para no cambiar el comportamiento de facturas ya probadas.
  const tasaIva = datos.tasaIva !== undefined ? String(datos.tasaIva) : '16';
  const esExento = tasaIva === 'exento';
  const tasaIvaDecimal = esExento ? 0 : Number(tasaIva) / 100;

  const items = conceptos.map((c, i) => {
    const cantidad = Number(c.cantidad || 1);
    const precio = Number(c.precioUnitario || 0);
    const taxes = [
      esExento
        ? { taxCode: '002', taxTypeCode: 'Exento', taxFlagCode: 'T' } // IVA exento: sin tasa, por definición legal
        : { taxCode: '002', taxTypeCode: 'Tasa', taxRate: tasaIvaDecimal.toFixed(6), taxFlagCode: 'T' },
    ];
    if (retIva > 0) taxes.push({ taxCode: '002', taxTypeCode: 'Tasa', taxRate: retIva.toFixed(6), taxFlagCode: 'R' }); // IVA retenido
    if (retIsr > 0) taxes.push({ taxCode: '001', taxTypeCode: 'Tasa', taxRate: retIsr.toFixed(6), taxFlagCode: 'R' }); // ISR retenido
    return {
      itemCode: c.claveProdServ || '01010101',
      quantity: String(cantidad),
      unitOfMeasurementCode: c.claveUnidad || 'E48',
      description: (c.descripcion || 'Servicio').slice(0, 256),
      unitPrice: precio.toFixed(2),
      taxObjectCode: '02',
      itemSku: c.sku || `CONTATECK-${Date.now()}-${i + 1}`,
      itemTaxes: taxes,
    };
  });

  return {
    versionCode: '4.0',
    series: datos.serie || 'CT',
    date: fechaMexico(),
    paymentFormCode: datos.formaPago || '01',     // Efectivo
    paymentMethodCode: datos.metodoPago || 'PUE', // Pago en una exhibición
    currencyCode: 'MXN',
    exchangeRate: 1,
    typeCode: 'I',                                 // Ingreso
    expeditionZipCode: CP_EMISOR,
    exportCode: '01',
    issuer: EMISOR_PRUEBA,
    recipient: {
      tin: (r.rfc || 'EKU9003173C9').toUpperCase().trim(),
      legalName: (r.nombre || 'ESCUELA KEMPER URGATE').toUpperCase().trim(),
      zipCode: r.cp || '42501',
      taxRegimeCode: r.regimen || '601',
      cfdiUseCode: r.usoCfdi || 'G03',
      email: r.email || 'pruebas@contateck.mx',
    },
    items,
  };
}

// ------------------------------------------------------------
//  NOTA DE CRÉDITO (CFDI de Egreso, tipo "E")
//  Se relaciona con la factura de ingreso original mediante
//  relatedInvoices. tipoRelacion: "01" descuento/bonificación,
//  "03" devolución de mercancía.
//    datos = {
//      receptor: { rfc, nombre, usoCfdi?, cp?, regimen?, email? },
//      conceptos: [ { descripcion, cantidad, precioUnitario } ],
//      uuidRelacionado: "UUID-de-la-factura-original",
//      tipoRelacion?: "01" | "03",
//      formaPago?, serie?
//    }
// ------------------------------------------------------------
export function construirNotaCredito(datos = {}) {
  const r = datos.receptor || {};
  const conceptos = Array.isArray(datos.conceptos) && datos.conceptos.length
    ? datos.conceptos
    : [{ descripcion: 'Descuento, devolución o bonificación', cantidad: 1, precioUnitario: 0 }];

  const items = conceptos.map((c, i) => {
    const cantidad = Number(c.cantidad || 1);
    const precio = Number(c.precioUnitario || 0);
    return {
      itemCode: c.claveProdServ || '84111506',   // Servicios de facturación (típico en NC)
      quantity: String(cantidad),
      unitOfMeasurementCode: c.claveUnidad || 'E48',
      description: (c.descripcion || 'Descuento, devolución o bonificación').slice(0, 256),
      unitPrice: precio.toFixed(2),
      taxObjectCode: '02',
      itemSku: c.sku || `NC-${Date.now()}-${i + 1}`,
      itemTaxes: [
        { taxCode: '002', taxTypeCode: 'Tasa', taxRate: '0.160000', taxFlagCode: 'T' }, // IVA 16%
      ],
    };
  });

  return {
    versionCode: '4.0',
    series: datos.serie || 'NC',
    date: fechaMexico(),
    paymentFormCode: datos.formaPago || '01',     // forma del descuento; "15" Condonación si no estaba pagada
    paymentMethodCode: datos.metodoPago || 'PUE',
    currencyCode: 'MXN',
    exchangeRate: 1,
    typeCode: 'E',                                 // Egreso (nota de crédito)
    expeditionZipCode: CP_EMISOR,
    exportCode: '01',
    issuer: EMISOR_PRUEBA,
    recipient: {
      tin: (r.rfc || 'EKU9003173C9').toUpperCase().trim(),
      legalName: (r.nombre || 'ESCUELA KEMPER URGATE').toUpperCase().trim(),
      zipCode: r.cp || '42501',
      taxRegimeCode: r.regimen || '601',
      cfdiUseCode: r.usoCfdi || 'G02',             // G02: Devoluciones, descuentos o bonificaciones
      email: r.email || 'pruebas@contateck.mx',
    },
    relatedInvoices: [
      { relationshipTypeCode: datos.tipoRelacion || '01', uuid: String(datos.uuidRelacionado || '').trim() },
    ],
    items,
  };
}

// ------------------------------------------------------------
//  REP · Complemento para Recepción de Pagos (CFDI de Pago, "P")
//  Se emite cuando una factura PPD recibe un pago. Lleva el
//  complemento payment con la(s) factura(s) pagada(s).
//    datos = {
//      receptor: { rfc, nombre, cp?, regimen?, email? },
//      pago: { fecha?, formaPago?, monto },
//      facturaPagada: {
//        uuid, serie?, folio?, taxObjectCode?,
//        saldoAnterior, montoPagado, saldoInsoluto?, parcialidad?,
//        conIva? (default true)
//      },
//      serie?
//    }
//  Nota: para CFDI de Pago el comprobante va con moneda "XXX" y
//  sin conceptos; los montos viven en el complemento.
// ------------------------------------------------------------
export function construirREP(datos = {}) {
  const r = datos.receptor || {};
  const p = datos.pago || {};
  const f = datos.facturaPagada || {};

  const conIva = f.conIva !== false; // por defecto las facturas CONTATECK llevan IVA 16%
  const montoPagado = Number(p.monto != null ? p.monto : (f.montoPagado || 0));
  const saldoAnterior = Number(f.saldoAnterior != null ? f.saldoAnterior : montoPagado);
  const saldoInsoluto = Number(
    f.saldoInsoluto != null ? f.saldoInsoluto : Math.max(saldoAnterior - montoPagado, 0)
  );
  // El subtotal de la parcialidad: si la factura llevaba IVA 16%, se desglosa.
  const subtotalPagado = conIva ? montoPagado / 1.16 : montoPagado;

  const paidInvoice = {
    uuid: String(f.uuid || '').trim(),
    series: f.serie || 'CT',
    number: String(f.folio || '1'),
    paymentAmount: montoPagado.toFixed(2),
    currencyCode: 'MXN',
    partialityNumber: Number(f.parcialidad || 1),
    subTotal: subtotalPagado.toFixed(2),
    previousBalance: saldoAnterior.toFixed(2),
    remainingBalance: saldoInsoluto.toFixed(2),
    taxObjectCode: f.taxObjectCode || (conIva ? '02' : '01'),
    equivalence: 1,
  };
  // Solo se desglosan impuestos del documento si es objeto de impuesto.
  if (conIva) {
    paidInvoice.paidInvoiceTaxes = [
      { taxCode: '002', taxTypeCode: 'Tasa', taxRate: '0.160000', taxFlagCode: 'T' },
    ];
  }

  return {
    versionCode: '4.0',
    series: datos.serie || 'PAGO',
    date: fechaMexico(),
    currencyCode: 'XXX',                           // CFDI de pago: moneda "XXX" a nivel comprobante
    exchangeRate: 1,
    typeCode: 'P',                                 // Pago (REP)
    expeditionZipCode: CP_EMISOR,
    exportCode: '01',
    issuer: EMISOR_PRUEBA,
    recipient: {
      tin: (r.rfc || 'EKU9003173C9').toUpperCase().trim(),
      legalName: (r.nombre || 'ESCUELA KEMPER URGATE').toUpperCase().trim(),
      zipCode: r.cp || '42501',
      taxRegimeCode: r.regimen || '601',
      cfdiUseCode: 'CP01',                         // CP01: uso CFDI obligatorio para pagos
      email: r.email || 'pruebas@contateck.mx',
    },
    complement: {
      payment: {
        paymentDate: p.fecha || fechaMexico(),
        paymentFormCode: p.formaPago || '03',      // 03: Transferencia electrónica de fondos
        currencyCode: 'MXN',
        exchangeRate: 1,
        amount: montoPagado.toFixed(2),
        paidInvoices: [paidInvoice],
      },
    },
  };
}

// Factura de demostración fija (la usa /api/demo/timbrar).
export function facturaDePrueba() {
  return construirFactura({
    serie: 'DEMO',
    receptor: { rfc: 'EKU9003173C9', nombre: 'ESCUELA KEMPER URGATE', usoCfdi: 'G03' },
    conceptos: [{ descripcion: 'Servicio de prueba CONTATECK', cantidad: 1, precioUnitario: 100 }],
  });
}
