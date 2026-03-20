import { describe, expect, it } from 'vitest';
import {
  findMonthlyPnlTargetAccount,
  MONTHLY_PNL_TARGET_ACCOUNTS,
  MONTHLY_PNL_TARGET_SECTIONS,
} from './monthlyPnlDefinitions';

describe('monthlyPnlDefinitions', () => {
  it('expone la plantilla completa del estado de resultados en el orden esperado', () => {
    expect(MONTHLY_PNL_TARGET_SECTIONS.map((section) => section.key)).toEqual([
      'REVENUE',
      'COST_OF_SALES',
      'GROSS_PROFIT',
      'SGA',
      'OPERATING_INCOME',
      'NON_OPERATING_INCOME',
      'NON_OPERATING_EXPENSES',
      'PROFIT_BEFORE_TAX',
      'INCOME_TAX',
      'NET_PROFIT',
    ]);

    expect(MONTHLY_PNL_TARGET_ACCOUNTS).toHaveLength(64);
    expect(MONTHLY_PNL_TARGET_ACCOUNTS[0]?.key).toBe('revenue_merchandise');
    expect(MONTHLY_PNL_TARGET_ACCOUNTS.at(-1)?.key).toBe('net_profit_loss');
  });

  it('marca subtotales y notas especiales donde corresponde', () => {
    expect(findMonthlyPnlTargetAccount('gross_profit')?.kind).toBe('subtotal');
    expect(findMonthlyPnlTargetAccount('operating_income_loss')?.kind).toBe('subtotal');
    expect(findMonthlyPnlTargetAccount('profit_before_income_tax')?.kind).toBe('subtotal');
    expect(findMonthlyPnlTargetAccount('net_profit_loss')?.kind).toBe('subtotal');
    expect(findMonthlyPnlTargetAccount('inventory_write_off')?.notes).toEqual(['Please provide descriptions.']);
  });
});
