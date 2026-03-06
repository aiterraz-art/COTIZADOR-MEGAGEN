import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import type {
  CurrentStock,
  ParsedDatasetResult,
  ProductRotation,
  ProductSupplier,
} from '../types/inventory';

const normalize = (text: string): string => text
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim();

const parseNumber = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined) return 0;

  const raw = String(value).trim();
  if (!raw) return 0;
  const clean = raw.replace(/[^\d.,-]/g, '');
  if (!clean) return 0;

  const hasComma = clean.includes(',');
  const hasDot = clean.includes('.');
  let normalized = clean;

  if (hasComma && hasDot) {
    if (clean.lastIndexOf(',') > clean.lastIndexOf('.')) {
      normalized = clean.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = clean.replace(/,/g, '');
    }
  } else if (hasComma) {
    normalized = clean.replace(',', '.');
  }

  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : 0;
};

const parseDateToISO = (value: unknown): string => {
  if (typeof value === 'number') {
    const dateCode = XLSX.SSF.parse_date_code(value);
    if (!dateCode) return new Date().toISOString().slice(0, 10);
    return new Date(dateCode.y, dateCode.m - 1, dateCode.d).toISOString().slice(0, 10);
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }

  return new Date().toISOString().slice(0, 10);
};

const resolveColumnValue = (row: Record<string, unknown>, aliases: string[]): unknown => {
  const normalizedAliases = aliases.map(normalize);
  const entries = Object.entries(row);

  for (const [key, value] of entries) {
    const normalizedKey = normalize(key);
    if (normalizedAliases.some((alias) => normalizedKey === alias || normalizedKey.includes(alias))) {
      return value;
    }
  }

  return undefined;
};

const readSheetRows = async (file: File): Promise<Record<string, unknown>[]> => {
  const extension = file.name.split('.').pop()?.toLowerCase();

  if (extension === 'csv') {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results: Papa.ParseResult<Record<string, unknown>>) => resolve(results.data),
        error: (error: Error) => reject(error),
      });
    });
  }

  if (extension === 'xlsx' || extension === 'xls') {
    const content = new Uint8Array(await file.arrayBuffer());
    const workbook = XLSX.read(content, { type: 'array' });
    const firstSheet = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheet];
    return XLSX.utils.sheet_to_json(worksheet, { defval: '' }) as Record<string, unknown>[];
  }

  throw new Error('Formato no soportado. Usa .xlsx, .xls o .csv');
};

export const parseSupplierMasterFile = async (file: File): Promise<ParsedDatasetResult<ProductSupplier>> => {
  const rows = await readSheetRows(file);
  const parsedRows: ProductSupplier[] = [];

  for (const row of rows) {
    const sku = String(resolveColumnValue(row, ['sku', 'codigo', 'code', 'cod']) ?? '').trim();
    const name = String(resolveColumnValue(row, ['nombre', 'name', 'producto', 'descripcion']) ?? '').trim();
    const supplierName = String(resolveColumnValue(row, ['proveedor', 'supplier', 'supplier_name']) ?? '').trim() || 'SIN_PROVEEDOR';
    const leadTimeDays = Math.max(0, parseNumber(resolveColumnValue(row, ['lead time', 'lead_time', 'tiempo entrega', 'dias entrega'])));

    if (!sku) continue;

    parsedRows.push({
      sku,
      name: name || sku,
      supplierName,
      leadTimeDays,
    });
  }

  return {
    rows: parsedRows,
    totalRows: rows.length,
    validRows: parsedRows.length,
    discardedRows: rows.length - parsedRows.length,
  };
};

export const parseRotationFile = async (file: File): Promise<ParsedDatasetResult<ProductRotation>> => {
  const rows = await readSheetRows(file);
  const parsedRows: ProductRotation[] = [];

  for (const row of rows) {
    const sku = String(resolveColumnValue(row, ['sku', 'codigo', 'code', 'cod']) ?? '').trim();
    const totalExits90Days = Math.max(0, parseNumber(resolveColumnValue(row, ['salidas', 'exits', 'ventas_90d', 'rotacion_90d'])));

    if (!sku) continue;

    parsedRows.push({
      sku,
      totalExits90Days,
      averageDailyUsage: totalExits90Days / 90,
    });
  }

  return {
    rows: parsedRows,
    totalRows: rows.length,
    validRows: parsedRows.length,
    discardedRows: rows.length - parsedRows.length,
  };
};

export const parseStockFile = async (file: File): Promise<ParsedDatasetResult<CurrentStock>> => {
  const rows = await readSheetRows(file);
  const parsedRows: CurrentStock[] = [];

  for (const row of rows) {
    const sku = String(resolveColumnValue(row, ['sku', 'codigo', 'code', 'cod']) ?? '').trim();
    const stockLevel = Math.max(0, parseNumber(resolveColumnValue(row, ['stock', 'existencia', 'inventario', 'stock_level'])));
    const lastUpdated = parseDateToISO(resolveColumnValue(row, ['fecha', 'last_updated', 'updated_at']));

    if (!sku) continue;

    parsedRows.push({
      sku,
      stockLevel,
      lastUpdated,
    });
  }

  return {
    rows: parsedRows,
    totalRows: rows.length,
    validRows: parsedRows.length,
    discardedRows: rows.length - parsedRows.length,
  };
};
