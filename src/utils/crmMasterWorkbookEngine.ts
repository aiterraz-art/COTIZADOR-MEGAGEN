import * as XLSX from 'xlsx';
import type { CellObject, WorkSheet } from 'xlsx';
import type {
  ClientMutationDetail,
  CrmMasterWorkbookModel,
  CrmWorkbookMutationSummary,
  CrmWorkbookUpdateResult,
  SellerAssignmentRef,
  WeeklySalesAggregate,
  WeeklySalesBatch,
  WeeklySalesRow,
} from '../types/crmWorkbook';
import {
  formatMonthSheetName,
  getCRMActualMonthFormula,
  getCRMMonthColumn,
  normalizeCRMRut,
} from './crmWorkbookAliases';
import {
  clearSheetRows,
  cloneWorksheet,
  copyRowStyle,
  ensureWorkbookRecalculation,
  moveRow,
  setSheetRef,
  writeDateCell,
  writeFormulaCell,
  writeLiteralCell,
} from './crmWorkbookWriter';

const STANDARD_MONTH_END_COLUMN = 5;
const CRM_END_COLUMN = 22;
const ANNUAL_END_COLUMN = 4;
const SELLER_END_COLUMN = 1;

const getCell = (sheet: WorkSheet, address: string): CellObject | undefined => sheet[address] as CellObject | undefined;

const getString = (sheet: WorkSheet, address: string): string => {
  const value = getCell(sheet, address)?.v;
  return value === undefined || value === null ? '' : String(value).trim();
};

const getNumber = (sheet: WorkSheet, address: string): number => {
  const value = getCell(sheet, address)?.v;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
};

const buildEmptySummary = (): CrmWorkbookMutationSummary => ({
  updatedMonthlyRows: 0,
  insertedMonthlyRows: 0,
  createdMonthlySheets: [],
  updatedCrmRows: 0,
  insertedCrmRows: 0,
  updatedSellerAssignments: 0,
  insertedSellerAssignments: 0,
  rebuiltAnnualRows: 0,
  affectedMonths: [],
  newClients: [],
  updatedClients: [],
  sellerChanges: [],
  warnings: [],
});

const toMutationDetail = (aggregate: WeeklySalesAggregate): ClientMutationDetail => ({
  clientRut: aggregate.displayRut,
  clientName: aggregate.clientName,
  salesRep: aggregate.salesRep || '#N/A',
  month: aggregate.month,
  netAmountDelta: aggregate.netAmountDelta,
});

export const aggregateWeeklySalesRows = (rows: WeeklySalesRow[]): {
  aggregates: WeeklySalesAggregate[];
  warnings: string[];
} => {
  const aggregatesByKey = new Map<string, WeeklySalesAggregate>();
  const warnings: string[] = [];

  rows.forEach((row) => {
    const timestamp = new Date(row.saleDate).getTime();
    if (!Number.isFinite(timestamp)) {
      warnings.push(`No se pudo interpretar la fecha ${row.saleDate} de ${row.clientRut}; se descartó.`);
      return;
    }

    const saleDate = new Date(timestamp);
    const year = saleDate.getUTCFullYear();
    const month = saleDate.getUTCMonth() + 1;

    if (year !== 2026) {
      warnings.push(`La venta de ${row.clientRut} con fecha ${row.saleDate} quedó fuera de 2026 y no se aplicó.`);
      return;
    }

    const normalizedRut = normalizeCRMRut(row.clientRut);
    const key = `${normalizedRut}:${year}:${month}`;
    const existing = aggregatesByKey.get(key);

    if (!existing) {
      aggregatesByKey.set(key, {
        normalizedRut,
        displayRut: row.clientRut,
        clientName: row.clientName,
        salesRep: row.salesRep,
        year,
        month,
        netAmountDelta: row.netAmount,
        latestSaleDate: row.saleDate,
      });
      return;
    }

    existing.netAmountDelta += row.netAmount;
    if (row.clientName) {
      existing.clientName = row.clientName;
    }

    const currentTs = new Date(existing.latestSaleDate).getTime();
    if (timestamp >= currentTs) {
      existing.latestSaleDate = row.saleDate;
      existing.displayRut = row.clientRut;
      if (row.salesRep) {
        existing.salesRep = row.salesRep;
      }
      if (row.clientName) {
        existing.clientName = row.clientName;
      }
    }
  });

  const aggregates = Array.from(aggregatesByKey.values()).sort((left, right) => {
    if (left.month !== right.month) return left.month - right.month;
    return left.normalizedRut.localeCompare(right.normalizedRut, 'es');
  });

  return { aggregates, warnings };
};

