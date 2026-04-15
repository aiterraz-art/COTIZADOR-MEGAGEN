import { describe, expect, it } from 'vitest';

import { convertImportAmountToCLP } from './importCosting';

describe('importCosting', () => {
  it('mantiene CLP sin conversion', () => {
    expect(convertImportAmountToCLP(150000, 'CLP', 950, 1050)).toBe(150000);
  });

  it('convierte USD a CLP usando el valor del dolar', () => {
    expect(convertImportAmountToCLP(7500, 'USD', 950, 1050)).toBe(7125000);
  });

  it('convierte EUR a CLP usando el valor del euro', () => {
    expect(convertImportAmountToCLP(4000, 'EUR', 950, 1050)).toBe(4200000);
  });
});
