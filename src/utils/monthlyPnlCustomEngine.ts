import {
  MONTHLY_PNL_TARGET_ACCOUNTS,
  MONTHLY_PNL_TARGET_SECTIONS,
} from '../data/monthlyPnlDefinitions';
import type {
  MonthlyManualInputs,
  MonthlyPnlCustomMappingResult,
  MonthlyPnlLine,
  MonthlyPnlMappedLine,
  MonthlyPnlMappedSource,
  MonthlyPnlMappingTotals,
  MonthlyPnlSourceRow,
} from '../types/monthlyAnalysis';
import { findMonthlyPnlSourceMapping } from './monthlyPnlMapping';

const asPositiveMagnitude = (value: number): number => (value < 0 ? Math.abs(value) : value);

const createEmptyManualInputs = (): MonthlyManualInputs => ({
  adminSalaryManualCLP: null,
});

const toSourceRows = (lines: MonthlyPnlLine[]): MonthlyPnlSourceRow[] => lines.map((line) => ({
  lineOrder: line.lineOrder,
  accountCode: line.accountCode,
  accountName: line.accountName,
  amountCLP: line.amountCLP,
  sourceSectionLabel: line.subsection || line.section,
  isSubtotal: line.isSubtotal,
}));

const createMappedLineIndex = (): Map<string, MonthlyPnlMappedLine> => {
  const lines = new Map<string, MonthlyPnlMappedLine>();

  for (const section of MONTHLY_PNL_TARGET_SECTIONS) {
    for (const account of section.accounts) {
      lines.set(account.key, {
        targetKey: account.key,
        targetLabel: account.label,
        sectionKey: section.key,
        amountCLP: 0,
        kind: account.kind,
        sources: [],
        notes: account.notes,
      });
    }
  }

  return lines;
};

const appendSource = (
  target: MonthlyPnlMappedLine,
  source: MonthlyPnlMappedSource,
): void => {
  target.sources = [...target.sources, source];
};

const assignAmount = (
  target: MonthlyPnlMappedLine,
  amountCLP: number,
  source: MonthlyPnlMappedSource,
): void => {
  target.amountCLP += amountCLP;
  appendSource(target, source);
};

const summarizeSources = (
  rows: MonthlyPnlSourceRow[],
  amountCLP: number,
): MonthlyPnlMappedSource[] => {
  if (!rows.length) return [];
  if (rows.length === 1) {
    const [row] = rows;
    return [{
      lineOrder: row.lineOrder,
      accountCode: row.accountCode,
      accountName: row.accountName,
      amountCLP,
      sourceSectionLabel: row.sourceSectionLabel,
    }];
  }

  return [{
    lineOrder: rows[0].lineOrder,
    accountCode: rows.every((row) => row.accountCode === rows[0].accountCode) ? rows[0].accountCode : '',
    accountName: rows.every((row) => row.accountName === rows[0].accountName) ? rows[0].accountName : 'REMUNERACIONES',
    amountCLP,
    sourceSectionLabel: rows[0].sourceSectionLabel,
  }];
};

const recalculateSubtotals = (
  mappedLines: Map<string, MonthlyPnlMappedLine>,
): MonthlyPnlMappingTotals => {
  const totalCostOfSalesCLP = MONTHLY_PNL_TARGET_SECTIONS
    .find((section) => section.key === 'COST_OF_SALES')
    ?.accounts
    .reduce((acc, account) => acc + (mappedLines.get(account.key)?.amountCLP ?? 0), 0) ?? 0;

  const totalSgaCLP = MONTHLY_PNL_TARGET_SECTIONS
    .find((section) => section.key === 'SGA')
    ?.accounts
    .reduce((acc, account) => acc + (mappedLines.get(account.key)?.amountCLP ?? 0), 0) ?? 0;

  const totalNonOperatingIncomeCLP = MONTHLY_PNL_TARGET_SECTIONS
    .find((section) => section.key === 'NON_OPERATING_INCOME')
    ?.accounts
    .reduce((acc, account) => acc + (mappedLines.get(account.key)?.amountCLP ?? 0), 0) ?? 0;

  const totalNonOperatingExpensesCLP = MONTHLY_PNL_TARGET_SECTIONS
    .find((section) => section.key === 'NON_OPERATING_EXPENSES')
    ?.accounts
    .reduce((acc, account) => acc + (mappedLines.get(account.key)?.amountCLP ?? 0), 0) ?? 0;

  const revenueMerchandise = mappedLines.get('revenue_merchandise')?.amountCLP ?? 0;
  const otherRevenue = mappedLines.get('other_revenue')?.amountCLP ?? 0;
  const grossProfit = revenueMerchandise + otherRevenue - totalCostOfSalesCLP;
  const operatingIncome = grossProfit - totalSgaCLP;
  const incomeTaxExpense = mappedLines.get('income_tax_expense')?.amountCLP ?? 0;
  const profitBeforeTax = operatingIncome + totalNonOperatingIncomeCLP - totalNonOperatingExpensesCLP;
  const netProfit = profitBeforeTax - incomeTaxExpense;

  const grossProfitLine = mappedLines.get('gross_profit');
  if (grossProfitLine) grossProfitLine.amountCLP = grossProfit;

  const operatingIncomeLine = mappedLines.get('operating_income_loss');
  if (operatingIncomeLine) operatingIncomeLine.amountCLP = operatingIncome;

  const profitBeforeTaxLine = mappedLines.get('profit_before_income_tax');
  if (profitBeforeTaxLine) profitBeforeTaxLine.amountCLP = profitBeforeTax;

  const netProfitLine = mappedLines.get('net_profit_loss');
  if (netProfitLine) netProfitLine.amountCLP = netProfit;

  return {
    totalCostOfSalesCLP,
    totalSgaCLP,
    totalNonOperatingIncomeCLP,
    totalNonOperatingExpensesCLP,
  };
};

