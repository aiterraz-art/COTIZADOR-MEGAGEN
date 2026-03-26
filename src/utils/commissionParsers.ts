import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import type {
  CommissionCarryoverLine,
  CommissionCarryoverParseResult,
  CommissionCompanyKey,
  CommissionReceivableRow,
  CommissionReceivablesParseResult,
  CommissionSalesParseResult,
  CommissionSalesRawLine,
} from '../types/commissions';

type GenericRow = Record<string, unknown>;

const SALES_ALIASES = {
  documentType: ['nombre doc', 'tipo documento', 'documento'],
  documentNumber: ['numero del documento', 'nmero del documento', 'numero documento', 'nmero documento', 'factura'],
  clientCode: ['codigo del cliente', 'código del cliente', 'codigo cliente', 'código cliente', 'c o del cliente', 'c o cliente', 'rut'],
  clientName: ['nombre del cliente', 'razon social', 'razón social', 'nombre'],
  salesRep: ['nombre del vendedor', 'vendedor', 'sales rep'],
  saleDate: ['fecha', 'date'],
  productCode: ['cod producto', 'cod. producto', 'codigo producto', 'sku'],
  productDescription: ['desc producto', 'desc. producto', 'descripcion', 'descripción', 'producto'],
  quantity: ['cantidad', 'qty'],
  netAmount: ['total neto linea', 'total detalle', 'monto neto', 'total'],
  productClass: ['cat prod', 'cat. prod.', 'categoria producto', 'categoría producto', 'tipo producto'],
} as const;

const RECEIVABLE_ALIASES = {
  documentNumber: ['numero', 'nmero', 'numero documento', 'factura'],
  balanceAmount: ['saldo', 'saldo $'],
  clientCode: ['codigo cliente', 'código cliente', 'codigo del cliente', 'código del cliente', 'c o cliente', 'c o del cliente', 'rut'],
  clientName: ['nombre', 'nombre cliente', 'cliente'],
  documentType: ['docto', 'tipo documento', 'documento'],
  dueDate: ['vencimiento', 'fecha vencimiento'],
} as const;

const CARRYOVER_ALIASES = {
  company: ['empresa'],
  originPeriodKey: ['periodo origen', 'periodo', 'período origen', 'período'],
  documentType: ['nombre doc', 'tipo documento', 'documento'],
  documentNumber: ['numero documento', 'numero del documento', 'nmero del documento', 'nmero'],
  clientCode: ['codigo cliente', 'código cliente', 'codigo del cliente', 'código del cliente', 'c o del cliente', 'c o cliente', 'rut'],
  clientName: ['nombre cliente', 'nombre del cliente', 'razon social', 'razón social', 'nombre'],
  salesRep: ['nombre del vendedor', 'vendedor', 'sales rep'],
  saleDate: ['fecha'],
  productCode: ['cod producto', 'cod. producto', 'codigo producto', 'sku'],
  productDescription: ['desc producto', 'desc. producto', 'descripcion', 'descripción', 'producto'],
  quantity: ['cantidad'],
  netAmount: ['total neto linea', 'monto neto', 'total'],
  productClass: ['clase comision', 'clase comisión', 'cat prod', 'cat. prod.'],
  ratePercent: ['tasa comision %', 'tasa comisión %', 'tasa %', 'comision %', 'comisión %'],
  sourceStatus: ['estado'],
  observation: ['observacion', 'observación', 'nota'],
} as const;

const normalizeText = (value: unknown): string => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const parseNumeric = (value: unknown): number => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const raw = String(value ?? '').trim();
  if (!raw) return 0;

  const clean = raw.replace(/[^\d.,-]/g, '');
  if (!clean) return 0;

  let normalized = clean;
  if (clean.includes(',') && clean.includes('.')) {
    normalized = clean.lastIndexOf(',') > clean.lastIndexOf('.')
      ? clean.replace(/\./g, '').replace(',', '.')
      : clean.replace(/,/g, '');
  } else if (clean.includes('.') && /^-?\d{1,3}(\.\d{3})+$/.test(clean)) {
    normalized = clean.replace(/\./g, '');
  } else if (clean.includes(',')) {
    normalized = clean.replace(',', '.');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseDateISO = (value: unknown): string => {
  if (typeof value === 'number') {
    const base = new Date(Date.UTC(1899, 11, 30));
    base.setUTCDate(base.getUTCDate() + Math.trunc(value));
    return base.toISOString().slice(0, 10);
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) {
    return direct.toISOString().slice(0, 10);
  }

  const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!match) return '';
  const [, day, month, year] = match;
  const numericYear = year.length === 2 ? Number(`20${year}`) : Number(year);
  const date = new Date(Date.UTC(numericYear, Number(month) - 1, Number(day)));
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};

