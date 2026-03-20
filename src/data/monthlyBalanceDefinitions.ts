import type {
  MonthlyBalanceTargetRowKind,
  MonthlyBalanceTargetSectionKey,
} from '../types/monthlyAnalysis';

export interface MonthlyBalanceTargetRowDefinition {
  key: string;
  label: string;
  sectionKey: MonthlyBalanceTargetSectionKey;
  level: number;
  kind: MonthlyBalanceTargetRowKind;
  parentKey?: string;
  sumOf?: string[];
  notes?: string[];
  isContraAsset?: boolean;
}

export interface MonthlyBalanceTargetSectionDefinition {
  key: MonthlyBalanceTargetSectionKey;
  label: string;
  rows: MonthlyBalanceTargetRowDefinition[];
}

const defineRow = (
  sectionKey: MonthlyBalanceTargetSectionKey,
  key: string,
  label: string,
  level: number,
  kind: MonthlyBalanceTargetRowKind,
  options?: {
    parentKey?: string;
    sumOf?: string[];
    notes?: string[];
    isContraAsset?: boolean;
  },
): MonthlyBalanceTargetRowDefinition => ({
  key,
  label,
  sectionKey,
  level,
  kind,
  parentKey: options?.parentKey,
  sumOf: options?.sumOf,
  notes: options?.notes,
  isContraAsset: options?.isContraAsset,
});