const insertSheetNameAfter = (sheetNames: string[], sourceSheetName: string, nextSheetName: string) => {
  if (sheetNames.includes(nextSheetName)) return;
  const index = sheetNames.indexOf(sourceSheetName);
  if (index === -1) {
    sheetNames.push(nextSheetName);
    return;
  }
  sheetNames.splice(index + 1, 0, nextSheetName);
};

const clearRowForTemplate = (sheet: WorkSheet, rowIndex: number, endColumnIndex: number) => {
  for (let column = 0; column <= endColumnIndex; column += 1) {
    const address = XLSX.utils.encode_cell({ r: rowIndex - 1, c: column });
    const template = getCell(sheet, address);
    writeLiteralCell(sheet, address, '', template);
  }
};

const ensureMonthlySheet = (model: CrmMasterWorkbookModel, month: number, summary: CrmWorkbookMutationSummary) => {
  const existing = model.monthlySheets.get(month);
  if (existing) return existing;

  const templateRef = model.monthlySheets.get(2);
  if (!templateRef) {
    throw new Error('No existe la hoja 26년 2월 para clonar meses futuros.');
  }

  const sourceSheetName = templateRef.sheetName;
  const targetSheetName = formatMonthSheetName(month);
  const targetSheet = cloneWorksheet(model.workbook, sourceSheetName, targetSheetName);
  insertSheetNameAfter(model.workbook.SheetNames, sourceSheetName, targetSheetName);

  const range = targetSheet['!ref'] ? XLSX.utils.decode_range(targetSheet['!ref']) : XLSX.utils.decode_range('A1:F2');
  for (let row = 2; row <= range.e.r + 1; row += 1) {
    clearRowForTemplate(targetSheet, row, STANDARD_MONTH_END_COLUMN);
  }
  setSheetRef(targetSheet, 2, STANDARD_MONTH_END_COLUMN);

  const nextRef = {
    month,
    sheetName: targetSheetName,
    layout: 'standard' as const,
    templateRowIndex: templateRef.templateRowIndex,
    dataStartRow: 2,
    dataEndRow: 1,
    appendRowIndex: 2,
    totalRowIndex: null,
  };

  model.monthlySheets.set(month, nextRef);
  summary.createdMonthlySheets.push(targetSheetName);
  return nextRef;
};

const writeStandardMonthlyFormulas = (sheet: WorkSheet, rowIndex: number, templateRowIndex: number) => {
  const templateE = getCell(sheet, `E${templateRowIndex}`);
  const templateF = getCell(sheet, `F${templateRowIndex}`);
  writeFormulaCell(sheet, `E${rowIndex}`, `IF(C${rowIndex}="","",D${rowIndex}-C${rowIndex})`, templateE);
  writeFormulaCell(sheet, `F${rowIndex}`, `IF(OR(C${rowIndex}="",C${rowIndex}=0),"",E${rowIndex}/C${rowIndex})`, templateF);
};