const normalizeInvoiceNumber = (value: unknown): string => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }

  const raw = String(value ?? '').trim();
  if (!raw) return '';

  let normalized = raw
    .replace(/^'+/, '')
    .replace(/\s+/g, '')
    .replace(/,$/, '')
    .trim();

  if (/^-?\d+\.0+$/.test(normalized)) {
    normalized = normalized.replace(/\.0+$/, '');
  }

  return normalized;
};

const normalizePeriodKey = (value: unknown): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const iso = parseDateISO(raw);
  if (iso) return iso.slice(0, 7);
  const match = raw.match(/^(\d{4})[-/](\d{1,2})$/);
  if (!match) return raw;
  return `${match[1]}-${String(Number(match[2])).padStart(2, '0')}`;
};

const findAliasValue = (row: GenericRow, aliases: readonly string[]): unknown => {
  const normalizedAliases = aliases.map(normalizeText);

  for (const alias of normalizedAliases) {
    const exact = Object.entries(row).find(([key]) => normalizeText(key) === alias);
    if (exact) return exact[1];
  }

  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = normalizeText(key);
    if (normalizedAliases.some((alias) => normalizedKey === alias || normalizedKey.includes(alias))) {
      return value;
    }
  }

  return undefined;
};

const inferCompanyKey = (value: unknown): CommissionCompanyKey | null => {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (normalized.includes('3dental') || normalized.includes('3 dental')) return '3dental';
  if (normalized.includes('megagen') || normalized.includes('mega gen')) return 'megagen';
  return null;
};

const getRowTimestamp = (isoDate: string): number | null => {
  const value = new Date(`${isoDate}T00:00:00`).getTime();
  return Number.isFinite(value) ? value : null;
};

const buildPeriodRange = (dates: string[]): { periodFrom?: string; periodTo?: string } => {
  const timestamps = dates
    .map((date) => getRowTimestamp(date))
    .filter((value): value is number => value !== null);

  if (!timestamps.length) return {};

  return {
    periodFrom: new Date(Math.min(...timestamps)).toISOString().slice(0, 10),
    periodTo: new Date(Math.max(...timestamps)).toISOString().slice(0, 10),
  };
};

const isEffectivelyBlankSalesRow = (row: GenericRow): boolean => {
  const values = [
    findAliasValue(row, SALES_ALIASES.documentNumber),
    findAliasValue(row, SALES_ALIASES.clientCode),
    findAliasValue(row, SALES_ALIASES.clientName),
    findAliasValue(row, SALES_ALIASES.productCode),
    findAliasValue(row, SALES_ALIASES.productDescription),
    findAliasValue(row, SALES_ALIASES.netAmount),
  ];
  return values.every((value) => String(value ?? '').trim() === '');
};

export const parseCommissionSalesRows = (
  rows: GenericRow[],
  companyKey: CommissionCompanyKey,
): CommissionSalesParseResult => {
  const parsedRows: CommissionSalesRawLine[] = [];
  const warnings: string[] = [];
  const dates: string[] = [];

  rows.forEach((row, index) => {
    if (isEffectivelyBlankSalesRow(row)) {
      return;
    }

    const saleDate = parseDateISO(findAliasValue(row, SALES_ALIASES.saleDate));
    const parsedRow: CommissionSalesRawLine = {
      sourceRowIndex: index + 2,
      documentType: String(findAliasValue(row, SALES_ALIASES.documentType) ?? '').trim(),
      documentNumber: normalizeInvoiceNumber(findAliasValue(row, SALES_ALIASES.documentNumber)),
      clientCode: String(findAliasValue(row, SALES_ALIASES.clientCode) ?? '').trim(),
      clientName: String(findAliasValue(row, SALES_ALIASES.clientName) ?? '').trim(),
      salesRep: String(findAliasValue(row, SALES_ALIASES.salesRep) ?? '').trim(),
      saleDate,
      productCode: String(findAliasValue(row, SALES_ALIASES.productCode) ?? '').trim(),
      productDescription: String(findAliasValue(row, SALES_ALIASES.productDescription) ?? '').trim(),
      quantity: parseNumeric(findAliasValue(row, SALES_ALIASES.quantity)),
      netAmountCLP: parseNumeric(findAliasValue(row, SALES_ALIASES.netAmount)),
      productClass: companyKey === '3dental'
        ? String(findAliasValue(row, SALES_ALIASES.productClass) ?? '').trim()
        : undefined,
    };

    if (!parsedRow.saleDate) {
      warnings.push(`Fila ${index + 2}: fecha no válida en ventas; se dejó vacía para revisión.`);
    } else {
      dates.push(parsedRow.saleDate);
    }

    if (!parsedRow.salesRep) {
      warnings.push(`Fila ${index + 2}: documento ${parsedRow.documentNumber || '(sin factura)'} no trae vendedor.`);
    }

    if (!parsedRow.clientName) {
      warnings.push(`Fila ${index + 2}: documento ${parsedRow.documentNumber || '(sin factura)'} no trae nombre de cliente.`);
    }

    parsedRows.push(parsedRow);
  });

  return {
    rows: parsedRows,
    totalRows: rows.length,
    validRows: parsedRows.length,
    discardedRows: rows.length - parsedRows.length,
    warnings,
    ...buildPeriodRange(dates),
  };
};

