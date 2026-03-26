import * as XLSX from 'xlsx';
import type { WorkSheet } from 'xlsx';
import { COMMISSION_COMPANY_DEFINITIONS } from '../data/commissionDefaults';
import type {
  CommissionClosureProcessingResult,
  CommissionProcessedLine,
  CommissionWorkbookBuildResult,
} from '../types/commissions';
import { ensureWorkbookRecalculation } from './crmWorkbookWriter';

const quoteSheetName = (sheetName: string): string => `'${sheetName.replace(/'/g, "''")}'`;

const setColumns = (sheet: WorkSheet, widths: number[]) => {
  sheet['!cols'] = widths.map((wch) => ({ wch }));
};

const formatDate = (isoDate: string): string => {
  if (!isoDate) return '';
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('es-CL');
};

const rowObservation = (line: CommissionProcessedLine): string =>
  [line.exclusionReason, ...line.warnings].filter(Boolean).join(' | ');

const buildConfigurationSheet = (result: CommissionClosureProcessingResult): WorkSheet => {
  const rows: Array<Array<string | number>> = [
    ['Campo', 'Valor'],
    ['Empresa', result.companyLabel],
    ['Periodo', result.periodKey],
    ['Fecha generación', new Date().toLocaleString('es-CL')],
    ['Archivo ventas', result.salesFileName || '-'],
    ['Archivo cobranza', result.receivablesFileName || '-'],
    ['Archivo arrastre', result.carryoverFileName || '-'],
    ['Tasa MegaGen (%)', result.configSnapshot.globalRatePercent ?? ''],
    ['Tasa Implantes (%)', result.configSnapshot.implantRatePercent ?? ''],
    ['Tasa 3Dental (%)', result.configSnapshot.threeDentalRatePercent ?? ''],
    [''],
    ['Catálogo de exclusión'],
    ['Campo', 'Operador', 'Valor', 'Nota'],
    ...(result.configSnapshot.exclusionRules.length > 0
      ? result.configSnapshot.exclusionRules.map((rule) => [rule.field, rule.operator, rule.value, rule.note])
      : [['-', '-', '-', 'Sin exclusiones configuradas']]),
  ];

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  setColumns(sheet, [24, 32, 18, 48]);
  return sheet;
};

const buildCurrentPaidSheet = (lines: CommissionProcessedLine[]): WorkSheet => {
  const rows: Array<Array<string | number>> = [
    ['Documento', 'Fecha', 'Vendedor', 'Cliente', 'Producto', 'Cantidad', 'Neto', 'Clase', 'Tasa %', 'Comisión CLP', 'Observación'],
    ...lines.map((line) => [
      line.documentNumber,
      formatDate(line.saleDate),
      line.salesRep,
      line.clientName || line.clientCode,
      line.productDescription || line.productCode,
      line.quantity,
      line.netAmountCLP,
      line.productClass,
      line.ratePercent,
      '',
      rowObservation(line),
    ]),
  ];

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  for (let rowIndex = 2; rowIndex <= lines.length + 1; rowIndex += 1) {
    sheet[`J${rowIndex}`] = { t: 'n', f: `G${rowIndex}*I${rowIndex}/100` };
  }
  setColumns(sheet, [14, 12, 22, 34, 44, 10, 14, 12, 10, 16, 42]);
  return sheet;
};

const buildCarryoverPaidSheet = (lines: CommissionProcessedLine[]): WorkSheet => {
  const rows: Array<Array<string | number>> = [
    ['Periodo Origen', 'Documento', 'Fecha Origen', 'Vendedor', 'Cliente', 'Producto', 'Neto', 'Clase', 'Tasa Original %', 'Comisión CLP', 'Observación'],
    ...lines.map((line) => [
      line.originPeriodKey || '',
      line.documentNumber,
      formatDate(line.saleDate),
      line.salesRep,
      line.clientName || line.clientCode,
      line.productDescription || line.productCode,
      line.netAmountCLP,
      line.productClass,
      line.ratePercent,
      '',
      rowObservation(line),
    ]),
  ];

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  for (let rowIndex = 2; rowIndex <= lines.length + 1; rowIndex += 1) {
    sheet[`J${rowIndex}`] = { t: 'n', f: `G${rowIndex}*I${rowIndex}/100` };
  }
  setColumns(sheet, [16, 14, 12, 22, 34, 44, 14, 12, 14, 16, 42]);
  return sheet;
};

