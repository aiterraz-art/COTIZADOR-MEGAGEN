import * as XLSX from 'xlsx';
import type { CellObject, WorkBook, WorkSheet } from 'xlsx';
import type {
  CrmMasterCrmRowRef,
  CrmMasterMonthlySheetRef,
  CrmMasterWorkbookModel,
  SellerAssignmentRef,
} from '../types/crmWorkbook';
import {
  isMonthSheetName,
  normalizeCRMRut,
  parseCRMDateISO,
  parseCRMNumericValue,
} from './crmWorkbookAliases';

const CRM_SHEET_NAME = 'CRM';
const ANNUAL_SHEET_NAME = '26Y Sales';
const SELLER_ASSIGNMENTS_SHEET_NAME = '영업사원별';
const REPORT_SHEET_NAME = 'Report';

const getCell = (sheet: WorkSheet, address: string): CellObject | undefined => sheet[address] as CellObject | undefined;

const getCellValue = (sheet: WorkSheet, address: string): unknown => getCell(sheet, address)?.v;

const getStringValue = (sheet: WorkSheet, address: string): string => {
  const value = getCellValue(sheet, address);
  return value === undefined || value === null ? '' : String(value).trim();
};

const getSheetRange = (sheet: WorkSheet) => {
  const ref = sheet['!ref'];
  return ref ? XLSX.utils.decode_range(ref) : XLSX.utils.decode_range('A1:A1');
};

const findLastNonEmptyRow = (sheet: WorkSheet, columnLetters: string[], startRow = 1): number => {
  const range = getSheetRange(sheet);
  for (let row = range.e.r + 1; row >= startRow; row -= 1) {
    const hasValue = columnLetters.some((column) => {
      const cell = getCell(sheet, `${column}${row}`);
      return cell !== undefined && cell.v !== undefined && String(cell.v).trim() !== '';
    });
    if (hasValue) {
      return row;
    }
  }
  return startRow;
};

const findRowByColumnValue = (sheet: WorkSheet, column: string, predicate: (value: string) => boolean, startRow = 1): number | null => {
  const range = getSheetRange(sheet);
  for (let row = startRow; row <= range.e.r + 1; row += 1) {
    const value = getStringValue(sheet, `${column}${row}`);
    if (predicate(value)) {
      return row;
    }
  }
  return null;
};

const parseMonthlySheetRef = (sheetName: string, sheet: WorkSheet, month: number): CrmMasterMonthlySheetRef => {
  const totalRowIndex = findRowByColumnValue(sheet, 'A', (value) => value.toUpperCase() === 'TOTAL VENTA');
  const dataStartRow = month === 1 ? 4 : 2;
  const templateRowIndex = month === 1 ? 4 : 2;
  const dataEndRow = totalRowIndex
    ? Math.max(dataStartRow, totalRowIndex - 1)
    : findLastNonEmptyRow(sheet, ['A', 'B', 'C', 'D', 'E', 'F'], dataStartRow);
  const appendRowIndex = totalRowIndex ? totalRowIndex : dataEndRow + 1;

  return {
    month,
    sheetName,
    layout: month === 1 ? 'legacy_january' : 'standard',
    templateRowIndex,
    dataStartRow,
    dataEndRow,
    appendRowIndex,
    totalRowIndex,
  };
};

const parseCrmRows = (sheet: WorkSheet): {
  rowsByRut: Map<string, CrmMasterCrmRowRef>;
  lastRowIndex: number;
  templateRowIndex: number;
} => {
  const rowsByRut = new Map<string, CrmMasterCrmRowRef>();
  const lastRowIndex = findLastNonEmptyRow(sheet, ['A', 'B', 'C', 'D', 'I'], 3);

  for (let row = 3; row <= lastRowIndex; row += 1) {
    const clientRut = normalizeCRMRut(getStringValue(sheet, `C${row}`));
    if (!clientRut) continue;
    rowsByRut.set(clientRut, {
      rowIndex: row,
      salesRep: getStringValue(sheet, `B${row}`),
      clientRut,
      clientName: getStringValue(sheet, `D${row}`),
      firstSoldDate: parseCRMDateISO(getCellValue(sheet, `G${row}`)),
      recentSoldDate: parseCRMDateISO(getCellValue(sheet, `I${row}`)),
    });
  }

  return {
    rowsByRut,
    lastRowIndex,
    templateRowIndex: Math.min(Math.max(3, lastRowIndex), 3),
  };
};

