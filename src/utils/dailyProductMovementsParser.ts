import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import type {
  DailyProductMovementDocumentSummary,
  DailyProductMovementRow,
  DailyProductMovementsParseResult,
  ProductMovementClassification,
  ProductMovementDirection,
} from '../types/dailyProductMovements';

const normalize = (text: string): string => text
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const parseNumber = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value == null) return 0;

  const raw = String(value).trim();
  if (!raw) return 0;

  const clean = raw.replace(/[^\d,.-]/g, '');
  if (!clean) return 0;

  const hasComma = clean.includes(',');
  const hasDot = clean.includes('.');
  let normalizedValue = clean;

  if (hasComma && hasDot) {
    normalizedValue = clean.lastIndexOf(',') > clean.lastIndexOf('.')
      ? clean.replace(/\./g, '').replace(',', '.')
      : clean.replace(/,/g, '');
  } else if (hasComma) {
    normalizedValue = clean.replace(',', '.');
  }

  const parsed = Number(normalizedValue);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseDate = (value: unknown): { display: string; iso: string } => {
  if (typeof value === 'number') {
    const dateCode = XLSX.SSF.parse_date_code(value);
    if (dateCode) {
      const date = new Date(Date.UTC(dateCode.y, dateCode.m - 1, dateCode.d));
      return {
        display: `${String(dateCode.d).padStart(2, '0')}/${String(dateCode.m).padStart(2, '0')}/${dateCode.y}`,
        iso: date.toISOString().slice(0, 10),
      };
    }
  }

  const raw = String(value ?? '').trim();
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const [, dd, mm, yyyy] = match;
    const iso = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    return { display: raw, iso };
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return {
      display: parsed.toLocaleDateString('es-CL'),
      iso: parsed.toISOString().slice(0, 10),
    };
  }

  return { display: raw, iso: '' };
};

const classifyMovement = (
  document: string,
  entryQty: number,
  exitQty: number,
): { classification: ProductMovementClassification; direction: ProductMovementDirection } => {
  const normalizedDocument = normalize(document);

  if (normalizedDocument.includes('saldo anterior')) {
    return { classification: 'opening_balance', direction: 'opening' };
  }

  if (normalizedDocument.includes('rebaja stock')) {
    return { classification: 'sale_exit', direction: 'exit' };
  }

  if (normalizedDocument.includes('guia de despacho')) {
    if (entryQty > 0 && exitQty <= 0) return { classification: 'dispatch_transfer', direction: 'entry' };
    if (exitQty > 0) return { classification: 'dispatch_transfer', direction: 'exit' };
    return { classification: 'dispatch_transfer', direction: 'neutral' };
  }

  if (normalizedDocument.includes('parte de entrada nc')) {
    return { classification: 'credit_note_entry', direction: entryQty > 0 ? 'entry' : 'neutral' };
  }

  if (entryQty > 0 && exitQty <= 0) return { classification: 'other', direction: 'entry' };
  if (exitQty > 0 && entryQty <= 0) return { classification: 'other', direction: 'exit' };
  return { classification: 'other', direction: 'neutral' };
};

const refineDispatchGuideClassifications = (rows: DailyProductMovementRow[]): DailyProductMovementRow[] => {
  const guideGroups = new Map<string, { totalEntryQty: number; totalExitQty: number }>();

  for (const row of rows) {
    if (!normalize(row.document).includes('guia de despacho')) continue;
    const key = `${normalize(row.document)}|${row.documentNumber}|${row.sku}`;
    const current = guideGroups.get(key) ?? { totalEntryQty: 0, totalExitQty: 0 };
    current.totalEntryQty += row.entryQty;
    current.totalExitQty += row.exitQty;
    guideGroups.set(key, current);
  }

  return rows.map((row) => {
    if (!normalize(row.document).includes('guia de despacho')) return row;

    const key = `${normalize(row.document)}|${row.documentNumber}|${row.sku}`;
    const group = guideGroups.get(key);
    if (!group) return row;

    const isInternalTransfer = group.totalEntryQty > 0
      && group.totalExitQty > 0
      && Math.abs(group.totalEntryQty - group.totalExitQty) < 0.000001;

    return {
      ...row,
      classification: isInternalTransfer ? 'dispatch_transfer' : 'dispatch_sale',
    };
  });
};

const readCsvMatrix = async (file: File): Promise<string[][]> => {
  const buffer = await file.arrayBuffer();
  const text = new TextDecoder('latin1').decode(buffer);
  const result = Papa.parse<string[]>(text, {
    delimiter: ';',
    skipEmptyLines: true,
  });

  if (result.errors.length) {
    throw new Error(result.errors[0].message);
  }

  return result.data;
};

const readWorkbookMatrix = async (file: File): Promise<string[][]> => {
  const buffer = new Uint8Array(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheet = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheet];
  return XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' }) as string[][];
};

const readMatrix = async (file: File): Promise<string[][]> => {
  const extension = file.name.split('.').pop()?.toLowerCase();

  if (extension === 'csv') return readCsvMatrix(file);
  if (extension === 'xlsx' || extension === 'xls') return readWorkbookMatrix(file);

  throw new Error('Formato no soportado. Usa .csv, .xlsx o .xls');
};