const buildUnpaidSheet = (result: CommissionClosureProcessingResult): WorkSheet => {
  const companyDefinition = COMMISSION_COMPANY_DEFINITIONS[result.companyKey];
  const rows: Array<Array<string | number>> = [
    ['Empresa', 'Periodo Origen', 'Nombre Doc', 'Numero Documento', 'Codigo Cliente', 'Nombre Cliente', 'Nombre del Vendedor', 'Fecha', 'Cod. Producto', 'Desc. Producto', 'Cantidad', 'Total Neto Linea', 'Clase Comision', 'Tasa Comision %', 'Origen Arrastre', 'Estado', 'Observacion'],
    ...result.unpaidLines.map((line) => [
      companyDefinition.companyLabel,
      line.originPeriodKey || result.periodKey,
      line.documentType,
      line.documentNumber,
      line.clientCode,
      line.clientName,
      line.salesRep,
      formatDate(line.saleDate),
      line.productCode,
      line.productDescription,
      line.quantity,
      line.netAmountCLP,
      line.productClass,
      line.ratePercent,
      line.originType,
      'PENDIENTE',
      rowObservation(line),
    ]),
  ];

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  setColumns(sheet, [12, 14, 24, 16, 16, 32, 24, 12, 18, 42, 10, 16, 16, 14, 18, 14, 42]);
  return sheet;
};

const buildExcludedSheet = (lines: CommissionProcessedLine[]): WorkSheet => {
  const rows: Array<Array<string | number>> = [
    ['Documento', 'Fecha', 'Vendedor', 'Cliente', 'SKU', 'Producto', 'Cantidad', 'Neto', 'Motivo Exclusión', 'Observación'],
    ...lines.map((line) => [
      line.documentNumber,
      formatDate(line.saleDate),
      line.salesRep,
      line.clientName || line.clientCode,
      line.productCode,
      line.productDescription,
      line.quantity,
      line.netAmountCLP,
      line.exclusionReason || '',
      rowObservation(line),
    ]),
  ];

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  setColumns(sheet, [14, 12, 22, 34, 16, 42, 10, 14, 28, 42]);
  return sheet;
};

const buildMegagenSummarySheet = (result: CommissionClosureProcessingResult): WorkSheet => {
  const rows: Array<Array<string | number>> = [['Resumen Comisiones MegaGen'], ['']];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const sellers = result.sellerSummaries.map((summary) => summary.salesRep);
  let row = 3;

  if (!sellers.length) {
    sheet[`A${row}`] = { t: 's', v: 'No hay vendedores con comisión en este cierre.' };
    setColumns(sheet, [34, 18]);
    return sheet;
  }

  sellers.forEach((seller) => {
    sheet[`A${row}`] = { t: 's', v: seller };
    sheet[`A${row + 1}`] = { t: 's', v: 'Ventas cobradas mes' };
    sheet[`B${row + 1}`] = { t: 'n', f: `SUMIFS(${quoteSheetName('Ventas_Cobradas_Mes')}!$G:$G,${quoteSheetName('Ventas_Cobradas_Mes')}!$C:$C,$A$${row},${quoteSheetName('Ventas_Cobradas_Mes')}!$G:$G,\">0\")` };
    sheet[`A${row + 2}`] = { t: 's', v: 'Arrastres cobrados' };
    sheet[`B${row + 2}`] = { t: 'n', f: `SUMIFS(${quoteSheetName('Arrastres_Cobrados')}!$G:$G,${quoteSheetName('Arrastres_Cobrados')}!$D:$D,$A$${row},${quoteSheetName('Arrastres_Cobrados')}!$G:$G,\">0\")` };
    sheet[`A${row + 3}`] = { t: 's', v: 'Descuentos por notas/créditos' };
    sheet[`B${row + 3}`] = { t: 'n', f: `SUMIFS(${quoteSheetName('Ventas_Cobradas_Mes')}!$G:$G,${quoteSheetName('Ventas_Cobradas_Mes')}!$C:$C,$A$${row},${quoteSheetName('Ventas_Cobradas_Mes')}!$G:$G,\"<0\")+SUMIFS(${quoteSheetName('Arrastres_Cobrados')}!$G:$G,${quoteSheetName('Arrastres_Cobrados')}!$D:$D,$A$${row},${quoteSheetName('Arrastres_Cobrados')}!$G:$G,\"<0\")` };
    sheet[`A${row + 4}`] = { t: 's', v: 'Base comisionable total' };
    sheet[`B${row + 4}`] = { t: 'n', f: `SUM(B${row + 1}:B${row + 3})` };
    sheet[`A${row + 5}`] = { t: 's', v: 'Tasa MegaGen (%)' };
    sheet[`B${row + 5}`] = { t: 'n', f: `${quoteSheetName('Configuracion')}!$B$8` };
    sheet[`A${row + 6}`] = { t: 's', v: 'Comisión total a pagar' };
    sheet[`B${row + 6}`] = { t: 'n', f: `SUMIFS(${quoteSheetName('Ventas_Cobradas_Mes')}!$J:$J,${quoteSheetName('Ventas_Cobradas_Mes')}!$C:$C,$A$${row})+SUMIFS(${quoteSheetName('Arrastres_Cobrados')}!$J:$J,${quoteSheetName('Arrastres_Cobrados')}!$D:$D,$A$${row})` };
    row += 8;
  });

  setColumns(sheet, [34, 18]);
  return sheet;
};

