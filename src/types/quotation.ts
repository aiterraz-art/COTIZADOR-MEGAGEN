export type QuotePricingMode =
  | 'global_margin'
  | 'global_net'
  | 'at_cost'
  | 'manual_lines'
  | 'legacy_global_net';

export type LinePricingMode =
  | 'inherit'
  | 'fixed_net_unit'
  | 'fixed_net_total'
  | 'fixed_profit_unit'
  | 'fixed_profit_total'
  | 'fixed_margin_percent'
  | 'at_cost'
  | 'manual_net_unit';

export interface QuotePricingConfig {
  mode: QuotePricingMode;
  targetMarginPercent?: number;
  targetNetTotalCLP?: number;
}

export interface QuoteLineDraft {
  productId: string;
  productName: string;
  sku?: string;
  quantity: number;
  costUSD: number;
  category?: string;
  pricingMode: LinePricingMode;
  value?: number;
  locked?: boolean;
}

export interface CalculatedQuoteLine extends QuoteLineDraft {
  costUnitCLP: number;
  costTotalCLP: number;
  netUnitCLP: number;
  netTotalCLP: number;
  profitUnitCLP: number;
  profitTotalCLP: number;
  marginPercent: number;
  effectiveMode: LinePricingMode | 'global_margin' | 'global_net' | 'at_cost';
  locked: boolean;
}

export interface QuoteCalculationResult {
  lines: CalculatedQuoteLine[];
  totalCostCLP: number;
  totalNetCLP: number;
  totalIvaCLP: number;
  totalWithIvaCLP: number;
  totalProfitCLP: number;
  totalMarginPercent: number;
  unresolvedAmountCLP: number;
  warnings: string[];
}