const refreshLegacyJanuaryTotalRow = (sheet: WorkSheet, totalRowIndex: number) => {
  const templateB = getCell(sheet, `B${totalRowIndex}`);
  const templateC = getCell(sheet, `C${totalRowIndex}`);
  const templateD = getCell(sheet, `D${totalRowIndex}`);
  const templateE = getCell(sheet, `E${totalRowIndex}`);

  writeFormulaCell(sheet, `C${totalRowIndex}`, `SUM(C4:C${totalRowIndex - 1})`, templateC);
  writeFormulaCell(sheet, `D${totalRowIndex}`, `IF(OR(B${totalRowIndex}="",B${totalRowIndex}=0),"",C${totalRowIndex}-B${totalRowIndex})`, templateD);
  writeFormulaCell(sheet, `E${totalRowIndex}`, `IF(OR(B${totalRowIndex}="",B${totalRowIndex}=0),"",D${totalRowIndex}/B${totalRowIndex})`, templateE);
  if (!getCell(sheet, `B${totalRowIndex}`)) {
    writeLiteralCell(sheet, `B${totalRowIndex}`, '', templateB);
  }
};

const applyAggregateToMonthlySheet = (
  model: CrmMasterWorkbookModel,
  aggregate: WeeklySalesAggregate,
  summary: CrmWorkbookMutationSummary,
) => {
  const monthlyRef = ensureMonthlySheet(model, aggregate.month, summary);
  const sheet = model.workbook.Sheets[monthlyRef.sheetName];
  if (!sheet) {
    throw new Error(`No se encontró la hoja ${monthlyRef.sheetName} después de crearla.`);
  }

  summary.affectedMonths = Array.from(new Set([...summary.affectedMonths, aggregate.month])).sort((a, b) => a - b);

  const actualColumn = monthlyRef.layout === 'legacy_january' ? 'C' : 'D';
  const searchEndRow = monthlyRef.totalRowIndex ? monthlyRef.totalRowIndex - 1 : Math.max(monthlyRef.dataEndRow, monthlyRef.appendRowIndex - 1);
  let existingRowIndex: number | null = null;

  for (let row = monthlyRef.dataStartRow; row <= searchEndRow; row += 1) {
    if (normalizeCRMRut(getString(sheet, `A${row}`)) === aggregate.normalizedRut) {
      existingRowIndex = row;
      break;
    }
  }

  if (existingRowIndex !== null) {
    const templateActual = getCell(sheet, `${actualColumn}${existingRowIndex}`);
    const nextActual = getNumber(sheet, `${actualColumn}${existingRowIndex}`) + aggregate.netAmountDelta;
    writeLiteralCell(sheet, `${actualColumn}${existingRowIndex}`, nextActual, templateActual);
    if (aggregate.clientName) {
      writeLiteralCell(sheet, `B${existingRowIndex}`, aggregate.clientName, getCell(sheet, `B${existingRowIndex}`));
    }
    if (monthlyRef.layout === 'standard') {
      writeStandardMonthlyFormulas(sheet, existingRowIndex, monthlyRef.templateRowIndex);
    }
    summary.updatedMonthlyRows += 1;
    summary.updatedClients.push(toMutationDetail(aggregate));
    return;
  }

  const targetRowIndex = monthlyRef.appendRowIndex;
  if (monthlyRef.layout === 'legacy_january' && monthlyRef.totalRowIndex) {
    moveRow(sheet, monthlyRef.totalRowIndex, monthlyRef.totalRowIndex + 1, STANDARD_MONTH_END_COLUMN - 1);
    copyRowStyle(sheet, monthlyRef.templateRowIndex, monthlyRef.totalRowIndex, STANDARD_MONTH_END_COLUMN - 1);
    clearRowForTemplate(sheet, monthlyRef.totalRowIndex, STANDARD_MONTH_END_COLUMN - 1);
    monthlyRef.totalRowIndex += 1;
    monthlyRef.appendRowIndex = monthlyRef.totalRowIndex;
  } else {
    copyRowStyle(sheet, monthlyRef.templateRowIndex, targetRowIndex, STANDARD_MONTH_END_COLUMN);
    clearRowForTemplate(sheet, targetRowIndex, STANDARD_MONTH_END_COLUMN);
    monthlyRef.appendRowIndex = targetRowIndex + 1;
  }

  writeLiteralCell(sheet, `A${targetRowIndex}`, aggregate.displayRut, getCell(sheet, `A${monthlyRef.templateRowIndex}`));
  writeLiteralCell(sheet, `B${targetRowIndex}`, aggregate.clientName || aggregate.displayRut, getCell(sheet, `B${monthlyRef.templateRowIndex}`));
  if (monthlyRef.layout === 'legacy_january') {
    writeLiteralCell(sheet, `C${targetRowIndex}`, aggregate.netAmountDelta, getCell(sheet, `C${monthlyRef.templateRowIndex}`));
    writeLiteralCell(sheet, `D${targetRowIndex}`, '', getCell(sheet, `D${monthlyRef.templateRowIndex}`));
    writeLiteralCell(sheet, `E${targetRowIndex}`, '', getCell(sheet, `E${monthlyRef.templateRowIndex}`));
  } else {
    writeLiteralCell(sheet, `C${targetRowIndex}`, '', getCell(sheet, `C${monthlyRef.templateRowIndex}`));
    writeLiteralCell(sheet, `D${targetRowIndex}`, aggregate.netAmountDelta, getCell(sheet, `D${monthlyRef.templateRowIndex}`));
    writeStandardMonthlyFormulas(sheet, targetRowIndex, monthlyRef.templateRowIndex);
  }

  monthlyRef.dataEndRow = Math.max(monthlyRef.dataEndRow, targetRowIndex);
  setSheetRef(sheet, monthlyRef.totalRowIndex ?? Math.max(monthlyRef.appendRowIndex, targetRowIndex), STANDARD_MONTH_END_COLUMN);
  if (monthlyRef.layout === 'legacy_january' && monthlyRef.totalRowIndex) {
    refreshLegacyJanuaryTotalRow(sheet, monthlyRef.totalRowIndex);
  }

  summary.insertedMonthlyRows += 1;
  summary.newClients.push(toMutationDetail(aggregate));
};

