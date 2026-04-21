import { isPocketBaseProvider } from './dataProvider';
import { pocketbase } from './pocketbase';
import { supabase } from './supabase';
import type {
  CommissionClosureListItem,
  CommissionClosureRecord,
  CommissionClosureSummary,
  CommissionCompanyConfig,
  CommissionCompanyKey,
  CommissionExclusionRule,
  CommissionProcessedLine,
  CommissionProductClass,
  UpsertCommissionClosurePayload,
} from '../types/commissions';
import { createDefaultCommissionConfig } from '../data/commissionDefaults';

type GenericRow = Record<string, unknown>;

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toStringArray = (value: unknown): string[] => (
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : []
);

const firstDefined = (...values: unknown[]): unknown => (
  values.find((value) => value !== undefined && value !== null)
);

const toStringValue = (...values: unknown[]): string => String(firstDefined(...values) ?? '');

const escapePocketBaseValue = (value: string): string => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const parseExclusionRule = (value: unknown): CommissionExclusionRule | null => {
  if (!value || typeof value !== 'object') return null;
  const row = value as GenericRow;
  const field = String(row.field || '');
  const operator = String(row.operator || '');
  if ((field !== 'sku' && field !== 'description') || (operator !== 'equals' && operator !== 'contains')) {
    return null;
  }
  return {
    id: String(row.id || ''),
    field,
    operator,
    value: String(row.value || ''),
    note: String(row.note || ''),
  };
};

const parseCompanyConfig = (companyKey: CommissionCompanyKey, value: unknown): CommissionCompanyConfig => {
  const fallback = createDefaultCommissionConfig(companyKey);
  if (!value || typeof value !== 'object') {
    return fallback;
  }
  const row = value as GenericRow;
  return {
    companyKey,
    globalRatePercent: row.globalRatePercent == null && row.global_rate_percent == null
      ? null
      : toNumber(row.globalRatePercent ?? row.global_rate_percent),
    implantRatePercent: row.implantRatePercent == null && row.implant_rate_percent == null
      ? null
      : toNumber(row.implantRatePercent ?? row.implant_rate_percent),
    threeDentalRatePercent: row.threeDentalRatePercent == null && row.three_dental_rate_percent == null
      ? null
      : toNumber(row.threeDentalRatePercent ?? row.three_dental_rate_percent),
    exclusionRules: Array.isArray(row.exclusionRules ?? row.exclusion_rules)
      ? ((row.exclusionRules ?? row.exclusion_rules) as unknown[])
        .map(parseExclusionRule)
        .filter((rule): rule is CommissionExclusionRule => Boolean(rule))
      : [],
  };
};

const parseSellerSummaries = (value: unknown): CommissionClosureSummary['sellerSummaries'] => {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const row = (entry && typeof entry === 'object' ? entry : {}) as GenericRow;
    const rawByClass = (row.byClass && typeof row.byClass === 'object' ? row.byClass : {}) as GenericRow;
    const byClass: CommissionClosureSummary['sellerSummaries'][number]['byClass'] = {};

    for (const [classKey, classValue] of Object.entries(rawByClass)) {
      const classRow = (classValue && typeof classValue === 'object' ? classValue : {}) as GenericRow;
      if (!['MEGAGEN', 'IMPLANTES', '3DENTAL'].includes(classKey)) continue;
      byClass[classKey as CommissionProductClass] = {
        currentPaidNetCLP: toNumber(classRow.currentPaidNetCLP),
        carryoverPaidNetCLP: toNumber(classRow.carryoverPaidNetCLP),
        negativeAdjustmentsNetCLP: toNumber(classRow.negativeAdjustmentsNetCLP),
        baseNetCLP: toNumber(classRow.baseNetCLP),
        totalCommissionCLP: toNumber(classRow.totalCommissionCLP),
      };
    }

    return {
      salesRep: String(row.salesRep || ''),
      currentPaidNetCLP: toNumber(row.currentPaidNetCLP),
      carryoverPaidNetCLP: toNumber(row.carryoverPaidNetCLP),
      negativeAdjustmentsNetCLP: toNumber(row.negativeAdjustmentsNetCLP),
      totalBaseNetCLP: toNumber(row.totalBaseNetCLP),
      totalCommissionCLP: toNumber(row.totalCommissionCLP),
      byClass,
    };
  });
};