const build3DentalSummarySheet = (result: CommissionClosureProcessingResult): WorkSheet => {
  const rows: Array<Array<string | number>> = [['Resumen Comisiones 3Dental'], ['']];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const sellers = result.sellerSummaries.map((summary) => summary.salesRep);
  let row = 3;

  if (!sellers.length) {
    sheet[`A${row}`] = { t: 's', v: 'No hay vendedores con comisión en este cierre.' };
    setColumns(sheet, [34, 18]);
    return sheet;
  }

  sellers.forEach((seller) => {
    sheet[`A${row}`] = { t: 's', v: seller };
    sheet[`A${row + 1}`] = { t: 's', v: 'Implantes cobrados mes' };
    sheet[`B${row + 1}`] = { t: 'n', f: `SUMIFS(${quoteSheetName('Ventas_Cobradas_Mes')}!$G:$G,${quoteSheetName('Ventas_Cobradas_Mes')}!$C:$C,$A$${row},${quoteSheetName('Ventas_Cobradas_Mes')}!$H:$H,\"IMPLANTES\",${quoteSheetName('Ventas_Cobradas_Mes')}!$G:$G,\">0\")` };
    sheet[`A${row + 2}`] = { t: 's', v: 'Implantes arrastres cobrados' };
    sheet[`B${row + 2}`] = { t: 'n', f: `SUMIFS(${quoteSheetName('Arrastres_Cobrados')}!$G:$G,${quoteSheetName('Arrastres_Cobrados')}!$D:$D,$A$${row},${quoteSheetName('Arrastres_Cobrados')}!$H:$H,\"IMPLANTES\",${quoteSheetName('Arrastres_Cobrados')}!$G:$G,\">0\")` };
    sheet[`A${row + 3}`] = { t: 's', v: 'Implantes descuentos' };
    sheet[`B${row + 3}`] = { t: 'n', f: `SUMIFS(${quoteSheetName('Ventas_Cobradas_Mes')}!$G:$G,${quoteSheetName('Ventas_Cobradas_Mes')}!$C:$C,$A$${row},${quoteSheetName('Ventas_Cobradas_Mes')}!$H:$H,\"IMPLANTES\",${quoteSheetName('Ventas_Cobradas_Mes')}!$G:$G,\"<0\")+SUMIFS(${quoteSheetName('Arrastres_Cobrados')}!$G:$G,${quoteSheetName('Arrastres_Cobrados')}!$D:$D,$A$${row},${quoteSheetName('Arrastres_Cobrados')}!$H:$H,\"IMPLANTES\",${quoteSheetName('Arrastres_Cobrados')}!$G:$G,\"<0\")` };
    sheet[`A${row + 4}`] = { t: 's', v: 'Base Implantes' };
    sheet[`B${row + 4}`] = { t: 'n', f: `SUM(B${row + 1}:B${row + 3})` };
    sheet[`A${row + 5}`] = { t: 's', v: 'Tasa Implantes (%)' };
    sheet[`B${row + 5}`] = { t: 'n', f: `${quoteSheetName('Configuracion')}!$B$9` };
    sheet[`A${row + 6}`] = { t: 's', v: 'Comisión Implantes' };
    sheet[`B${row + 6}`] = { t: 'n', f: `SUMIFS(${quoteSheetName('Ventas_Cobradas_Mes')}!$J:$J,${quoteSheetName('Ventas_Cobradas_Mes')}!$C:$C,$A$${row},${quoteSheetName('Ventas_Cobradas_Mes')}!$H:$H,\"IMPLANTES\")+SUMIFS(${quoteSheetName('Arrastres_Cobrados')}!$J:$J,${quoteSheetName('Arrastres_Cobrados')}!$D:$D,$A$${row},${quoteSheetName('Arrastres_Cobrados')}!$H:$H,\"IMPLANTES\")` };
    sheet[`A${row + 7}`] = { t: 's', v: '3Dental cobrado mes' };
    sheet[`B${row + 7}`] = { t: 'n', f: `SUMIFS(${quoteSheetName('Ventas_Cobradas_Mes')}!$G:$G,${quoteSheetName('Ventas_Cobradas_Mes')}!$C:$C,$A$${row},${quoteSheetName('Ventas_Cobradas_Mes')}!$H:$H,\"3DENTAL\",${quoteSheetName('Ventas_Cobradas_Mes')}!$G:$G,\">0\")` };
    sheet[`A${row + 8}`] = { t: 's', v: '3Dental arrastres cobrados' };
    sheet[`B${row + 8}`] = { t: 'n', f: `SUMIFS(${quoteSheetName('Arrastres_Cobrados')}!$G:$G,${quoteSheetName('Arrastres_Cobrados')}!$D:$D,$A$${row},${quoteSheetName('Arrastres_Cobrados')}!$H:$H,\"3DENTAL\",${quoteSheetName('Arrastres_Cobrados')}!$G:$G,\">0\")` };
    sheet[`A${row + 9}`] = { t: 's', v: '3Dental descuentos' };
    sheet[`B${row + 9}`] = { t: 'n', f: `SUMIFS(${quoteSheetName('Ventas_Cobradas_Mes')}!$G:$G,${quoteSheetName('Ventas_Cobradas_Mes')}!$C:$C,$A$${row},${quoteSheetName('Ventas_Cobradas_Mes')}!$H:$H,\"3DENTAL\",${quoteSheetName('Ventas_Cobradas_Mes')}!$G:$G,\"<0\")+SUMIFS(${quoteSheetName('Arrastres_Cobrados')}!$G:$G,${quoteSheetName('Arrastres_Cobrados')}!$D:$D,$A$${row},${quoteSheetName('Arrastres_Cobrados')}!$H:$H,\"3DENTAL\",${quoteSheetName('Arrastres_Cobrados')}!$G:$G,\"<0\")` };
    sheet[`A${row + 10}`] = { t: 's', v: 'Base 3Dental' };
    sheet[`B${row + 10}`] = { t: 'n', f: `SUM(B${row + 7}:B${row + 9})` };
    sheet[`A${row + 11}`] = { t: 's', v: 'Tasa 3Dental (%)' };
    sheet[`B${row + 11}`] = { t: 'n', f: `${quoteSheetName('Configuracion')}!$B$10` };
    sheet[`A${row + 12}`] = { t: 's', v: 'Comisión 3Dental' };
    sheet[`B${row + 12}`] = { t: 'n', f: `SUMIFS(${quoteSheetName('Ventas_Cobradas_Mes')}!$J:$J,${quoteSheetName('Ventas_Cobradas_Mes')}!$C:$C,$A$${row},${quoteSheetName('Ventas_Cobradas_Mes')}!$H:$H,\"3DENTAL\")+SUMIFS(${quoteSheetName('Arrastres_Cobrados')}!$J:$J,${quoteSheetName('Arrastres_Cobrados')}!$D:$D,$A$${row},${quoteSheetName('Arrastres_Cobrados')}!$H:$H,\"3DENTAL\")` };
    sheet[`A${row + 13}`] = { t: 's', v: 'Total comisión vendedor' };
    sheet[`B${row + 13}`] = { t: 'n', f: `SUM(B${row + 6},B${row + 12})` };
    row += 15;
  });

  setColumns(sheet, [34, 18]);
  return sheet;
};

