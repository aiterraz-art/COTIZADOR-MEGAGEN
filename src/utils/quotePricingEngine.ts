import type {
  CalculatedQuoteLine,
  QuoteCalculationResult,
  QuoteLineDraft,
  QuotePricingConfig,
} from '../types/quotation';

interface CalculateQuoteInput {
  exchangeRate: number;
  lines: QuoteLineDraft[];
  pricingConfig: QuotePricingConfig;
}

const IVA_RATE = 0.19;
const MAX_MARGIN_RATIO = 0.99;

const roundCurrency = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
};

const safeMarginRatio = (marginPercent: number) => {
  return Math.min(MAX_MARGIN_RATIO, Math.max(-500, marginPercent) / 100);
};

const toBaseLine = (line: QuoteLineDraft, exchangeRate: number): CalculatedQuoteLine => {
  const quantity = Math.max(0, line.quantity || 0);
  const costUnitCLP = roundCurrency(Math.max(0, line.costUSD || 0) * Math.max(0, exchangeRate || 0));
  const costTotalCLP = roundCurrency(costUnitCLP * quantity);

  return {
    ...line,
    quantity,
    costUnitCLP,
    costTotalCLP,
    netUnitCLP: costUnitCLP,
    netTotalCLP: costTotalCLP,
    profitUnitCLP: 0,
    profitTotalCLP: 0,
    marginPercent: 0,
    effectiveMode: 'at_cost',
    locked: Boolean(line.locked),
  };
};

const finalizeLine = (line: CalculatedQuoteLine, netTotalCLP: number, effectiveMode: CalculatedQuoteLine['effectiveMode']): CalculatedQuoteLine => {
  const normalizedNetTotal = roundCurrency(Math.max(0, netTotalCLP));
  const quantity = Math.max(0, line.quantity);
  const netUnitCLP = quantity > 0 ? roundCurrency(normalizedNetTotal / quantity) : 0;
  const profitTotalCLP = roundCurrency(normalizedNetTotal - line.costTotalCLP);
  const profitUnitCLP = quantity > 0 ? roundCurrency(profitTotalCLP / quantity) : 0;
  const marginPercent = normalizedNetTotal > 0 ? (profitTotalCLP / normalizedNetTotal) * 100 : 0;

  return {
    ...line,
    netUnitCLP,
    netTotalCLP: normalizedNetTotal,
    profitUnitCLP,
    profitTotalCLP,
    marginPercent,
    effectiveMode,
  };
};

const resolveExplicitLine = (line: CalculatedQuoteLine): CalculatedQuoteLine | null => {
  const value = Number(line.value ?? 0);

  switch (line.pricingMode) {
    case 'fixed_net_unit':
    case 'manual_net_unit':
      return finalizeLine(line, value * line.quantity, line.pricingMode);
    case 'fixed_net_total':
      return finalizeLine(line, value, line.pricingMode);
    case 'fixed_profit_unit':
      return finalizeLine(line, line.costTotalCLP + (value * line.quantity), line.pricingMode);
    case 'fixed_profit_total':
      return finalizeLine(line, line.costTotalCLP + value, line.pricingMode);
    case 'fixed_margin_percent': {
      const ratio = safeMarginRatio(value);
      const divisor = 1 - ratio;
      return finalizeLine(line, divisor <= 0 ? line.costTotalCLP : line.costTotalCLP / divisor, line.pricingMode);
    }
    case 'at_cost':
      return finalizeLine(line, line.costTotalCLP, 'at_cost');
    default:
      return null;
  }
};

const deriveGlobalTargetNet = (
  pricingConfig: QuotePricingConfig,
  adjustableCostCLP: number,
  resolvedNetCLP: number,
) => {
  if (pricingConfig.mode === 'global_margin') {
    const ratio = safeMarginRatio(pricingConfig.targetMarginPercent ?? 50);
    const divisor = 1 - ratio;
    const adjustableNet = divisor <= 0 ? adjustableCostCLP : adjustableCostCLP / divisor;
    return roundCurrency(resolvedNetCLP + adjustableNet);
  }

  if (pricingConfig.mode === 'global_net' || pricingConfig.mode === 'legacy_global_net') {
    return roundCurrency(pricingConfig.targetNetTotalCLP ?? resolvedNetCLP + adjustableCostCLP);
  }

  if (pricingConfig.mode === 'at_cost') {
    return roundCurrency(resolvedNetCLP + adjustableCostCLP);
  }

  return roundCurrency(resolvedNetCLP);
};

