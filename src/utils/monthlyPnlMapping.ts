import type { MonthlyPnlSourceRow } from '../types/monthlyAnalysis';

export interface MonthlyPnlSourceAccountMapping {
  sourceCode?: string;
  sourceName: string;
  sourceKind: 'detail' | 'subtotal';
  targetKey: string;
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
  sourceKind: MonthlyPnlSourceAccountMapping['sourceKind'],
): string => `${sourceKind}::${normalize(sourceCode)}::${normalize(sourceName)}`;

export const MONTHLY_PNL_SOURCE_ACCOUNT_MAPPINGS: MonthlyPnlSourceAccountMapping[] = [
  { sourceCode: '3.1.1010.10.01', sourceName: 'VENTAS', sourceKind: 'detail', targetKey: 'revenue_merchandise' },
  { sourceName: 'COSTOS DE EXPLOTACION', sourceKind: 'subtotal', targetKey: 'cost_of_merchandise_sold' },
  { sourceCode: '4.5.1040.10.01', sourceName: 'REMUNERACIONES', sourceKind: 'detail', targetKey: 'salaries_split' },
  { sourceCode: '4.5.1040.10.02', sourceName: 'APORTE PATRONAL', sourceKind: 'detail', targetKey: 'employee_benefits' },
  { sourceCode: '4.5.1040.10.03', sourceName: 'ASIGNACION COLACION', sourceKind: 'detail', targetKey: 'employee_benefits' },
  { sourceCode: '4.5.1040.10.04', sourceName: 'ASIGNACION MOVILIZACION', sourceKind: 'detail', targetKey: 'employee_benefits' },
  { sourceCode: '4.5.1030.10.13', sourceName: 'COMBUSTIBLES Y LUBRICANTES', sourceKind: 'detail', targetKey: 'vehicle_maintenance_expense' },
  { sourceCode: '4.5.1030.10.03', sourceName: 'GTO. COMUNICACIONES', sourceKind: 'detail', targetKey: 'communication_expense' },
  { sourceCode: '4.5.1030.10.12', sourceName: 'GTOS. INFORMATICOS y SOFTWARES', sourceKind: 'detail', targetKey: 'communication_expense' },
  { sourceCode: '4.5.1030.10.04', sourceName: 'SERVICIOS BASICOS', sourceKind: 'detail', targetKey: 'utility_expense' },
  { sourceCode: '4.5.1030.10.02', sourceName: 'ARRIENDOS', sourceKind: 'detail', targetKey: 'rental_expense' },
  { sourceCode: '4.5.1030.10.16', sourceName: 'GTOS. COMUNES', sourceKind: 'detail', targetKey: 'rental_expense' },
  { sourceCode: '4.5.1030.10.06', sourceName: 'SEGUROS', sourceKind: 'detail', targetKey: 'insurance_expense' },
  { sourceCode: '4.5.1030.10.05', sourceName: 'MANTENCION Y REPARACION', sourceKind: 'detail', targetKey: 'repair_expense' },
  { sourceCode: '4.5.1030.10.21', sourceName: 'GTOS. DE FLETES', sourceKind: 'detail', targetKey: 'freight_and_delivery_expense' },
  { sourceCode: '4.5.1030.10.32', sourceName: 'GTOS. ENCOMIENDAS', sourceKind: 'detail', targetKey: 'freight_and_delivery_expense' },
  { sourceCode: '4.5.1030.10.15', sourceName: 'GTOS. CORRESPONDENCIA', sourceKind: 'detail', targetKey: 'freight_and_delivery_expense' },
  { sourceCode: '4.5.1060.10.01', sourceName: 'DEPRECIACION DEL EJERCICIO', sourceKind: 'detail', targetKey: 'depreciation_expense' },
  { sourceCode: '4.5.1030.10.24', sourceName: 'GTOS. BANCARIOS', sourceKind: 'detail', targetKey: 'commissions' },
  { sourceCode: '4.5.1030.10.01', sourceName: 'HONORARIOS', sourceKind: 'detail', targetKey: 'professional_fee' },
  { sourceCode: '4.5.1040.20.01', sourceName: 'GTOS. ASESORIAS CONTABLES', sourceKind: 'detail', targetKey: 'professional_fee' },
  { sourceCode: '4.5.1030.10.08', sourceName: 'UTILES Y ARTICULOS DE OFICINA', sourceKind: 'detail', targetKey: 'office_supply_expenses' },
  { sourceCode: '4.5.1030.10.26', sourceName: 'SERVICIOS Y ARTICULOS DE ASEO', sourceKind: 'detail', targetKey: 'office_supply_expenses' },
  { sourceCode: '4.5.1030.10.09', sourceName: 'GTOS. DE VIAJE Y ESTADIA', sourceKind: 'detail', targetKey: 'travel_and_transportation_expense' },
  { sourceCode: '4.5.1030.10.17', sourceName: 'GTOS. LOCOMOCION', sourceKind: 'detail', targetKey: 'travel_and_transportation_expense' },
  { sourceCode: '4.5.1030.10.22', sourceName: 'GTOS. DE ESTACIONAMIENTO', sourceKind: 'detail', targetKey: 'travel_and_transportation_expense' },
  { sourceCode: '4.5.1030.10.10', sourceName: 'GTOS. DE REPRESENTACION', sourceKind: 'detail', targetKey: 'entertainment_expense' },
  { sourceCode: '4.5.1030.10.29', sourceName: 'GTOS. COMISION MEDIOS DE PAGO', sourceKind: 'detail', targetKey: 'merchant_fees_expense' },
  { sourceCode: '4.5.1030.10.98', sourceName: 'GASTOS SIN COMPROBANTES', sourceKind: 'detail', targetKey: 'misc_non_deductible_expenses' },
  { sourceCode: '3.5.1070.10.01', sourceName: 'DIFERENCIA DE CAMBIO', sourceKind: 'detail', targetKey: 'gain_fx_transactions' },
  { sourceCode: '3.5.1080.80.02', sourceName: 'REAJUSTE CREDITO FISCAL', sourceKind: 'detail', targetKey: 'miscellaneous_income' },
];

const sourceMappingIndex = new Map<string, MonthlyPnlSourceAccountMapping>(
  MONTHLY_PNL_SOURCE_ACCOUNT_MAPPINGS.map((mapping) => [
    buildMatchKey(mapping.sourceCode ?? '', mapping.sourceName, mapping.sourceKind),
    mapping,
  ]),
);

export const findMonthlyPnlSourceMapping = (
  row: MonthlyPnlSourceRow,
): MonthlyPnlSourceAccountMapping | null => {
  const kind: MonthlyPnlSourceAccountMapping['sourceKind'] = row.isSubtotal ? 'subtotal' : 'detail';
  return sourceMappingIndex.get(buildMatchKey(row.accountCode, row.accountName, kind)) ?? null;
};
