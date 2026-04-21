import type {
  CommissionCarryoverLine,
  CommissionClosureListItem,
  CommissionClosureProcessingResult,
  CommissionClosureRecord,
  CommissionClosureSummary,
  CommissionCompanyConfig,
  CommissionCompanyKey,
  CommissionLineStatus,
  CommissionOriginType,
  CommissionProcessedLine,
  CommissionProductClass,
  CommissionReceivableRow,
  CommissionSalesRawLine,
  CommissionSellerSummary,
} from '../types/commissions';
import { COMMISSION_COMPANY_DEFINITIONS } from '../data/commissionDefaults';
import { normalizeCommissionInvoice, normalizeCommissionText } from './commissionParsers';

export interface ProcessCommissionClosureInput {
  companyKey: CommissionCompanyKey;
  periodKey: string;
  config: CommissionCompanyConfig;
  salesLines: CommissionSalesRawLine[];
  receivableRows: CommissionReceivableRow[];
  carryoverLines: CommissionCarryoverLine[];
  salesFileName: string;
  receivablesFileName: string;
  carryoverFileName?: string;
  usedCarryoverSource: 'manual' | 'saved' | 'none';
  initialWarnings?: string[];
}

const addUnique = (collection: string[], message: string) => {
  if (message && !collection.includes(message)) {
    collection.push(message);
  }
};

const normalizeProductClass = (companyKey: CommissionCompanyKey, rawClass?: string): CommissionProductClass | '' => {
  if (companyKey === 'megagen') return 'MEGAGEN';

  const normalized = normalizeCommissionText(rawClass);
  if (normalized === 'implantes' || normalized === 'implante') return 'IMPLANTES';
  if (normalized === '3dental' || normalized === '3 dental') return '3DENTAL';
  return '';
};

const buildInvoiceKey = (documentNumber: string): string => normalizeCommissionInvoice(documentNumber);

const matchesExclusion = (
  config: CommissionCompanyConfig,
  productCode: string,
  productDescription: string,
): { matched: boolean; reason?: string } => {
  const normalizedSku = normalizeCommissionText(productCode);
  const normalizedDescription = normalizeCommissionText(productDescription);

  for (const rule of config.exclusionRules) {
    const targetValue = normalizeCommissionText(rule.value);
    if (!targetValue) continue;

    const haystack = rule.field === 'sku' ? normalizedSku : normalizedDescription;
    const matched = rule.operator === 'equals'
      ? haystack === targetValue
      : haystack.includes(targetValue);

    if (matched) {
      return {
        matched: true,
        reason: rule.note?.trim() || `${rule.field}:${rule.operator}:${rule.value}`,
      };
    }
  }

  return { matched: false };
};

const getRatePercent = (
  companyKey: CommissionCompanyKey,
  productClass: CommissionProductClass | '',
  config: CommissionCompanyConfig,
): number => {
  if (companyKey === 'megagen') {
    return config.globalRatePercent ?? 0;
  }
  if (productClass === 'IMPLANTES') {
    return config.implantRatePercent ?? 0;
  }
  if (productClass === '3DENTAL') {
    return config.threeDentalRatePercent ?? 0;
  }
  return 0;
};

const createEmptyClassSummary = () => ({
  currentPaidNetCLP: 0,
  carryoverPaidNetCLP: 0,
  negativeAdjustmentsNetCLP: 0,
  baseNetCLP: 0,
  totalCommissionCLP: 0,
});

const sortLines = (lines: CommissionProcessedLine[]): CommissionProcessedLine[] => (
  [...lines].sort((left, right) => {
    if (left.saleDate !== right.saleDate) {
      return left.saleDate.localeCompare(right.saleDate);
    }
    if (left.documentNumber !== right.documentNumber) {
      return left.documentNumber.localeCompare(right.documentNumber, 'es');
    }
    return left.lineOrder - right.lineOrder;
  })
);