export const calculateQuote = ({ exchangeRate, lines, pricingConfig }: CalculateQuoteInput): QuoteCalculationResult => {
  const warnings: string[] = [];
  const baseLines = lines.map((line) => toBaseLine(line, exchangeRate));

  const resolvedMap = new Map<string, CalculatedQuoteLine>();
  const adjustableLines: CalculatedQuoteLine[] = [];

  for (const line of baseLines) {
    const explicitLine = resolveExplicitLine(line);
    if (explicitLine) {
      resolvedMap.set(line.productId, explicitLine);
      continue;
    }

    if (line.locked) {
      resolvedMap.set(line.productId, finalizeLine(line, line.costTotalCLP, 'at_cost'));
      continue;
    }

    if (pricingConfig.mode === 'manual_lines') {
      resolvedMap.set(line.productId, finalizeLine(line, line.costTotalCLP, 'at_cost'));
      continue;
    }

    adjustableLines.push(line);
  }

  const resolvedNetCLP = Array.from(resolvedMap.values()).reduce((acc, line) => acc + line.netTotalCLP, 0);
  const adjustableCostCLP = adjustableLines.reduce((acc, line) => acc + line.costTotalCLP, 0);
  const targetNetCLP = deriveGlobalTargetNet(pricingConfig, adjustableCostCLP, resolvedNetCLP);
  const remainingNetCLP = targetNetCLP - resolvedNetCLP;

  if ((pricingConfig.mode === 'global_net' || pricingConfig.mode === 'legacy_global_net') && targetNetCLP < baseLines.reduce((acc, line) => acc + line.costTotalCLP, 0)) {
    warnings.push('El total fijado es menor al costo total.');
  }

  if (adjustableLines.length === 0 && (pricingConfig.mode === 'global_margin' || pricingConfig.mode === 'global_net' || pricingConfig.mode === 'legacy_global_net')) {
    const unresolvedAmountCLP = roundCurrency(remainingNetCLP);
    if (Math.abs(unresolvedAmountCLP) > 0) {
      warnings.push('No hay lineas ajustables para cumplir el objetivo global.');
    }
  }

  if (adjustableLines.length > 0) {
    const baseForDistribution = adjustableCostCLP > 0 ? adjustableCostCLP : adjustableLines.length;
    for (const line of adjustableLines) {
      const weight = adjustableCostCLP > 0 ? line.costTotalCLP / baseForDistribution : 1 / adjustableLines.length;
      const assignedNet = roundCurrency(remainingNetCLP * weight);
      const effectiveMode = pricingConfig.mode === 'global_net' || pricingConfig.mode === 'legacy_global_net'
        ? 'global_net'
        : pricingConfig.mode === 'global_margin'
          ? 'global_margin'
          : 'at_cost';
      resolvedMap.set(line.productId, finalizeLine(line, assignedNet, effectiveMode));
    }

    const assignedTotal = adjustableLines.reduce((acc, line) => acc + (resolvedMap.get(line.productId)?.netTotalCLP ?? 0), 0);
    const distributionDiff = roundCurrency(remainingNetCLP - assignedTotal);
    if (distributionDiff !== 0) {
      const lastLine = adjustableLines[adjustableLines.length - 1];
      const current = resolvedMap.get(lastLine.productId);
      if (current) {
        resolvedMap.set(lastLine.productId, finalizeLine(current, current.netTotalCLP + distributionDiff, current.effectiveMode));
      }
    }
  }

  const calculatedLines = baseLines.map((line) => resolvedMap.get(line.productId) ?? finalizeLine(line, line.costTotalCLP, 'at_cost'));
  const totalCostCLP = calculatedLines.reduce((acc, line) => acc + line.costTotalCLP, 0);
  const totalNetCLP = calculatedLines.reduce((acc, line) => acc + line.netTotalCLP, 0);
  const totalProfitCLP = calculatedLines.reduce((acc, line) => acc + line.profitTotalCLP, 0);
  const totalMarginPercent = totalNetCLP > 0 ? (totalProfitCLP / totalNetCLP) * 100 : 0;
  const unresolvedAmountCLP = roundCurrency(targetNetCLP - totalNetCLP);

  if (unresolvedAmountCLP !== 0 && (pricingConfig.mode === 'global_net' || pricingConfig.mode === 'legacy_global_net')) {
    warnings.push(unresolvedAmountCLP > 0 ? 'La promocion quedo subasignada.' : 'La promocion quedo sobreasignada.');
  }

  if (calculatedLines.some((line) => line.marginPercent < 0)) {
    warnings.push('La linea tiene margen negativo.');
  }

  return {
    lines: calculatedLines,
    totalCostCLP,
    totalNetCLP,
    totalIvaCLP: roundCurrency(totalNetCLP * IVA_RATE),
    totalWithIvaCLP: roundCurrency(totalNetCLP * (1 + IVA_RATE)),
    totalProfitCLP,
    totalMarginPercent,
    unresolvedAmountCLP,
    warnings: Array.from(new Set(warnings)),
  };
};