export const parseCommissionReceivableRows = (rows: GenericRow[]): CommissionReceivablesParseResult => {
  const parsedRows: CommissionReceivableRow[] = [];
  const warnings: string[] = [];

  rows.forEach((row, index) => {
    const documentNumber = normalizeInvoiceNumber(findAliasValue(row, RECEIVABLE_ALIASES.documentNumber));
    const balanceAmountCLP = parseNumeric(findAliasValue(row, RECEIVABLE_ALIASES.balanceAmount));

    if (!documentNumber && !balanceAmountCLP) return;
    if (!documentNumber) {
      warnings.push(`Fila ${index + 2}: cuenta por cobrar sin número de documento; se descartó.`);
      return;
    }
    if (balanceAmountCLP <= 0) {
      return;
    }

    parsedRows.push({
      sourceRowIndex: index + 2,
      documentNumber,
      balanceAmountCLP,
      clientCode: String(findAliasValue(row, RECEIVABLE_ALIASES.clientCode) ?? '').trim() || undefined,
      clientName: String(findAliasValue(row, RECEIVABLE_ALIASES.clientName) ?? '').trim() || undefined,
      documentType: String(findAliasValue(row, RECEIVABLE_ALIASES.documentType) ?? '').trim() || undefined,
      dueDate: parseDateISO(findAliasValue(row, RECEIVABLE_ALIASES.dueDate)) || undefined,
    });
  });

  return {
    rows: parsedRows,
    totalRows: rows.length,
    validRows: parsedRows.length,
    discardedRows: rows.length - parsedRows.length,
    warnings,
  };
};

export const parseCommissionCarryoverRows = (
  rows: GenericRow[],
  sourceType: 'workbook_carryover' | 'bootstrap_sales',
  companyKey: CommissionCompanyKey,
): CommissionCarryoverParseResult => {
  if (sourceType === 'bootstrap_sales') {
    const sales = parseCommissionSalesRows(rows, companyKey);
    return {
      rows: sales.rows.map((row) => ({
        sourceRowIndex: row.sourceRowIndex,
        sourceType,
        sourceCompanyKey: companyKey,
        originPeriodKey: row.saleDate ? row.saleDate.slice(0, 7) : '',
        documentType: row.documentType,
        documentNumber: row.documentNumber,
        clientCode: row.clientCode,
        clientName: row.clientName,
        salesRep: row.salesRep,
        saleDate: row.saleDate,
        productCode: row.productCode,
        productDescription: row.productDescription,
        quantity: row.quantity,
        netAmountCLP: row.netAmountCLP,
        productClass: row.productClass,
        ratePercent: null,
      })),
      totalRows: sales.totalRows,
      validRows: sales.validRows,
      discardedRows: sales.discardedRows,
      sourceType,
      warnings: sales.warnings,
    };
  }

  const parsedRows: CommissionCarryoverLine[] = [];
  const warnings: string[] = [];

  rows.forEach((row, index) => {
    const documentNumber = normalizeInvoiceNumber(findAliasValue(row, CARRYOVER_ALIASES.documentNumber));
    const netAmountCLP = parseNumeric(findAliasValue(row, CARRYOVER_ALIASES.netAmount));

    if (!documentNumber && !netAmountCLP) return;

    const sourceCompanyKey = inferCompanyKey(findAliasValue(row, CARRYOVER_ALIASES.company));
    const saleDate = parseDateISO(findAliasValue(row, CARRYOVER_ALIASES.saleDate));
    const originPeriodKey = normalizePeriodKey(findAliasValue(row, CARRYOVER_ALIASES.originPeriodKey)) || (saleDate ? saleDate.slice(0, 7) : '');

    parsedRows.push({
      sourceRowIndex: index + 2,
      sourceType,
      sourceCompanyKey,
      originPeriodKey,
      documentType: String(findAliasValue(row, CARRYOVER_ALIASES.documentType) ?? '').trim(),
      documentNumber,
      clientCode: String(findAliasValue(row, CARRYOVER_ALIASES.clientCode) ?? '').trim(),
      clientName: String(findAliasValue(row, CARRYOVER_ALIASES.clientName) ?? '').trim(),
      salesRep: String(findAliasValue(row, CARRYOVER_ALIASES.salesRep) ?? '').trim(),
      saleDate,
      productCode: String(findAliasValue(row, CARRYOVER_ALIASES.productCode) ?? '').trim(),
      productDescription: String(findAliasValue(row, CARRYOVER_ALIASES.productDescription) ?? '').trim(),
      quantity: parseNumeric(findAliasValue(row, CARRYOVER_ALIASES.quantity)),
      netAmountCLP,
      productClass: String(findAliasValue(row, CARRYOVER_ALIASES.productClass) ?? '').trim(),
      ratePercent: findAliasValue(row, CARRYOVER_ALIASES.ratePercent) == null
        ? null
        : parseNumeric(findAliasValue(row, CARRYOVER_ALIASES.ratePercent)),
      sourceStatus: String(findAliasValue(row, CARRYOVER_ALIASES.sourceStatus) ?? '').trim() || undefined,
      observation: String(findAliasValue(row, CARRYOVER_ALIASES.observation) ?? '').trim() || undefined,
    });
  });

  return {
    rows: parsedRows,
    totalRows: rows.length,
    validRows: parsedRows.length,
    discardedRows: rows.length - parsedRows.length,
    sourceType,
    warnings,
  };
};

