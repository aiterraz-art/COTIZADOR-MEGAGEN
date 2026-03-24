import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import type { CRMParseResult, CRMPeriodRow } from '../types/crm';
import type { WeeklySalesBatch, WeeklySalesRow } from '../types/crmWorkbook';
import { findAliasValue, normalizeCRMRut, parseCRMDateISO, parseCRMNumericValue, WEEKLY_SALES_ALIASES } from './crmWorkbookAliases';

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
    const clientCode = String(findAliasValue(row, ['código del cliente', 'codigo del cliente', 'rut', 'cliente']) ?? '').trim();
    const clientName = String(findAliasValue(row, ['nombre del cliente', 'cliente', 'razon social']) ?? '').trim();
    const salesRep = String(findAliasValue(row, ['nombre del vendedor', 'vendedor', 'sales rep']) ?? '').trim() || '#N/A';
    const saleDate = parseCRMDateISO(findAliasValue(row, ['fecha', 'date'])) || new Date().toISOString().slice(0, 10);

    if (!clientCode) continue;

    const parsed: CRMPeriodRow = {
      documentName: String(findAliasValue(row, ['nombre doc', 'tipo documento', 'documento']) ?? '').trim(),
      documentNumber: String(findAliasValue(row, ['numero del documento', 'nmero del documento', 'n° documento', 'factura']) ?? '').trim(),
      salesRep,
      clientCode,
      clientName: clientName || clientCode,
      saleDate,
      productCode: String(findAliasValue(row, ['cod. producto', 'cod producto', 'sku', 'codigo producto']) ?? '').trim(),
      productDescription: String(findAliasValue(row, ['desc. producto', 'descripcion', 'producto']) ?? '').trim(),
      quantity: parseCRMNumericValue(findAliasValue(row, ['cantidad', 'qty'])),
      unitPrice: parseCRMNumericValue(findAliasValue(row, ['precio unitario', 'precio', 'unit price'])),
      totalDetail: parseCRMNumericValue(findAliasValue(row, ['total detalle', 'monto neto', 'total'])),
      currentCost: parseCRMNumericValue(findAliasValue(row, ['costo vigente', 'costo'])),
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

export const parseWeeklySalesRows = (rows: Record<string, unknown>[]): WeeklySalesBatch => {
  const parsedRows: WeeklySalesRow[] = [];
  const warnings: string[] = [];
  const timestamps: number[] = [];

  rows.forEach((row, index) => {
    const rawRut = String(findAliasValue(row, WEEKLY_SALES_ALIASES.clientRut) ?? '').trim();
    const normalizedRut = normalizeCRMRut(rawRut);
    const rawAmount = findAliasValue(row, WEEKLY_SALES_ALIASES.netAmount);
    const netAmount = parseCRMNumericValue(rawAmount);
    const saleDate = parseCRMDateISO(findAliasValue(row, WEEKLY_SALES_ALIASES.saleDate));
    const clientName = String(findAliasValue(row, WEEKLY_SALES_ALIASES.clientName) ?? '').trim();
    const salesRep = String(findAliasValue(row, WEEKLY_SALES_ALIASES.salesRep) ?? '').trim();

    if (!normalizedRut) {
      warnings.push(`Fila ${index + 2}: RUT no válido o vacío; se descartó.`);
      return;
    }

    if (!saleDate) {
      warnings.push(`Fila ${index + 2}: fecha no válida para ${normalizedRut}; se descartó.`);
      return;
    }

    if (rawAmount === undefined || rawAmount === null || String(rawAmount).trim() === '') {
      warnings.push(`Fila ${index + 2}: monto vacío para ${normalizedRut}; se descartó.`);
      return;
    }

    parsedRows.push({
      saleDate,
      clientRut: normalizedRut,
      clientName,
      salesRep,
      netAmount,
      sourceRowIndex: index + 2,
    });

    const timestamp = new Date(saleDate).getTime();
    if (Number.isFinite(timestamp)) {
      timestamps.push(timestamp);
    }

    if (!clientName) {
      warnings.push(`Fila ${index + 2}: ${normalizedRut} no trae razón social; se usará la del workbook si existe.`);
    }

    if (!salesRep) {
      warnings.push(`Fila ${index + 2}: ${normalizedRut} no trae vendedor; se mantendrá el vigente o se usará #N/A.`);
    }
  });

  const minDate = timestamps.length ? new Date(Math.min(...timestamps)).toISOString().slice(0, 10) : undefined;
  const maxDate = timestamps.length ? new Date(Math.max(...timestamps)).toISOString().slice(0, 10) : undefined;

  return {
    rows: parsedRows,
    totalRows: rows.length,
    validRows: parsedRows.length,
    discardedRows: rows.length - parsedRows.length,
    periodFrom: minDate,
    periodTo: maxDate,
    warnings,
  };
};

export const parseWeeklySalesFile = async (file: File): Promise<WeeklySalesBatch> => {
  const rows = await readRows(file);
  return parseWeeklySalesRows(rows);
};