export const buildCommissionWorkbook = (
  result: CommissionClosureProcessingResult,
): CommissionWorkbookBuildResult => {
  const workbook = XLSX.utils.book_new();
  const companyDefinition = COMMISSION_COMPANY_DEFINITIONS[result.companyKey];

  XLSX.utils.book_append_sheet(workbook, buildConfigurationSheet(result), 'Configuracion');
  XLSX.utils.book_append_sheet(
    workbook,
    result.companyKey === 'megagen' ? buildMegagenSummarySheet(result) : build3DentalSummarySheet(result),
    'Resumen_Comisiones',
  );
  XLSX.utils.book_append_sheet(workbook, buildCurrentPaidSheet(result.currentPaidLines), 'Ventas_Cobradas_Mes');
  XLSX.utils.book_append_sheet(workbook, buildCarryoverPaidSheet(result.carryoverPaidLines), 'Arrastres_Cobrados');
  XLSX.utils.book_append_sheet(workbook, buildUnpaidSheet(result), 'No_Cobradas_Vigentes');

  if (result.excludedLines.length) {
    XLSX.utils.book_append_sheet(workbook, buildExcludedSheet(result.excludedLines), 'Excluidas');
  }

  ensureWorkbookRecalculation(workbook);

  return {
    workbook,
    downloadFileName: `comisiones-${companyDefinition.companyLabel.toLowerCase()}-${result.periodKey}.xlsx`,
  };
};
