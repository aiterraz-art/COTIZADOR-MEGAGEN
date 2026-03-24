export const MONTH_NAMES_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'] as const;

export const WEEKLY_SALES_ALIASES = {
  saleDate: ['fecha', 'fecha ultima compra', 'ultima compra', 'última compra', 'recent sold date', 'sale date', 'date'],
  clientRut: ['rut', 'codigo cliente', 'código cliente', 'client code', 'codigo del cliente', 'código del cliente'],
  clientName: ['razon social', 'razón social', 'cliente', 'customer name', 'nombre del cliente'],
  salesRep: ['vendedor', 'sales rep', 'nombre vendedor', 'nombre del vendedor'],
  netAmount: ['venta neta', 'venta neta real', 'monto compra', 'monto neto', 'total', 'total detalle'],
} as const;

export const normalizeCRMText = (text: string): string => text
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim();

export const normalizeCRMRut = (value: string): string => {
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) return '';
  const clean = trimmed.replace(/\./g, '').replace(/\s+/g, '');
  const parts = clean.split('-').filter(Boolean);
  if (parts.length === 1) {
    return clean;
  }
  return `${parts[0]}-${parts[1]}`;
};

export const parseCRMNumericValue = (value: unknown): number => {
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
  } else if (hasDot && /^-?\d{1,3}(\.\d{3})+$/.test(clean)) {
    normalized = clean.replace(/\./g, '');
  } else if (hasComma) {
    normalized = clean.replace(',', '.');
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const parseCRMDateISO = (value: unknown): string => {
  if (typeof value === 'number') {
    const base = new Date(Date.UTC(1899, 11, 30));
    base.setUTCDate(base.getUTCDate() + Math.trunc(value));
    return base.toISOString().slice(0, 10);
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }

    const match = value.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (match) {
      const [, day, month, year] = match;
      const numericYear = year.length === 2 ? Number(`20${year}`) : Number(year);
      const isoDate = new Date(Date.UTC(numericYear, Number(month) - 1, Number(day)));
      if (!Number.isNaN(isoDate.getTime())) {
        return isoDate.toISOString().slice(0, 10);
      }
    }
  }
  return '';
};

export const findAliasValue = (row: Record<string, unknown>, aliases: readonly string[]): unknown => {
  const normalizedAliases = aliases.map(normalizeCRMText);
  for (const alias of normalizedAliases) {
    const exactMatch = Object.entries(row).find(([key]) => normalizeCRMText(key) === alias);
    if (exactMatch) {
      return exactMatch[1];
    }
  }

  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = normalizeCRMText(key);
    if (normalizedAliases.some((alias) => normalizedKey === alias || normalizedKey.includes(alias))) {
      return value;
    }
  }
  return undefined;
};

export const quoteSheetName = (sheetName: string): string => `'${sheetName.replace(/'/g, "''")}'`;

export const formatMonthSheetName = (month: number): string => `26년 ${month}월`;

export const getCRMMonthColumn = (month: number): string => String.fromCharCode('J'.charCodeAt(0) + month - 1);

export const getCRMActualMonthFormula = (month: number, rowIndex: number, sheetName: string): string => {
  if (month === 1) {
    return `IFERROR(VLOOKUP(C${rowIndex},${quoteSheetName(sheetName)}!A:C,3,FALSE),0)`;
  }
  return `IFERROR(XLOOKUP(C${rowIndex},${quoteSheetName(sheetName)}!A:A,${quoteSheetName(sheetName)}!D:D,0,0,1),0)`;
};

export const isMonthSheetName = (sheetName: string): number | null => {
  const match = sheetName.match(/^26년\s*(\d{1,2})/);
  if (!match) return null;
  const month = Number(match[1]);
  return month >= 1 && month <= 12 ? month : null;
};