const parseAnnualExpected = (sheet: WorkSheet): {
  expectedByRut: Map<string, number | null>;
  totalRowIndex: number | null;
  templateRowIndex: number;
} => {
  const expectedByRut = new Map<string, number | null>();
  const totalRowIndex = findRowByColumnValue(sheet, 'A', (value) => value.toUpperCase() === 'TOTAL VENTA', 1);
  const endRow = totalRowIndex ? totalRowIndex - 1 : findLastNonEmptyRow(sheet, ['A', 'B', 'C', 'D', 'E'], 2);

  for (let row = 2; row <= endRow; row += 1) {
    const rawRut = getStringValue(sheet, `A${row}`);
    const clientRut = normalizeCRMRut(rawRut);
    if (!clientRut) continue;

    const columnB = getCellValue(sheet, `B${row}`);
    const columnC = getCellValue(sheet, `C${row}`);
    let expected: number | null = null;
    if (typeof columnB === 'number') {
      expected = parseCRMNumericValue(columnB);
    } else if (typeof columnC === 'number') {
      expected = parseCRMNumericValue(columnC);
    }
    expectedByRut.set(clientRut, expected);
  }

  return {
    expectedByRut,
    totalRowIndex,
    templateRowIndex: 2,
  };
};

const parseSellerAssignments = (sheet: WorkSheet): {
  assignmentsByRut: Map<string, SellerAssignmentRef>;
  templateRowIndex: number;
} => {
  const assignmentsByRut = new Map<string, SellerAssignmentRef>();
  const lastRowIndex = findLastNonEmptyRow(sheet, ['A', 'B'], 2);

  for (let row = 2; row <= lastRowIndex; row += 1) {
    const clientRut = normalizeCRMRut(getStringValue(sheet, `A${row}`));
    const salesRep = getStringValue(sheet, `B${row}`);
    if (!clientRut) continue;
    const existing = assignmentsByRut.get(clientRut);
    if (!existing) {
      assignmentsByRut.set(clientRut, {
        order: row,
        clientRut,
        salesRep,
      });
      continue;
    }
    existing.salesRep = salesRep || existing.salesRep;
  }

  return {
    assignmentsByRut,
    templateRowIndex: 2,
  };
};

export const parseCrmMasterWorkbook = (workbook: WorkBook, sourceFileName = 'Chile CRM.xlsx'): CrmMasterWorkbookModel => {
  const crmSheet = workbook.Sheets[CRM_SHEET_NAME];
  const annualSheet = workbook.Sheets[ANNUAL_SHEET_NAME];
  const sellerSheet = workbook.Sheets[SELLER_ASSIGNMENTS_SHEET_NAME];

  if (!crmSheet) {
    throw new Error(`No se encontró la hoja ${CRM_SHEET_NAME} en el workbook maestro.`);
  }
  if (!annualSheet) {
    throw new Error(`No se encontró la hoja ${ANNUAL_SHEET_NAME} en el workbook maestro.`);
  }
  if (!sellerSheet) {
    throw new Error(`No se encontró la hoja ${SELLER_ASSIGNMENTS_SHEET_NAME} en el workbook maestro.`);
  }

  const monthlySheets = new Map<number, CrmMasterMonthlySheetRef>();
  workbook.SheetNames.forEach((sheetName) => {
    const month = isMonthSheetName(sheetName);
    if (month === null) return;
    monthlySheets.set(month, parseMonthlySheetRef(sheetName, workbook.Sheets[sheetName], month));
  });

  const crmRows = parseCrmRows(crmSheet);
  const annual = parseAnnualExpected(annualSheet);
  const assignments = parseSellerAssignments(sellerSheet);

  return {
    sourceFileName,
    workbook,
    monthlySheets,
    crmRowsByRut: crmRows.rowsByRut,
    crmLastRowIndex: crmRows.lastRowIndex,
    crmTemplateRowIndex: crmRows.templateRowIndex,
    crmSheetName: CRM_SHEET_NAME,
    annualSheetName: ANNUAL_SHEET_NAME,
    annualExpectedByRut: annual.expectedByRut,
    annualTemplateRowIndex: annual.templateRowIndex,
    annualTotalRowIndex: annual.totalRowIndex,
    salesRepSheetName: SELLER_ASSIGNMENTS_SHEET_NAME,
    salesRepAssignmentsByRut: assignments.assignmentsByRut,
    salesRepTemplateRowIndex: assignments.templateRowIndex,
    reportSheetName: workbook.Sheets[REPORT_SHEET_NAME] ? REPORT_SHEET_NAME : null,
  };
};

export const parseCrmMasterWorkbookFile = async (file: File): Promise<CrmMasterWorkbookModel> => {
  const data = new Uint8Array(await file.arrayBuffer());
  const workbook = XLSX.read(data, {
    type: 'array',
    cellDates: true,
    cellStyles: true,
    cellFormula: true,
  });
  return parseCrmMasterWorkbook(workbook, file.name);
};
