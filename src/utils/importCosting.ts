export type ImportCurrencyCode = 'CLP' | 'USD' | 'EUR';

export const convertImportAmountToCLP = (
  amount: number,
  currency: ImportCurrencyCode,
  usdRate: number,
  eurRate: number,
): number => {
  const normalizedAmount = Number.isFinite(amount) ? amount : 0;
  const normalizedUsdRate = Number.isFinite(usdRate) ? usdRate : 0;
  const normalizedEurRate = Number.isFinite(eurRate) ? eurRate : 0;

  if (currency === 'USD') return normalizedAmount * normalizedUsdRate;
  if (currency === 'EUR') return normalizedAmount * normalizedEurRate;
  return normalizedAmount;
};
