import type { MonthlyPnlTargetSectionKey } from '../types/monthlyAnalysis';

export interface MonthlyPnlTargetAccountDefinition {
  key: string;
  label: string;
  aliases: string[];
  kind: 'detail' | 'subtotal';
  notes?: string[];
}

export interface MonthlyPnlTargetSectionDefinition {
  key: MonthlyPnlTargetSectionKey;
  label: string;
  accounts: MonthlyPnlTargetAccountDefinition[];
}

const defineAccount = (
  key: string,
  label: string,
  options?: {
    aliases?: string[];
    kind?: 'detail' | 'subtotal';
    notes?: string[];
  },
): MonthlyPnlTargetAccountDefinition => ({
  key,
  label,
  aliases: [label, ...(options?.aliases ?? [])],
  kind: options?.kind ?? 'detail',
  notes: options?.notes,
});

export const MONTHLY_PNL_TARGET_SECTIONS: MonthlyPnlTargetSectionDefinition[] = [
  {
    key: 'REVENUE',
    label: 'I. Revenue',
    accounts: [
      defineAccount('revenue_merchandise', 'Revenue - Merchandise'),
      defineAccount('other_revenue', 'Other revenue'),
    ],
  },
  {
    key: 'COST_OF_SALES',
    label: 'II. Cost of sales (COGS)',
    accounts: [
      defineAccount('cost_of_merchandise_sold', 'Cost of Merchandise Sold'),
      defineAccount('beginning_inventory_merchandise', 'Beginning Inventory - Merchandise'),
      defineAccount('purchases', 'Purchases'),
      defineAccount('transfers_out', 'Transfers Out'),
      defineAccount('ending_inventory_merchandise', 'Ending Inventory - Merchandise'),
      defineAccount('inventory_write_down', 'Inventory Write-down'),
      defineAccount('other_cost_of_sales', 'Other Cost of Sales'),
    ],
  },
  {
    key: 'GROSS_PROFIT',
    label: 'III. Gross profit',
    accounts: [
      defineAccount('gross_profit', 'Gross profit', { kind: 'subtotal' }),
    ],
  },
  {
    key: 'SGA',
    label: 'IV. Selling, general and administrative expenses (SG&A)',
    accounts: [
      defineAccount('salaries_admin_gm', 'Salaries (Admin, GM)'),
      defineAccount('salaries_sales_rep', 'Salaries (Sales Rep)'),
      defineAccount('bonus', 'Bonus'),
      defineAccount('incentive', 'Incentive'),
      defineAccount('provision_for_severance_indemnities', 'Provision for severance indemnities'),
      defineAccount('accrued_vacation_expense', 'Accrued vacation expense'),
      defineAccount('employee_benefits', 'Employee benefits'),
      defineAccount('mobile_phone_for_sales_rep', 'Mobile phone for sales rep'),
      defineAccount('vehicle_maintenance_expense', 'Vehicle maintenance expense'),
      defineAccount('communication_expense', 'Communication expense (internet, Office call, fax)'),
      defineAccount('utility_expense', 'Utility expense'),
      defineAccount('electric_power_expense', 'Electric power expense'),
      defineAccount('taxes_and_dues', 'Taxes and Dues'),
      defineAccount('rental_expense', 'Rental expense'),
      defineAccount('insurance_expense', 'Insurance Expense'),
      defineAccount('repair_expense', 'Repair expense'),
      defineAccount('freight_and_delivery_expense', 'Freight and delivery expense'),
      defineAccount('customs_duty', 'Customs Duty'),
      defineAccount('depreciation_expense', 'Depreciation expense'),
      defineAccount('training_and_education_expense', 'Training and education expense'),
      defineAccount('printing_and_publication_expenses', 'Printing and publication expenses'),
      defineAccount('commissions', 'Commissions (bank charge etc)'),
      defineAccount('professional_fee', 'Professional fee (Lawyer, CPA, etc)'),
      defineAccount('office_supply_expenses', 'Office supply expenses'),
      defineAccount('travel_and_transportation_expense', 'Travel and Transportation expense'),
      defineAccount('entertainment_expense', 'Entertainment expense'),
      defineAccount('advertising_and_marketing_expense', 'Advertising and marketing expense'),
      defineAccount('sales_promotion_expense', 'Sales Promotion Expense'),
      defineAccount('bad_debt_expense', 'Bad debt expense'),
      defineAccount('seminar_expense', 'Seminar expense'),
      defineAccount('speaker_fee', 'Speaker Fee'),
      defineAccount('other_sga_expense', 'Other Selling & Administrative expense'),
      defineAccount('merchant_fees_expense', 'Merchant Fees Expense'),
      defineAccount('commercial_credit_report_fees', 'Commercial Credit Report Fees'),
      defineAccount('misc_non_deductible_expenses', 'Miscellaneous Non-deductible Expenses'),
      defineAccount('inventory_write_off', 'Inventory Write-off', {
        notes: ['Please provide descriptions.'],
      }),
    ],
  },
  {
    key: 'OPERATING_INCOME',
    label: 'V. Operating income(loss)',
    accounts: [
      defineAccount('operating_income_loss', 'Operating income(loss)', { kind: 'subtotal' }),
    ],
  },
  {
    key: 'NON_OPERATING_INCOME',
    label: 'VI. Non-operating income',
    accounts: [
      defineAccount('interest_income', 'Interest income'),
      defineAccount('gain_fx_transactions', 'Gain on foreign currency transactions (exchange)'),
      defineAccount('gain_fx_translation', 'Gain on foreign currency translations'),
      defineAccount('reversal_allowance_doubtful_accounts', 'Reversals of allowance for doubtful accounts'),
      defineAccount('gain_on_disposals_ppe', 'Gains on disposals of property, plant and equipment'),
      defineAccount('miscellaneous_income', 'Miscellaneous Income'),
      defineAccount('equity_method_income', 'Equity Method Income'),
      defineAccount('dividend_income', 'Dividend Income'),
    ],
  },
  {
    key: 'NON_OPERATING_EXPENSES',
    label: 'VII. Non-operating expenses',
    accounts: [
      defineAccount('interest_expense', 'Interest expense'),
      defineAccount('loss_fx_transactions', 'Loss on foreign currency transactions (exchange)'),
      defineAccount('loss_fx_translation', 'Loss on foreign exchange translations'),
      defineAccount('loss_on_disposals_ppe', 'Loss on disposal of property, plant and equipment'),
      defineAccount('miscellaneous_loss', 'Miscellaneous Loss'),
      defineAccount('equity_method_loss', 'Equity Method Loss'),
    ],
  },
  {
    key: 'PROFIT_BEFORE_TAX',
    label: 'VIII. Profit(loss) before income tax',
    accounts: [
      defineAccount('profit_before_income_tax', 'Profit(loss) before income tax', { kind: 'subtotal' }),
    ],
  },
  {
    key: 'INCOME_TAX',
    label: 'IX. Income tax expense',
    accounts: [
      defineAccount('income_tax_expense', 'Income tax expense'),
    ],
  },
  {
    key: 'NET_PROFIT',
    label: 'X. Net profit(loss)',
    accounts: [
      defineAccount('net_profit_loss', 'Net profit(loss)', { kind: 'subtotal' }),
    ],
  },
];

export const MONTHLY_PNL_TARGET_ACCOUNTS: MonthlyPnlTargetAccountDefinition[] = MONTHLY_PNL_TARGET_SECTIONS
  .flatMap((section) => section.accounts);

export const findMonthlyPnlTargetAccount = (
  key: string,
): MonthlyPnlTargetAccountDefinition | null => (
  MONTHLY_PNL_TARGET_ACCOUNTS.find((account) => account.key === key) ?? null
);