const ASSETS_ROWS: MonthlyBalanceTargetRowDefinition[] = [
  defineRow('ASSETS', 'current_assets_header', 'Current Assets', 0, 'header'),
  defineRow('ASSETS', 'checking_savings', 'Checking/Savings', 1, 'detail', { parentKey: 'current_assets_header' }),
  defineRow('ASSETS', 'accounts_receivable', 'Accounts Receivable', 1, 'detail', { parentKey: 'current_assets_header' }),
  defineRow('ASSETS', 'other_current_assets_header', 'Other Current Assets', 1, 'header', { parentKey: 'current_assets_header' }),
  defineRow('ASSETS', 'advance_to_vendor', 'Advance to Vendor', 2, 'detail', { parentKey: 'other_current_assets_header' }),
  defineRow('ASSETS', 'inventory_asset_header', 'Inventory Asset', 2, 'header', { parentKey: 'other_current_assets_header' }),
  defineRow('ASSETS', 'inventory_header', 'Inventory', 3, 'header', { parentKey: 'inventory_asset_header' }),
  defineRow('ASSETS', 'inventory_etc', 'Inventory_Etc', 4, 'detail', { parentKey: 'inventory_header' }),
  defineRow('ASSETS', 'inventory_fixture', 'Inventory_Fixture', 4, 'detail', { parentKey: 'inventory_header' }),
  defineRow('ASSETS', 'inventory_instrument', 'Inventory_Instrument', 4, 'detail', { parentKey: 'inventory_header' }),
  defineRow('ASSETS', 'inventory_kit', 'Inventory_Kit', 4, 'detail', { parentKey: 'inventory_header' }),
  defineRow('ASSETS', 'inventory_medit', 'Inventory_Medit', 4, 'detail', { parentKey: 'inventory_header' }),
  defineRow('ASSETS', 'inventory_prosthetics', 'Inventory_Prosthetics', 4, 'detail', { parentKey: 'inventory_header' }),
  defineRow('ASSETS', 'total_inventory', 'Total Inventory', 3, 'subtotal', {
    parentKey: 'inventory_asset_header',
    sumOf: ['inventory_etc', 'inventory_fixture', 'inventory_instrument', 'inventory_kit', 'inventory_medit', 'inventory_prosthetics'],
  }),
  defineRow('ASSETS', 'inventory_in_transit', 'Inventory in Transit', 3, 'detail', { parentKey: 'inventory_asset_header' }),
  defineRow('ASSETS', 'total_inventory_asset', 'Total Inventory Asset', 2, 'subtotal', {
    parentKey: 'other_current_assets_header',
    sumOf: ['total_inventory', 'inventory_in_transit'],
  }),
  defineRow('ASSETS', 'other_receivable', 'Other Receivable', 2, 'detail', { parentKey: 'other_current_assets_header' }),
  defineRow('ASSETS', 'prepaid_expenses', 'Prepaid Expenses', 2, 'detail', { parentKey: 'other_current_assets_header' }),
  defineRow('ASSETS', 'prepaid_insurance', 'Prepaid Insurance', 2, 'detail', { parentKey: 'other_current_assets_header' }),
  defineRow('ASSETS', 'prepaid_tax', 'Prepaid Tax', 2, 'detail', { parentKey: 'other_current_assets_header' }),
  defineRow('ASSETS', 'undeposited_funds', 'Undeposited Funds', 2, 'detail', { parentKey: 'other_current_assets_header' }),
  defineRow('ASSETS', 'total_other_current_assets', 'Total Other Current Assets', 1, 'subtotal', {
    parentKey: 'current_assets_header',
    sumOf: ['advance_to_vendor', 'total_inventory_asset', 'other_receivable', 'prepaid_expenses', 'prepaid_insurance', 'prepaid_tax', 'undeposited_funds'],
  }),
  defineRow('ASSETS', 'total_current_assets', 'Total Current Assets', 0, 'subtotal', {
    sumOf: ['checking_savings', 'accounts_receivable', 'total_other_current_assets'],
  }),
  defineRow('ASSETS', 'fixed_assets_header', 'Fixed Assets', 0, 'header'),
  defineRow('ASSETS', 'fixed_assets_group_header', 'Fixed Assets', 1, 'header', { parentKey: 'fixed_assets_header' }),
  defineRow('ASSETS', 'auto_header', 'Auto', 2, 'header', { parentKey: 'fixed_assets_group_header' }),
  defineRow('ASSETS', 'accumulated_depreciation_auto', 'Accumulated Depreciation-Auto', 3, 'detail', {
    parentKey: 'auto_header',
    isContraAsset: true,
  }),
  defineRow('ASSETS', 'auto_other', 'Auto - Other', 3, 'detail', { parentKey: 'auto_header' }),
  defineRow('ASSETS', 'total_auto', 'Total Auto', 2, 'subtotal', {
    parentKey: 'fixed_assets_group_header',
    sumOf: ['auto_other', 'accumulated_depreciation_auto'],
  }),
  defineRow('ASSETS', 'computer_equipment_header', 'Computer & Equipment', 2, 'header', { parentKey: 'fixed_assets_group_header' }),
  defineRow('ASSETS', 'accumulated_depreciation_me', 'Accumulated Depreciation-M&E', 3, 'detail', {
    parentKey: 'computer_equipment_header',
    isContraAsset: true,
  }),
  defineRow('ASSETS', 'computer_equipment_other', 'Computer & Equipment - Other', 3, 'detail', { parentKey: 'computer_equipment_header' }),
  defineRow('ASSETS', 'total_computer_equipment', 'Total Computer & Equipment', 2, 'subtotal', {
    parentKey: 'fixed_assets_group_header',
    sumOf: ['computer_equipment_other', 'accumulated_depreciation_me'],
  }),
  defineRow('ASSETS', 'construction_in_progress', 'Construction in Progress', 2, 'detail', { parentKey: 'fixed_assets_group_header' }),
  defineRow('ASSETS', 'furniture_fixture_header', 'Furniture and Fixture', 2, 'header', { parentKey: 'fixed_assets_group_header' }),
  defineRow('ASSETS', 'accumulated_depreciation_ff', 'Accumulated Depreciation-F&F', 3, 'detail', {
    parentKey: 'furniture_fixture_header',
    isContraAsset: true,
  }),
  defineRow('ASSETS', 'furniture_fixture_other', 'Furniture and Fixture - Other', 3, 'detail', { parentKey: 'furniture_fixture_header' }),
  defineRow('ASSETS', 'total_furniture_fixture', 'Total Furniture and Fixture', 2, 'subtotal', {
    parentKey: 'fixed_assets_group_header',
    sumOf: ['furniture_fixture_other', 'accumulated_depreciation_ff'],
  }),
  defineRow('ASSETS', 'total_fixed_assets_internal', 'Total Fixed Assets', 1, 'subtotal', {
    parentKey: 'fixed_assets_header',
    sumOf: ['total_auto', 'total_computer_equipment', 'construction_in_progress', 'total_furniture_fixture'],
  }),
  defineRow('ASSETS', 'total_fixed_assets', 'Total Fixed Assets', 0, 'subtotal', {
    sumOf: ['total_fixed_assets_internal'],
  }),
  defineRow('ASSETS', 'other_assets_header', 'Other Assets', 0, 'header'),
  defineRow('ASSETS', 'intangible_assets_header', 'Intangible Assets', 1, 'header', { parentKey: 'other_assets_header' }),
  defineRow('ASSETS', 'construction_in_process', 'Construction in Process', 2, 'detail', { parentKey: 'intangible_assets_header' }),
  defineRow('ASSETS', 'total_intangible_assets', 'Total Intangible Assets', 1, 'subtotal', {
    parentKey: 'other_assets_header',
    sumOf: ['construction_in_process'],
  }),
  defineRow('ASSETS', 'security_deposits_asset', 'Security Deposits Asset', 1, 'detail', { parentKey: 'other_assets_header' }),
  defineRow('ASSETS', 'total_other_assets', 'Total Other Assets', 0, 'subtotal', {
    sumOf: ['total_intangible_assets', 'security_deposits_asset'],
  }),
  defineRow('ASSETS', 'total_assets', 'TOTAL ASSETS', 0, 'grand_total', {
    sumOf: ['total_current_assets', 'total_fixed_assets', 'total_other_assets'],
  }),
];