const buildCrmClientRollup = (aggregates: WeeklySalesAggregate[]) => {
  const rollup = new Map<string, WeeklySalesAggregate>();
  aggregates.forEach((aggregate) => {
    const existing = rollup.get(aggregate.normalizedRut);
    if (!existing) {
      rollup.set(aggregate.normalizedRut, { ...aggregate });
      return;
    }
    const existingTs = new Date(existing.latestSaleDate).getTime();
    const nextTs = new Date(aggregate.latestSaleDate).getTime();
    if (nextTs >= existingTs) {
      existing.latestSaleDate = aggregate.latestSaleDate;
      if (aggregate.clientName) existing.clientName = aggregate.clientName;
      if (aggregate.salesRep) existing.salesRep = aggregate.salesRep;
      existing.displayRut = aggregate.displayRut;
    }
    existing.netAmountDelta += aggregate.netAmountDelta;
  });
  return rollup;
};

const writeCRMMonthlyFormulas = (sheet: WorkSheet, rowIndex: number, model: CrmMasterWorkbookModel) => {
  const templateRowIndex = model.crmTemplateRowIndex;

  writeFormulaCell(sheet, `E${rowIndex}`, `IFERROR(VLOOKUP(C${rowIndex},'25Y Sales'!A:D,4,FALSE),0)`, getCell(sheet, `E${templateRowIndex}`));
  writeFormulaCell(sheet, `F${rowIndex}`, `SUM(J${rowIndex}:U${rowIndex})`, getCell(sheet, `F${templateRowIndex}`));
  writeFormulaCell(sheet, `H${rowIndex}`, `SUM(E${rowIndex},F${rowIndex})`, getCell(sheet, `H${templateRowIndex}`));

  for (let month = 1; month <= 12; month += 1) {
    const column = getCRMMonthColumn(month);
    const templateCell = getCell(sheet, `${column}${templateRowIndex}`);
    const monthlyRef = model.monthlySheets.get(month);
    if (!monthlyRef) {
      writeLiteralCell(sheet, `${column}${rowIndex}`, '', templateCell);
      continue;
    }
    writeFormulaCell(sheet, `${column}${rowIndex}`, getCRMActualMonthFormula(month, rowIndex, monthlyRef.sheetName), templateCell);
  }

  writeFormulaCell(sheet, `V${rowIndex}`, `IF(DAYS(TODAY(),I${rowIndex})>90,"Inactive","Active")`, getCell(sheet, `V${templateRowIndex}`));
};