export const buildMonthlyPnlCustomMapping = (
  lines: MonthlyPnlLine[],
  manualInputs: MonthlyManualInputs = createEmptyManualInputs(),
): MonthlyPnlCustomMappingResult => {
  const sourceRows = toSourceRows(lines);
  const mappedLines = createMappedLineIndex();
  const warnings: string[] = [];
  const errors: string[] = [];
  const unmappedSourceLines: MonthlyPnlSourceRow[] = [];
  const remunerationRows: MonthlyPnlSourceRow[] = [];

  for (const row of sourceRows) {
    const mapping = findMonthlyPnlSourceMapping(row);

    if (!mapping) {
      if (!row.isSubtotal) {
        unmappedSourceLines.push(row);
      }
      continue;
    }

    if (mapping.targetKey === 'salaries_split') {
      remunerationRows.push(row);
      continue;
    }

    const target = mappedLines.get(mapping.targetKey);
    if (!target) {
      if (!row.isSubtotal) {
        unmappedSourceLines.push(row);
      }
      continue;
    }

    const source: MonthlyPnlMappedSource = {
      lineOrder: row.lineOrder,
      accountCode: row.accountCode,
      accountName: row.accountName,
      amountCLP: row.amountCLP,
      sourceSectionLabel: row.sourceSectionLabel,
    };

    const isPositiveMagnitudeTarget = target.sectionKey === 'COST_OF_SALES'
      || target.sectionKey === 'SGA'
      || target.sectionKey === 'NON_OPERATING_EXPENSES'
      || target.targetKey === 'income_tax_expense';

    assignAmount(target, isPositiveMagnitudeTarget ? asPositiveMagnitude(row.amountCLP) : row.amountCLP, source);
  }

  if (remunerationRows.length) {
    const remunerationTotalCLP = remunerationRows.reduce((acc, row) => acc + asPositiveMagnitude(row.amountCLP), 0);
    const adminSalaryManualCLP = manualInputs.adminSalaryManualCLP;

    if (adminSalaryManualCLP === null || Number.isNaN(adminSalaryManualCLP)) {
      errors.push('Debes ingresar Salaries (Admin, GM) para repartir REMUNERACIONES.');
    } else if (adminSalaryManualCLP < 0) {
      errors.push('Salaries (Admin, GM) no puede ser negativo.');
    } else if (adminSalaryManualCLP > remunerationTotalCLP) {
      errors.push('Salaries (Admin, GM) no puede ser mayor que REMUNERACIONES.');
    } else {
      const adminTarget = mappedLines.get('salaries_admin_gm');
      const salesRepTarget = mappedLines.get('salaries_sales_rep');
      const salesRepAmountCLP = remunerationTotalCLP - adminSalaryManualCLP;

      if (adminTarget) {
        adminTarget.amountCLP = adminSalaryManualCLP;
        adminTarget.isManual = true;
        adminTarget.sources = summarizeSources(remunerationRows, adminSalaryManualCLP);
      }

      if (salesRepTarget) {
        salesRepTarget.amountCLP = salesRepAmountCLP;
        salesRepTarget.sources = summarizeSources(remunerationRows, salesRepAmountCLP);
      }
    }
  }

  if (unmappedSourceLines.length) {
    errors.push('Hay cuentas nuevas en el ER que aún no tienen regla de tratamiento.');
  }

  const totals = recalculateSubtotals(mappedLines);

  return {
    mappedLines: MONTHLY_PNL_TARGET_ACCOUNTS.map((account) => mappedLines.get(account.key)!).filter(Boolean),
    sourceRows,
    unmappedSourceLines: unmappedSourceLines.sort((left, right) => left.lineOrder - right.lineOrder),
    manualInputs: {
      adminSalaryManualCLP: manualInputs.adminSalaryManualCLP,
    },
    totals,
    warnings,
    errors,
  };
};