const readRowsFromCsvFile = async (file: File): Promise<GenericRow[]> => (
  new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results: Papa.ParseResult<GenericRow>) => resolve(results.data),
      error: (error) => reject(error),
    });
  })
);

const readWorkbookFromFile = async (file: File): Promise<XLSX.WorkBook> => {
  const data = new Uint8Array(await file.arrayBuffer());
  return XLSX.read(data, { type: 'array', cellDates: true });
};

const readRowsFromWorkbook = (workbook: XLSX.WorkBook, sheetName: string): GenericRow[] => (
  XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' }) as GenericRow[]
);

export const parseCommissionSalesFile = async (
  file: File,
  companyKey: CommissionCompanyKey,
): Promise<CommissionSalesParseResult> => {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'csv') {
    return parseCommissionSalesRows(await readRowsFromCsvFile(file), companyKey);
  }
  if (extension === 'xlsx' || extension === 'xls') {
    const workbook = await readWorkbookFromFile(file);
    return parseCommissionSalesRows(readRowsFromWorkbook(workbook, workbook.SheetNames[0]), companyKey);
  }
  throw new Error('Formato no soportado. Usa .xlsx, .xls o .csv');
};

export const parseCommissionReceivablesFile = async (file: File): Promise<CommissionReceivablesParseResult> => {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'csv') {
    return parseCommissionReceivableRows(await readRowsFromCsvFile(file));
  }
  if (extension === 'xlsx' || extension === 'xls') {
    const workbook = await readWorkbookFromFile(file);
    return parseCommissionReceivableRows(readRowsFromWorkbook(workbook, workbook.SheetNames[0]));
  }
  throw new Error('Formato no soportado. Usa .xlsx, .xls o .csv');
};

export const parseCommissionCarryoverFile = async (
  file: File,
  companyKey: CommissionCompanyKey,
): Promise<CommissionCarryoverParseResult> => {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'csv') {
    return parseCommissionCarryoverRows(await readRowsFromCsvFile(file), 'bootstrap_sales', companyKey);
  }

  if (extension === 'xlsx' || extension === 'xls') {
    const workbook = await readWorkbookFromFile(file);
    const carryoverSheetName = workbook.SheetNames.find((sheetName) => normalizeText(sheetName) === 'no cobradas vigentes');
    if (carryoverSheetName) {
      return parseCommissionCarryoverRows(readRowsFromWorkbook(workbook, carryoverSheetName), 'workbook_carryover', companyKey);
    }
    return parseCommissionCarryoverRows(readRowsFromWorkbook(workbook, workbook.SheetNames[0]), 'bootstrap_sales', companyKey);
  }

  throw new Error('Formato no soportado. Usa .xlsx, .xls o .csv');
};

export const normalizeCommissionText = normalizeText;
export const normalizeCommissionInvoice = normalizeInvoiceNumber;
