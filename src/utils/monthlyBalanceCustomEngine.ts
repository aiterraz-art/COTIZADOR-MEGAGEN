import { MONTHLY_BALANCE_TARGET_ROWS } from '../data/monthlyBalanceDefinitions';
import { MONTHLY_BALANCE_SOURCE_NET_INCOME_CONTROL_CODE } from '../types/monthlyAnalysis';
import type {
  MonthlyBalanceCustomMappingResult,
  MonthlyBalanceLine,
  MonthlyBalanceMappedLine,
  MonthlyBalanceMappedSource,
  MonthlyBalanceMappingTotals,
  MonthlyBalanceSourceRow,
  MonthlyPnlCustomMappingResult,
} from '../types/monthlyAnalysis';
import {
  findMonthlyBalanceExpectedSourceAccount,
  findMonthlyBalanceSourceMapping,
} from './monthlyBalanceMapping';

interface BuildMonthlyBalanceCustomMappingOptions {
  customPnl?: MonthlyPnlCustomMappingResult | null;
  fallbackNetIncomeCLP?: number | null;
}

const toSourceRows = (lines: MonthlyBalanceLine[]): MonthlyBalanceSourceRow[] => lines.map((line) => ({
  lineOrder: line.lineOrder,
  accountCode: line.accountCode,
  accountName: line.accountName,
  amountCLP: line.amountCLP,
  sourceSectionLabel: line.subsection || line.section,
  isSubtotal: line.isSubtotal,
}));

const createMappedLineIndex = (): Map<string, MonthlyBalanceMappedLine> => {
  const mappedLines = new Map<string, MonthlyBalanceMappedLine>();

  for (const row of MONTHLY_BALANCE_TARGET_ROWS) {
    mappedLines.set(row.key, {
      targetKey: row.key,
      targetLabel: row.label,
      sectionKey: row.sectionKey,
      amountCLP: 0,
      kind: row.kind,
      level: row.level,
      parentKey: row.parentKey,
      sources: [],
      notes: row.notes,
    });
  }

  return mappedLines;
};

const normalizeTargetAmount = (
  _targetKey: string,
  amountCLP: number,
): number => amountCLP;

const resolveNetIncomeCLP = (
  customPnl: MonthlyPnlCustomMappingResult | null | undefined,
  fallbackNetIncomeCLP: number | null | undefined,
): { value: number; warnings: string[] } => {
  if (customPnl && !customPnl.errors.length) {
    const netIncomeLine = customPnl.mappedLines.find((line) => line.targetKey === 'net_profit_loss');
    if (netIncomeLine) {
      return {
        value: netIncomeLine.amountCLP,
        warnings: [],
      };
    }
  }

  if (typeof fallbackNetIncomeCLP === 'number' && Number.isFinite(fallbackNetIncomeCLP)) {
    return {
      value: fallbackNetIncomeCLP,
      warnings: [],
    };
  }

  return {
    value: 0,
    warnings: ['No fue posible derivar Net Income desde el ER; se usó 0.'],
  };
};

const recalculateComputedLines = (
  mappedLineIndex: Map<string, MonthlyBalanceMappedLine>,
  netIncomeCLP: number,
): MonthlyBalanceMappingTotals => {
  const netIncomeLine = mappedLineIndex.get('net_income');
  if (netIncomeLine) {
    netIncomeLine.amountCLP = netIncomeCLP;
    netIncomeLine.notes = netIncomeLine.notes?.length
      ? netIncomeLine.notes
      : ['Derivado desde el ER mensual cuando exista.'];
  }

  for (const definition of MONTHLY_BALANCE_TARGET_ROWS) {
    const current = mappedLineIndex.get(definition.key);
    if (!current || definition.kind === 'detail') continue;

    if (definition.kind === 'header') {
      current.amountCLP = 0;
      continue;
    }

    current.amountCLP = (definition.sumOf ?? []).reduce((acc, key) => acc + (mappedLineIndex.get(key)?.amountCLP ?? 0), 0);
  }

  return {
    totalAssetsCLP: mappedLineIndex.get('total_assets')?.amountCLP ?? 0,
    totalLiabilitiesCLP: mappedLineIndex.get('total_liabilities')?.amountCLP ?? 0,
    totalEquityCLP: mappedLineIndex.get('total_equity')?.amountCLP ?? 0,
    totalLiabilitiesAndEquityCLP: mappedLineIndex.get('total_liabilities_and_equity')?.amountCLP ?? 0,
  };
};

