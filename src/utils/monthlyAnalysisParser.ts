import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import type { Product } from '../data/mockProducts';
import { findImplantDefinition } from '../data/implantDefinitions';
import { MONTHLY_BALANCE_SOURCE_NET_INCOME_CONTROL_CODE } from '../types/monthlyAnalysis';
import type {
  MonthlyBalanceLine,
  MonthlyBalanceSection,
  MonthlyInventoryFamily,
  MonthlyInventoryMovement,
  MonthlyParseResult,
  MonthlyPnlLine,
  MonthlyPnlSection,
} from '../types/monthlyAnalysis';

type TabularRow = Record<string, unknown>;
type SheetMatrixRow = unknown[];

const normalize = (text: string): string => text
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim();

const normalizeLoose = (text: string): string => normalize(text)
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const numberRegex = /^-?\d+(?:[.,]\d+)?$/;

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

const formatCLP = (value: number): string => new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
}).format(value);

const isNumericLike = (value: unknown): boolean => {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string') return false;
  const clean = value.trim().replace(/[^\d.,-]/g, '');
  return numberRegex.test(clean.replace(/\./g, '').replace(',', '.'))
    || numberRegex.test(clean.replace(/,/g, ''));
};

const formatPeriodKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  return `${year}-${month}`;
};

const monthMap: Record<string, number> = {
  ene: 1,
  enero: 1,
  jan: 1,
  january: 1,
  feb: 2,
  febrero: 2,
  february: 2,
  mar: 3,
  marzo: 3,
  march: 3,
  abr: 4,
  abril: 4,
  apr: 4,
  april: 4,
  may: 5,
  mayo: 5,
  jun: 6,
  junio: 6,
  june: 6,
  jul: 7,
  julio: 7,
  july: 7,
  ago: 8,
  agosto: 8,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  septiembre: 9,
  september: 9,
  oct: 10,
  octubre: 10,
  october: 10,
  nov: 11,
  noviembre: 11,
  november: 11,
  dic: 12,
  diciembre: 12,
  dec: 12,
  december: 12,
};