const parseClosureSummary = (value: unknown): CommissionClosureSummary => {
  const row = (value && typeof value === 'object' ? value : {}) as GenericRow;
  const companyKey = (String(row.companyKey || row.company_key || 'megagen') === '3dental' ? '3dental' : 'megagen') as CommissionCompanyKey;
  const rawStats = (row.stats && typeof row.stats === 'object' ? row.stats : {}) as GenericRow;

  return {
    companyKey,
    companyLabel: String(row.companyLabel || row.company_label || (companyKey === '3dental' ? '3Dental' : 'MegaGen')),
    periodKey: String(row.periodKey || row.period_key || ''),
    generatedAt: String(row.generatedAt || row.generated_at || ''),
    salesFileName: String(row.salesFileName || row.sales_file_name || ''),
    receivablesFileName: String(row.receivablesFileName || row.receivables_file_name || ''),
    carryoverFileName: String(row.carryoverFileName || row.carryover_file_name || ''),
    configSnapshot: parseCompanyConfig(companyKey, row.configSnapshot || row.config_snapshot),
    stats: {
      paidCurrentInvoices: toNumber(rawStats.paidCurrentInvoices),
      paidCarryoverInvoices: toNumber(rawStats.paidCarryoverInvoices),
      unpaidInvoices: toNumber(rawStats.unpaidInvoices),
      excludedLines: toNumber(rawStats.excludedLines),
      affectedSellers: toNumber(rawStats.affectedSellers),
      totalCommissionCLP: toNumber(rawStats.totalCommissionCLP),
    },
    sellerSummaries: parseSellerSummaries(row.sellerSummaries ?? row.seller_summaries),
    blockingErrors: toStringArray(row.blockingErrors ?? row.blocking_errors),
    warnings: toStringArray(row.warnings),
  };
};

const parseProcessedLine = (value: unknown): CommissionProcessedLine => {
  const row = (value && typeof value === 'object' ? value : {}) as GenericRow;
  const originTypeValue = String(firstDefined(row.originType, row.origin_type) ?? '');
  const statusValue = String(row.status ?? '');
  const productClassValue = String(firstDefined(row.productClass, row.product_class) ?? '');
  const originPeriodValue = firstDefined(row.originPeriodKey, row.origin_period_key);
  const exclusionReasonValue = firstDefined(row.exclusionReason, row.exclusion_reason);
  return {
    lineOrder: toNumber(row.lineOrder ?? row.line_order),
    companyKey: String(row.companyKey ?? row.company_key) === '3dental' ? '3dental' : 'megagen',
    periodKey: toStringValue(row.periodKey, row.period_key),
    originType: ['current_sales', 'carryover_saved', 'carryover_file', 'bootstrap'].includes(originTypeValue)
      ? originTypeValue as CommissionProcessedLine['originType']
      : 'current_sales',
    originPeriodKey: originPeriodValue != null ? String(originPeriodValue) : undefined,
    documentType: toStringValue(row.documentType, row.document_type),
    documentNumber: toStringValue(row.documentNumber, row.document_number),
    invoiceKey: toStringValue(row.invoiceKey, row.invoice_key),
    clientCode: toStringValue(row.clientCode, row.client_code),
    clientName: toStringValue(row.clientName, row.client_name),
    salesRep: toStringValue(row.salesRep, row.sales_rep),
    saleDate: toStringValue(row.saleDate, row.sale_date),
    productCode: toStringValue(row.productCode, row.product_code),
    productDescription: toStringValue(row.productDescription, row.product_description),
    quantity: toNumber(row.quantity),
    netAmountCLP: toNumber(row.netAmountCLP ?? row.net_amount_clp),
    productClass: ['MEGAGEN', 'IMPLANTES', '3DENTAL'].includes(productClassValue)
      ? productClassValue as CommissionProductClass
      : '',
    ratePercent: toNumber(row.ratePercent ?? row.rate_percent),
    commissionAmountCLP: toNumber(row.commissionAmountCLP ?? row.commission_amount_clp),
    status: ['paid_current', 'paid_carryover', 'unpaid', 'excluded'].includes(statusValue)
      ? statusValue as CommissionProcessedLine['status']
      : 'unpaid',
    isNegative: Boolean(row.isNegative ?? row.is_negative),
    isExcluded: Boolean(row.isExcluded ?? row.is_excluded),
    exclusionReason: exclusionReasonValue != null ? String(exclusionReasonValue) : undefined,
    warnings: toStringArray(row.warnings),
    sourceFileName: toStringValue(row.sourceFileName, row.source_file_name),
  };
};