const syncCrmSheet = (
  model: CrmMasterWorkbookModel,
  aggregates: WeeklySalesAggregate[],
  summary: CrmWorkbookMutationSummary,
) => {
  const sheet = model.workbook.Sheets[model.crmSheetName];
  if (!sheet) {
    throw new Error(`No se encontró la hoja ${model.crmSheetName}.`);
  }

  const rollup = buildCrmClientRollup(aggregates);

  rollup.forEach((aggregate, normalizedRut) => {
    const existing = model.crmRowsByRut.get(normalizedRut);
    if (existing) {
      const nextSalesRep = aggregate.salesRep || existing.salesRep || '#N/A';
      const nextClientName = aggregate.clientName || existing.clientName || aggregate.displayRut;
      const currentDateTs = existing.recentSoldDate ? new Date(existing.recentSoldDate).getTime() : 0;
      const nextDateTs = new Date(aggregate.latestSaleDate).getTime();
      const nextRecentDate = nextDateTs >= currentDateTs ? aggregate.latestSaleDate : existing.recentSoldDate;

      if (existing.salesRep && aggregate.salesRep && existing.salesRep !== aggregate.salesRep) {
        summary.sellerChanges.push({
          clientRut: aggregate.displayRut,
          previousSalesRep: existing.salesRep,
          nextSalesRep: aggregate.salesRep,
        });
      }

      writeLiteralCell(sheet, `B${existing.rowIndex}`, nextSalesRep, getCell(sheet, `B${existing.rowIndex}`));
      writeLiteralCell(sheet, `D${existing.rowIndex}`, nextClientName, getCell(sheet, `D${existing.rowIndex}`));
      writeDateCell(sheet, `I${existing.rowIndex}`, nextRecentDate, getCell(sheet, `I${existing.rowIndex}`));
      writeCRMMonthlyFormulas(sheet, existing.rowIndex, model);

      existing.salesRep = nextSalesRep;
      existing.clientName = nextClientName;
      existing.recentSoldDate = nextRecentDate;
      summary.updatedCrmRows += 1;
      return;
    }

    const nextRowIndex = model.crmLastRowIndex + 1;
    copyRowStyle(sheet, model.crmTemplateRowIndex, nextRowIndex, CRM_END_COLUMN);
    clearRowForTemplate(sheet, nextRowIndex, CRM_END_COLUMN);

    writeLiteralCell(sheet, `A${nextRowIndex}`, nextRowIndex - 2, getCell(sheet, `A${model.crmTemplateRowIndex}`));
    writeLiteralCell(sheet, `B${nextRowIndex}`, aggregate.salesRep || '#N/A', getCell(sheet, `B${model.crmTemplateRowIndex}`));
    writeLiteralCell(sheet, `C${nextRowIndex}`, aggregate.displayRut, getCell(sheet, `C${model.crmTemplateRowIndex}`));
    writeLiteralCell(sheet, `D${nextRowIndex}`, aggregate.clientName || aggregate.displayRut, getCell(sheet, `D${model.crmTemplateRowIndex}`));
    writeDateCell(sheet, `G${nextRowIndex}`, aggregate.latestSaleDate, getCell(sheet, `G${model.crmTemplateRowIndex}`));
    writeDateCell(sheet, `I${nextRowIndex}`, aggregate.latestSaleDate, getCell(sheet, `I${model.crmTemplateRowIndex}`));
    writeLiteralCell(sheet, `W${nextRowIndex}`, '', getCell(sheet, `W${model.crmTemplateRowIndex}`));
    writeCRMMonthlyFormulas(sheet, nextRowIndex, model);

    model.crmRowsByRut.set(normalizedRut, {
      rowIndex: nextRowIndex,
      salesRep: aggregate.salesRep || '#N/A',
      clientRut: aggregate.displayRut,
      clientName: aggregate.clientName || aggregate.displayRut,
      firstSoldDate: aggregate.latestSaleDate,
      recentSoldDate: aggregate.latestSaleDate,
    });

    model.crmLastRowIndex = nextRowIndex;
    summary.insertedCrmRows += 1;
  });

  for (let row = 3; row <= model.crmLastRowIndex; row += 1) {
    writeLiteralCell(sheet, `A${row}`, row - 2, getCell(sheet, `A${row}`));
    writeCRMMonthlyFormulas(sheet, row, model);
  }

  writeFormulaCell(sheet, 'F1', `SUBTOTAL(9,F2:F${model.crmLastRowIndex})*0.0012`, getCell(sheet, 'F1'));
  writeFormulaCell(sheet, 'W1', `SUBTOTAL(9,W2:W${model.crmLastRowIndex})*0.0012`, getCell(sheet, 'W1'));
  setSheetRef(sheet, model.crmLastRowIndex, CRM_END_COLUMN);
};