const valueToPeriodKey = (value: unknown): string | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatPeriodKey(value);
  }

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return formatPeriodKey(new Date(parsed.y, parsed.m - 1, parsed.d));
  }

  if (typeof value !== 'string') return null;
  const raw = normalize(value);
  if (!raw) return null;

  const isoMatch = raw.match(/(20\d{2})[-/](\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}`;
  }

  const monthYearMatch = raw.match(/(\d{1,2})[-/](20\d{2})/);
  if (monthYearMatch) {
    return `${monthYearMatch[2]}-${monthYearMatch[1].padStart(2, '0')}`;
  }

  const namedMonthMatch = raw.match(/([a-z]+)\s+(20\d{2})/);
  if (namedMonthMatch) {
    const month = monthMap[namedMonthMatch[1]];
    if (month) return `${namedMonthMatch[2]}-${String(month).padStart(2, '0')}`;
  }

  const asDate = new Date(value);
  if (!Number.isNaN(asDate.getTime())) {
    return formatPeriodKey(asDate);
  }

  return null;
};

const resolveColumnValue = (row: TabularRow, aliases: string[]): unknown => {
  const normalizedAliases = aliases.map(normalize);
  let bestMatch: { value: unknown; score: number } | null = null;

  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = normalize(key);

    for (const alias of normalizedAliases) {
      let score = 0;

      if (normalizedKey === alias) {
        score = 1000 + alias.length;
      } else if (normalizedKey.includes(alias)) {
        score = alias.length;
      }

      if (!score) continue;
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { value, score };
      }
    }
  }

  return bestMatch?.value;
};

const resolveTextFallbacks = (row: TabularRow): string[] => (
  Object.values(row)
    .map((value) => String(value ?? '').trim())
    .filter((value) => value.length > 0 && !isNumericLike(value))
);

const collectHeaderHints = (rows: TabularRow[], maxRows = 3): string[] => {
  const headers = new Set<string>();

  for (const row of rows.slice(0, maxRows)) {
    for (const key of Object.keys(row)) {
      const normalizedKey = normalizeLoose(key);
      if (normalizedKey) headers.add(normalizedKey);
    }
  }

  return Array.from(headers);
};

const headersMatchAliases = (headers: string[], aliases: string[]): boolean => {
  const normalizedAliases = aliases.map(normalizeLoose);
  return headers.some((header) => normalizedAliases.some((alias) => header === alias || header.includes(alias)));
};

const detectInventoryFileShape = (rows: TabularRow[]): {
  headers: string[];
  looksLikeSalesReport: boolean;
  looksLikeInventoryReport: boolean;
} => {
  const headers = collectHeaderHints(rows);

  const looksLikeSalesReport = [
    ['nombre doc', 'tipo documento', 'documento'],
    ['numero del documento', 'n documento', 'factura'],
    ['nombre del vendedor', 'vendedor', 'sales rep'],
    ['codigo del cliente', 'cliente'],
    ['cod producto', 'sku', 'codigo producto'],
    ['precio unitario', 'precio'],
    ['total detalle', 'monto neto', 'total'],
    ['costo vigente', 'costo'],
  ].filter((aliases) => headersMatchAliases(headers, aliases)).length >= 4;

  const inventorySignalMatches = [
    ['sku', 'codigo', 'cod producto'],
    ['stock inicial', 'saldo inicial', 'opening'],
    ['entradas', 'ingresos', 'entry'],
    ['salidas', 'egresos', 'exit'],
    ['ajustes', 'adjustment', 'regularizaciones'],
    ['stock final', 'saldo final', 'closing'],
    ['tipo movimiento', 'movement type'],
  ].filter((aliases) => headersMatchAliases(headers, aliases)).length;

  const looksLikeInventoryReport = inventorySignalMatches >= 2;

  return {
    headers,
    looksLikeSalesReport,
    looksLikeInventoryReport,
  };
};

const resolveAmountValue = (
  row: TabularRow,
  aliases: string[],
  allowFallback = true,
): { value: number; found: boolean } => {
  const direct = resolveColumnValue(row, aliases);
  if (direct !== undefined) {
    return { value: parseNumber(direct), found: true };
  }

  if (!allowFallback) {
    return { value: 0, found: false };
  }

  const values = Object.values(row);
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (isNumericLike(values[index])) {
      return { value: parseNumber(values[index]), found: true };
    }
  }

  return { value: 0, found: false };
};

const readSheetRows = async (file: File): Promise<TabularRow[]> => {
  const extension = file.name.split('.').pop()?.toLowerCase();

  if (extension === 'csv') {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results: Papa.ParseResult<TabularRow>) => resolve(results.data),
        error: (error: Error) => reject(error),
      });
    });
  }

  if (extension === 'xlsx' || extension === 'xls') {
    const content = new Uint8Array(await file.arrayBuffer());
    const workbook = XLSX.read(content, { type: 'array' });
    const firstSheet = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheet];
    return XLSX.utils.sheet_to_json(worksheet, { defval: '' }) as TabularRow[];
  }

  throw new Error('Formato no soportado. Usa .xlsx, .xls o .csv');
};

const readSheetMatrix = async (file: File): Promise<SheetMatrixRow[]> => {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension !== 'xlsx' && extension !== 'xls') {
    throw new Error('Formato no soportado. Usa .xlsx o .xls');
  }

  const content = new Uint8Array(await file.arrayBuffer());
  const workbook = XLSX.read(content, { type: 'array', cellDates: true });
  const firstSheet = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheet];
  return XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as SheetMatrixRow[];
};

const collectDetectedPeriodKeys = (rows: TabularRow[]): string[] => {
  const periodKeys = new Set<string>();
  const periodAliases = ['periodo', 'period', 'mes', 'fecha', 'date', 'fecha documento', 'fecha contabilizacion'];

  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      const normalizedKey = normalize(key);
      if (!periodAliases.some((alias) => normalizedKey === alias || normalizedKey.includes(alias))) continue;
      const periodKey = valueToPeriodKey(value);
      if (periodKey) periodKeys.add(periodKey);
    }
  }

  return Array.from(periodKeys).sort();
};

const evaluateDetectedPeriods = (
  selectedPeriodKey: string,
  detectedPeriodKeys: string[],
  errors: string[],
  warnings: string[],
): void => {
  if (!detectedPeriodKeys.length) return;
  const allMatch = detectedPeriodKeys.every((periodKey) => periodKey === selectedPeriodKey);
  const anyMatch = detectedPeriodKeys.some((periodKey) => periodKey === selectedPeriodKey);

  if (allMatch) return;

  if (!anyMatch) {
    errors.push(`El archivo parece pertenecer a ${detectedPeriodKeys.join(', ')} y no al periodo ${selectedPeriodKey}.`);
    return;
  }

  warnings.push(`Se detectaron periodos mixtos en el archivo: ${detectedPeriodKeys.join(', ')}.`);
};

const extractPeriodKeysFromText = (value: string): string[] => {
  const keys = new Set<string>();
  const dateMatches = value.matchAll(/(\d{2})\/(\d{2})\/(20\d{2})/g);

  for (const match of dateMatches) {
    const [, day, month, year] = match;
    if (!day || !month || !year) continue;
    keys.add(`${year}-${month}`);
  }

  const isoMatches = value.matchAll(/(20\d{2})[-/](\d{1,2})/g);
  for (const match of isoMatches) {
    const [, year, month] = match;
    if (!year || !month) continue;
    keys.add(`${year}-${month.padStart(2, '0')}`);
  }

  return Array.from(keys);
};

const collectDetectedPeriodKeysFromMatrix = (rows: SheetMatrixRow[]): string[] => {
  const detected = new Set<string>();

  for (const row of rows.slice(0, 12)) {
    for (const cell of row) {
      if (typeof cell !== 'string') continue;
      const normalizedCell = normalize(cell);
      if (!normalizedCell.includes('period')) continue;
      for (const periodKey of extractPeriodKeysFromText(cell)) {
        detected.add(periodKey);
      }
    }
  }

  return Array.from(detected).sort();
};

const normalizeMatrixCell = (value: unknown): string => normalize(String(value ?? ''));

const findBalanceWorksheetHeaderIndex = (rows: SheetMatrixRow[]): number => rows.findIndex((row) => {
  const normalizedRow = row.map((cell) => normalizeMatrixCell(cell));
  if (!normalizedRow.length) return false;

  return normalizedRow[0] === 'cuenta'
    && normalizedRow.some((cell) => cell.includes('activo'))
    && normalizedRow.some((cell) => cell.includes('pasivo'));
});

const inferBalanceSectionFromAccountCode = (accountCode: string): MonthlyBalanceSection => {
  if (accountCode.startsWith('1.1.')) return 'ACTIVO_CORRIENTE';
  if (accountCode.startsWith('1.2.') || accountCode.startsWith('1.3.') || accountCode.startsWith('1.4.')) {
    return 'ACTIVO_NO_CORRIENTE';
  }
  if (accountCode.startsWith('2.1.')) return 'PASIVO_CORRIENTE';
  if (accountCode.startsWith('2.2.') || accountCode.startsWith('2.3.')) return 'PASIVO_NO_CORRIENTE';
  if (accountCode.startsWith('2.4.')) return 'PATRIMONIO';
  return 'OTROS';
};

const getBalanceSectionLabel = (section: MonthlyBalanceSection): string => {
  if (section === 'ACTIVO_CORRIENTE') return 'Activo Corriente';
  if (section === 'ACTIVO_NO_CORRIENTE') return 'Activo No Corriente';
  if (section === 'PASIVO_CORRIENTE') return 'Pasivo Corriente';
  if (section === 'PASIVO_NO_CORRIENTE') return 'Pasivo No Corriente';
  if (section === 'PATRIMONIO') return 'Patrimonio';
  return 'Otros';
};

const isBalanceWorksheetAccountCode = (value: string): boolean => /^\d+(?:\.\d+)+$/.test(value.trim());

const isSubtotalName = (value: string): boolean => {
  const normalized = normalize(value);
  return normalized.includes('total')
    || normalized.includes('subtotal')
    || normalized.startsWith('resultado ')
    || normalized.startsWith('utilidad ')
    || normalized.startsWith('margen ')
    || normalized.includes('ebitda');
};

const inferBalanceSection = (sourceSection: string, accountName: string): MonthlyBalanceSection => {
  const raw = normalize(`${sourceSection} ${accountName}`);

  if (raw.includes('activo corriente') || raw.includes('activos corrientes') || raw.includes('circulante')) {
    return 'ACTIVO_CORRIENTE';
  }
  if (raw.includes('activo no corriente') || raw.includes('activos no corrientes') || raw.includes('largo plazo') || raw.includes('fijo')) {
    return 'ACTIVO_NO_CORRIENTE';
  }
  if (raw.includes('pasivo corriente') || raw.includes('pasivos corrientes') || raw.includes('corto plazo')) {
    return 'PASIVO_CORRIENTE';
  }
  if (raw.includes('pasivo no corriente') || raw.includes('pasivos no corrientes')) {
    return 'PASIVO_NO_CORRIENTE';
  }
  if (raw.includes('patrimonio') || raw.includes('capital') || raw.includes('retenid')) {
    return 'PATRIMONIO';
  }
  if (
    raw.includes('caja')
    || raw.includes('banco')
    || raw.includes('efectivo')
    || raw.includes('cliente')
    || raw.includes('deudor')
    || raw.includes('inventario')
    || raw.includes('existencia')
    || raw.includes('stock')
  ) {
    return 'ACTIVO_CORRIENTE';
  }
  if (raw.includes('proveedor') || raw.includes('acreedor') || raw.includes('por pagar')) {
    return 'PASIVO_CORRIENTE';
  }

  return 'OTROS';
};

const inferPnlSection = (sourceSection: string, accountName: string): MonthlyPnlSection => {
  const raw = normalize(`${sourceSection} ${accountName}`);

  if (raw.includes('costo de venta') || raw.includes('costo ventas') || raw.includes('cost of sales')) {
    return 'COSTO_VENTAS';
  }
  if (
    raw.includes('gasto')
    || raw.includes('administracion')
    || raw.includes('administración')
    || raw.includes('marketing')
    || raw.includes('remuner')
    || raw.includes('venta y distribucion')
  ) {
    return 'GASTOS_OPERACIONALES';
  }
  if (
    raw.includes('resultado')
    || raw.includes('utilidad')
    || raw.includes('ebitda')
    || raw.includes('margen bruto')
  ) {
    return 'RESULTADOS';
  }
  if (raw.includes('financiero') || raw.includes('impuesto') || raw.includes('otros ingresos') || raw.includes('otros egresos')) {
    return 'OTROS_INGRESOS_EGRESOS';
  }
  if (raw.includes('venta') || raw.includes('ingreso operacional') || raw.includes('revenue') || raw.includes('ingresos')) {
    return 'INGRESOS';
  }

  return 'OTROS';
};

const inferInventoryFamily = (productName: string, category: string): MonthlyInventoryFamily => {
  const implantDefinition = findImplantDefinition(productName);
  const normalizedName = normalize(productName);
  const normalizedCategory = normalize(category);

  if (normalizedCategory.includes('despacho') || normalizedName.includes('despacho')) {
    return 'DESPACHO';
  }

  if (
    normalizedCategory.includes('implante')
    || implantDefinition
  ) {
    return 'IMPLANTES';
  }

  if (normalizedCategory.includes('kit') || normalizedName.includes('kit')) {
    return 'KITS';
  }

  if (
    normalizedCategory.includes('motor')
    || normalizedName.includes('coxo')
    || normalizedName.includes('coxxo')
    || normalizedName.includes('motor')
  ) {
    return 'MOTOR';
  }

  return 'ADITAMENTOS';
};

const isPnlAccountCode = (value: string): boolean => /^\d+(?:\.\d+)+$/.test(value.trim());

const findPnlHeaderRowIndex = (rows: SheetMatrixRow[]): number => rows.findIndex((row) => {
  const normalizedCells = row.map((cell) => normalize(String(cell ?? '')));
  const hasCuenta = normalizedCells.some((cell) => cell === 'cuenta');
  const hasDescription = normalizedCells.some((cell) => cell.startsWith('descrip'));
  const hasTargetYear = normalizedCells.some((cell) => cell.includes('2026'));
  return hasCuenta && hasDescription && hasTargetYear;
});

const resolvePnlColumnIndexes = (headerRow: SheetMatrixRow): {
  codeIndex: number;
  nameIndex: number;
  amountIndex: number;
} => {
  const normalizedCells = headerRow.map((cell) => normalize(String(cell ?? '')));
  const codeIndex = normalizedCells.findIndex((cell) => cell === 'cuenta');
  const nameIndex = normalizedCells.findIndex((cell) => cell.startsWith('descrip'));
  const amountIndex = normalizedCells.findIndex((cell) => cell.includes('2026'));

  return {
    codeIndex,
    nameIndex,
    amountIndex: amountIndex >= 0 ? amountIndex : 3,
  };
};

export const parsePnlWorksheetRows = (
  rows: SheetMatrixRow[],
  selectedPeriodKey: string,
  fileName = '',
): MonthlyParseResult<MonthlyPnlLine> => {
  const warnings: string[] = [];
  const errors: string[] = [];
  const detectedPeriodKeys = collectDetectedPeriodKeysFromMatrix(rows);
  const parsedRows: MonthlyPnlLine[] = [];

  if (!rows.length) {
    errors.push('El archivo de estado de resultados está vacío.');
  }

  const headerRowIndex = findPnlHeaderRowIndex(rows);
  if (headerRowIndex === -1) {
    errors.push('No se encontró la cabecera esperada del estado de resultados personalizado.');
    return {
      fileName,
      rows: parsedRows,
      warnings,
      errors,
      totalRows: rows.length,
      validRows: parsedRows.length,
      detectedPeriodKeys,
    };
  }

  evaluateDetectedPeriods(selectedPeriodKey, detectedPeriodKeys, errors, warnings);

  const { codeIndex, nameIndex, amountIndex } = resolvePnlColumnIndexes(rows[headerRowIndex] ?? []);
  if (codeIndex === -1 || nameIndex === -1 || amountIndex === -1) {
    errors.push('No se pudieron resolver las columnas Cuenta, Descripción y Año 2026 del ER.');
    return {
      fileName,
      rows: parsedRows,
      warnings,
      errors,
      totalRows: rows.length,
      validRows: parsedRows.length,
      detectedPeriodKeys,
    };
  }

  let currentSectionLabel = '';

  for (let index = headerRowIndex + 1; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const codeCell = String(row[codeIndex] ?? '').trim();
    const nameCell = String(row[nameIndex] ?? '').trim();
    const amountCell = row[amountIndex];
    const hasAmount = amountCell !== '' && amountCell !== null && amountCell !== undefined;

    if (!codeCell && !nameCell && !hasAmount) continue;

    if (codeCell && !nameCell && !hasAmount && !isPnlAccountCode(codeCell)) {
      currentSectionLabel = codeCell;
      continue;
    }

    if (isPnlAccountCode(codeCell)) {
      if (!nameCell) continue;

      parsedRows.push({
        lineOrder: index + 1,
        accountCode: codeCell,
        accountName: nameCell,
        section: inferPnlSection(currentSectionLabel, nameCell),
        subsection: currentSectionLabel,
        amountCLP: parseNumber(amountCell),
        sourcePeriodKey: detectedPeriodKeys[0] ?? selectedPeriodKey,
        isSubtotal: false,
      });
      continue;
    }

    if (!codeCell && nameCell && hasAmount) {
      parsedRows.push({
        lineOrder: index + 1,
        accountCode: '',
        accountName: nameCell,
        section: inferPnlSection(currentSectionLabel || nameCell, nameCell),
        subsection: currentSectionLabel,
        amountCLP: parseNumber(amountCell),
        sourcePeriodKey: detectedPeriodKeys[0] ?? selectedPeriodKey,
        isSubtotal: true,
      });
    }
  }

  if (!parsedRows.length) {
    errors.push('No se detectaron líneas válidas en el estado de resultados personalizado.');
  }

  return {
    fileName,
    rows: parsedRows,
    warnings,
    errors,
    totalRows: rows.length,
    validRows: parsedRows.length,
    detectedPeriodKeys,
  };
};

interface CatalogEntry {
  family: MonthlyInventoryFamily;
  name: string;
  category: string;
  normalizedName: string;
}

interface CatalogLookup {
  exactNameIndex: Map<string, CatalogEntry>;
  entries: CatalogEntry[];
}

const buildCatalogLookup = (products: Product[]): CatalogLookup => {
  const exactNameIndex = new Map<string, CatalogEntry>();
  const entries: CatalogEntry[] = [];

  for (const product of products) {
    const normalizedName = normalizeLoose(product.name);
    if (!normalizedName) continue;

    const entry: CatalogEntry = {
      family: inferInventoryFamily(product.name, product.category),
      name: product.name,
      category: product.category,
      normalizedName,
    };

    if (!exactNameIndex.has(normalizedName)) {
      exactNameIndex.set(normalizedName, entry);
    }

    entries.push(entry);
  }

  entries.sort((left, right) => right.normalizedName.length - left.normalizedName.length);

  return {
    exactNameIndex,
    entries,
  };
};

const resolveCatalogMatch = (
  productName: string,
  catalogLookup: CatalogLookup,
): CatalogEntry | null => {
  const normalizedProductName = normalizeLoose(productName);
  if (!normalizedProductName) return null;

  const exactMatch = catalogLookup.exactNameIndex.get(normalizedProductName);
  if (exactMatch) return exactMatch;

  return catalogLookup.entries.find((entry) => (
    normalizedProductName.includes(entry.normalizedName)
    || entry.normalizedName.includes(normalizedProductName)
  )) ?? null;
};

const sortInventoryByFamily = (family: MonthlyInventoryFamily): number => {
  return {
    IMPLANTES: 0,
    KITS: 1,
    MOTOR: 2,
    ADITAMENTOS: 3,
    DESPACHO: 4,
    SIN_CLASIFICAR: 5,
  }[family];
};

export const parseBalanceRows = (
  rows: TabularRow[],
  selectedPeriodKey: string,
  fileName = '',
): MonthlyParseResult<MonthlyBalanceLine> => {
  const warnings: string[] = [];
  const errors: string[] = [];
  const detectedPeriodKeys = collectDetectedPeriodKeys(rows);
  const parsedRows: MonthlyBalanceLine[] = [];

  if (!rows.length) {
    errors.push('El archivo de balance está vacío.');
  }

  evaluateDetectedPeriods(selectedPeriodKey, detectedPeriodKeys, errors, warnings);

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const fallbackTexts = resolveTextFallbacks(row);
    const code = String(resolveColumnValue(row, ['codigo cuenta', 'cuenta codigo', 'account code', 'codigo', 'cod']) ?? fallbackTexts[0] ?? '').trim();
    const accountName = String(resolveColumnValue(row, ['nombre cuenta', 'descripcion', 'account name', 'cuenta nombre', 'gl name', 'detalle', 'concepto']) ?? fallbackTexts[1] ?? fallbackTexts[0] ?? '').trim();
    const subsection = String(resolveColumnValue(row, ['subgrupo', 'sub group', 'categoria', 'subcategoria', 'nivel 2']) ?? '').trim();
    const sourceSection = String(resolveColumnValue(row, ['seccion', 'section', 'tipo', 'rubro', 'clasificacion', 'grupo']) ?? '').trim();
    const amount = resolveAmountValue(row, ['saldo final', 'saldo', 'amount', 'monto', 'total', 'final balance', 'balance']);

    if (!accountName || !amount.found) continue;

    parsedRows.push({
      lineOrder: index + 1,
      accountCode: code,
      accountName,
      section: inferBalanceSection(sourceSection, accountName),
      subsection,
      amountCLP: amount.value,
      sourcePeriodKey: valueToPeriodKey(resolveColumnValue(row, ['periodo', 'period', 'mes', 'fecha'])) ?? selectedPeriodKey,
      isSubtotal: isSubtotalName(accountName),
    });
  }

  if (!parsedRows.length) {
    errors.push('No se detectaron líneas válidas en el balance.');
  }

  return {
    fileName,
    rows: parsedRows,
    warnings,
    errors,
    totalRows: rows.length,
    validRows: parsedRows.length,
    detectedPeriodKeys,
  };
};

export const parseBalanceWorksheetRows = (
  rows: SheetMatrixRow[],
  selectedPeriodKey: string,
  fileName = '',
): MonthlyParseResult<MonthlyBalanceLine> => {
  const warnings: string[] = [];
  const errors: string[] = [];
  const detectedPeriodKeys = collectDetectedPeriodKeysFromMatrix(rows);
  const parsedRows: MonthlyBalanceLine[] = [];

  if (!rows.length) {
    errors.push('El archivo de balance está vacío.');
  }

  evaluateDetectedPeriods(selectedPeriodKey, detectedPeriodKeys, errors, warnings);

  const headerIndex = findBalanceWorksheetHeaderIndex(rows);
  if (headerIndex === -1) {
    errors.push('No se encontró la cabecera esperada del balance exportado.');
    return {
      fileName,
      rows: [],
      warnings,
      errors,
      totalRows: rows.length,
      validRows: 0,
      detectedPeriodKeys,
    };
  }

  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    const rawCode = String(row[0] ?? '').trim();
    const rawName = String(row[1] ?? '').trim();
    const normalizedCode = normalize(rawCode);

    if (!rawCode && !rawName) continue;

    if (normalizedCode === 'resultado') {
      parsedRows.push({
        lineOrder: index + 1,
        accountCode: MONTHLY_BALANCE_SOURCE_NET_INCOME_CONTROL_CODE,
        accountName: 'Resultado',
        section: 'OTROS',
        subsection: 'Control Balance',
        amountCLP: parseNumber(row[8]) - parseNumber(row[9]),
        sourcePeriodKey: selectedPeriodKey,
        isSubtotal: true,
      });
      continue;
    }

    if (normalizedCode === 'total' || normalizedCode === 'sumas parciales' || normalizedCode === 'suma total') {
      continue;
    }

    if (!isBalanceWorksheetAccountCode(rawCode)) continue;
    if (!rawCode.startsWith('1.') && !rawCode.startsWith('2.')) continue;

    const section = inferBalanceSectionFromAccountCode(rawCode);
    const amountCLP = rawCode.startsWith('1.')
      ? parseNumber(row[6]) - parseNumber(row[7])
      : parseNumber(row[7]) - parseNumber(row[6]);

    parsedRows.push({
      lineOrder: index + 1,
      accountCode: rawCode,
      accountName: rawName,
      section,
      subsection: getBalanceSectionLabel(section),
      amountCLP,
      sourcePeriodKey: selectedPeriodKey,
      isSubtotal: false,
    });
  }

  if (!parsedRows.filter((row) => row.accountCode !== MONTHLY_BALANCE_SOURCE_NET_INCOME_CONTROL_CODE).length) {
    errors.push('No se detectaron líneas válidas en el balance exportado.');
  }

  return {
    fileName,
    rows: parsedRows,
    warnings,
    errors,
    totalRows: rows.length,
    validRows: parsedRows.length,
    detectedPeriodKeys,
  };
};

export const parsePnlRows = (
  rows: TabularRow[],
  selectedPeriodKey: string,
  fileName = '',
): MonthlyParseResult<MonthlyPnlLine> => {
  const warnings: string[] = [];
  const errors: string[] = [];
  const detectedPeriodKeys = collectDetectedPeriodKeys(rows);
  const parsedRows: MonthlyPnlLine[] = [];

  if (!rows.length) {
    errors.push('El archivo de estado de resultados está vacío.');
  }

  evaluateDetectedPeriods(selectedPeriodKey, detectedPeriodKeys, errors, warnings);

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const fallbackTexts = resolveTextFallbacks(row);
    const code = String(resolveColumnValue(row, ['codigo cuenta', 'cuenta codigo', 'account code', 'codigo', 'cod']) ?? fallbackTexts[0] ?? '').trim();
    const accountName = String(resolveColumnValue(row, ['nombre cuenta', 'descripcion', 'account name', 'cuenta nombre', 'gl name', 'detalle', 'concepto']) ?? fallbackTexts[1] ?? fallbackTexts[0] ?? '').trim();
    const subsection = String(resolveColumnValue(row, ['subgrupo', 'sub group', 'categoria', 'subcategoria', 'nivel 2']) ?? '').trim();
    const sourceSection = String(resolveColumnValue(row, ['seccion', 'section', 'tipo', 'rubro', 'clasificacion', 'grupo']) ?? '').trim();
    const amount = resolveAmountValue(row, ['saldo final', 'saldo', 'amount', 'monto', 'total', 'resultado', 'valor']);

    if (!accountName || !amount.found) continue;

    parsedRows.push({
      lineOrder: index + 1,
      accountCode: code,
      accountName,
      section: inferPnlSection(sourceSection, accountName),
      subsection,
      amountCLP: amount.value,
      sourcePeriodKey: valueToPeriodKey(resolveColumnValue(row, ['periodo', 'period', 'mes', 'fecha'])) ?? selectedPeriodKey,
      isSubtotal: isSubtotalName(accountName),
    });
  }

  if (!parsedRows.length) {
    errors.push('No se detectaron líneas válidas en el estado de resultados.');
  }

  return {
    fileName,
    rows: parsedRows,
    warnings,
    errors,
    totalRows: rows.length,
    validRows: parsedRows.length,
    detectedPeriodKeys,
  };
};

const resolveMovementKind = (movementType: string): 'entry' | 'exit' | 'adjustment' | 'unknown' => {
  const normalized = normalize(movementType);
  if (normalized.includes('entrada') || normalized.includes('ingreso') || normalized.includes('compra')) return 'entry';
  if (normalized.includes('salida') || normalized.includes('egreso') || normalized.includes('venta') || normalized.includes('consumo')) return 'exit';
  if (normalized.includes('ajuste') || normalized.includes('merma') || normalized.includes('regularizacion')) return 'adjustment';
  return 'unknown';
};

const sortInventoryRows = (rows: MonthlyInventoryMovement[]): MonthlyInventoryMovement[] => rows.sort((left, right) => {
  const familyDiff = sortInventoryByFamily(left.family) - sortInventoryByFamily(right.family);
  if (familyDiff !== 0) return familyDiff;
  return left.sku.localeCompare(right.sku, 'es');
});

const parseSalesRowsAsInventory = (
  rows: TabularRow[],
  selectedPeriodKey: string,
  catalogLookup: CatalogLookup,
  warnings: string[],
): MonthlyInventoryMovement[] => {
  const aggregated = new Map<string, MonthlyInventoryMovement>();
  let dispatchRowCount = 0;
  let dispatchAmountCLP = 0;

  warnings.push('Se detectó el mismo formato comercial usado en Análisis Diario; se usarán las cantidades vendidas como salidas. Este reporte no incluye stock inicial ni stock final.');

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const rawSku = String(resolveColumnValue(row, ['sku', 'cod. producto', 'cod producto', 'codigo producto', 'codigo articulo', 'item code']) ?? '').trim();
    const description = String(resolveColumnValue(row, ['desc. producto', 'desc producto', 'descripcion producto', 'producto', 'item description', 'product description', 'nombre producto']) ?? '').trim();
    const quantity = resolveAmountValue(row, ['cantidad', 'qty', 'quantity', 'unidades'], false);
    const totalAmount = resolveAmountValue(row, ['total detalle', 'monto neto', 'monto', 'amount', 'valor', 'total'], false);

    if (!rawSku && !description && !quantity.found && !totalAmount.found) continue;

    const normalizedSku = normalize(rawSku);
    const normalizedDescription = normalize(description);
    const isDispatch = normalizedSku === 'despacho'
      || normalizedDescription.includes('servicio despacho')
      || normalizedDescription.includes('despacho');

    if (isDispatch) {
      dispatchRowCount += 1;
      dispatchAmountCLP += totalAmount.found ? totalAmount.value : 0;
    }

    if (!quantity.found || quantity.value === 0) continue;

    const sku = rawSku ? rawSku.toUpperCase() : `SIN-SKU-${index + 1}`;
    const catalogMatch = resolveCatalogMatch(description, catalogLookup);
    const rawProductName = description || catalogMatch?.name || sku;
    const implantDefinition = findImplantDefinition(rawProductName);
    const productName = implantDefinition?.name ?? rawProductName;
    const category = catalogMatch?.category || '';
    const family = isDispatch ? 'DESPACHO' : inferInventoryFamily(productName, category);

    if (!rawSku) {
      warnings.push(`Se encontró una fila sin SKU explícito; se usó el identificador ${sku}.`);
    }

    const current = aggregated.get(sku);
    const isUnclassified = !catalogMatch && family !== 'DESPACHO';
    if (current) {
      aggregated.set(sku, {
        ...current,
        exitsQty: current.exitsQty + quantity.value,
        totalAmountCLP: (current.totalAmountCLP ?? 0) + (totalAmount.found ? totalAmount.value : 0),
        isUnclassified: current.isUnclassified || isUnclassified,
      });
      continue;
    }

    aggregated.set(sku, {
      sku,
      productName,
      family,
      openingQty: 0,
      entriesQty: 0,
      exitsQty: quantity.value,
      adjustmentsQty: 0,
      closingQty: 0,
      totalAmountCLP: totalAmount.found ? totalAmount.value : undefined,
      sourcePeriodKey: valueToPeriodKey(resolveColumnValue(row, ['periodo', 'period', 'mes', 'fecha', 'date'])) ?? selectedPeriodKey,
      isUnclassified,
    });
  }

  if (dispatchRowCount > 0) {
    warnings.push(`Se detectaron ${dispatchRowCount} líneas de SERVICIO DESPACHO por ${formatCLP(dispatchAmountCLP)}; se mostrarán aparte del resto de productos.`);
  }

  return sortInventoryRows(Array.from(aggregated.values()));
};

export const parseInventoryRows = (
  rows: TabularRow[],
  selectedPeriodKey: string,
  products: Product[],
  fileName = '',
): MonthlyParseResult<MonthlyInventoryMovement> => {
  const warnings: string[] = [];
  const errors: string[] = [];
  const detectedPeriodKeys = collectDetectedPeriodKeys(rows);
  const catalogLookup = buildCatalogLookup(products);
  const aggregated = new Map<string, MonthlyInventoryMovement>();
  const inventoryFileShape = detectInventoryFileShape(rows);

  if (!rows.length) {
    errors.push('El archivo de movimientos de inventario está vacío.');
  }

  if (!products.length) {
    warnings.push('El catálogo de productos está vacío; la clasificación por nombre puede quedar incompleta.');
  }

  evaluateDetectedPeriods(selectedPeriodKey, detectedPeriodKeys, errors, warnings);

  if (inventoryFileShape.looksLikeSalesReport && !inventoryFileShape.looksLikeInventoryReport) {
    const parsedRows = parseSalesRowsAsInventory(rows, selectedPeriodKey, catalogLookup, warnings);
    const unmappedSkus = parsedRows.filter((row) => row.isUnclassified).map((row) => row.sku);

    if (unmappedSkus.length) {
      warnings.push(`SKUs sin clasificación en catálogo: ${unmappedSkus.join(', ')}.`);
    }

    if (!parsedRows.length) {
      errors.push('No se detectaron ventas válidas para convertirlas en salidas mensuales. Revisa que el archivo tenga SKU/Cod. Producto, descripción y cantidad.');
      if (inventoryFileShape.headers.length) {
        warnings.push(`Columnas detectadas: ${inventoryFileShape.headers.slice(0, 6).join(', ')}${inventoryFileShape.headers.length > 6 ? ', ...' : ''}.`);
      }
    }

    return {
      fileName,
      rows: parsedRows,
      warnings,
      errors,
      totalRows: rows.length,
      validRows: parsedRows.length,
      detectedPeriodKeys,
    };
  }

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const fallbackTexts = resolveTextFallbacks(row);
    const rawSku = String(resolveColumnValue(row, ['sku', 'codigo', 'code', 'cod producto', 'cod']) ?? fallbackTexts[0] ?? '').trim();
    const sku = rawSku ? rawSku.toUpperCase() : `SIN-SKU-${index + 1}`;
    const productNameRaw = String(resolveColumnValue(row, ['nombre', 'name', 'producto', 'descripcion', 'item']) ?? '').trim();
    const opening = resolveAmountValue(row, ['stock inicial', 'opening', 'opening qty', 'saldo inicial', 'inicial'], false);
    const entries = resolveAmountValue(row, ['entradas', 'ingresos', 'entry', 'entries', 'compras'], false);
    const exits = resolveAmountValue(row, ['salidas', 'egresos', 'exit', 'exits', 'consumo', 'ventas'], false);
    const adjustments = resolveAmountValue(row, ['ajustes', 'adjustment', 'adjustments', 'regularizaciones'], false);
    const closing = resolveAmountValue(row, ['stock final', 'closing', 'closing qty', 'saldo final', 'final'], false);
    const quantity = resolveAmountValue(row, ['cantidad', 'qty', 'quantity', 'unidades'], false);
    const movementType = String(resolveColumnValue(row, ['tipo movimiento', 'movement type', 'tipo', 'clase movimiento']) ?? '').trim();
    const totalAmount = resolveAmountValue(row, ['monto', 'amount', 'valor', 'importe', 'total'], false);

    const openingQty = opening.found ? opening.value : 0;
    let entriesQty = entries.found ? entries.value : 0;
    let exitsQty = exits.found ? exits.value : 0;
    let adjustmentsQty = adjustments.found ? adjustments.value : 0;
    let closingQty = closing.found ? closing.value : 0;

    if (!entries.found && !exits.found && !adjustments.found && quantity.found && movementType) {
      const movementKind = resolveMovementKind(movementType);
      if (movementKind === 'entry') entriesQty = quantity.value;
      if (movementKind === 'exit') exitsQty = Math.abs(quantity.value);
      if (movementKind === 'adjustment' || movementKind === 'unknown') adjustmentsQty = quantity.value;
    }

    const hasQuantityData = opening.found || entries.found || exits.found || adjustments.found || closing.found || (quantity.found && movementType.length > 0);
    if (!hasQuantityData) continue;

    if (!closing.found) {
      closingQty = openingQty + entriesQty - exitsQty + adjustmentsQty;
    }

    const catalogMatch = resolveCatalogMatch(productNameRaw, catalogLookup);
    const rawProductName = productNameRaw || catalogMatch?.name || sku;
    const implantDefinition = findImplantDefinition(rawProductName);
    const productName = implantDefinition?.name ?? rawProductName;
    const category = catalogMatch?.category || '';
    const family = inferInventoryFamily(productName, category);

    if (!rawSku) {
      warnings.push(`Se encontró una fila sin SKU explícito; se usó el identificador ${sku}.`);
    }

    const current = aggregated.get(sku);
    const isUnclassified = !catalogMatch && family !== 'DESPACHO';
    if (current) {
      aggregated.set(sku, {
        ...current,
        openingQty: current.openingQty + openingQty,
        entriesQty: current.entriesQty + entriesQty,
        exitsQty: current.exitsQty + exitsQty,
        adjustmentsQty: current.adjustmentsQty + adjustmentsQty,
        closingQty: current.closingQty + closingQty,
        totalAmountCLP: (current.totalAmountCLP ?? 0) + (totalAmount.found ? totalAmount.value : 0),
        isUnclassified: current.isUnclassified || isUnclassified,
      });
      continue;
    }

    aggregated.set(sku, {
      sku,
      productName,
      family,
      openingQty,
      entriesQty,
      exitsQty,
      adjustmentsQty,
      closingQty,
      totalAmountCLP: totalAmount.found ? totalAmount.value : undefined,
      sourcePeriodKey: valueToPeriodKey(resolveColumnValue(row, ['periodo', 'period', 'mes', 'fecha'])) ?? selectedPeriodKey,
      isUnclassified,
    });
  }

  const parsedRows = sortInventoryRows(Array.from(aggregated.values()));

  const unmappedSkus = parsedRows.filter((row) => row.isUnclassified).map((row) => row.sku);
  if (unmappedSkus.length) {
    warnings.push(`SKUs sin clasificación en catálogo: ${unmappedSkus.join(', ')}.`);
  }

  if (!parsedRows.length) {
    if (inventoryFileShape.looksLikeSalesReport && !inventoryFileShape.looksLikeInventoryReport) {
      errors.push('El archivo parece ser un reporte comercial o de ventas, no un movimiento de inventario. Para este módulo sube un archivo con columnas como SKU, Stock Inicial, Entradas, Salidas, Ajustes o Stock Final.');
    } else {
      errors.push('No se detectaron movimientos válidos de inventario. Verifica que el archivo tenga columnas como SKU, Stock Inicial, Entradas, Salidas, Ajustes o Stock Final.');
    }

    if (inventoryFileShape.headers.length) {
      warnings.push(`Columnas detectadas: ${inventoryFileShape.headers.slice(0, 6).join(', ')}${inventoryFileShape.headers.length > 6 ? ', ...' : ''}.`);
    }
  }

  return {
    fileName,
    rows: parsedRows,
    warnings,
    errors,
    totalRows: rows.length,
    validRows: parsedRows.length,
    detectedPeriodKeys,
  };
};

export const parseMonthlyBalanceFile = async (file: File, selectedPeriodKey: string): Promise<MonthlyParseResult<MonthlyBalanceLine>> => {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'xlsx' || extension === 'xls') {
    const matrix = await readSheetMatrix(file);
    const specializedResult = parseBalanceWorksheetRows(matrix, selectedPeriodKey, file.name);
    if (!specializedResult.errors.some((error) => error.includes('cabecera esperada'))) {
      return specializedResult;
    }
  }

  const rows = await readSheetRows(file);
  return parseBalanceRows(rows, selectedPeriodKey, file.name);
};

export const parseMonthlyPnlFile = async (file: File, selectedPeriodKey: string): Promise<MonthlyParseResult<MonthlyPnlLine>> => {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'xlsx' || extension === 'xls') {
    const matrix = await readSheetMatrix(file);
    const specializedResult = parsePnlWorksheetRows(matrix, selectedPeriodKey, file.name);
    if (!specializedResult.errors.some((error) => error.includes('cabecera esperada'))) {
      return specializedResult;
    }
  }

  const rows = await readSheetRows(file);
  return parsePnlRows(rows, selectedPeriodKey, file.name);
};

export const parseMonthlyInventoryFile = async (
  file: File,
  selectedPeriodKey: string,
  products: Product[],
): Promise<MonthlyParseResult<MonthlyInventoryMovement>> => {
  const rows = await readSheetRows(file);
  return parseInventoryRows(rows, selectedPeriodKey, products, file.name);
};