const mapClosureListItem = (row: GenericRow): CommissionClosureListItem => ({
  id: String(row.id || ''),
  companyKey: String(row.company_key || row.companyKey) === '3dental' ? '3dental' : 'megagen',
  periodKey: String(row.period_key || row.periodKey || ''),
  salesFileName: String(row.sales_file_name || row.salesFileName || ''),
  receivablesFileName: String(row.receivables_file_name || row.receivablesFileName || ''),
  carryoverFileName: String(row.carryover_file_name || row.carryoverFileName || ''),
  summary: parseClosureSummary(row.summary),
  createdAt: String(row.created_at || row.created || ''),
  updatedAt: String(row.updated_at || row.updated || row.created_at || ''),
});

const findPocketBaseSingleRecord = async (
  collectionName: string,
  filter: string,
): Promise<GenericRow | null> => {
  const rows = await pocketbase.collection(collectionName).getFullList<GenericRow>({ filter });
  return rows[0] ?? null;
};

const deletePocketBaseRecords = async (
  collectionName: string,
  filter: string,
): Promise<void> => {
  const rows = await pocketbase.collection(collectionName).getFullList<{ id: string }>({
    filter,
    fields: 'id',
  });

  for (const row of rows) {
    await pocketbase.collection(collectionName).delete(row.id);
  }
};

export const fetchCommissionCompanyConfig = async (companyKey: CommissionCompanyKey): Promise<CommissionCompanyConfig> => {
  if (!isPocketBaseProvider) {
    const { data, error } = await supabase
      .from('commission_company_configs')
      .select('*')
      .eq('company_key', companyKey)
      .maybeSingle();

    if (error) throw error;
    return data ? parseCompanyConfig(companyKey, data as GenericRow) : createDefaultCommissionConfig(companyKey);
  }

  const row = await findPocketBaseSingleRecord('commission_company_configs', `company_key="${escapePocketBaseValue(companyKey)}"`);
  return row ? parseCompanyConfig(companyKey, row) : createDefaultCommissionConfig(companyKey);
};

export const upsertCommissionCompanyConfig = async (config: CommissionCompanyConfig): Promise<void> => {
  const payload = {
    company_key: config.companyKey,
    global_rate_percent: config.globalRatePercent,
    implant_rate_percent: config.implantRatePercent,
    three_dental_rate_percent: config.threeDentalRatePercent,
    exclusion_rules: config.exclusionRules,
    updated_at: new Date().toISOString(),
  };

  if (!isPocketBaseProvider) {
    const { data, error } = await supabase
      .from('commission_company_configs')
      .select('id')
      .eq('company_key', config.companyKey)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      const { error: updateError } = await supabase
        .from('commission_company_configs')
        .update(payload)
        .eq('company_key', config.companyKey);
      if (updateError) throw updateError;
      return;
    }

    const { error: insertError } = await supabase
      .from('commission_company_configs')
      .insert({
        ...payload,
        created_at: new Date().toISOString(),
      });
    if (insertError) throw insertError;
    return;
  }

  const existing = await findPocketBaseSingleRecord('commission_company_configs', `company_key="${escapePocketBaseValue(config.companyKey)}"`);
  if (existing) {
    await pocketbase.collection('commission_company_configs').update(String(existing.id), payload);
  } else {
    await pocketbase.collection('commission_company_configs').create({
      ...payload,
      created_at: new Date().toISOString(),
    });
  }
};

