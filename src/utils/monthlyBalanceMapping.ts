import type { MonthlyBalanceSourceRow } from '../types/monthlyAnalysis';

export interface MonthlyBalanceSourceAccountMapping {
  sourceCode: string;
  sourceName: string;
  sourceKind: 'detail' | 'subtotal';
  targetKey: string;
}

export interface MonthlyBalanceExpectedSourceAccount {
  sourceCode: string;
  sourceName: string;
  sourceKind: 'detail' | 'subtotal';
  ignore?: boolean;
  warnIfNonZero?: string;
  notes?: string[];
}

const normalize = (text: string): string => text
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const buildMatchKey = (
  sourceCode: string,
  sourceName: string,
  sourceKind: MonthlyBalanceSourceAccountMapping['sourceKind'],
): string => `${sourceKind}::${normalize(sourceCode)}::${normalize(sourceName)}`;

export const MONTHLY_BALANCE_SOURCE_ACCOUNT_MAPPINGS: MonthlyBalanceSourceAccountMapping[] = [
  { sourceCode: '1.1.1010.20.07', sourceName: 'BCO_BCI - 32832061', sourceKind: 'detail', targetKey: 'checking_savings' },
  { sourceCode: '1.1.1040.10.01', sourceName: 'CLIENTES NACIONALES', sourceKind: 'detail', targetKey: 'accounts_receivable' },
  { sourceCode: '1.1.1010.10.03', sourceName: 'FONDOS POR RENDIR', sourceKind: 'detail', targetKey: 'undeposited_funds' },
  { sourceCode: '1.1.1040.10.07', sourceName: 'WEBPAY', sourceKind: 'detail', targetKey: 'undeposited_funds' },
  { sourceCode: '1.1.1040.20.01', sourceName: 'CHEQUES POR COBRAR', sourceKind: 'detail', targetKey: 'undeposited_funds' },
  { sourceCode: '1.1.1040.40.01', sourceName: 'ANTICIPO DE SUELDOS', sourceKind: 'detail', targetKey: 'other_receivable' },
  { sourceCode: '1.1.1040.50.01', sourceName: 'DEUDORES VARIOS', sourceKind: 'detail', targetKey: 'other_receivable' },
  { sourceCode: '1.1.1040.50.02', sourceName: 'ANTICIPO A PROVEEDORES', sourceKind: 'detail', targetKey: 'advance_to_vendor' },
  { sourceCode: '1.1.1040.50.03', sourceName: 'ANTICIPO DE HONORARIOS', sourceKind: 'detail', targetKey: 'prepaid_expenses' },
  { sourceCode: '1.1.1080.10.01', sourceName: 'MERCADERIAS', sourceKind: 'detail', targetKey: 'inventory_etc' },
  { sourceCode: '1.1.1080.50.01', sourceName: 'IMPORTACIONES EN TRANSITO', sourceKind: 'detail', targetKey: 'inventory_in_transit' },
  { sourceCode: '1.1.1090.10.01', sourceName: 'IVA CREDITO FISCAL', sourceKind: 'detail', targetKey: 'prepaid_tax' },
  { sourceCode: '1.1.1090.10.02', sourceName: 'PPM', sourceKind: 'detail', targetKey: 'prepaid_tax' },
  { sourceCode: '1.2.1050.10.02', sourceName: 'GARANTIA DE ARRIENDO', sourceKind: 'detail', targetKey: 'security_deposits_asset' },
  { sourceCode: '1.2.1210.30.02', sourceName: 'VEHICULOS', sourceKind: 'detail', targetKey: 'auto_other' },
  { sourceCode: '1.2.1210.30.04', sourceName: 'EQUIPOS COMPUTACIONALES', sourceKind: 'detail', targetKey: 'computer_equipment_other' },
  { sourceCode: '1.2.1210.70.02', sourceName: 'D A VEHICULOS', sourceKind: 'detail', targetKey: 'accumulated_depreciation_auto' },
  { sourceCode: '1.2.1210.70.04', sourceName: 'D A EQUIPOS COMPUTACIONALES', sourceKind: 'detail', targetKey: 'accumulated_depreciation_me' },
  { sourceCode: '2.1.1010.30.20', sourceName: 'TARJETA VISA', sourceKind: 'detail', targetKey: 'credit_cards' },
  { sourceCode: '2.1.1070.20.01', sourceName: 'PROVEEDORES NACIONALES', sourceKind: 'detail', targetKey: 'accounts_payable_other' },
  { sourceCode: '2.1.1070.20.02', sourceName: 'PROVEEDORES EXTRANJEROS', sourceKind: 'detail', targetKey: 'accounts_payable_mgg_hq' },
  { sourceCode: '2.1.1070.20.03', sourceName: 'FACTURAS POR RECIBIR', sourceKind: 'detail', targetKey: 'accounts_payable_other' },
  { sourceCode: '2.1.1070.40.01', sourceName: 'ACREEDORES VARIOS', sourceKind: 'detail', targetKey: 'other_payable' },
  { sourceCode: '2.1.1070.40.02', sourceName: 'ANTICIPO DE CLIENTES', sourceKind: 'detail', targetKey: 'unearned_sales_revenue' },
  { sourceCode: '2.1.2020.10.01', sourceName: 'PROVISIONES', sourceKind: 'detail', targetKey: 'accrued_expense' },
  { sourceCode: '2.1.2030.10.01', sourceName: 'IVA DEBITO FISCAL', sourceKind: 'detail', targetKey: 'sales_tax_payable' },
  { sourceCode: '2.1.2030.10.02', sourceName: 'IMPUESTO 2 CATEGORIA', sourceKind: 'detail', targetKey: 'other_payable' },
  { sourceCode: '2.1.2030.10.03', sourceName: 'IMPUESTO UNICO', sourceKind: 'detail', targetKey: 'other_payable' },
  { sourceCode: '2.1.2030.10.06', sourceName: 'IMPUESTOS POR PAGAR', sourceKind: 'detail', targetKey: 'sales_tax_payable' },
  { sourceCode: '2.1.2030.20.01', sourceName: 'REMUNERACIONES POR PAGAR', sourceKind: 'detail', targetKey: 'payroll_liabilities' },
  { sourceCode: '2.1.2030.30.01', sourceName: 'HONORARIOS POR PAGAR', sourceKind: 'detail', targetKey: 'other_payable' },
  { sourceCode: '2.1.2030.40.11', sourceName: 'IMPOSICIONES POR PAGAR', sourceKind: 'detail', targetKey: 'payroll_liabilities' },
  { sourceCode: '2.1.2030.60.01', sourceName: 'IMPUESTO A LA RENTA', sourceKind: 'detail', targetKey: 'other_payable' },
  { sourceCode: '2.4.1000.10.01', sourceName: 'CAPITAL', sourceKind: 'detail', targetKey: 'capital_stock' },
  { sourceCode: '2.4.1500.30.01', sourceName: 'PERDIDAS ACUMULADAS', sourceKind: 'detail', targetKey: 'retained_earnings' },
];