const rebuildSellerAssignmentsSheet = (
  model: CrmMasterWorkbookModel,
  summary: CrmWorkbookMutationSummary,
) => {
  const sheet = model.workbook.Sheets[model.salesRepSheetName];
  if (!sheet) {
    throw new Error(`No se encontró la hoja ${model.salesRepSheetName}.`);
  }

  const mergedAssignments = new Map<string, SellerAssignmentRef>();
  model.salesRepAssignmentsByRut.forEach((assignment, normalizedRut) => {
    mergedAssignments.set(normalizedRut, { ...assignment });
  });

  let nextOrder = Array.from(mergedAssignments.values()).reduce((max, assignment) => Math.max(max, assignment.order), 1) + 1;
  model.crmRowsByRut.forEach((crmRow, normalizedRut) => {
    const existing = mergedAssignments.get(normalizedRut);
    const nextSalesRep = crmRow.salesRep || '#N/A';
    if (!existing) {
      mergedAssignments.set(normalizedRut, {
        order: nextOrder,
        clientRut: crmRow.clientRut,
        salesRep: nextSalesRep,
      });
      nextOrder += 1;
      summary.insertedSellerAssignments += 1;
      return;
    }
    if (existing.salesRep !== nextSalesRep) {
      existing.salesRep = nextSalesRep;
      summary.updatedSellerAssignments += 1;
    }
  });

  const orderedAssignments = Array.from(mergedAssignments.values()).sort((left, right) => left.order - right.order);
  const previousRange = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : XLSX.utils.decode_range('A1:B2');

  orderedAssignments.forEach((assignment, index) => {
    const rowIndex = index + 2;
    copyRowStyle(sheet, model.salesRepTemplateRowIndex, rowIndex, SELLER_END_COLUMN);
    clearRowForTemplate(sheet, rowIndex, SELLER_END_COLUMN);
    writeLiteralCell(sheet, `A${rowIndex}`, assignment.clientRut, getCell(sheet, `A${model.salesRepTemplateRowIndex}`));
    writeLiteralCell(sheet, `B${rowIndex}`, assignment.salesRep, getCell(sheet, `B${model.salesRepTemplateRowIndex}`));
  });

  const lastRowIndex = Math.max(2, orderedAssignments.length + 1);
  if (lastRowIndex < previousRange.e.r + 1) {
    clearSheetRows(sheet, lastRowIndex + 1, previousRange.e.r + 1, SELLER_END_COLUMN);
  }
  setSheetRef(sheet, lastRowIndex, SELLER_END_COLUMN);
  model.salesRepAssignmentsByRut = new Map(orderedAssignments.map((assignment) => [normalizeCRMRut(assignment.clientRut), assignment]));
};