export const fetchCommissionClosures = async (companyKey: CommissionCompanyKey): Promise<CommissionClosureListItem[]> => {
  if (!isPocketBaseProvider) {
    const { data, error } = await supabase
      .from('commission_closures')
      .select('*')
      .eq('company_key', companyKey)
      .order('period_key', { ascending: false });

    if (error) throw error;
    return (data ?? []).map((row) => mapClosureListItem(row as GenericRow));
  }

  const rows = await pocketbase.collection('commission_closures').getFullList<GenericRow>({
    filter: `company_key="${escapePocketBaseValue(companyKey)}"`,
  });

  return rows
    .map((row) => mapClosureListItem(row))
    .sort((left, right) => right.periodKey.localeCompare(left.periodKey, 'es'));
};

export const fetchCommissionClosureByPeriod = async (
  companyKey: CommissionCompanyKey,
  periodKey: string,
): Promise<CommissionClosureRecord | null> => {
  if (!isPocketBaseProvider) {
    const { data: header, error: headerError } = await supabase
      .from('commission_closures')
      .select('*')
      .eq('company_key', companyKey)
      .eq('period_key', periodKey)
      .maybeSingle();

    if (headerError) throw headerError;
    if (!header) return null;

    const { data: lineRows, error: lineError } = await supabase
      .from('commission_closure_lines')
      .select('*')
      .eq('company_key', companyKey)
      .eq('period_key', periodKey)
      .order('line_order', { ascending: true });

    if (lineError) throw lineError;

    return {
      ...mapClosureListItem(header as GenericRow),
      lines: (lineRows ?? []).map((row) => parseProcessedLine(row as GenericRow)),
    };
  }

  const header = await findPocketBaseSingleRecord(
    'commission_closures',
    `company_key="${escapePocketBaseValue(companyKey)}" && period_key="${escapePocketBaseValue(periodKey)}"`,
  );
  if (!header) return null;

  const lineRows = await pocketbase.collection('commission_closure_lines').getFullList<GenericRow>({
    filter: `company_key="${escapePocketBaseValue(companyKey)}" && period_key="${escapePocketBaseValue(periodKey)}"`,
    sort: 'line_order',
  });

  return {
    ...mapClosureListItem(header),
    lines: lineRows.map((row) => parseProcessedLine(row)),
  };
};

export const fetchLatestCommissionClosureBefore = async (
  companyKey: CommissionCompanyKey,
  periodKey: string,
): Promise<CommissionClosureRecord | null> => {
  if (!isPocketBaseProvider) {
    const { data, error } = await supabase
      .from('commission_closures')
      .select('*')
      .eq('company_key', companyKey)
      .lt('period_key', periodKey)
      .order('period_key', { ascending: false })
      .limit(1);

    if (error) throw error;
    const header = data?.[0];
    if (!header) return null;
    return fetchCommissionClosureByPeriod(companyKey, String((header as GenericRow).period_key || ''));
  }

  const rows = await pocketbase.collection('commission_closures').getFullList<GenericRow>({
    filter: `company_key="${escapePocketBaseValue(companyKey)}"`,
  });

  const sorted = rows
    .map((row) => mapClosureListItem(row))
    .filter((row) => row.periodKey < periodKey)
    .sort((left, right) => right.periodKey.localeCompare(left.periodKey, 'es'));

  if (!sorted.length) return null;
  return fetchCommissionClosureByPeriod(companyKey, sorted[0].periodKey);
};

