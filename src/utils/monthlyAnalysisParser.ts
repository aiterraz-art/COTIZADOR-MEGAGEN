import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import type { Product } from '../data/mockProducts';
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

const normalize = (text: string): string => text
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
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
  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = normalize(key);
    if (normalizedAliases.some((alias) => normalizedKey === alias || normalizedKey.includes(alias))) {
      return value;
    }
  }

  return undefined;
};

const resolveTextFallbacks = (row: TabularRow): string[] => (
  Object.values(row)
    .map((value) => String(value ?? '').trim())
    .filter((value) => value.length > 0 && !isNumericLike(value))
);

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

  if (raw.includes('venta') || raw.includes('ingreso operacional') || raw.includes('revenue') || raw.includes('ingresos')) {
    return 'INGRESOS';
  }
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

  return 'OTROS';
};

const familyFromCategory = (category: string): MonthlyInventoryFamily => {
  const normalized = normalize(category);
  if (normalized.includes('implante')) return 'IMPLANTES';
  if (normalized.includes('aditamento') || normalized.includes('ti-base') || normalized.includes('abutment')) return 'ADITAMENTOS';
  if (normalized.includes('kit')) return 'KITS';
  return 'SIN_CLASIFICAR';
};

const buildCatalogIndex = (products: Product[]): Map<string, { family: MonthlyInventoryFamily; name: string }> => {
  const index = new Map<string, { family: MonthlyInventoryFamily; name: string }>();
  for (const product of products) {
    const sku = String(product.sku || '').trim().toUpperCase();
    if (!sku) continue;
    index.set(sku, {
      family: familyFromCategory(product.category),
      name: product.name,
    });
  }
  return index;
};

const sortInventoryByFamily = (family: MonthlyInventoryFamily): number => {
  return {
    IMPLANTES: 0,
    ADITAMENTOS: 1,
    KITS: 2,
    SIN_CLASIFICAR: 3,
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

export const parseInventoryRows = (
  rows: TabularRow[],
  selectedPeriodKey: string,
  products: Product[],
  fileName = '',
): MonthlyParseResult<MonthlyInventoryMovement> => {
  const warnings: string[] = [];
  const errors: string[] = [];
  const detectedPeriodKeys = collectDetectedPeriodKeys(rows);
  const catalogIndex = buildCatalogIndex(products);
  const aggregated = new Map<string, MonthlyInventoryMovement>();

  if (!rows.length) {
    errors.push('El archivo de movimientos de inventario está vacío.');
  }

  if (!products.length) {
    warnings.push('El catálogo de productos está vacío; la clasificación por SKU puede quedar incompleta.');
  }

  evaluateDetectedPeriods(selectedPeriodKey, detectedPeriodKeys, errors, warnings);

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

    const catalogMatch = catalogIndex.get(sku);
    const family = catalogMatch?.family ?? 'SIN_CLASIFICAR';
    const productName = productNameRaw || catalogMatch?.name || sku;

    if (!rawSku) {
      warnings.push(`Se encontró una fila sin SKU explícito; se usó el identificador ${sku}.`);
    }

    const current = aggregated.get(sku);
    if (current) {
      aggregated.set(sku, {
        ...current,
        openingQty: current.openingQty + openingQty,
        entriesQty: current.entriesQty + entriesQty,
        exitsQty: current.exitsQty + exitsQty,
        adjustmentsQty: current.adjustmentsQty + adjustmentsQty,
        closingQty: current.closingQty + closingQty,
        totalAmountCLP: (current.totalAmountCLP ?? 0) + (totalAmount.found ? totalAmount.value : 0),
        isUnclassified: current.isUnclassified || family === 'SIN_CLASIFICAR',
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
      isUnclassified: family === 'SIN_CLASIFICAR',
    });
  }

  const parsedRows = Array.from(aggregated.values()).sort((left, right) => {
    const familyDiff = sortInventoryByFamily(left.family) - sortInventoryByFamily(right.family);
    if (familyDiff !== 0) return familyDiff;
    return left.sku.localeCompare(right.sku, 'es');
  });

  const unmappedSkus = parsedRows.filter((row) => row.isUnclassified).map((row) => row.sku);
  if (unmappedSkus.length) {
    warnings.push(`SKUs sin clasificación en catálogo: ${unmappedSkus.join(', ')}.`);
  }

  if (!parsedRows.length) {
    errors.push('No se detectaron movimientos válidos de inventario.');
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
  const rows = await readSheetRows(file);
  return parseBalanceRows(rows, selectedPeriodKey, file.name);
};

export const parseMonthlyPnlFile = async (file: File, selectedPeriodKey: string): Promise<MonthlyParseResult<MonthlyPnlLine>> => {
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
