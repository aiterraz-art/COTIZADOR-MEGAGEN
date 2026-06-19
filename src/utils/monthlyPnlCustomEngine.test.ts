import { describe, expect, it } from 'vitest';
import type { MonthlyPnlLine } from '../types/monthlyAnalysis';
import { buildMonthlyPnlCustomMapping } from './monthlyPnlCustomEngine';

const makeLine = (overrides: Partial<MonthlyPnlLine>): MonthlyPnlLine => ({
  lineOrder: overrides.lineOrder ?? 1,
  accountCode: overrides.accountCode ?? '',
  accountName: overrides.accountName ?? '',
  section: overrides.section ?? 'GASTOS_OPERACIONALES',
  subsection: overrides.subsection ?? '',
  amountCLP: overrides.amountCLP ?? 0,
  sourcePeriodKey: overrides.sourcePeriodKey ?? '2026-02',
  isSubtotal: overrides.isSubtotal ?? false,
});

describe('monthlyPnlCustomEngine', () => {
  it('mapea el ER personalizado y calcula subtotales objetivo', () => {
    const result = buildMonthlyPnlCustomMapping([
      makeLine({ lineOrder: 1, accountCode: '3.1.1010.10.01', accountName: 'VENTAS', section: 'INGRESOS', subsection: 'INGRESO DE EXPLOTACION', amountCLP: 58_457_090 }),
      makeLine({ lineOrder: 2, accountCode: '', accountName: 'COSTOS DE EXPLOTACION', section: 'COSTO_VENTAS', subsection: 'COSTOS DE EXPLOTACION', amountCLP: -33_258_073, isSubtotal: true }),
      makeLine({ lineOrder: 3, accountCode: '4.5.1040.10.01', accountName: 'REMUNERACIONES', subsection: 'GTOS. DE ADMINIS. Y VENTAS', amountCLP: 22_915_886 }),
      makeLine({ lineOrder: 4, accountCode: '4.5.1040.10.02', accountName: 'APORTE PATRONAL', subsection: 'GTOS. DE ADMINIS. Y VENTAS', amountCLP: 1_233_215 }),
      makeLine({ lineOrder: 5, accountCode: '4.5.1040.10.03', accountName: 'ASIGNACION COLACION', subsection: 'GTOS. DE ADMINIS. Y VENTAS', amountCLP: 75_000 }),
      makeLine({ lineOrder: 6, accountCode: '4.5.1040.10.04', accountName: 'ASIGNACION MOVILIZACION', subsection: 'GTOS. DE ADMINIS. Y VENTAS', amountCLP: 125_000 }),
      makeLine({ lineOrder: 7, accountCode: '4.5.1030.10.02', accountName: 'ARRIENDOS', subsection: 'GTOS. DE ADMINIS. Y VENTAS', amountCLP: 1_420_430 }),
      makeLine({ lineOrder: 8, accountCode: '4.5.1030.10.16', accountName: 'GTOS. COMUNES', subsection: 'GTOS. DE ADMINIS. Y VENTAS', amountCLP: 308_583 }),
      makeLine({ lineOrder: 9, accountCode: '4.5.1030.10.21', accountName: 'GTOS. DE FLETES', subsection: 'GTOS. DE ADMINIS. Y VENTAS', amountCLP: 185_000 }),
      makeLine({ lineOrder: 10, accountCode: '4.5.1030.10.32', accountName: 'GTOS. ENCOMIENDAS', subsection: 'GTOS. DE ADMINIS. Y VENTAS', amountCLP: 290_984 }),
      makeLine({ lineOrder: 11, accountCode: '4.5.1030.10.15', accountName: 'GTOS. CORRESPONDENCIA', subsection: 'GTOS. DE ADMINIS. Y VENTAS', amountCLP: 2_280 }),
      makeLine({ lineOrder: 12, accountCode: '4.5.1030.10.03', accountName: 'GTO. COMUNICACIONES', subsection: 'GTOS. DE ADMINIS. Y VENTAS', amountCLP: 198_187 }),
      makeLine({ lineOrder: 13, accountCode: '4.5.1030.10.12', accountName: 'GTOS. INFORMATICOS y SOFTWARES', subsection: 'GTOS. DE ADMINIS. Y VENTAS', amountCLP: 638_701 }),
      makeLine({ lineOrder: 14, accountCode: '3.5.1070.10.01', accountName: 'DIFERENCIA DE CAMBIO', section: 'OTROS_INGRESOS_EGRESOS', subsection: 'OTROS INGRESOS', amountCLP: -1_770_908 }),
      makeLine({ lineOrder: 15, accountCode: '3.5.1080.80.02', accountName: 'REAJUSTE CREDITO FISCAL', section: 'OTROS_INGRESOS_EGRESOS', subsection: 'CORRECCION MONETARIA', amountCLP: 55_109 }),
    ], {
      adminSalaryManualCLP: 5_000_000,
    });

    expect(result.errors).toEqual([]);
    expect(result.unmappedSourceLines).toEqual([]);
    expect(result.mappedLines.find((line) => line.targetKey === 'revenue_merchandise')?.amountCLP).toBe(58_457_090);
    expect(result.mappedLines.find((line) => line.targetKey === 'cost_of_merchandise_sold')?.amountCLP).toBe(33_258_073);
    expect(result.mappedLines.find((line) => line.targetKey === 'salaries_admin_gm')?.amountCLP).toBe(5_000_000);
    expect(result.mappedLines.find((line) => line.targetKey === 'salaries_sales_rep')?.amountCLP).toBe(17_915_886);
    expect(result.mappedLines.find((line) => line.targetKey === 'employee_benefits')?.amountCLP).toBe(1_433_215);
    expect(result.mappedLines.find((line) => line.targetKey === 'rental_expense')?.amountCLP).toBe(1_729_013);
    expect(result.mappedLines.find((line) => line.targetKey === 'freight_and_delivery_expense')?.amountCLP).toBe(478_264);
    expect(result.mappedLines.find((line) => line.targetKey === 'communication_expense')?.amountCLP).toBe(836_888);
    expect(result.mappedLines.find((line) => line.targetKey === 'gain_fx_transactions')?.amountCLP).toBe(-1_770_908);
    expect(result.mappedLines.find((line) => line.targetKey === 'miscellaneous_income')?.amountCLP).toBe(55_109);
    expect(result.mappedLines.find((line) => line.targetKey === 'gross_profit')?.amountCLP).toBe(25_199_017);
    expect(result.mappedLines.find((line) => line.targetKey === 'profit_before_income_tax')?.amountCLP).toBe(-3_910_048);
  });

  it('bloquea el guardado cuando aparecen cuentas nuevas sin regla', () => {
    const result = buildMonthlyPnlCustomMapping([
      makeLine({ lineOrder: 1, accountCode: '3.1.1010.10.01', accountName: 'VENTAS', section: 'INGRESOS', subsection: 'INGRESO DE EXPLOTACION', amountCLP: 100_000 }),
      makeLine({ lineOrder: 2, accountCode: '4.5.1030.10.99', accountName: 'CUENTA NUEVA SIN MAPEO', subsection: 'GTOS. DE ADMINIS. Y VENTAS', amountCLP: 2_898 }),
    ], {
      adminSalaryManualCLP: null,
    });

    expect(result.errors).toContain('Hay cuentas nuevas en el ER que aún no tienen regla de tratamiento.');
    expect(result.unmappedSourceLines).toHaveLength(1);
    expect(result.unmappedSourceLines[0]?.accountName).toBe('CUENTA NUEVA SIN MAPEO');
  });

  it('mapea las nuevas cuentas del ER al concepto operativo correcto', () => {
    const result = buildMonthlyPnlCustomMapping([
      makeLine({ lineOrder: 1, accountCode: '4.5.1030.10.11', accountName: 'GTOS. DE PUBLICIDAD', subsection: 'GTOS. DE ADMINIS. Y VENTAS', amountCLP: 8_044_017 }),
      makeLine({ lineOrder: 2, accountCode: '4.5.1030.10.25', accountName: 'PATENTES Y CONTRIBUCIONES', subsection: 'GTOS. DE ADMINIS. Y VENTAS', amountCLP: 34_876 }),
      makeLine({ lineOrder: 3, accountCode: '4.5.1030.10.30', accountName: 'GTOS. MENORES VEHICULOS', subsection: 'GTOS. DE ADMINIS. Y VENTAS', amountCLP: 351_263 }),
      makeLine({ lineOrder: 4, accountCode: '4.5.1040.10.11', accountName: 'INDEMNIZACION VACACIONES', subsection: 'GTOS. DE ADMINIS. Y VENTAS', amountCLP: 537_892 }),
      makeLine({ lineOrder: 5, accountCode: '4.5.1090.10.01', accountName: 'DIFERENCIA DE CAMBIO', section: 'OTROS_INGRESOS_EGRESOS', subsection: 'OTROS EGRESOS F. DE LA EXPLOT.', amountCLP: 19_056_179 }),
    ], {
      adminSalaryManualCLP: 0,
    });

    expect(result.errors).toEqual([]);
    expect(result.unmappedSourceLines).toEqual([]);
    expect(result.mappedLines.find((line) => line.targetKey === 'advertising_and_marketing_expense')?.amountCLP).toBe(8_044_017);
    expect(result.mappedLines.find((line) => line.targetKey === 'taxes_and_dues')?.amountCLP).toBe(34_876);
    expect(result.mappedLines.find((line) => line.targetKey === 'vehicle_maintenance_expense')?.amountCLP).toBe(351_263);
    expect(result.mappedLines.find((line) => line.targetKey === 'accrued_vacation_expense')?.amountCLP).toBe(537_892);
    expect(result.mappedLines.find((line) => line.targetKey === 'loss_fx_transactions')?.amountCLP).toBe(19_056_179);
  });

  it('mapea las nuevas cuentas notariales, informes comerciales y castigo de existencias', () => {
    const result = buildMonthlyPnlCustomMapping([
      makeLine({ lineOrder: 1, accountCode: '4.5.1030.10.19', accountName: 'GTOS. NOTARIALES', subsection: 'GTOS. DE ADMINIS. Y VENTAS', amountCLP: 7_000 }),
      makeLine({ lineOrder: 2, accountCode: '4.5.1030.10.31', accountName: 'GTOS. INFORMES COMERCIALES', subsection: 'GTOS. DE ADMINIS. Y VENTAS', amountCLP: 14_706 }),
      makeLine({ lineOrder: 3, accountCode: '4.5.1050.10.04', accountName: 'CASTIGO DE EXISTENCIAS', subsection: 'GTOS. DE ADMINIS. Y VENTAS', amountCLP: 786_139 }),
    ], {
      adminSalaryManualCLP: 0,
    });

    expect(result.errors).toEqual([]);
    expect(result.unmappedSourceLines).toEqual([]);
    expect(result.mappedLines.find((line) => line.targetKey === 'professional_fee')?.amountCLP).toBe(7_000);
    expect(result.mappedLines.find((line) => line.targetKey === 'commercial_credit_report_fees')?.amountCLP).toBe(14_706);
    expect(result.mappedLines.find((line) => line.targetKey === 'inventory_write_off')?.amountCLP).toBe(786_139);
  });

  it('mapea ropa de trabajo y epp como gasto administrativo general', () => {
    const result = buildMonthlyPnlCustomMapping([
      makeLine({ lineOrder: 1, accountCode: '4.5.1030.10.27', accountName: 'ROPA DE TRABAJO Y EPP', subsection: 'GTOS. DE ADMINIS. Y VENTAS', amountCLP: 117_500 }),
    ], {
      adminSalaryManualCLP: 0,
    });

    expect(result.errors).toEqual([]);
    expect(result.unmappedSourceLines).toEqual([]);
    expect(result.mappedLines.find((line) => line.targetKey === 'other_sga_expense')?.amountCLP).toBe(117_500);
  });

  it('mapea las nuevas cuentas acumuladas del ER a sus conceptos correctos', () => {
    const result = buildMonthlyPnlCustomMapping([
      makeLine({ lineOrder: 1, accountCode: '4.5.1030.10.28', accountName: 'GASTOS DE CAPACITACION', subsection: 'GTOS. DE ADMINIS. Y VENTAS', amountCLP: 2_700_000 }),
      makeLine({ lineOrder: 2, accountCode: '4.5.1030.10.33', accountName: 'GTOS. AUTOPISTAS', subsection: 'GTOS. DE ADMINIS. Y VENTAS', amountCLP: 134_777 }),
      makeLine({ lineOrder: 3, accountCode: '4.5.1050.10.07', accountName: 'IVA NO RECUPERABLE', subsection: 'GTOS. DE ADMINIS. Y VENTAS', amountCLP: 82_612 }),
      makeLine({ lineOrder: 4, accountCode: '4.5.1070.10.04', accountName: 'INTERESES Y MULTAS FISCALES', section: 'OTROS_INGRESOS_EGRESOS', subsection: 'DEPRECIACION', amountCLP: 99_613 }),
      makeLine({ lineOrder: 5, accountCode: '4.5.1070.10.05', accountName: 'REAJUSTE ART 72.', section: 'OTROS_INGRESOS_EGRESOS', subsection: 'DEPRECIACION', amountCLP: 28_642 }),
    ], {
      adminSalaryManualCLP: 0,
    });

    expect(result.errors).toEqual([]);
    expect(result.unmappedSourceLines).toEqual([]);
    expect(result.mappedLines.find((line) => line.targetKey === 'training_and_education_expense')?.amountCLP).toBe(2_700_000);
    expect(result.mappedLines.find((line) => line.targetKey === 'travel_and_transportation_expense')?.amountCLP).toBe(134_777);
    expect(result.mappedLines.find((line) => line.targetKey === 'taxes_and_dues')?.amountCLP).toBe(82_612);
    expect(result.mappedLines.find((line) => line.targetKey === 'miscellaneous_loss')?.amountCLP).toBe(128_255);
  });

  it('valida que Salaries (Admin, GM) no exceda REMUNERACIONES', () => {
    const result = buildMonthlyPnlCustomMapping([
      makeLine({ lineOrder: 1, accountCode: '4.5.1040.10.01', accountName: 'REMUNERACIONES', subsection: 'GTOS. DE ADMINIS. Y VENTAS', amountCLP: 2_000_000 }),
    ], {
      adminSalaryManualCLP: 2_500_000,
    });

    expect(result.errors).toContain('Salaries (Admin, GM) no puede ser mayor que REMUNERACIONES.');
  });

  it('no suma depreciacion del ejercicio dentro de SG&A para este layout', () => {
    const result = buildMonthlyPnlCustomMapping([
      makeLine({ lineOrder: 1, accountCode: '3.1.1010.10.01', accountName: 'VENTAS', section: 'INGRESOS', amountCLP: 1_000_000 }),
      makeLine({ lineOrder: 2, accountCode: '4.5.1040.10.01', accountName: 'REMUNERACIONES', subsection: 'GTOS. DE ADMINIS. Y VENTAS', amountCLP: 400_000 }),
      makeLine({ lineOrder: 3, accountCode: '4.5.1060.10.01', accountName: 'DEPRECIACION DEL EJERCICIO', section: 'OTROS_INGRESOS_EGRESOS', subsection: 'DEPRECIACION', amountCLP: 50_000 }),
    ], {
      adminSalaryManualCLP: 0,
    });

    expect(result.totals.totalSgaCLP).toBe(400_000);
    expect(result.mappedLines.find((line) => line.targetKey === 'depreciation_expense')?.amountCLP).toBe(50_000);
    expect(result.totals.totalNonOperatingExpensesCLP).toBe(50_000);
    expect(result.mappedLines.find((line) => line.targetKey === 'operating_income_loss')?.amountCLP).toBe(600_000);
    expect(result.mappedLines.find((line) => line.targetKey === 'profit_before_income_tax')?.amountCLP).toBe(550_000);
  });

  it('considera el subtotal GASTO FINANCIERO como interest expense no operacional', () => {
    const result = buildMonthlyPnlCustomMapping([
      makeLine({ lineOrder: 1, accountCode: '3.1.1010.10.01', accountName: 'VENTAS', section: 'INGRESOS', amountCLP: 1_000_000 }),
      makeLine({ lineOrder: 2, accountCode: '', accountName: 'GASTO FINANCIERO', section: 'OTROS_INGRESOS_EGRESOS', subsection: 'GASTO FINANCIERO', amountCLP: -6_384, isSubtotal: true }),
    ], {
      adminSalaryManualCLP: 0,
    });

    expect(result.errors).toEqual([]);
    expect(result.unmappedSourceLines).toEqual([]);
    expect(result.mappedLines.find((line) => line.targetKey === 'interest_expense')?.amountCLP).toBe(6_384);
    expect(result.totals.totalNonOperatingExpensesCLP).toBe(6_384);
    expect(result.mappedLines.find((line) => line.targetKey === 'net_profit_loss')?.amountCLP).toBe(993_616);
  });

  it('no duplica el subtotal GASTO FINANCIERO cuando reaparece dentro de RESULTADO NO OPERACIONAL', () => {
    const result = buildMonthlyPnlCustomMapping([
      makeLine({ lineOrder: 1, accountCode: '', accountName: 'GASTO FINANCIERO', section: 'OTROS_INGRESOS_EGRESOS', subsection: 'GASTO FINANCIERO', amountCLP: -6_384, isSubtotal: true }),
      makeLine({ lineOrder: 2, accountCode: '', accountName: 'GASTO FINANCIERO', section: 'RESULTADOS', subsection: 'RESULTADO NO OPERACIONAL', amountCLP: -6_384, isSubtotal: true }),
    ], {
      adminSalaryManualCLP: 0,
    });

    expect(result.errors).toEqual([]);
    expect(result.unmappedSourceLines).toEqual([]);
    expect(result.mappedLines.find((line) => line.targetKey === 'interest_expense')?.amountCLP).toBe(6_384);
    expect(result.totals.totalNonOperatingExpensesCLP).toBe(6_384);
  });
});
