import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import type {
  CurrentStock,
  ParsedDatasetResult,
  ProductRotation,
  ProductSupplier,
  WarehouseCategory,
  WarehouseLedgerParseResult,
  WarehouseLedgerRow,
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

const parseLedgerNumber = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined) return 0;

  const raw = String(value).trim();
  if (!raw) return 0;
  const negative = raw.includes('(') && raw.includes(')');
  const clean = raw.replace(/[^\d.,-]/g, '');
  if (!clean) return 0;

  const commas = (clean.match(/,/g) || []).length;
  const dots = (clean.match(/\./g) || []).length;
  let normalized = clean;

  if (commas && dots) {
    normalized = clean.lastIndexOf(',') > clean.lastIndexOf('.')
      ? clean.replace(/\./g, '').replace(',', '.')
      : clean.replace(/,/g, '');
  } else if (commas || dots) {
    const separator = commas ? ',' : '.';
    const occurrences = commas || dots;
    const lastPart = clean.slice(clean.lastIndexOf(separator) + 1);
    // In Chilean ledgers, 1.250 and 1,250 usually mean one thousand two hundred fifty.
    normalized = occurrences > 1 || lastPart.length === 3
      ? clean.replace(new RegExp(`\\${separator}`, 'g'), '')
      : clean.replace(separator, '.');
  }

  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? (negative ? -Math.abs(numeric) : numeric) : 0;
};

const classifyWarehouseProduct = (sku: string, name: string): WarehouseCategory => {
  const source = normalize(`${sku} ${name}`)
    .replaceAll('[', ' ')
    .replaceAll(']', ' ')
    .replace(/[_-]/g, ' ');
  const includes = (pattern: RegExp) => pattern.test(source);

  const prostheticTerms = /abutment|pilar|analog|análogo|coping|scanbody|scan body|transfer|cylinder|cilindro|tornillo|screw|healing|cicatriz|locator|barra|bar\/clip|aditamento/;
  if (includes(prostheticTerms)) return 'Prosthetic';

  if (includes(/\bblue\s*diamond\b|\bbd\d*\b/)) return 'BD';
  if (includes(/\bari\b|anyridge\s*(i|internal)\b/)) return 'Ari';
  if (includes(/\banyridge\b|\bar\d+\b|\bar\b/)) return 'AR';
  if (includes(/\banyone\b|\bany\s*one\b|\bao\d+\b|\bao\b/)) return 'AO';
  if (includes(/\bst\d+\b|\bst fixture\b|\bspecial\s*thread\b/)) return 'ST';

  const fixtureTerms = /fixture|implante|implant/;
  if (includes(fixtureTerms)) return 'ETC';
  return 'Others';
};

const findHeaderRow = (matrix: unknown[][]): { index: number; headers: string[] } | null => {
  for (let index = 0; index < Math.min(matrix.length, 50); index += 1) {
    const headers = matrix[index].map((cell) => String(cell ?? '').trim());
    const joined = normalize(headers.join(' | '));
    const hasProduct = /sku|codigo|cod |articulo|producto|descripcion|nombre/.test(joined);
    const hasAmount = /saldo|valor|importe|monto|total|haber|debe/.test(joined);
    if (hasProduct && hasAmount) return { index, headers };
  }
  return null;
};

const findColumn = (headers: string[], aliases: string[]): number => {
  const normalizedAliases = aliases.map(normalize);
  return headers.findIndex((header) => {
    const normalizedHeader = normalize(header);
    return normalizedAliases.some((alias) => normalizedHeader === alias || normalizedHeader.includes(alias));
  });
};

/** Parses a warehouse ledger with product, quantity and balance/value columns. */
export const parseWarehouseLedgerFile = async (file: File): Promise<WarehouseLedgerParseResult> => {
  const extension = file.name.split('.').pop()?.toLowerCase();
  let matrix: unknown[][];

  if (extension === 'csv') {
    const rows = await readSheetRows(file);
    matrix = rows.length ? [Object.keys(rows[0]), ...rows.map((row) => Object.values(row))] : [];
  } else if (extension === 'xlsx' || extension === 'xls') {
    const content = new Uint8Array(await file.arrayBuffer());
    const workbook = XLSX.read(content, { type: 'array' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as unknown[][];
  } else {
    throw new Error('Formato no soportado. Usa .xlsx, .xls o .csv');
  }

  const header = findHeaderRow(matrix);
  if (!header) {
    throw new Error('No se encontraron encabezados. El archivo debe incluir producto/código y saldo o valor.');
  }

  const skuIndex = findColumn(header.headers, ['sku', 'codigo producto', 'codigo articulo', 'cod producto', 'cod articulo', 'codigo', 'cod']);
  const nameIndex = findColumn(header.headers, ['descripcion producto', 'nombre producto', 'descripcion', 'producto', 'articulo', 'nombre']);
  const quantityIndex = findColumn(header.headers, ['saldo cantidad', 'cantidad saldo', 'cantidad', 'unidades', 'existencia', 'stock']);
  const valueIndex = findColumn(header.headers, ['saldo valorizado', 'saldo valor', 'valor total', 'saldo final', 'importe', 'monto', 'valor', 'saldo']);

  if (valueIndex < 0 || (skuIndex < 0 && nameIndex < 0)) {
    throw new Error('Faltan columnas requeridas. Se necesita producto o código y una columna de saldo/valor.');
  }

  const rows: WarehouseLedgerRow[] = [];
  const dataRows = matrix.slice(header.index + 1);
  for (const cells of dataRows) {
    const sku = skuIndex >= 0 ? String(cells[skuIndex] ?? '').trim() : '';
    const name = nameIndex >= 0 ? String(cells[nameIndex] ?? '').trim() : '';
    if (!sku && !name) continue;
    if (normalize(`${sku} ${name}`).startsWith('total')) continue;

    rows.push({
      sku,
      name: name || sku,
      quantity: quantityIndex >= 0 ? parseLedgerNumber(cells[quantityIndex]) : 0,
      valueCLP: parseLedgerNumber(cells[valueIndex]),
      category: classifyWarehouseProduct(sku, name),
    });
  }

  return {
    rows,
    totalRows: dataRows.length,
    discardedRows: dataRows.length - rows.length,
  };
};