const collectAnnualActuals = (model: CrmMasterWorkbookModel) => {
  const totalsByRut = new Map<string, { displayRut: string; clientName: string; realAmount: number }>();

  Array.from(model.monthlySheets.values())
    .sort((left, right) => left.month - right.month)
    .forEach((monthlyRef) => {
      const sheet = model.workbook.Sheets[monthlyRef.sheetName];
      if (!sheet) return;
      const valueColumn = monthlyRef.layout === 'legacy_january' ? 'C' : 'D';
      const endRow = monthlyRef.totalRowIndex ? monthlyRef.totalRowIndex - 1 : monthlyRef.dataEndRow;
      for (let row = monthlyRef.dataStartRow; row <= endRow; row += 1) {
        const rawRut = getString(sheet, `A${row}`);
        const normalizedRut = normalizeCRMRut(rawRut);
        if (!normalizedRut) continue;
        const current = totalsByRut.get(normalizedRut) ?? {
          displayRut: rawRut,
          clientName: getString(sheet, `B${row}`),
          realAmount: 0,
        };
        current.displayRut = rawRut || current.displayRut;
        current.clientName = getString(sheet, `B${row}`) || current.clientName;
        current.realAmount += getNumber(sheet, `${valueColumn}${row}`);
        totalsByRut.set(normalizedRut, current);
      }
    });

  return totalsByRut;
};