export const processCommissionClosure = (input: ProcessCommissionClosureInput): CommissionClosureProcessingResult => {
  const companyDefinition = COMMISSION_COMPANY_DEFINITIONS[input.companyKey];
  const warnings: string[] = [...(input.initialWarnings ?? [])];
  const blockingErrors: string[] = [];
  const pendingInvoiceSet = new Set(
    input.receivableRows
      .map((row) => buildInvoiceKey(row.documentNumber))
      .filter(Boolean),
  );

  if (!input.salesFileName) {
    addUnique(blockingErrors, 'Debes cargar el archivo de ventas del mes.');
  }
  if (!input.receivablesFileName) {
    addUnique(blockingErrors, 'Debes cargar el archivo de cuentas por cobrar.');
  }
  if (input.companyKey === 'megagen' && (!input.config.globalRatePercent || input.config.globalRatePercent <= 0)) {
    addUnique(blockingErrors, 'Debes ingresar una tasa válida de comisión para MegaGen.');
  }
  if (input.companyKey === '3dental') {
    if (!input.config.implantRatePercent || input.config.implantRatePercent <= 0) {
      addUnique(blockingErrors, 'Debes ingresar una tasa válida para Implantes.');
    }
    if (!input.config.threeDentalRatePercent || input.config.threeDentalRatePercent <= 0) {
      addUnique(blockingErrors, 'Debes ingresar una tasa válida para 3Dental.');
    }
  }
  if (!input.carryoverLines.length && input.usedCarryoverSource === 'none') {
    addUnique(warnings, 'No se cargó arrastre manual ni se encontró arrastre previo guardado.');
  }
  if (!input.config.exclusionRules.length) {
    addUnique(warnings, 'El catálogo de exclusiones está vacío.');
  }

  const invoiceMetadata = new Map<string, { sellers: Set<string>; clients: Set<string> }>();
  const addInvoiceMetadata = (invoiceKey: string, salesRep: string, clientName: string) => {
    if (!invoiceKey) return;
    const current = invoiceMetadata.get(invoiceKey) ?? { sellers: new Set<string>(), clients: new Set<string>() };
    if (salesRep) current.sellers.add(salesRep);
    if (clientName) current.clients.add(clientName);
    invoiceMetadata.set(invoiceKey, current);
  };

  input.salesLines.forEach((line) => addInvoiceMetadata(buildInvoiceKey(line.documentNumber), line.salesRep, line.clientName));
  input.carryoverLines.forEach((line) => addInvoiceMetadata(buildInvoiceKey(line.documentNumber), line.salesRep, line.clientName));

  invoiceMetadata.forEach((metadata, invoiceKey) => {
    if (metadata.sellers.size > 1) {
      addUnique(warnings, `La factura ${invoiceKey} aparece con vendedores distintos.`);
    }
    if (metadata.clients.size > 1) {
      addUnique(warnings, `La factura ${invoiceKey} aparece con clientes distintos.`);
    }
  });

  const lines: CommissionProcessedLine[] = [];

  const pushProcessedLine = (
    originType: CommissionOriginType,
    originPeriodKey: string | undefined,
    baseLine: {
      documentType: string;
      documentNumber: string;
      clientCode: string;
      clientName: string;
      salesRep: string;
      saleDate: string;
      productCode: string;
      productDescription: string;
      quantity: number;
      netAmountCLP: number;
      productClass?: string;
      frozenRatePercent?: number | null;
      sourceFileName: string;
      carryoverCompanyKey?: CommissionCompanyKey | null;
      carryoverObservation?: string;
    },
  ) => {
    const invoiceKey = buildInvoiceKey(baseLine.documentNumber);
    const exclusionMatch = matchesExclusion(input.config, baseLine.productCode, baseLine.productDescription);
    const isExcluded = exclusionMatch.matched;
    const resolvedClass = isExcluded ? normalizeProductClass(input.companyKey, baseLine.productClass) : normalizeProductClass(input.companyKey, baseLine.productClass);
    const lineWarnings: string[] = [];
    let blockingLineReason = '';

    if (!invoiceKey) {
      addUnique(blockingErrors, `Hay líneas sin número de factura (${baseLine.productDescription || baseLine.productCode || 'sin producto'}).`);
      lineWarnings.push('Sin número de factura.');
      blockingLineReason = 'Sin número de factura';
    }

    if (!baseLine.salesRep) {
      addUnique(warnings, `La factura ${baseLine.documentNumber || '(sin número)'} no trae vendedor.`);
      lineWarnings.push('Sin vendedor.');
    }

    if (!baseLine.clientName) {
      addUnique(warnings, `La factura ${baseLine.documentNumber || '(sin número)'} no trae nombre de cliente.`);
      lineWarnings.push('Sin nombre de cliente.');
    }

    if (originType !== 'current_sales' && baseLine.carryoverCompanyKey && baseLine.carryoverCompanyKey !== input.companyKey) {
      addUnique(warnings, `El arrastre cargado contiene líneas de ${baseLine.carryoverCompanyKey}; se procesaron igualmente para revisión.`);
      lineWarnings.push(`Empresa arrastre: ${baseLine.carryoverCompanyKey}`);
    }

    let effectiveClass = resolvedClass;
    if (!isExcluded && input.companyKey === '3dental' && !effectiveClass) {
      addUnique(blockingErrors, `La factura ${baseLine.documentNumber || '(sin número)'} tiene líneas sin clase válida de comisión.`);
      lineWarnings.push('Clase de comisión inválida.');
      blockingLineReason = 'Clase de comisión inválida';
    }

    if (input.companyKey === 'megagen') {
      effectiveClass = 'MEGAGEN';
    }

    let ratePercent = 0;
    if (originType === 'carryover_saved' || originType === 'carryover_file') {
      ratePercent = baseLine.frozenRatePercent ?? 0;
      if (!ratePercent && !isExcluded && effectiveClass) {
        addUnique(warnings, `La factura ${baseLine.documentNumber || '(sin número)'} del arrastre no traía tasa congelada; se recalculó con la vigente.`);
        ratePercent = getRatePercent(input.companyKey, effectiveClass, input.config);
      }
    } else {
      ratePercent = getRatePercent(input.companyKey, effectiveClass, input.config);
    }

    let status: CommissionLineStatus;
    if (isExcluded || blockingLineReason) {
      status = 'excluded';
    } else if (pendingInvoiceSet.has(invoiceKey)) {
      status = 'unpaid';
    } else if (originType === 'current_sales') {
      status = 'paid_current';
    } else {
      status = 'paid_carryover';
    }

    const commissionAmountCLP = status === 'paid_current' || status === 'paid_carryover'
      ? (baseLine.netAmountCLP * ratePercent) / 100
      : 0;

    lines.push({
      lineOrder: lines.length + 1,
      companyKey: input.companyKey,
      periodKey: input.periodKey,
      originType,
      originPeriodKey,
      documentType: baseLine.documentType,
      documentNumber: baseLine.documentNumber,
      invoiceKey,
      clientCode: baseLine.clientCode,
      clientName: baseLine.clientName,
      salesRep: baseLine.salesRep || '#N/A',
      saleDate: baseLine.saleDate,
      productCode: baseLine.productCode,
      productDescription: baseLine.productDescription,
      quantity: baseLine.quantity,
      netAmountCLP: baseLine.netAmountCLP,
      productClass: effectiveClass,
      ratePercent,
      commissionAmountCLP,
      status,
      isNegative: baseLine.netAmountCLP < 0,
      isExcluded,
      exclusionReason: exclusionMatch.reason || blockingLineReason || undefined,
      warnings: [...lineWarnings, ...(baseLine.carryoverObservation ? [baseLine.carryoverObservation] : [])],
      sourceFileName: baseLine.sourceFileName,
    });
  };

  input.salesLines.forEach((line) => {
    pushProcessedLine('current_sales', input.periodKey, {
      ...line,
      sourceFileName: input.salesFileName,
    });
  });

  input.carryoverLines.forEach((line) => {
    const originType: CommissionOriginType = line.sourceType === 'saved_closure'
      ? 'carryover_saved'
      : line.sourceType === 'workbook_carryover'
        ? 'carryover_file'
        : 'bootstrap';

    pushProcessedLine(originType, line.originPeriodKey || undefined, {
      documentType: line.documentType,
      documentNumber: line.documentNumber,
      clientCode: line.clientCode,
      clientName: line.clientName,
      salesRep: line.salesRep,
      saleDate: line.saleDate,
      productCode: line.productCode,
      productDescription: line.productDescription,
      quantity: line.quantity,
      netAmountCLP: line.netAmountCLP,
      productClass: line.productClass,
      frozenRatePercent: line.ratePercent,
      sourceFileName: input.carryoverFileName || 'Arrastre previo',
      carryoverCompanyKey: line.sourceCompanyKey,
      carryoverObservation: line.observation,
    });
  });

  const sortedLines = sortLines(lines).map((line, index) => ({ ...line, lineOrder: index + 1 }));
  const currentPaidLines = sortedLines.filter((line) => line.status === 'paid_current');
  const carryoverPaidLines = sortedLines.filter((line) => line.status === 'paid_carryover');
  const unpaidLines = sortedLines.filter((line) => line.status === 'unpaid');
  const excludedLines = sortedLines.filter((line) => line.status === 'excluded');

  const sellerMap = new Map<string, CommissionSellerSummary>();
  const paidLines = sortedLines.filter((line) => line.status === 'paid_current' || line.status === 'paid_carryover');

  paidLines.forEach((line) => {
    const sellerSummary = sellerMap.get(line.salesRep) ?? {
      salesRep: line.salesRep,
      currentPaidNetCLP: 0,
      carryoverPaidNetCLP: 0,
      negativeAdjustmentsNetCLP: 0,
      totalBaseNetCLP: 0,
      totalCommissionCLP: 0,
      byClass: {},
    };

    const classKey = line.productClass || (input.companyKey === 'megagen' ? 'MEGAGEN' : '3DENTAL');
    sellerSummary.byClass[classKey] = sellerSummary.byClass[classKey] ?? createEmptyClassSummary();
    const classSummary = sellerSummary.byClass[classKey];

    if (line.status === 'paid_current') {
      sellerSummary.currentPaidNetCLP += line.netAmountCLP > 0 ? line.netAmountCLP : 0;
      classSummary.currentPaidNetCLP += line.netAmountCLP > 0 ? line.netAmountCLP : 0;
    }

    if (line.status === 'paid_carryover') {
      sellerSummary.carryoverPaidNetCLP += line.netAmountCLP > 0 ? line.netAmountCLP : 0;
      classSummary.carryoverPaidNetCLP += line.netAmountCLP > 0 ? line.netAmountCLP : 0;
    }

    if (line.netAmountCLP < 0) {
      sellerSummary.negativeAdjustmentsNetCLP += line.netAmountCLP;
      classSummary.negativeAdjustmentsNetCLP += line.netAmountCLP;
    }

    sellerSummary.totalBaseNetCLP += line.netAmountCLP;
    sellerSummary.totalCommissionCLP += line.commissionAmountCLP;
    classSummary.baseNetCLP += line.netAmountCLP;
    classSummary.totalCommissionCLP += line.commissionAmountCLP;
    sellerMap.set(line.salesRep, sellerSummary);
  });

  const sellerSummaries = Array.from(sellerMap.values()).sort((left, right) => left.salesRep.localeCompare(right.salesRep, 'es'));

  const countUniqueInvoices = (status: CommissionLineStatus) => new Set(
    sortedLines
      .filter((line) => line.status === status)
      .map((line) => line.invoiceKey)
      .filter(Boolean),
  ).size;

  const stats = {
    paidCurrentInvoices: countUniqueInvoices('paid_current'),
    paidCarryoverInvoices: countUniqueInvoices('paid_carryover'),
    unpaidInvoices: countUniqueInvoices('unpaid'),
    excludedLines: excludedLines.length,
    affectedSellers: new Set(paidLines.map((line) => line.salesRep)).size,
    totalCommissionCLP: paidLines.reduce((acc, line) => acc + line.commissionAmountCLP, 0),
  };

  return {
    companyKey: input.companyKey,
    companyLabel: companyDefinition.companyLabel,
    periodKey: input.periodKey,
    salesFileName: input.salesFileName,
    receivablesFileName: input.receivablesFileName,
    carryoverFileName: input.carryoverFileName || '',
    usedCarryoverSource: input.usedCarryoverSource,
    configSnapshot: structuredClone(input.config),
    lines: sortedLines,
    currentPaidLines,
    carryoverPaidLines,
    unpaidLines,
    excludedLines,
    sellerSummaries,
    stats,
    blockingErrors,
    warnings,
  };
};

