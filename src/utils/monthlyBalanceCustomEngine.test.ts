import { describe, expect, it } from 'vitest';
import { MONTHLY_BALANCE_SOURCE_NET_INCOME_CONTROL_CODE } from '../types/monthlyAnalysis';
import type {
  MonthlyBalanceLine,
  MonthlyPnlCustomMappingResult,
} from '../types/monthlyAnalysis';
import { buildMonthlyBalanceCustomMapping } from './monthlyBalanceCustomEngine';

const makeBalanceLine = (overrides: Partial<MonthlyBalanceLine>): MonthlyBalanceLine => ({
  lineOrder: overrides.lineOrder ?? 1,
  accountCode: overrides.accountCode ?? '',
  accountName: overrides.accountName ?? '',
  section: overrides.section ?? 'ACTIVO_CORRIENTE',
  subsection: overrides.subsection ?? '',
  amountCLP: overrides.amountCLP ?? 0,
  sourcePeriodKey: overrides.sourcePeriodKey ?? '2026-02',
  isSubtotal: overrides.isSubtotal ?? false,
});

const makeCustomPnl = (netIncomeCLP: number): MonthlyPnlCustomMappingResult => ({
  mappedLines: [{
    targetKey: 'net_profit_loss',
    targetLabel: 'Net profit(loss)',
    sectionKey: 'NET_PROFIT',
    amountCLP: netIncomeCLP,
    kind: 'subtotal',
    sources: [],
  }],
  sourceRows: [],
  unmappedSourceLines: [],
  manualInputs: { adminSalaryManualCLP: 0 },
  totals: {
    totalCostOfSalesCLP: 0,
    totalSgaCLP: 0,
    totalNonOperatingIncomeCLP: 0,
    totalNonOperatingExpensesCLP: 0,
  },
  warnings: [],
  errors: [],
});