export const buildMonthlyBalanceCustomMapping = (
  lines: MonthlyBalanceLine[],
  options?: BuildMonthlyBalanceCustomMappingOptions,
): MonthlyBalanceCustomMappingResult => {
  const sourceRows = toSourceRows(lines);
  const sourceNetIncomeControlRow = sourceRows.find((row) => row.accountCode === MONTHLY_BALANCE_SOURCE_NET_INCOME_CONTROL_CODE) ?? null;
  const balanceSourceRows = sourceRows.filter((row) => row.accountCode !== MONTHLY_BALANCE_SOURCE_NET_INCOME_CONTROL_CODE);
  const mappedLineIndex = createMappedLineIndex();
  const unmappedSourceLines: MonthlyBalanceSourceRow[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const warningSet = new Set<string>();

  for (const row of balanceSourceRows) {
    const mapping = findMonthlyBalanceSourceMapping(row);

    if (!mapping) {
      const expectedAccount = findMonthlyBalanceExpectedSourceAccount(row);
      if (expectedAccount?.ignore) {
        if (expectedAccount.warnIfNonZero && row.amountCLP !== 0 && !warningSet.has(expectedAccount.warnIfNonZero)) {
          warnings.push(expectedAccount.warnIfNonZero);
          warningSet.add(expectedAccount.warnIfNonZero);
        }
        continue;
      }

      if (!row.isSubtotal) {
        unmappedSourceLines.push(row);
      }
      continue;
    }

    const targetLine = mappedLineIndex.get(mapping.targetKey);
    if (!targetLine) {
      if (!row.isSubtotal) {
        unmappedSourceLines.push(row);
      }
      continue;
    }

    const source: MonthlyBalanceMappedSource = {
      lineOrder: row.lineOrder,
      accountCode: row.accountCode,
      accountName: row.accountName,
      amountCLP: row.amountCLP,
      sourceSectionLabel: row.sourceSectionLabel,
    };

    targetLine.amountCLP += normalizeTargetAmount(mapping.targetKey, row.amountCLP);
    targetLine.sources = [...targetLine.sources, source];
  }

  if (unmappedSourceLines.length) {
    warnings.push('Hay cuentas nuevas en el Balance que aún no tienen regla de tratamiento.');
  }

  const resolvedNetIncome = resolveNetIncomeCLP(options?.customPnl, options?.fallbackNetIncomeCLP);
  warnings.push(...resolvedNetIncome.warnings);

  const totals = recalculateComputedLines(mappedLineIndex, resolvedNetIncome.value);
  const balanceDifferenceCLP = totals.totalAssetsCLP - totals.totalLiabilitiesAndEquityCLP;
  const sourceNetIncomeControlCLP = sourceNetIncomeControlRow?.amountCLP ?? null;
  const netIncomeDifferenceCLP = sourceNetIncomeControlCLP === null
    ? null
    : resolvedNetIncome.value - sourceNetIncomeControlCLP;

  if (netIncomeDifferenceCLP !== null && netIncomeDifferenceCLP !== 0) {
    warnings.push(`El Net Income del ER difiere del Resultado del balance por ${netIncomeDifferenceCLP.toFixed(0)}.`);
  }

  if (balanceDifferenceCLP !== 0) {
    warnings.push(`El balance no cuadra: TOTAL ASSETS difiere de TOTAL LIABILITIES & EQUITY por ${balanceDifferenceCLP.toFixed(0)}.`);
  }

  return {
    mappedLines: MONTHLY_BALANCE_TARGET_ROWS.map((row) => mappedLineIndex.get(row.key)!).filter(Boolean),
    sourceRows: balanceSourceRows,
    unmappedSourceLines: unmappedSourceLines.sort((left, right) => left.lineOrder - right.lineOrder),
    totals,
    warnings,
    errors,
    balanceDifferenceCLP,
    sourceNetIncomeControlCLP,
    netIncomeDifferenceCLP,
  };
};
