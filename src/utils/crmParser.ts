import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import type { CRMParseResult, CRMPeriodRow } from '../types/crm';

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
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseDateISO = (value: unknown): string => {
  if (typeof value === 'number') {
    const dateCode = XLSX.SSF.parse_date_code(value);
    if (dateCode) return new Date(dateCode.y, dateCode.m - 1, dateCode.d).toISOString().slice(0, 10);
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
};

const findValue = (row: Record<string, unknown>, aliases: string[]): unknown => {
  const normalizedAliases = aliases.map(normalize);
  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = normalize(key);
    if (normalizedAliases.some((alias) => normalizedKey === alias || normalizedKey.includes(alias))) {
      return value;
    }
  }
  return undefined;
};

const readRows = async (file: File): Promise<Record<string, unknown>[]> => {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'csv') {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results: Papa.ParseResult<Record<string, unknown>>) => resolve(results.data),
        error: (err: Error) => reject(err),
      });
    });
  }

  if (extension === 'xlsx' || extension === 'xls') {
    const data = new Uint8Array(await file.arrayBuffer());
    const workbook = XLSX.read(data, { type: 'array', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' }) as Record<string, unknown>[];
  }

  throw new Error('Formato no soportado. Usa .xlsx, .xls o .csv');
};

export const parseCRMPeriodFile = async (file: File): Promise<CRMParseResult> => {
  const rows = await readRows(file);
  const parsedRows: CRMPeriodRow[] = [];
  const timestamps: number[] = [];

  for (const row of rows) {
    const clientCode = String(findValue(row, ['código del cliente', 'codigo del cliente', 'rut', 'cliente']) ?? '').trim();
    const clientName = String(findValue(row, ['nombre del cliente', 'cliente', 'razon social']) ?? '').trim();
    const salesRep = String(findValue(row, ['nombre del vendedor', 'vendedor', 'sales rep']) ?? '').trim() || '#N/A';
    const saleDate = parseDateISO(findValue(row, ['fecha', 'date']));

    if (!clientCode) continue;

    const parsed: CRMPeriodRow = {
      documentName: String(findValue(row, ['nombre doc', 'tipo documento', 'documento']) ?? '').trim(),
      documentNumber: String(findValue(row, ['numero del documento', 'nmero del documento', 'n° documento', 'factura']) ?? '').trim(),
      salesRep,
      clientCode,
      clientName: clientName || clientCode,
      saleDate,
      productCode: String(findValue(row, ['cod. producto', 'cod producto', 'sku', 'codigo producto']) ?? '').trim(),
      productDescription: String(findValue(row, ['desc. producto', 'descripcion', 'producto']) ?? '').trim(),
      quantity: parseNumber(findValue(row, ['cantidad', 'qty'])),
      unitPrice: parseNumber(findValue(row, ['precio unitario', 'precio', 'unit price'])),
      totalDetail: parseNumber(findValue(row, ['total detalle', 'monto neto', 'total'])),
      currentCost: parseNumber(findValue(row, ['costo vigente', 'costo'])),
    };

    parsedRows.push(parsed);
    const ts = new Date(saleDate).getTime();
    if (Number.isFinite(ts)) timestamps.push(ts);
  }

  const minDate = timestamps.length ? new Date(Math.min(...timestamps)).toISOString().slice(0, 10) : undefined;
  const maxDate = timestamps.length ? new Date(Math.max(...timestamps)).toISOString().slice(0, 10) : undefined;

  return {
    rows: parsedRows,
    totalRows: rows.length,
    validRows: parsedRows.length,
    discardedRows: rows.length - parsedRows.length,
    periodFrom: minDate,
    periodTo: maxDate,
  };
};
