import { describe, expect, it } from 'vitest';
import {
  findMonthlyBalanceTargetRow,
  MONTHLY_BALANCE_TARGET_ROWS,
  MONTHLY_BALANCE_TARGET_SECTIONS,
} from './monthlyBalanceDefinitions';

describe('monthlyBalanceDefinitions', () => {
  it('mantiene el orden esperado de secciones del balance objetivo', () => {
    expect(MONTHLY_BALANCE_TARGET_SECTIONS.map((section) => section.key)).toEqual([
      'ASSETS',
      'LIABILITIES_EQUITY',
    ]);
  });

  it('expone las 71 filas de la plantilla objetivo', () => {
    expect(MONTHLY_BALANCE_TARGET_ROWS).toHaveLength(71);
  });

  it('resuelve filas duplicadas por label mediante keys distintas', () => {
    const fixedAssetsRows = MONTHLY_BALANCE_TARGET_ROWS.filter((row) => row.label === 'Fixed Assets');
    const totalFixedAssetsRows = MONTHLY_BALANCE_TARGET_ROWS.filter((row) => row.label === 'Total Fixed Assets');

    expect(fixedAssetsRows.map((row) => row.key)).toEqual(['fixed_assets_header', 'fixed_assets_group_header']);
    expect(totalFixedAssetsRows.map((row) => row.key)).toEqual(['total_fixed_assets_internal', 'total_fixed_assets']);
  });

  it('clasifica correctamente headers, subtotales y grand totals', () => {
    expect(findMonthlyBalanceTargetRow('current_assets_header')?.kind).toBe('header');
    expect(findMonthlyBalanceTargetRow('checking_savings')?.kind).toBe('detail');
    expect(findMonthlyBalanceTargetRow('total_inventory')?.kind).toBe('subtotal');
    expect(findMonthlyBalanceTargetRow('total_assets')?.kind).toBe('grand_total');
  });
});