const LIABILITIES_AND_EQUITY_ROWS: MonthlyBalanceTargetRowDefinition[] = [
  defineRow('LIABILITIES_EQUITY', 'liabilities_header', 'Liabilities', 0, 'header'),
  defineRow('LIABILITIES_EQUITY', 'current_liabilities_header', 'Current Liabilities', 1, 'header', { parentKey: 'liabilities_header' }),
  defineRow('LIABILITIES_EQUITY', 'accounts_payable_header', 'Accounts Payable', 2, 'header', { parentKey: 'current_liabilities_header' }),
  defineRow('LIABILITIES_EQUITY', 'accounts_payable_other', 'Accounts Payable_Other', 3, 'detail', { parentKey: 'accounts_payable_header' }),
  defineRow('LIABILITIES_EQUITY', 'accounts_payable_mgg_hq', 'Accounts Payable_MGG HQ', 3, 'detail', { parentKey: 'accounts_payable_header' }),
  defineRow('LIABILITIES_EQUITY', 'total_accounts_payable', 'Total Accounts Payable', 2, 'subtotal', {
    parentKey: 'current_liabilities_header',
    sumOf: ['accounts_payable_other', 'accounts_payable_mgg_hq'],
  }),
  defineRow('LIABILITIES_EQUITY', 'credit_cards', 'Credit Cards', 2, 'detail', { parentKey: 'current_liabilities_header' }),
  defineRow('LIABILITIES_EQUITY', 'other_current_liabilities_header', 'Other Current Liabilities', 2, 'header', { parentKey: 'current_liabilities_header' }),
  defineRow('LIABILITIES_EQUITY', 'accrued_expense', 'Accrued Expense', 3, 'detail', { parentKey: 'other_current_liabilities_header' }),
  defineRow('LIABILITIES_EQUITY', 'other_payable', 'Other Payable', 3, 'detail', { parentKey: 'other_current_liabilities_header' }),
  defineRow('LIABILITIES_EQUITY', 'payroll_liabilities', 'Payroll Liabilities', 3, 'detail', { parentKey: 'other_current_liabilities_header' }),
  defineRow('LIABILITIES_EQUITY', 'ppp_loan_payable', 'PPP Loan Payable', 3, 'detail', { parentKey: 'other_current_liabilities_header' }),
  defineRow('LIABILITIES_EQUITY', 'sales_tax_payable', 'Sales Tax Payable', 3, 'detail', { parentKey: 'other_current_liabilities_header' }),
  defineRow('LIABILITIES_EQUITY', 'unearned_sales_revenue', 'Unearned Sales Revenue', 3, 'detail', { parentKey: 'other_current_liabilities_header' }),
  defineRow('LIABILITIES_EQUITY', 'total_other_current_liabilities', 'Total Other Current Liabilities', 2, 'subtotal', {
    parentKey: 'current_liabilities_header',
    sumOf: ['accrued_expense', 'other_payable', 'payroll_liabilities', 'ppp_loan_payable', 'sales_tax_payable', 'unearned_sales_revenue'],
  }),
  defineRow('LIABILITIES_EQUITY', 'total_current_liabilities', 'Total Current Liabilities', 1, 'subtotal', {
    parentKey: 'liabilities_header',
    sumOf: ['total_accounts_payable', 'credit_cards', 'total_other_current_liabilities'],
  }),
  defineRow('LIABILITIES_EQUITY', 'total_other_liabilities', 'Total Other Liabilities', 1, 'subtotal', {
    parentKey: 'liabilities_header',
    sumOf: [],
  }),
  defineRow('LIABILITIES_EQUITY', 'total_liabilities', 'Total Liabilities', 0, 'subtotal', {
    sumOf: ['total_current_liabilities', 'total_other_liabilities'],
  }),
  defineRow('LIABILITIES_EQUITY', 'equity_header', 'Equity', 0, 'header'),
  defineRow('LIABILITIES_EQUITY', 'capital_stock', 'Capital Stock', 1, 'detail', { parentKey: 'equity_header' }),
  defineRow('LIABILITIES_EQUITY', 'retained_earnings', 'Retained Earnings', 1, 'detail', { parentKey: 'equity_header' }),
  defineRow('LIABILITIES_EQUITY', 'net_income', 'Net Income', 1, 'detail', {
    parentKey: 'equity_header',
    notes: ['Derivado desde el ER mensual cuando exista.'],
  }),
  defineRow('LIABILITIES_EQUITY', 'total_equity', 'Total Equity', 0, 'subtotal', {
    sumOf: ['capital_stock', 'retained_earnings', 'net_income'],
  }),
  defineRow('LIABILITIES_EQUITY', 'total_liabilities_and_equity', 'TOTAL LIABILITIES & EQUITY', 0, 'grand_total', {
    sumOf: ['total_liabilities', 'total_equity'],
  }),
];

export const MONTHLY_BALANCE_TARGET_SECTIONS: MonthlyBalanceTargetSectionDefinition[] = [
  {
    key: 'ASSETS',
    label: 'ASSETS',
    rows: ASSETS_ROWS,
  },
  {
    key: 'LIABILITIES_EQUITY',
    label: 'LIABILITIES & EQUITY',
    rows: LIABILITIES_AND_EQUITY_ROWS,
  },
];

export const MONTHLY_BALANCE_TARGET_ROWS: MonthlyBalanceTargetRowDefinition[] = MONTHLY_BALANCE_TARGET_SECTIONS
  .flatMap((section) => section.rows);

export const findMonthlyBalanceTargetRow = (
  key: string,
): MonthlyBalanceTargetRowDefinition | null => (
  MONTHLY_BALANCE_TARGET_ROWS.find((row) => row.key === key) ?? null
);