export const buildCommissionClosureSummary = (
  result: CommissionClosureProcessingResult,
): CommissionClosureSummary => ({
  companyKey: result.companyKey,
  companyLabel: result.companyLabel,
  periodKey: result.periodKey,
  generatedAt: new Date().toISOString(),
  salesFileName: result.salesFileName,
  receivablesFileName: result.receivablesFileName,
  carryoverFileName: result.carryoverFileName,
  configSnapshot: structuredClone(result.configSnapshot),
  stats: { ...result.stats },
  sellerSummaries: structuredClone(result.sellerSummaries),
  blockingErrors: [...result.blockingErrors],
  warnings: [...result.warnings],
});

export const buildCommissionProcessingResultFromClosure = (
  record: CommissionClosureRecord,
): CommissionClosureProcessingResult => {
  const sortedLines = sortLines(record.lines);

  return {
    companyKey: record.companyKey,
    companyLabel: record.summary.companyLabel,
    periodKey: record.periodKey,
    salesFileName: record.salesFileName,
    receivablesFileName: record.receivablesFileName,
    carryoverFileName: record.carryoverFileName,
    usedCarryoverSource: 'saved',
    configSnapshot: structuredClone(record.summary.configSnapshot),
    lines: sortedLines,
    currentPaidLines: sortedLines.filter((line) => line.status === 'paid_current'),
    carryoverPaidLines: sortedLines.filter((line) => line.status === 'paid_carryover'),
    unpaidLines: sortedLines.filter((line) => line.status === 'unpaid'),
    excludedLines: sortedLines.filter((line) => line.status === 'excluded'),
    sellerSummaries: structuredClone(record.summary.sellerSummaries),
    stats: { ...record.summary.stats },
    blockingErrors: [...record.summary.blockingErrors],
    warnings: [...record.summary.warnings],
  };
};

export const mapClosureToCarryoverLines = (
  closure: CommissionClosureRecord | CommissionClosureListItem | null,
): CommissionCarryoverLine[] => {
  if (!closure || !('lines' in closure)) return [];

  return closure.lines
    .filter((line) => line.status === 'unpaid')
    .map((line) => ({
      sourceRowIndex: line.lineOrder,
      sourceType: 'saved_closure',
      sourceCompanyKey: line.companyKey,
      originPeriodKey: line.originPeriodKey || line.periodKey,
      documentType: line.documentType,
      documentNumber: line.documentNumber,
      clientCode: line.clientCode,
      clientName: line.clientName,
      salesRep: line.salesRep,
      saleDate: line.saleDate,
      productCode: line.productCode,
      productDescription: line.productDescription,
      quantity: line.quantity,
      netAmountCLP: line.netAmountCLP,
      productClass: line.productClass,
      ratePercent: line.ratePercent,
      sourceStatus: line.status,
      observation: line.warnings.join(' | ') || undefined,
    }));
};