export const MONTHLY_BALANCE_EXPECTED_SOURCE_ACCOUNTS: MonthlyBalanceExpectedSourceAccount[] = [
  {
    sourceCode: '1.1.1080.10.02',
    sourceName: 'CONTRACUENTA DE APERTURA',
    sourceKind: 'detail',
    ignore: true,
    warnIfNonZero: 'La cuenta CONTRACUENTA DE APERTURA se ignora en el balance objetivo y viene con saldo distinto de cero.',
  },
  {
    sourceCode: '2.4.1500.40.01',
    sourceName: 'UTILIDAD O PERDIDA DEL EJERCICIO',
    sourceKind: 'detail',
    ignore: true,
    notes: ['Se ignora como fuente del balance objetivo; el Net Income oficial viene desde el ER mensual.'],
  },
];

const sourceMappingIndex = new Map<string, MonthlyBalanceSourceAccountMapping>(
  MONTHLY_BALANCE_SOURCE_ACCOUNT_MAPPINGS.map((mapping) => [
    buildMatchKey(mapping.sourceCode, mapping.sourceName, mapping.sourceKind),
    mapping,
  ]),
);

const expectedSourceAccountIndex = new Map<string, MonthlyBalanceExpectedSourceAccount>(
  MONTHLY_BALANCE_EXPECTED_SOURCE_ACCOUNTS.map((account) => [
    buildMatchKey(account.sourceCode, account.sourceName, account.sourceKind),
    account,
  ]),
);

export const findMonthlyBalanceSourceMapping = (
  row: MonthlyBalanceSourceRow,
): MonthlyBalanceSourceAccountMapping | null => {
  const kind: MonthlyBalanceSourceAccountMapping['sourceKind'] = row.isSubtotal ? 'subtotal' : 'detail';
  return sourceMappingIndex.get(buildMatchKey(row.accountCode, row.accountName, kind)) ?? null;
};

export const findMonthlyBalanceExpectedSourceAccount = (
  row: MonthlyBalanceSourceRow,
): MonthlyBalanceExpectedSourceAccount | null => {
  const kind: MonthlyBalanceExpectedSourceAccount['sourceKind'] = row.isSubtotal ? 'subtotal' : 'detail';
  return expectedSourceAccountIndex.get(buildMatchKey(row.accountCode, row.accountName, kind)) ?? null;
};