const rebuildAnnualSalesSheet = (model: CrmMasterWorkbookModel, summary: CrmWorkbookMutationSummary) => {
  const sheet = model.workbook.Sheets[model.annualSheetName];
  if (!sheet) {
    throw new Error(`No se encontró la hoja ${model.annualSheetName}.`);
  }

  const currentRange = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : XLSX.utils.decode_range('A1:E2');
  const annualActuals = collectAnnualActuals(model);

  const existingOrder = new Map<string, number>();
  let orderCursor = 0;
  for (let row = 2; row <= currentRange.e.r + 1; row += 1) {
    const clientRut = normalizeCRMRut(getString(sheet, `A${row}`));
    if (!clientRut || clientRut === 'TOTAL VENTA') continue;
    if (!existingOrder.has(clientRut)) {
      existingOrder.set(clientRut, orderCursor);
      orderCursor += 1;
    }
  }

  const orderedAnnualRows = Array.from(annualActuals.entries())
    .sort((left, right) => {
      const leftOrder = existingOrder.get(left[0]);
      const rightOrder = existingOrder.get(right[0]);
      if (leftOrder !== undefined && rightOrder !== undefined) return leftOrder - rightOrder;
      if (leftOrder !== undefined) return -1;
      if (rightOrder !== undefined) return 1;
      return left[0].localeCompare(right[0], 'es');
    });

  orderedAnnualRows.forEach(([normalizedRut, annualRow], index) => {
    const rowIndex = index + 2;
    copyRowStyle(sheet, model.annualTemplateRowIndex, rowIndex, ANNUAL_END_COLUMN);
    clearRowForTemplate(sheet, rowIndex, ANNUAL_END_COLUMN);

    const expectedAmount = model.annualExpectedByRut.get(normalizedRut);
    writeLiteralCell(sheet, `A${rowIndex}`, annualRow.displayRut, getCell(sheet, `A${model.annualTemplateRowIndex}`));
    writeLiteralCell(sheet, `B${rowIndex}`, expectedAmount ?? '', getCell(sheet, `B${model.annualTemplateRowIndex}`));
    writeLiteralCell(sheet, `C${rowIndex}`, annualRow.realAmount, getCell(sheet, `C${model.annualTemplateRowIndex}`));
    writeFormulaCell(sheet, `D${rowIndex}`, `IF(OR(B${rowIndex}="",B${rowIndex}=0),"",C${rowIndex}-B${rowIndex})`, getCell(sheet, `D${model.annualTemplateRowIndex}`));
    writeFormulaCell(sheet, `E${rowIndex}`, `IF(OR(B${rowIndex}="",B${rowIndex}=0),"",D${rowIndex}/B${rowIndex})`, getCell(sheet, `E${model.annualTemplateRowIndex}`));
  });

  const blankRowIndex = orderedAnnualRows.length + 2;
  const totalRowIndex = blankRowIndex + 1;
  copyRowStyle(sheet, model.annualTemplateRowIndex, blankRowIndex, ANNUAL_END_COLUMN);
  clearRowForTemplate(sheet, blankRowIndex, ANNUAL_END_COLUMN);

  const totalTemplateRow = model.annualTotalRowIndex ?? Math.max(model.annualTemplateRowIndex, totalRowIndex);
  copyRowStyle(sheet, totalTemplateRow, totalRowIndex, ANNUAL_END_COLUMN);
  clearRowForTemplate(sheet, totalRowIndex, ANNUAL_END_COLUMN);
  writeLiteralCell(sheet, `A${totalRowIndex}`, 'TOTAL VENTA', getCell(sheet, `A${totalTemplateRow}`));
  writeFormulaCell(sheet, `B${totalRowIndex}`, `SUM(B2:B${blankRowIndex - 1})`, getCell(sheet, `B${totalTemplateRow}`));
  writeFormulaCell(sheet, `C${totalRowIndex}`, `SUM(C2:C${blankRowIndex - 1})`, getCell(sheet, `C${totalTemplateRow}`));
  writeFormulaCell(sheet, `D${totalRowIndex}`, `SUM(D2:D${blankRowIndex - 1})`, getCell(sheet, `D${totalTemplateRow}`));
  writeFormulaCell(sheet, `E${totalRowIndex}`, `IF(B${totalRowIndex}=0,"",D${totalRowIndex}/B${totalRowIndex})`, getCell(sheet, `E${totalTemplateRow}`));

  if (totalRowIndex < currentRange.e.r + 1) {
    clearSheetRows(sheet, totalRowIndex + 1, currentRange.e.r + 1, ANNUAL_END_COLUMN);
  }
  setSheetRef(sheet, totalRowIndex, ANNUAL_END_COLUMN);
  summary.rebuiltAnnualRows = orderedAnnualRows.length;
};

const buildDownloadFileName = (model: CrmMasterWorkbookModel, weeklyBatch: WeeklySalesBatch) => {
  const baseName = model.sourceFileName.replace(/\.(xlsx|xls)$/i, '');
  const suffix = weeklyBatch.periodTo ?? new Date().toISOString().slice(0, 10);
  return `${baseName}-actualizado-${suffix}.xlsx`;
};

export const updateCrmMasterWorkbook = (
  model: CrmMasterWorkbookModel,
  weeklyBatch: WeeklySalesBatch,
): CrmWorkbookUpdateResult => {
  const summary = buildEmptySummary();
  summary.warnings.push(...weeklyBatch.warnings);

  const { aggregates, warnings } = aggregateWeeklySalesRows(weeklyBatch.rows);
  summary.warnings.push(...warnings);

  aggregates.forEach((aggregate) => applyAggregateToMonthlySheet(model, aggregate, summary));
  syncCrmSheet(model, aggregates, summary);
  rebuildSellerAssignmentsSheet(model, summary);
  rebuildAnnualSalesSheet(model, summary);

  ensureWorkbookRecalculation(model.workbook);

  return {
    workbook: model.workbook,
    downloadFileName: buildDownloadFileName(model, weeklyBatch),
    summary,
  };
};
