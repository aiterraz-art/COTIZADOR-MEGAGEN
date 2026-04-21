import * as XLSX from 'xlsx';
import type { CellObject, WorkBook, WorkSheet } from 'xlsx';

const cloneStyle = <T,>(value: T): T => structuredClone(value);

export const cloneCellObject = (cell?: CellObject): CellObject | undefined => {
  if (!cell) return undefined;
  const next: CellObject = { ...cell };
  if (cell.s) next.s = cloneStyle(cell.s);
  if (cell.l) next.l = cloneStyle(cell.l);
  if (cell.c) next.c = cloneStyle(cell.c);
  return next;
};

const inferCellType = (value: unknown): CellObject['t'] => {
  if (value instanceof Date) return 'd';
  if (typeof value === 'number') return 'n';
  if (typeof value === 'boolean') return 'b';
  return 's';
};

const ensureRangeIncludes = (sheet: WorkSheet, rowIndex: number, columnIndex: number) => {
  const currentRange = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : XLSX.utils.decode_range('A1:A1');
  currentRange.e.r = Math.max(currentRange.e.r, rowIndex - 1);
  currentRange.e.c = Math.max(currentRange.e.c, columnIndex);
  sheet['!ref'] = XLSX.utils.encode_range(currentRange);
};

export const setSheetRef = (sheet: WorkSheet, endRowIndex: number, endColumnIndex: number) => {
  sheet['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: Math.max(0, endRowIndex - 1), c: Math.max(0, endColumnIndex) },
  });
};

export const clearSheetRows = (sheet: WorkSheet, startRowIndex: number, endRowIndex: number, endColumnIndex: number) => {
  for (let row = startRowIndex; row <= endRowIndex; row += 1) {
    for (let column = 0; column <= endColumnIndex; column += 1) {
      delete sheet[XLSX.utils.encode_cell({ r: row - 1, c: column })];
    }
  }
};

export const copyRowStyle = (sheet: WorkSheet, sourceRowIndex: number, targetRowIndex: number, endColumnIndex: number) => {
  for (let column = 0; column <= endColumnIndex; column += 1) {
    const sourceAddress = XLSX.utils.encode_cell({ r: sourceRowIndex - 1, c: column });
    const targetAddress = XLSX.utils.encode_cell({ r: targetRowIndex - 1, c: column });
    const sourceCell = sheet[sourceAddress] as CellObject | undefined;
    if (!sourceCell) {
      delete sheet[targetAddress];
      continue;
    }
    const nextCell: CellObject = { t: sourceCell.t ?? 'z' };
    if (sourceCell.s) nextCell.s = cloneStyle(sourceCell.s);
    if (sourceCell.z) nextCell.z = sourceCell.z;
    if (sourceCell.w) nextCell.w = sourceCell.w;
    sheet[targetAddress] = nextCell;
  }

  if (sheet['!rows']?.[sourceRowIndex - 1]) {
    sheet['!rows'] = sheet['!rows'] ?? [];
    sheet['!rows'][targetRowIndex - 1] = cloneStyle(sheet['!rows'][sourceRowIndex - 1]);
  }

  ensureRangeIncludes(sheet, targetRowIndex, endColumnIndex);
};

export const moveRow = (sheet: WorkSheet, sourceRowIndex: number, targetRowIndex: number, endColumnIndex: number) => {
  for (let column = 0; column <= endColumnIndex; column += 1) {
    const sourceAddress = XLSX.utils.encode_cell({ r: sourceRowIndex - 1, c: column });
    const targetAddress = XLSX.utils.encode_cell({ r: targetRowIndex - 1, c: column });
    const sourceCell = sheet[sourceAddress] as CellObject | undefined;
    if (sourceCell) {
      sheet[targetAddress] = cloneCellObject(sourceCell);
    } else {
      delete sheet[targetAddress];
    }
  }

  if (sheet['!rows']?.[sourceRowIndex - 1]) {
    sheet['!rows'] = sheet['!rows'] ?? [];
    sheet['!rows'][targetRowIndex - 1] = cloneStyle(sheet['!rows'][sourceRowIndex - 1]);
  }

  ensureRangeIncludes(sheet, targetRowIndex, endColumnIndex);
};

export const writeLiteralCell = (
  sheet: WorkSheet,
  address: string,
  value: unknown,
  templateCell?: CellObject,
) => {
  if (value === '' || value === null || value === undefined) {
    const blankCell: CellObject = { t: templateCell?.t ?? 'z' };
    if (templateCell?.s) blankCell.s = cloneStyle(templateCell.s);
    if (templateCell?.z) blankCell.z = templateCell.z;
    sheet[address] = blankCell;
    return;
  }

  const nextCell: CellObject = {
    t: inferCellType(value),
  };
  nextCell.v = value as string | number | boolean | Date;

  if (templateCell?.s) nextCell.s = cloneStyle(templateCell.s);
  if (templateCell?.z) nextCell.z = templateCell.z;
  sheet[address] = nextCell;
};

export const writeFormulaCell = (
  sheet: WorkSheet,
  address: string,
  formula: string,
  templateCell?: CellObject,
) => {
  const nextCell: CellObject = {
    t: 'n',
    f: formula.startsWith('=') ? formula.slice(1) : formula,
  };

  if (templateCell?.s) nextCell.s = cloneStyle(templateCell.s);
  if (templateCell?.z) nextCell.z = templateCell.z;
  sheet[address] = nextCell;
};

export const writeDateCell = (
  sheet: WorkSheet,
  address: string,
  isoDate: string,
  templateCell?: CellObject,
) => {
  if (!isoDate) {
    writeLiteralCell(sheet, address, '', templateCell);
    return;
  }

  const nextCell: CellObject = {
    t: 'd',
    v: new Date(`${isoDate}T00:00:00`),
  };
  if (templateCell?.s) nextCell.s = cloneStyle(templateCell.s);
  if (templateCell?.z) nextCell.z = templateCell.z;
  sheet[address] = nextCell;
};

export const cloneWorksheet = (workbook: WorkBook, sourceSheetName: string, targetSheetName: string): WorkSheet => {
  const sourceSheet = workbook.Sheets[sourceSheetName];
  if (!sourceSheet) {
    throw new Error(`No se encontró la hoja plantilla ${sourceSheetName}.`);
  }
  const cloned = cloneStyle(sourceSheet);
  workbook.Sheets[targetSheetName] = cloned;
  return cloned;
};

export const ensureWorkbookRecalculation = (workbook: WorkBook) => {
  const workbookProps = (workbook.Workbook ?? { Sheets: [] }) as WorkBook['Workbook'];
  workbook.Workbook = workbookProps;
  (workbookProps as WorkBook['Workbook'] & { CalcPr?: Record<string, string> }).CalcPr = {
    calcMode: 'auto',
    fullCalcOnLoad: '1',
    forceFullCalc: '1',
  };
  delete (workbook as WorkBook & { CalcChain?: unknown }).CalcChain;
};