export const upsertCommissionClosure = async (payload: UpsertCommissionClosurePayload): Promise<void> => {
  const headerPayload = {
    company_key: payload.companyKey,
    period_key: payload.periodKey,
    sales_file_name: payload.salesFileName,
    receivables_file_name: payload.receivablesFileName,
    carryover_file_name: payload.carryoverFileName,
    summary: payload.summary,
    updated_at: new Date().toISOString(),
  };

  const lineRows = payload.lines.map((line) => ({
    company_key: payload.companyKey,
    period_key: payload.periodKey,
    line_order: line.lineOrder,
    origin_type: line.originType,
    origin_period_key: line.originPeriodKey ?? line.periodKey,
    document_type: line.documentType,
    document_number: line.documentNumber,
    client_code: line.clientCode,
    client_name: line.clientName,
    sales_rep: line.salesRep,
    sale_date: line.saleDate || null,
    product_code: line.productCode,
    product_description: line.productDescription,
    quantity: line.quantity,
    net_amount_clp: line.netAmountCLP,
    product_class: line.productClass || '',
    rate_percent: line.ratePercent,
    commission_amount_clp: line.commissionAmountCLP,
    status: line.status,
    exclusion_reason: line.exclusionReason ?? '',
    warnings: line.warnings,
    source_file_name: line.sourceFileName,
    is_negative: line.isNegative,
    is_excluded: line.isExcluded,
  }));

  if (!isPocketBaseProvider) {
    const { data: existing, error: existingError } = await supabase
      .from('commission_closures')
      .select('id')
      .eq('company_key', payload.companyKey)
      .eq('period_key', payload.periodKey)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existing) {
      const { error: updateError } = await supabase
        .from('commission_closures')
        .update(headerPayload)
        .eq('company_key', payload.companyKey)
        .eq('period_key', payload.periodKey);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabase
        .from('commission_closures')
        .insert({
          ...headerPayload,
          created_at: new Date().toISOString(),
        });
      if (insertError) throw insertError;
    }

    const { error: deleteLinesError } = await supabase
      .from('commission_closure_lines')
      .delete()
      .eq('company_key', payload.companyKey)
      .eq('period_key', payload.periodKey);

    if (deleteLinesError) throw deleteLinesError;

    if (lineRows.length) {
      const { error: insertLinesError } = await supabase
        .from('commission_closure_lines')
        .insert(lineRows);
      if (insertLinesError) throw insertLinesError;
    }
    return;
  }

  const existing = await findPocketBaseSingleRecord(
    'commission_closures',
    `company_key="${escapePocketBaseValue(payload.companyKey)}" && period_key="${escapePocketBaseValue(payload.periodKey)}"`,
  );

  if (existing) {
    await pocketbase.collection('commission_closures').update(String(existing.id), headerPayload);
  } else {
    await pocketbase.collection('commission_closures').create({
      ...headerPayload,
      created_at: new Date().toISOString(),
    });
  }

  await deletePocketBaseRecords(
    'commission_closure_lines',
    `company_key="${escapePocketBaseValue(payload.companyKey)}" && period_key="${escapePocketBaseValue(payload.periodKey)}"`,
  );

  for (const row of lineRows) {
    await pocketbase.collection('commission_closure_lines').create(row);
  }
};

export const deleteCommissionClosure = async (
  companyKey: CommissionCompanyKey,
  periodKey: string,
): Promise<void> => {
  if (!isPocketBaseProvider) {
    const [headerResult, linesResult] = await Promise.all([
      supabase.from('commission_closures').delete().eq('company_key', companyKey).eq('period_key', periodKey),
      supabase.from('commission_closure_lines').delete().eq('company_key', companyKey).eq('period_key', periodKey),
    ]);

    if (headerResult.error) throw headerResult.error;
    if (linesResult.error) throw linesResult.error;
    return;
  }

  const header = await findPocketBaseSingleRecord(
    'commission_closures',
    `company_key="${escapePocketBaseValue(companyKey)}" && period_key="${escapePocketBaseValue(periodKey)}"`,
  );

  await deletePocketBaseRecords(
    'commission_closure_lines',
    `company_key="${escapePocketBaseValue(companyKey)}" && period_key="${escapePocketBaseValue(periodKey)}"`,
  );

  if (header) {
    await pocketbase.collection('commission_closures').delete(String(header.id));
  }
};