describe('monthlyBalanceCustomEngine', () => {
  it('mapea las cuentas reales del balance, conserva signos definidos y calcula totales', () => {
    const result = buildMonthlyBalanceCustomMapping([
      makeBalanceLine({ lineOrder: 1, accountCode: '1.1.1010.20.07', accountName: 'BCO_BCI - 32832061', amountCLP: 100 }),
      makeBalanceLine({ lineOrder: 2, accountCode: '1.1.1040.10.01', accountName: 'CLIENTES NACIONALES', amountCLP: 200 }),
      makeBalanceLine({ lineOrder: 3, accountCode: '1.1.1010.10.03', accountName: 'FONDOS POR RENDIR', amountCLP: 10 }),
      makeBalanceLine({ lineOrder: 4, accountCode: '1.1.1040.10.07', accountName: 'WEBPAY', amountCLP: 20 }),
      makeBalanceLine({ lineOrder: 5, accountCode: '1.1.1040.20.01', accountName: 'CHEQUES POR COBRAR', amountCLP: 30 }),
      makeBalanceLine({ lineOrder: 6, accountCode: '1.1.1040.50.01', accountName: 'DEUDORES VARIOS', amountCLP: 40 }),
      makeBalanceLine({ lineOrder: 7, accountCode: '1.1.1040.50.02', accountName: 'ANTICIPO A PROVEEDORES', amountCLP: 50 }),
      makeBalanceLine({ lineOrder: 8, accountCode: '1.1.1040.50.03', accountName: 'ANTICIPO DE HONORARIOS', amountCLP: 60 }),
      makeBalanceLine({ lineOrder: 9, accountCode: '1.1.1080.10.01', accountName: 'MERCADERIAS', amountCLP: 70 }),
      makeBalanceLine({ lineOrder: 10, accountCode: '1.1.1080.50.01', accountName: 'IMPORTACIONES EN TRANSITO', amountCLP: 80 }),
      makeBalanceLine({ lineOrder: 11, accountCode: '1.1.1090.10.01', accountName: 'IVA CREDITO FISCAL', amountCLP: 90 }),
      makeBalanceLine({ lineOrder: 12, accountCode: '1.1.1090.10.02', accountName: 'PPM', amountCLP: 15 }),
      makeBalanceLine({ lineOrder: 13, accountCode: '1.2.1050.10.02', accountName: 'GARANTIA DE ARRIENDO', amountCLP: 25, section: 'ACTIVO_NO_CORRIENTE' }),
      makeBalanceLine({ lineOrder: 14, accountCode: '1.2.1210.30.02', accountName: 'VEHICULOS', amountCLP: 130, section: 'ACTIVO_NO_CORRIENTE' }),
      makeBalanceLine({ lineOrder: 15, accountCode: '1.2.1210.30.04', accountName: 'EQUIPOS COMPUTACIONALES', amountCLP: 200, section: 'ACTIVO_NO_CORRIENTE' }),
      makeBalanceLine({ lineOrder: 16, accountCode: '1.2.1210.70.02', accountName: 'D A VEHICULOS', amountCLP: 30, section: 'ACTIVO_NO_CORRIENTE' }),
      makeBalanceLine({ lineOrder: 17, accountCode: '1.2.1210.70.04', accountName: 'D A EQUIPOS COMPUTACIONALES', amountCLP: 50, section: 'ACTIVO_NO_CORRIENTE' }),
      makeBalanceLine({ lineOrder: 18, accountCode: '2.1.1010.30.20', accountName: 'TARJETA VISA', amountCLP: 5, section: 'PASIVO_CORRIENTE' }),
      makeBalanceLine({ lineOrder: 19, accountCode: '2.1.1070.20.01', accountName: 'PROVEEDORES NACIONALES', amountCLP: 300, section: 'PASIVO_CORRIENTE' }),
      makeBalanceLine({ lineOrder: 20, accountCode: '2.1.1070.20.02', accountName: 'PROVEEDORES EXTRANJEROS', amountCLP: 100, section: 'PASIVO_CORRIENTE' }),
      makeBalanceLine({ lineOrder: 21, accountCode: '2.1.1070.20.03', accountName: 'FACTURAS POR RECIBIR', amountCLP: 200, section: 'PASIVO_CORRIENTE' }),
      makeBalanceLine({ lineOrder: 22, accountCode: '2.1.1070.40.01', accountName: 'ACREEDORES VARIOS', amountCLP: 10, section: 'PASIVO_CORRIENTE' }),
      makeBalanceLine({ lineOrder: 23, accountCode: '2.1.1070.40.02', accountName: 'ANTICIPO DE CLIENTES', amountCLP: 20, section: 'PASIVO_CORRIENTE' }),
      makeBalanceLine({ lineOrder: 24, accountCode: '2.1.2020.10.01', accountName: 'PROVISIONES', amountCLP: 30, section: 'PASIVO_CORRIENTE' }),
      makeBalanceLine({ lineOrder: 25, accountCode: '2.1.2030.10.01', accountName: 'IVA DEBITO FISCAL', amountCLP: 40, section: 'PASIVO_CORRIENTE' }),
      makeBalanceLine({ lineOrder: 26, accountCode: '2.1.2030.10.02', accountName: 'IMPUESTO 2 CATEGORIA', amountCLP: 50, section: 'PASIVO_CORRIENTE' }),
      makeBalanceLine({ lineOrder: 27, accountCode: '2.1.2030.10.03', accountName: 'IMPUESTO UNICO', amountCLP: 60, section: 'PASIVO_CORRIENTE' }),
      makeBalanceLine({ lineOrder: 28, accountCode: '2.1.2030.10.06', accountName: 'IMPUESTOS POR PAGAR', amountCLP: 70, section: 'PASIVO_CORRIENTE' }),
      makeBalanceLine({ lineOrder: 29, accountCode: '2.1.2030.20.01', accountName: 'REMUNERACIONES POR PAGAR', amountCLP: 80, section: 'PASIVO_CORRIENTE' }),
      makeBalanceLine({ lineOrder: 30, accountCode: '2.1.2030.30.01', accountName: 'HONORARIOS POR PAGAR', amountCLP: 90, section: 'PASIVO_CORRIENTE' }),
      makeBalanceLine({ lineOrder: 31, accountCode: '2.1.2030.40.11', accountName: 'IMPOSICIONES POR PAGAR', amountCLP: 100, section: 'PASIVO_CORRIENTE' }),
      makeBalanceLine({ lineOrder: 32, accountCode: '2.1.2030.60.01', accountName: 'IMPUESTO A LA RENTA', amountCLP: 110, section: 'PASIVO_CORRIENTE' }),
      makeBalanceLine({ lineOrder: 33, accountCode: '2.4.1000.10.01', accountName: 'CAPITAL', amountCLP: 120, section: 'PATRIMONIO' }),
      makeBalanceLine({ lineOrder: 34, accountCode: '2.4.1500.30.01', accountName: 'PERDIDAS ACUMULADAS', amountCLP: -140, section: 'PATRIMONIO' }),
      makeBalanceLine({ lineOrder: 35, accountCode: MONTHLY_BALANCE_SOURCE_NET_INCOME_CONTROL_CODE, accountName: 'Resultado', amountCLP: 80, section: 'OTROS', isSubtotal: true }),
    ], {
      customPnl: makeCustomPnl(80),
    });

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      'El balance no cuadra: TOTAL ASSETS difiere de TOTAL LIABILITIES & EQUITY por -285.',
    ]);
    expect(result.mappedLines.find((line) => line.targetKey === 'undeposited_funds')?.amountCLP).toBe(60);
    expect(result.mappedLines.find((line) => line.targetKey === 'prepaid_tax')?.amountCLP).toBe(105);
    expect(result.mappedLines.find((line) => line.targetKey === 'accumulated_depreciation_auto')?.amountCLP).toBe(-30);
    expect(result.mappedLines.find((line) => line.targetKey === 'accumulated_depreciation_me')?.amountCLP).toBe(-50);
    expect(result.mappedLines.find((line) => line.targetKey === 'retained_earnings')?.amountCLP).toBe(-140);
    expect(result.mappedLines.find((line) => line.targetKey === 'total_current_assets')?.amountCLP).toBe(765);
    expect(result.mappedLines.find((line) => line.targetKey === 'total_fixed_assets')?.amountCLP).toBe(250);
    expect(result.mappedLines.find((line) => line.targetKey === 'total_other_assets')?.amountCLP).toBe(25);
    expect(result.mappedLines.find((line) => line.targetKey === 'total_assets')?.amountCLP).toBe(1040);
    expect(result.mappedLines.find((line) => line.targetKey === 'total_accounts_payable')?.amountCLP).toBe(600);
    expect(result.mappedLines.find((line) => line.targetKey === 'total_other_current_liabilities')?.amountCLP).toBe(660);
    expect(result.mappedLines.find((line) => line.targetKey === 'total_current_liabilities')?.amountCLP).toBe(1265);
    expect(result.mappedLines.find((line) => line.targetKey === 'net_income')?.amountCLP).toBe(80);
    expect(result.mappedLines.find((line) => line.targetKey === 'total_equity')?.amountCLP).toBe(60);
    expect(result.mappedLines.find((line) => line.targetKey === 'total_liabilities_and_equity')?.amountCLP).toBe(1325);
    expect(result.sourceNetIncomeControlCLP).toBe(80);
    expect(result.netIncomeDifferenceCLP).toBe(0);
    expect(result.balanceDifferenceCLP).toBe(-285);
  });

  it('usa el fallback del summary para Net Income y reporta el descuadre resultante', () => {
    const result = buildMonthlyBalanceCustomMapping([], {
      fallbackNetIncomeCLP: 1250,
    });

    expect(result.mappedLines.find((line) => line.targetKey === 'net_income')?.amountCLP).toBe(1250);
    expect(result.sourceNetIncomeControlCLP).toBeNull();
    expect(result.netIncomeDifferenceCLP).toBeNull();
    expect(result.warnings).toEqual([
      'El balance no cuadra: TOTAL ASSETS difiere de TOTAL LIABILITIES & EQUITY por -1250.',
    ]);
  });

  it('ignora cuentas técnicas esperadas, avisa si traen saldo y compara Resultado contra ER', () => {
    const result = buildMonthlyBalanceCustomMapping([
      makeBalanceLine({ accountCode: '1.1.1080.10.02', accountName: 'CONTRACUENTA DE APERTURA', amountCLP: 91 }),
      makeBalanceLine({ accountCode: '2.4.1500.40.01', accountName: 'UTILIDAD O PERDIDA DEL EJERCICIO', amountCLP: 33, section: 'PATRIMONIO' }),
      makeBalanceLine({ accountCode: MONTHLY_BALANCE_SOURCE_NET_INCOME_CONTROL_CODE, accountName: 'Resultado', amountCLP: 77, section: 'OTROS', isSubtotal: true }),
      makeBalanceLine({ accountCode: '9.9.9999.99.99', accountName: 'Cuenta Nueva Balance', amountCLP: 44 }),
    ], {
      customPnl: makeCustomPnl(80),
    });

    expect(result.unmappedSourceLines).toHaveLength(1);
    expect(result.unmappedSourceLines[0]?.accountName).toBe('Cuenta Nueva Balance');
    expect(result.warnings).toContain('La cuenta CONTRACUENTA DE APERTURA se ignora en el balance objetivo y viene con saldo distinto de cero.');
    expect(result.warnings).toContain('Hay cuentas nuevas en el Balance que aún no tienen regla de tratamiento.');
    expect(result.warnings).toContain('El Net Income del ER difiere del Resultado del balance por 3.');
  });
});