const findHeaderRowIndex = (rows: string[][]): number => rows.findIndex((row) => {
  const normalizedCells = row.map((cell) => normalize(String(cell ?? '')));
  return normalizedCells.includes('codigo')
    && normalizedCells.includes('descripcion')
    && normalizedCells.includes('fecha')
    && normalizedCells.includes('documento');
});

const summarizeDocuments = (rows: DailyProductMovementRow[]): DailyProductMovementDocumentSummary[] => {
  const map = new Map<string, DailyProductMovementDocumentSummary>();

  for (const row of rows) {
    const summaryKey = `${row.document}__${row.classification}`;
    const current = map.get(summaryKey) ?? {
      document: row.document,
      classification: row.classification,
      rows: 0,
      entryRows: 0,
      exitRows: 0,
      openingRows: 0,
      entryQty: 0,
      exitQty: 0,
      entryAmountCLP: 0,
      exitAmountCLP: 0,
    };

    current.rows += 1;
    if (row.direction === 'entry') {
      current.entryRows += 1;
      current.entryQty += row.entryQty;
      current.entryAmountCLP += row.entryAmountCLP;
    } else if (row.direction === 'exit') {
      current.exitRows += 1;
      current.exitQty += row.exitQty;
      current.exitAmountCLP += row.exitAmountCLP;
    } else if (row.direction === 'opening') {
      current.openingRows += 1;
    }

    map.set(summaryKey, current);
  }

  return [...map.values()].sort((a, b) => b.rows - a.rows || a.document.localeCompare(b.document, 'es'));
};

export const parseDailyProductMovementsFile = async (file: File): Promise<DailyProductMovementsParseResult> => {
  const matrix = await readMatrix(file);
  const headerRowIndex = findHeaderRowIndex(matrix);

  if (headerRowIndex < 0) {
    throw new Error('No se encontró la cabecera esperada del archivo de movimientos.');
  }

  const periodRow = matrix[0] ?? [];
  const sourcePeriodLabel = String(periodRow[1] ?? periodRow[0] ?? '').trim();
  const rows: DailyProductMovementRow[] = [];

  for (const sourceRow of matrix.slice(headerRowIndex + 1)) {
    const row = sourceRow.map((cell) => String(cell ?? '').trim());
    if (!row.some(Boolean)) continue;

    const sku = row[0] ?? '';
    const description = row[1] ?? '';
    const { display: date, iso: dateISO } = parseDate(row[2] ?? '');
    const document = row[3] ?? '';
    const documentNumber = row[4] ?? '';
    const warehouse = row[5] ?? '';
    const entryQty = parseNumber(row[6]);
    const exitQty = parseNumber(row[7]);
    const balanceQty = parseNumber(row[8]);
    const unitValueCLP = parseNumber(row[9]);
    const entryAmountCLP = parseNumber(row[10]);
    const exitAmountCLP = parseNumber(row[11]);
    const balanceAmountCLP = parseNumber(row[12]);
    const unitCostCLP = parseNumber(row[13]);

    if (!sku && !description && !document) continue;

    const { classification, direction } = classifyMovement(document, entryQty, exitQty);
    const effectiveQty = direction === 'entry'
      ? entryQty
      : direction === 'exit'
        ? exitQty
        : 0;
    const effectiveAmountCLP = direction === 'entry'
      ? entryAmountCLP
      : direction === 'exit'
        ? exitAmountCLP
        : 0;

    rows.push({
      sku,
      description,
      date,
      dateISO,
      document,
      documentNumber,
      warehouse,
      entryQty,
      exitQty,
      balanceQty,
      unitValueCLP,
      entryAmountCLP,
      exitAmountCLP,
      balanceAmountCLP,
      unitCostCLP,
      direction,
      classification,
      effectiveQty,
      effectiveAmountCLP,
    });
  }

  const refinedRows = refineDispatchGuideClassifications(rows);

  refinedRows.sort((a, b) => {
    if (a.dateISO !== b.dateISO) return a.dateISO.localeCompare(b.dateISO);
    if (a.document !== b.document) return a.document.localeCompare(b.document, 'es');
    if (a.documentNumber !== b.documentNumber) return a.documentNumber.localeCompare(b.documentNumber, 'es');
    return a.sku.localeCompare(b.sku, 'es');
  });

  const documentSummaries = summarizeDocuments(refinedRows);
  const movementRows = refinedRows.filter((row) => row.direction !== 'opening');
  const timestamps = refinedRows
    .map((row) => row.dateISO)
    .filter(Boolean)
    .sort();

  return {
    sourcePeriodLabel,
    rows: refinedRows,
    documentSummaries,
    unknownDocuments: documentSummaries
      .filter((summary) => summary.classification === 'other')
      .map((summary) => summary.document),
    totalRows: rows.length,
    openingRows: rows.filter((row) => row.direction === 'opening').length,
    movementRows: movementRows.length,
    totalEntryQty: movementRows.reduce((acc, row) => acc + row.entryQty, 0),
    totalExitQty: movementRows.reduce((acc, row) => acc + row.exitQty, 0),
    totalEntryAmountCLP: movementRows.reduce((acc, row) => acc + row.entryAmountCLP, 0),
    totalExitAmountCLP: movementRows.reduce((acc, row) => acc + row.exitAmountCLP, 0),
    dateFrom: timestamps[0],
    dateTo: timestamps[timestamps.length - 1],
  };
};
