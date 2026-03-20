import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Boxes,
  Copy,
  Database,
  FileSpreadsheet,
  RefreshCw,
  Save,
  Search,
  Upload,
  X,
} from 'lucide-react';
import type { Product } from '../data/mockProducts';
import {
  fetchMonthlyClosureByPeriod,
  fetchMonthlyClosures,
  upsertMonthlyClosure,
} from '../lib/monthlyAnalysisRepository';
import type {
  MonthlyAnalysisSummary,
  MonthlyBalanceCustomMappingResult,
  MonthlyBalanceLine,
  MonthlyComparisonItem,
  MonthlyInventoryFamily,
  MonthlyInventoryMovement,
  MonthlyManualInputs,
  MonthlyParseResult,
  MonthlyPnlCustomMappingResult,
  MonthlyPnlLine,
  MonthlyCloseListItem,
  MonthlyCloseRecord,
} from '../types/monthlyAnalysis';
import {
  buildMonthlyAnalysisSummary,
  buildMonthlyComparison,
  getPreviousPeriodKey,
  hasMinimumBalanceStructure,
  hasMinimumPnlStructure,
} from '../utils/monthlyAnalysisEngine';
import { buildMonthlyBalanceCustomMapping } from '../utils/monthlyBalanceCustomEngine';
import { buildMonthlyPnlCustomMapping } from '../utils/monthlyPnlCustomEngine';
import {
  parseMonthlyBalanceFile,
  parseMonthlyInventoryFile,
  parseMonthlyPnlFile,
} from '../utils/monthlyAnalysisParser';
import {
  createEmptyImplantCountMap,
  findImplantDefinition,
  IMPLANT_DEFINITIONS,
} from '../data/implantDefinitions';
import { MONTHLY_BALANCE_TARGET_SECTIONS } from '../data/monthlyBalanceDefinitions';
import { MONTHLY_PNL_TARGET_SECTIONS } from '../data/monthlyPnlDefinitions';

type MonthlyTab = 'summary' | 'balance' | 'pnl' | 'inventory';
type UploadKind = 'balance' | 'pnl' | 'inventory';
const MONTHLY_ANALYSIS_STORAGE_KEY = 'megagen.monthlyAnalysis.viewState';
const MONTHLY_ANALYSIS_STORAGE_VERSION = 5;

interface MonthlyAnalysisModuleProps {
  products: Product[];
}

interface MonthlyDraftState {
  balance: MonthlyParseResult<MonthlyBalanceLine> | null;
  pnl: MonthlyParseResult<MonthlyPnlLine> | null;
  inventory: MonthlyParseResult<MonthlyInventoryMovement> | null;
  manualInputs: MonthlyManualInputs;
}

interface QuickCopyMetric {
  key: string;
  label: string;
  quantity: number;
  amountCLP: number;
}

interface PersistedMonthlyAnalysisState {
  version: number;
  periodKey: string;
  activeTab: MonthlyTab;
  draft: MonthlyDraftState;
  selectedClosurePeriodKey: string | null;
}

const initialDraftState = (): MonthlyDraftState => ({
  balance: null,
  pnl: null,
  inventory: null,
  manualInputs: {
    adminSalaryManualCLP: null,
  },
});

const currentMonth = (): string => new Date().toISOString().slice(0, 7);

const formatCLP = (value: number): string => new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
}).format(value);

const formatQty = (value: number): string => new Intl.NumberFormat('es-CL', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
}).format(value);

const formatDelta = (value: number | null, kind: MonthlyComparisonItem['kind']): string => {
  if (value === null) return 'N/D';
  if (kind === 'currency') return formatCLP(value);
  if (kind === 'percent') return `${value.toFixed(2)}%`;
  return formatQty(value);
};

const formatValue = (value: number, kind: MonthlyComparisonItem['kind']): string => {
  if (kind === 'currency') return formatCLP(value);
  if (kind === 'percent') return `${value.toFixed(2)}%`;
  return formatQty(value);
};

const formatPeriodLabel = (periodKey: string): string => {
  const [year, month] = periodKey.split('-');
  const monthNumber = Number(month);
  if (!year || !monthNumber) return periodKey;
  const formatter = new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric' });
  return formatter.format(new Date(Number(year), monthNumber - 1, 1));
};

const getPnlSectionTotalLabel = (sectionLabel: string): string => (
  `Total ${sectionLabel.replace(/^[IVX]+\.\s*/, '')}`
);

const combineMessages = (
  ...entries: Array<MonthlyParseResult<unknown> | null>
): { warnings: string[]; errors: string[] } => {
  const warnings = entries.flatMap((entry) => entry?.warnings ?? []);
  const errors = entries.flatMap((entry) => entry?.errors ?? []);
  return { warnings, errors };
};

const normalizeMetricLabel = (value: string): string => value
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim();

const hasDraftContent = (draft: MonthlyDraftState): boolean => Boolean(
  draft.balance
  || draft.pnl
  || draft.inventory,
);

const readStoredMonthlyAnalysisState = (): PersistedMonthlyAnalysisState | null => {
  try {
    const raw = localStorage.getItem(MONTHLY_ANALYSIS_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<PersistedMonthlyAnalysisState>;
    if (parsed.version !== MONTHLY_ANALYSIS_STORAGE_VERSION) return null;
    const initialDraft = initialDraftState();
    const parsedDraft = parsed.draft as Partial<MonthlyDraftState> | undefined;

    return {
      version: MONTHLY_ANALYSIS_STORAGE_VERSION,
      periodKey: typeof parsed.periodKey === 'string' && parsed.periodKey ? parsed.periodKey : currentMonth(),
      activeTab: parsed.activeTab === 'balance' || parsed.activeTab === 'pnl' || parsed.activeTab === 'inventory' ? parsed.activeTab : 'summary',
      draft: {
        ...initialDraft,
        ...parsedDraft,
        manualInputs: {
          ...initialDraft.manualInputs,
          ...(parsedDraft?.manualInputs ?? {}),
        },
      },
      selectedClosurePeriodKey: typeof parsed.selectedClosurePeriodKey === 'string' && parsed.selectedClosurePeriodKey
        ? parsed.selectedClosurePeriodKey
        : null,
    };
  } catch {
    return null;
  }
};

const INVENTORY_FAMILIES: MonthlyInventoryFamily[] = ['IMPLANTES', 'KITS', 'MOTOR', 'ADITAMENTOS', 'DESPACHO', 'SIN_CLASIFICAR'];

const INVENTORY_FAMILY_LABELS: Record<MonthlyInventoryFamily, string> = {
  IMPLANTES: 'Implantes',
  KITS: 'Kits',
  MOTOR: 'Motores',
  ADITAMENTOS: 'Aditamentos',
  DESPACHO: 'Despacho',
  SIN_CLASIFICAR: 'Sin clasificar',
};

const getInventoryFamilyLabel = (family: MonthlyInventoryFamily): string => INVENTORY_FAMILY_LABELS[family];

const createEmptyInventoryFamilySummary = (
  family: MonthlyInventoryFamily,
): MonthlyAnalysisSummary['inventory']['byFamily'][MonthlyInventoryFamily] => ({
  family,
  openingQty: 0,
  entriesQty: 0,
  exitsQty: 0,
  adjustmentsQty: 0,
  closingQty: 0,
  netChangeQty: 0,
  salesAmountCLP: 0,
  skuCount: 0,
});

const MetricCard: React.FC<{ title: string; value: string; hint?: string; tone?: 'default' | 'success' | 'warning' }> = ({
  title,
  value,
  hint,
  tone = 'default',
}) => {
  const colors = {
    default: 'var(--accent)',
    success: 'var(--success)',
    warning: 'var(--warning)',
  };

  return (
    <div className="finance-card">
      <div className="text-muted" style={{ fontSize: '0.68rem', marginBottom: '0.35rem' }}>{title}</div>
      <div style={{ fontWeight: 800, fontSize: '1.22rem', color: colors[tone] }}>{value}</div>
      {hint ? <div className="text-muted" style={{ fontSize: '0.74rem', marginTop: '0.25rem' }}>{hint}</div> : null}
    </div>
  );
};

const ComparisonTable: React.FC<{ title: string; items: MonthlyComparisonItem[] }> = ({ title, items }) => (
  <div className="finance-card" style={{ padding: '1rem' }}>
    <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>{title}</h3>
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Métrica</th>
            <th style={{ textAlign: 'right' }}>Actual</th>
            <th style={{ textAlign: 'right' }}>Anterior</th>
            <th style={{ textAlign: 'right' }}>Variación</th>
            <th style={{ textAlign: 'right' }}>Variación %</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.key}>
              <td>{item.label}</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatValue(item.currentValue, item.kind)}</td>
              <td style={{ textAlign: 'right' }}>{item.previousValue === null ? 'N/D' : formatValue(item.previousValue, item.kind)}</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatDelta(item.deltaValue, item.kind)}</td>
              <td style={{ textAlign: 'right' }}>{item.deltaPercent === null ? 'N/D' : `${item.deltaPercent.toFixed(2)}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const MonthlyAnalysisModule: React.FC<MonthlyAnalysisModuleProps> = ({ products }) => {
  const persistedState = useMemo(() => readStoredMonthlyAnalysisState(), []);
  const restoredDraft = persistedState?.draft ?? initialDraftState();
  const restoredDraftExists = hasDraftContent(restoredDraft);
  const initialPreferredClosurePeriodKey = persistedState?.selectedClosurePeriodKey ?? persistedState?.periodKey ?? null;
  const balanceInputRef = useRef<HTMLInputElement>(null);
  const pnlInputRef = useRef<HTMLInputElement>(null);
  const inventoryInputRef = useRef<HTMLInputElement>(null);

  const [periodKey, setPeriodKey] = useState<string>(() => persistedState?.periodKey ?? currentMonth());
  const [activeTab, setActiveTab] = useState<MonthlyTab>(() => persistedState?.activeTab ?? 'summary');
  const [draft, setDraft] = useState<MonthlyDraftState>(() => restoredDraft);
  const [history, setHistory] = useState<MonthlyCloseListItem[]>([]);
  const [selectedClosure, setSelectedClosure] = useState<MonthlyCloseRecord | null>(null);
  const [selectedClosurePeriodKey, setSelectedClosurePeriodKey] = useState<string | null>(() => persistedState?.selectedClosurePeriodKey ?? null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [copiedMetricKey, setCopiedMetricKey] = useState('');
  const [inventorySearch, setInventorySearch] = useState('');
  const [familyFilter, setFamilyFilter] = useState<'ALL' | MonthlyInventoryFamily>('ALL');
  const [isHistoryWindowOpen, setIsHistoryWindowOpen] = useState(false);
  const [historyPreviewPeriodKey, setHistoryPreviewPeriodKey] = useState<string | null>(null);

  const loadClosure = useCallback(async (nextPeriodKey: string): Promise<void> => {
    setIsLoadingDetail(true);
    setErrorMessage('');
    setInfoMessage('');
    setSelectedClosurePeriodKey(nextPeriodKey);
    try {
      const closure = await fetchMonthlyClosureByPeriod(nextPeriodKey);
      setSelectedClosure(closure);
      setDraft(initialDraftState());
      setPeriodKey(nextPeriodKey);
      setActiveTab('summary');
      if (!closure) {
        setInfoMessage(`No existe cierre guardado para ${nextPeriodKey}.`);
      }
    } catch (error) {
      setErrorMessage(`Error cargando el cierre mensual: ${(error as Error).message}`);
    } finally {
      setIsLoadingDetail(false);
    }
  }, []);

  const refreshHistory = useCallback(async (options?: {
    preferredPeriodKey?: string | null;
    skipSelection?: boolean;
  }): Promise<void> => {
    setIsLoadingHistory(true);
    setErrorMessage('');
    try {
      const rows = await fetchMonthlyClosures();
      setHistory(rows);

      const targetPeriodKey = options?.skipSelection
        ? null
        : options?.preferredPeriodKey ?? rows[0]?.periodKey ?? null;

      if (targetPeriodKey) {
        await loadClosure(targetPeriodKey);
      } else {
        setSelectedClosure(null);
        if (!options?.skipSelection) {
          setSelectedClosurePeriodKey(null);
        }
      }
    } catch (error) {
      setErrorMessage(`Error cargando historial mensual: ${(error as Error).message}`);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [loadClosure]);

  useEffect(() => {
    void refreshHistory({
      preferredPeriodKey: restoredDraftExists
        ? null
        : initialPreferredClosurePeriodKey,
      skipSelection: restoredDraftExists,
    });
  }, [initialPreferredClosurePeriodKey, refreshHistory, restoredDraftExists]);

  useEffect(() => {
    try {
      const payload: PersistedMonthlyAnalysisState = {
        version: MONTHLY_ANALYSIS_STORAGE_VERSION,
        periodKey,
        activeTab,
        draft,
        selectedClosurePeriodKey,
      };
      localStorage.setItem(MONTHLY_ANALYSIS_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage errors so the module remains usable even if localStorage is unavailable.
    }
  }, [activeTab, draft, periodKey, selectedClosurePeriodKey]);

  useEffect(() => {
    if (!isHistoryWindowOpen) return undefined;

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setIsHistoryWindowOpen(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isHistoryWindowOpen]);

  const draftSummary = useMemo<MonthlyAnalysisSummary | null>(() => {
    if (!draft.balance || !draft.pnl || !draft.inventory) return null;
    if (draft.balance.errors.length || draft.pnl.errors.length || draft.inventory.errors.length) return null;

    return buildMonthlyAnalysisSummary(
      draft.balance.rows,
      draft.pnl.rows,
      draft.inventory.rows,
    );
  }, [draft.balance, draft.inventory, draft.pnl]);

  const draftCustomPnl = useMemo<MonthlyPnlCustomMappingResult | null>(() => (
    draft.pnl ? buildMonthlyPnlCustomMapping(draft.pnl.rows, draft.manualInputs) : null
  ), [draft.manualInputs, draft.pnl]);

  const draftCustomBalance = useMemo<MonthlyBalanceCustomMappingResult | null>(() => (
    draft.balance
      ? buildMonthlyBalanceCustomMapping(draft.balance.rows, {
        customPnl: draftCustomPnl,
      })
      : null
  ), [draft.balance, draftCustomPnl]);

  const selectedCustomPnl = useMemo<MonthlyPnlCustomMappingResult | null>(() => {
    if (!selectedClosure) return null;
    if (!selectedClosure.pnlLines.length) return null;
    return buildMonthlyPnlCustomMapping(
      selectedClosure.pnlLines,
      selectedClosure.summary.manualInputs ?? { adminSalaryManualCLP: null },
    );
  }, [selectedClosure]);

  const selectedCustomBalance = useMemo<MonthlyBalanceCustomMappingResult | null>(() => {
    if (!selectedClosure) return null;
    if (!selectedClosure.balanceLines.length) return null;

    if (
      selectedClosure.summary.customBalance
      && selectedClosure.summary.customBalance.sourceNetIncomeControlCLP !== undefined
      && selectedClosure.summary.customBalance.netIncomeDifferenceCLP !== undefined
    ) {
      return selectedClosure.summary.customBalance;
    }

    return buildMonthlyBalanceCustomMapping(selectedClosure.balanceLines, {
      customPnl: selectedCustomPnl,
      fallbackNetIncomeCLP: selectedClosure.summary.pnl.netIncomeCLP,
    });
  }, [selectedClosure, selectedCustomPnl]);

  const displaySummary = draftSummary ?? selectedClosure?.summary ?? null;
  const displayPeriodKey = draftSummary ? periodKey : selectedClosure?.periodKey ?? null;
  const displayCustomBalance = draftCustomBalance ?? selectedCustomBalance;
  const displayCustomPnl = draftCustomPnl ?? selectedCustomPnl;
  const displayManualInputs = draft.pnl
    ? draft.manualInputs
    : (selectedClosure?.summary.manualInputs ?? { adminSalaryManualCLP: null });
  const previousPeriodKey = displayPeriodKey ? getPreviousPeriodKey(displayPeriodKey) : null;
  const previousSummary = previousPeriodKey ? history.find((item) => item.periodKey === previousPeriodKey)?.summary ?? null : null;
  const comparison = displaySummary && displayPeriodKey
    ? buildMonthlyComparison(displayPeriodKey, displaySummary, previousPeriodKey, previousSummary)
    : null;

  const draftMessages = useMemo(() => {
    const combined = combineMessages(draft.balance, draft.pnl, draft.inventory);
    return {
      warnings: [...combined.warnings, ...(draftCustomPnl?.warnings ?? []), ...(draftCustomBalance?.warnings ?? [])],
      errors: combined.errors,
    };
  }, [draft.balance, draft.inventory, draft.pnl, draftCustomBalance, draftCustomPnl]);
  const draftValidationErrors = useMemo(() => {
    const errors: string[] = [];

    if (draft.balance && !hasMinimumBalanceStructure(draft.balance.rows)) {
      errors.push('El balance no contiene líneas suficientes para activos y pasivos/patrimonio.');
    }

    if (draft.pnl && !hasMinimumPnlStructure(draft.pnl.rows)) {
      errors.push('El estado de resultados no contiene líneas suficientes de ingresos y costos/gastos.');
    }

    if (draftCustomPnl?.errors.length) {
      errors.push(...draftCustomPnl.errors);
    }

    return errors;
  }, [draft.balance, draft.pnl, draftCustomPnl]);

  const canSaveDraft = Boolean(
    draft.balance
    && draft.pnl
    && draft.inventory
    && !draftMessages.errors.length
    && !draftValidationErrors.length
    && draftSummary,
  );

  const displayPnlLines = draft.pnl?.rows ?? selectedClosure?.pnlLines ?? [];
  const displayInventoryMovements = useMemo(
    () => draft.inventory?.rows ?? selectedClosure?.inventoryMovements ?? [],
    [draft.inventory, selectedClosure?.inventoryMovements],
  );
  const displayBalanceTraceabilityRows = useMemo(() => (
    displayCustomBalance?.mappedLines.flatMap((line) => line.sources.map((source) => ({
      ...source,
      targetKey: line.targetKey,
      targetLabel: line.targetLabel,
    }))) ?? []
  ), [displayCustomBalance]);
  const displayBalanceLineIndex = useMemo(() => new Map(
    displayCustomBalance?.mappedLines.map((line) => [line.targetKey, line]) ?? [],
  ), [displayCustomBalance]);
  const displayPnlTraceabilityRows = useMemo(() => (
    displayCustomPnl?.mappedLines.flatMap((line) => line.sources.map((source) => ({
      ...source,
      targetKey: line.targetKey,
      targetLabel: line.targetLabel,
      isManual: Boolean(line.isManual),
    }))) ?? []
  ), [displayCustomPnl]);
  const displayPnlLineIndex = useMemo(() => new Map(
    displayCustomPnl?.mappedLines.map((line) => [line.targetKey, line]) ?? [],
  ), [displayCustomPnl]);
  const displayPnlSectionTotalIndex = useMemo(() => new Map(
    MONTHLY_PNL_TARGET_SECTIONS.map((section) => [
      section.key,
      section.accounts.reduce((acc, account) => acc + (displayPnlLineIndex.get(account.key)?.amountCLP ?? 0), 0),
    ]),
  ), [displayPnlLineIndex]);
  const totalAssetsLine = displayBalanceLineIndex.get('total_assets') ?? null;
  const totalLiabilitiesAndEquityLine = displayBalanceLineIndex.get('total_liabilities_and_equity') ?? null;
  const balanceNetIncomeLine = displayBalanceLineIndex.get('net_income') ?? null;
  const displayBalanceInlineWarnings = useMemo(() => (
    displayCustomBalance?.warnings.filter((warning) => (
      !warning.startsWith('Hay cuentas nuevas en el Balance')
      && !warning.startsWith('El balance no cuadra')
      && !warning.startsWith('El Net Income del ER difiere')
    )) ?? []
  ), [displayCustomBalance]);
  const sourceNetProfitLine = useMemo(() => displayPnlLines.find((line) => {
    const normalizedName = normalizeMetricLabel(line.accountName);
    return normalizedName === 'resultado ejercicio' || normalizedName === 'resultado del ej antes de imp';
  }) ?? null, [displayPnlLines]);
  const appNetProfitLine = displayPnlLineIndex.get('net_profit_loss') ?? null;
  const totalSalariesSourceCLP = useMemo(() => displayPnlLines
    .filter((line) => line.accountCode === '4.5.1040.10.01' && normalizeMetricLabel(line.accountName) === 'remuneraciones')
    .reduce((acc, line) => acc + Math.abs(line.amountCLP), 0), [displayPnlLines]);
  const netProfitDifferenceCLP = sourceNetProfitLine && appNetProfitLine
    ? appNetProfitLine.amountCLP - sourceNetProfitLine.amountCLP
    : null;
  const previewPeriodKey = displayPeriodKey ?? (draft.inventory ? periodKey : null);

  const inventorySummaryPreview = useMemo<MonthlyAnalysisSummary['inventory'] | null>(() => {
    if (displaySummary) return displaySummary.inventory;
    if (!displayInventoryMovements.length) return null;

    const byFamily = Object.fromEntries(
      INVENTORY_FAMILIES.map((family) => [family, createEmptyInventoryFamilySummary(family)]),
    ) as MonthlyAnalysisSummary['inventory']['byFamily'];
    const familySkuSets = Object.fromEntries(
      INVENTORY_FAMILIES.map((family) => [family, new Set<string>()]),
    ) as Record<MonthlyInventoryFamily, Set<string>>;
    const totalSkuSet = new Set<string>();
    const totals = createEmptyInventoryFamilySummary('SIN_CLASIFICAR');
    let unmappedSkuCount = 0;

    for (const movement of displayInventoryMovements) {
      const familySummary = byFamily[movement.family];

      familySummary.openingQty += movement.openingQty;
      familySummary.entriesQty += movement.entriesQty;
      familySummary.exitsQty += movement.exitsQty;
      familySummary.adjustmentsQty += movement.adjustmentsQty;
      familySummary.closingQty += movement.closingQty;
      familySummary.netChangeQty += movement.closingQty - movement.openingQty;
      familySummary.salesAmountCLP += movement.totalAmountCLP ?? 0;

      totals.openingQty += movement.openingQty;
      totals.entriesQty += movement.entriesQty;
      totals.exitsQty += movement.exitsQty;
      totals.adjustmentsQty += movement.adjustmentsQty;
      totals.closingQty += movement.closingQty;
      totals.netChangeQty += movement.closingQty - movement.openingQty;
      totals.salesAmountCLP += movement.totalAmountCLP ?? 0;

      familySkuSets[movement.family].add(movement.sku);
      totalSkuSet.add(movement.sku);

      if (movement.isUnclassified) {
        unmappedSkuCount += 1;
      }
    }

    for (const family of INVENTORY_FAMILIES) {
      byFamily[family].skuCount = familySkuSets[family].size;
    }

    totals.skuCount = totalSkuSet.size;

    return {
      byFamily,
      totals,
      unmappedSkuCount,
    };
  }, [displayInventoryMovements, displaySummary]);

  const filteredInventoryMovements = useMemo(() => {
    const query = inventorySearch.toLowerCase().trim();
    return displayInventoryMovements.filter((movement) => {
      const familyMatches = familyFilter === 'ALL' || movement.family === familyFilter;
      const queryMatches = !query
        || `${movement.sku} ${movement.productName}`.toLowerCase().includes(query);
      return familyMatches && queryMatches;
    });
  }, [displayInventoryMovements, familyFilter, inventorySearch]);

  const implantInventoryMovements = useMemo(
    () => displayInventoryMovements.filter((movement) => movement.family === 'IMPLANTES'),
    [displayInventoryMovements],
  );

  const implantSalesByModel = useMemo(() => {
    const counts = createEmptyImplantCountMap();
    const amounts = createEmptyImplantCountMap();

    for (const movement of implantInventoryMovements) {
      const implant = findImplantDefinition(movement.productName);
      if (!implant) continue;
      counts[implant.key] += movement.exitsQty;
      amounts[implant.key] += movement.totalAmountCLP ?? 0;
    }

    return IMPLANT_DEFINITIONS.map((implant) => ({
      key: implant.key,
      name: implant.name,
      quantity: counts[implant.key],
      amountCLP: amounts[implant.key],
    }));
  }, [implantInventoryMovements]);

  const totalImplantsSold = useMemo(
    () => implantSalesByModel.reduce((acc, implant) => acc + implant.quantity, 0),
    [implantSalesByModel],
  );
  const totalImplantsAmountCLP = useMemo(
    () => implantSalesByModel.reduce((acc, implant) => acc + implant.amountCLP, 0),
    [implantSalesByModel],
  );

  const implantQuickCopyMetrics = useMemo<QuickCopyMetric[]>(() => (
    [
      ...implantSalesByModel.map((implant) => ({
        key: `implant-${implant.key}`,
        label: implant.name,
        quantity: implant.quantity,
        amountCLP: implant.amountCLP,
      })),
      {
        key: 'implant-total',
        label: 'Total Implantes',
        quantity: totalImplantsSold,
        amountCLP: totalImplantsAmountCLP,
      },
    ]
  ), [implantSalesByModel, totalImplantsAmountCLP, totalImplantsSold]);

  const buildFamilyQuickCopyMetrics = useCallback((
    family: Exclude<MonthlyInventoryFamily, 'IMPLANTES'>,
    totalLabel: string,
  ): QuickCopyMetric[] => {
    const aggregated = new Map<string, QuickCopyMetric>();

    for (const movement of displayInventoryMovements) {
      if (movement.family !== family) continue;

      const normalizedName = normalizeMetricLabel(movement.productName);
      const existing = aggregated.get(normalizedName);
      if (existing) {
        existing.quantity += movement.exitsQty;
        existing.amountCLP += movement.totalAmountCLP ?? 0;
        continue;
      }

      aggregated.set(normalizedName, {
        key: `${family.toLowerCase()}-${normalizedName}`,
        label: movement.productName,
        quantity: movement.exitsQty,
        amountCLP: movement.totalAmountCLP ?? 0,
      });
    }

    const metrics = Array.from(aggregated.values()).sort((left, right) => (
      right.quantity - left.quantity || left.label.localeCompare(right.label, 'es')
    ));
    const totalQuantity = metrics.reduce((acc, metric) => acc + metric.quantity, 0);
    const totalAmountCLP = metrics.reduce((acc, metric) => acc + metric.amountCLP, 0);

    if (!metrics.length) return [];

    return [
      ...metrics,
      {
        key: `${family.toLowerCase()}-total`,
        label: totalLabel,
        quantity: totalQuantity,
        amountCLP: totalAmountCLP,
      },
    ];
  }, [displayInventoryMovements]);

  const kitQuickCopyMetrics = useMemo(
    () => buildFamilyQuickCopyMetrics('KITS', 'Total Kits'),
    [buildFamilyQuickCopyMetrics],
  );
  const motorQuickCopyMetrics = useMemo(
    () => buildFamilyQuickCopyMetrics('MOTOR', 'Total Motores'),
    [buildFamilyQuickCopyMetrics],
  );
  const abutmentQuickCopyMetrics = useMemo(
    () => buildFamilyQuickCopyMetrics('ADITAMENTOS', 'Total Aditamentos'),
    [buildFamilyQuickCopyMetrics],
  );
  const dispatchQuickCopyMetrics = useMemo(
    () => buildFamilyQuickCopyMetrics('DESPACHO', 'Total Despacho'),
    [buildFamilyQuickCopyMetrics],
  );

  const existingPeriod = history.find((item) => item.periodKey === periodKey) ?? null;
  const historyPreviewItem = useMemo(() => {
    if (!history.length) return null;
    if (!historyPreviewPeriodKey) return history[0] ?? null;
    return history.find((item) => item.periodKey === historyPreviewPeriodKey) ?? history[0] ?? null;
  }, [history, historyPreviewPeriodKey]);

  const openHistoryWindow = (): void => {
    setHistoryPreviewPeriodKey(selectedClosure?.periodKey ?? selectedClosurePeriodKey ?? history[0]?.periodKey ?? null);
    setIsHistoryWindowOpen(true);
  };

  const handleOpenPreviewClosure = async (): Promise<void> => {
    if (!historyPreviewItem) return;
    await loadClosure(historyPreviewItem.periodKey);
    setIsHistoryWindowOpen(false);
  };

  const handleAdminSalaryInputChange = (value: string): void => {
    const trimmedValue = value.trim();
    setDraft((prev) => ({
      ...prev,
      manualInputs: {
        ...prev.manualInputs,
        adminSalaryManualCLP: trimmedValue ? Number(trimmedValue.replace(/[^\d-]/g, '')) : null,
      },
    }));
  };

  const copyMetricValue = async (key: string, value: number): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value.toFixed(0));
      setCopiedMetricKey(key);
      setTimeout(() => setCopiedMetricKey(''), 1200);
    } catch {
      setErrorMessage('No fue posible copiar el valor al portapapeles.');
    }
  };

  const renderCopyableCurrencyButton = (
    key: string,
    value: number,
    options?: {
      minWidth?: string;
      fontWeight?: number;
      subtle?: boolean;
    },
  ): React.ReactNode => {
    const isCopied = copiedMetricKey === key;
    const isNegative = value < 0;

    return (
      <button
        className="btn"
        style={{
          fontSize: '0.85rem',
          fontWeight: options?.fontWeight ?? 700,
          padding: options?.subtle ? '0.15rem 0.35rem' : '0.25rem 0.55rem',
          background: isCopied
            ? 'rgba(16,185,129,0.12)'
            : options?.subtle
              ? 'transparent'
              : 'rgba(2,132,199,0.08)',
          color: isCopied
            ? 'var(--success)'
            : isNegative
              ? 'var(--error)'
              : 'var(--accent)',
          border: options?.subtle ? 'none' : '1px solid var(--border)',
          borderRadius: '8px',
          minWidth: options?.minWidth ?? '132px',
          justifyContent: 'flex-end',
          whiteSpace: 'nowrap',
        }}
        onClick={() => void copyMetricValue(key, value)}
        title="Click para copiar monto"
      >
        {isCopied ? 'Copiado' : formatCLP(value)}
      </button>
    );
  };

  const renderSourceAccountList = (
    sources: Array<{
      accountCode: string;
      accountName: string;
      amountCLP: number;
    }>,
    options?: {
      accent?: string;
    },
  ): React.ReactNode => {
    if (!sources.length) return null;

    return (
      <div style={{ display: 'grid', gap: '0.22rem', marginTop: '0.3rem' }}>
        {sources.map((source, index) => (
          <div
            key={`${source.accountCode}-${source.accountName}-${index}`}
            style={{
              fontSize: '0.72rem',
              lineHeight: 1.3,
              color: options?.accent ?? 'var(--text-muted)',
            }}
          >
            {source.accountCode || 'Sin código'} · {source.accountName}
          </div>
        ))}
      </div>
    );
  };

  const renderQuickCopyPanel = (
    title: string,
    metrics: QuickCopyMetric[],
    emptyMessage: string,
  ): React.ReactNode => (
    <div className="finance-card" style={{ padding: '1rem' }}>
      <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>{title}</h3>
      {metrics.length ? (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <div style={{ display: 'grid', gap: '0.55rem' }}>
            {metrics.map((metric) => (
              <div key={metric.key} style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1.4fr) auto auto auto',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.45rem 0.55rem',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                background: '#fff',
              }}>
                <div style={{ fontSize: '0.82rem' }}>{metric.label}</div>
                <button
                  className="btn"
                  style={{ fontSize: '0.85rem', padding: '0.25rem 0.45rem', background: 'var(--surface)', border: '1px solid var(--border)' }}
                  onClick={() => void copyMetricValue(metric.key, metric.quantity)}
                  title="Copiar cantidad"
                >
                  <Copy size={13} />
                </button>
                <button
                  className="btn"
                  style={{
                    fontSize: '0.9rem',
                    padding: '0.25rem 0.55rem',
                    background: copiedMetricKey === metric.key ? 'rgba(16,185,129,0.12)' : 'rgba(0,167,233,0.1)',
                    color: copiedMetricKey === metric.key ? 'var(--success)' : 'var(--primary)',
                    border: '1px solid var(--border)',
                    minWidth: '88px',
                    justifyContent: 'center',
                  }}
                  onClick={() => void copyMetricValue(metric.key, metric.quantity)}
                  title="Click para copiar cantidad"
                >
                  {copiedMetricKey === metric.key ? 'Copiado' : metric.quantity.toFixed(0)}
                </button>
                <button
                  className="btn"
                  style={{
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    padding: '0.25rem 0.55rem',
                    background: copiedMetricKey === `${metric.key}-amount` ? 'rgba(16,185,129,0.12)' : 'rgba(2,132,199,0.08)',
                    color: copiedMetricKey === `${metric.key}-amount` ? 'var(--success)' : 'var(--accent)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    minWidth: '132px',
                    textAlign: 'right',
                    whiteSpace: 'nowrap',
                  }}
                  onClick={() => void copyMetricValue(`${metric.key}-amount`, metric.amountCLP)}
                  title="Click para copiar venta total"
                >
                  {copiedMetricKey === `${metric.key}-amount` ? 'Copiado' : formatCLP(metric.amountCLP)}
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ padding: '0.85rem', border: '1px dashed var(--border)', borderRadius: '12px', background: 'var(--surface)' }}>
          {emptyMessage}
        </div>
      )}
    </div>
  );

  const renderSalesBreakdownPanels = (messages?: {
    implants?: string;
    kits?: string;
    motors?: string;
    abutments?: string;
    dispatch?: string;
  }): React.ReactNode => (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {renderQuickCopyPanel(
        'Ventas de Implantes por Tipo',
        totalImplantsSold > 0 || totalImplantsAmountCLP > 0 ? implantQuickCopyMetrics : [],
        messages?.implants ?? 'No hay ventas de implantes clasificadas.',
      )}
      {renderQuickCopyPanel(
        'Ventas de Kits',
        kitQuickCopyMetrics,
        messages?.kits ?? 'No hay ventas de kits clasificadas.',
      )}
      {renderQuickCopyPanel(
        'Ventas de Motores',
        motorQuickCopyMetrics,
        messages?.motors ?? 'No hay ventas de motores clasificadas.',
      )}
      {renderQuickCopyPanel(
        'Ventas de Aditamentos',
        abutmentQuickCopyMetrics,
        messages?.abutments ?? 'No hay ventas de aditamentos clasificadas.',
      )}
      {renderQuickCopyPanel(
        'Ventas de Despacho',
        dispatchQuickCopyMetrics,
        messages?.dispatch ?? 'No hay líneas de despacho clasificadas.',
      )}
    </div>
  );

  const handleFileUpload = async (kind: UploadKind, file: File): Promise<void> => {
    setErrorMessage('');
    setInfoMessage('');
    setSelectedClosure(null);
    setSelectedClosurePeriodKey(null);

    try {
      if (kind === 'balance') {
        const result = await parseMonthlyBalanceFile(file, periodKey);
        setDraft((prev) => ({ ...prev, balance: result }));
        return;
      }

      if (kind === 'pnl') {
        const result = await parseMonthlyPnlFile(file, periodKey);
        setDraft((prev) => ({ ...prev, pnl: result }));
        setActiveTab('pnl');
        return;
      }

      const result = await parseMonthlyInventoryFile(file, periodKey, products);
      setDraft((prev) => ({ ...prev, inventory: result }));
      setActiveTab('summary');
    } catch (error) {
      setErrorMessage(`Error procesando archivo ${kind}: ${(error as Error).message}`);
    }
  };

  const handleSave = async (): Promise<void> => {
    if (!draftSummary || !draft.balance || !draft.pnl || !draft.inventory) return;

    setIsSaving(true);
    setErrorMessage('');
    setInfoMessage('');

    try {
      await upsertMonthlyClosure({
        periodKey,
        balanceFileName: draft.balance.fileName,
        pnlFileName: draft.pnl.fileName,
        inventoryFileName: draft.inventory.fileName,
        summary: draftSummary,
        balanceLines: draft.balance.rows,
        pnlLines: draft.pnl.rows,
        inventoryMovements: draft.inventory.rows,
        manualInputs: draft.manualInputs,
        customBalance: draftCustomBalance,
        customPnl: draftCustomPnl,
      });

      await refreshHistory({ preferredPeriodKey: periodKey });
      setInfoMessage(existingPeriod
        ? `El cierre ${periodKey} fue reemplazado correctamente.`
        : `El cierre ${periodKey} fue guardado correctamente.`);
    } catch (error) {
      setErrorMessage(`Error guardando cierre mensual: ${(error as Error).message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const resetDraft = (): void => {
    setDraft(initialDraftState());
    setSelectedClosurePeriodKey(selectedClosure?.periodKey ?? null);
    setErrorMessage('');
    setInfoMessage('');
  };

  const renderUploadCard = (
    kind: UploadKind,
    label: string,
    description: string,
    result: MonthlyParseResult<unknown> | null,
    ref: React.RefObject<HTMLInputElement | null>,
  ): React.ReactNode => {
    const buttonLabel = result ? 'Reemplazar archivo' : 'Cargar archivo';
    const statusText = !result
      ? 'Pendiente'
      : result.errors.length
        ? 'Con errores'
        : result.warnings.length
          ? 'Validado con advertencias'
          : 'Validado';

    const statusColor = !result
      ? 'var(--text-muted)'
      : result.errors.length
        ? 'var(--error)'
        : result.warnings.length
          ? 'var(--warning)'
          : 'var(--success)';

    return (
      <div className="finance-card" style={{ padding: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '0.6rem' }}>
          <div>
            <div style={{ fontWeight: 700 }}>{label}</div>
            <div className="text-muted" style={{ fontSize: '0.76rem' }}>{description}</div>
          </div>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: statusColor }}>{statusText}</span>
        </div>

        <div className="text-muted" style={{ fontSize: '0.75rem', marginBottom: '0.65rem' }}>
          {result
            ? `${result.fileName} | Filas válidas: ${result.validRows}/${result.totalRows}`
            : 'Sin archivo cargado'}
        </div>

        {result?.warnings.length ? (
          <div style={{ marginBottom: '0.65rem', fontSize: '0.75rem', color: 'var(--warning)' }}>
            <div style={{ fontWeight: 700, marginBottom: '0.2rem' }}>Advertencias: {result.warnings.length}</div>
            {result.warnings.slice(0, 2).map((warning) => (
              <div key={warning} style={{ lineHeight: 1.35 }}>{warning}</div>
            ))}
          </div>
        ) : null}

        {result?.errors.length ? (
          <div style={{ marginBottom: '0.65rem', fontSize: '0.75rem', color: 'var(--error)' }}>
            <div style={{ fontWeight: 700, marginBottom: '0.2rem' }}>Errores: {result.errors.length}</div>
            {result.errors.slice(0, 2).map((error) => (
              <div key={error} style={{ lineHeight: 1.35 }}>{error}</div>
            ))}
          </div>
        ) : null}

        <button className="btn btn-primary" onClick={() => ref.current?.click()}>
          <Upload size={14} /> {buttonLabel}
        </button>
        <input
          ref={ref}
          type="file"
          style={{ display: 'none' }}
          accept=".xlsx,.xls,.csv"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void handleFileUpload(kind, file);
            }
            event.target.value = '';
          }}
        />
      </div>
    );
  };

  return (
    <section className="glass card" style={{ marginTop: '1rem', textAlign: 'left' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <Database size={22} /> Análisis Mensual
          </h2>
          <p className="text-muted" style={{ fontSize: '0.84rem' }}>
            Carga balance, estado de resultados y movimientos de inventario para generar el cierre mensual con historial.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.78rem', minWidth: '180px' }}>
            Periodo de cierre
            <input
              type="month"
              className="input-field"
              value={periodKey}
              onChange={(event) => setPeriodKey(event.target.value)}
            />
          </label>
          <button className="btn" onClick={() => void refreshHistory({ preferredPeriodKey: displayPeriodKey ?? periodKey })}>
            <RefreshCw size={14} className={isLoadingHistory || isLoadingDetail ? 'animate-spin' : ''} />
            {isLoadingHistory || isLoadingDetail ? 'Cargando...' : 'Actualizar'}
          </button>
          <button className="btn" onClick={openHistoryWindow}>
            <Boxes size={14} /> Cierres guardados
          </button>
          <button className="btn btn-primary" disabled={!canSaveDraft || isSaving} onClick={() => void handleSave()}>
            <Save size={14} /> {isSaving ? 'Guardando...' : existingPeriod ? 'Reemplazar cierre' : 'Guardar cierre'}
          </button>
          <button className="btn" style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--error)' }} onClick={resetDraft}>
            Limpiar borrador
          </button>
        </div>
      </div>

      {existingPeriod ? (
        <div style={{
          marginBottom: '1rem',
          background: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.32)',
          borderRadius: '12px',
          padding: '0.8rem',
          color: '#92400e',
          display: 'flex',
          alignItems: 'center',
          gap: '0.55rem',
        }}>
          <AlertTriangle size={16} />
          Ya existe un cierre guardado para {periodKey}. Si guardas nuevamente, el período será reemplazado completo.
        </div>
      ) : null}

      {errorMessage ? (
        <div style={{ marginBottom: '1rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.32)', borderRadius: '12px', padding: '0.8rem', color: 'var(--error)' }}>
          {errorMessage}
        </div>
      ) : null}

      {infoMessage ? (
        <div style={{ marginBottom: '1rem', background: 'rgba(26,162,88,0.08)', border: '1px solid rgba(26,162,88,0.32)', borderRadius: '12px', padding: '0.8rem', color: 'var(--success)' }}>
          {infoMessage}
        </div>
      ) : null}

      {draftMessages.warnings.length || draftValidationErrors.length ? (
        <div style={{ marginBottom: '1rem', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.32)', borderRadius: '12px', padding: '0.8rem' }}>
          {draftMessages.warnings.length ? (
            <div style={{ marginBottom: draftValidationErrors.length ? '0.4rem' : 0, color: '#92400e', fontSize: '0.8rem' }}>
              {draftMessages.warnings.map((warning) => <div key={warning}>{warning}</div>)}
            </div>
          ) : null}
          {draftValidationErrors.length ? (
            <div style={{ color: 'var(--error)', fontSize: '0.8rem' }}>
              {draftValidationErrors.map((message) => <div key={message}>{message}</div>)}
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: '2fr minmax(260px, 0.95fr)', gap: '1rem', alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.85rem' }}>
            {renderUploadCard('balance', 'Balance', 'Archivo mensual del balance general.', draft.balance, balanceInputRef)}
            {renderUploadCard('pnl', 'Estado de Resultados', 'Archivo mensual del ER completo.', draft.pnl, pnlInputRef)}
            {renderUploadCard('inventory', 'Ventas por Producto', 'Usa el mismo formato comercial del análisis diario para consolidar ventas por SKU y familia.', draft.inventory, inventoryInputRef)}
          </div>

          <div className="finance-card" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              {[
                ['summary', 'Resumen'],
                ['balance', 'Balance'],
                ['pnl', 'Estado de Resultados'],
                ['inventory', 'Ventas'],
              ].map(([tabKey, label]) => (
                <button
                  key={tabKey}
                  className="btn"
                  style={{
                    background: activeTab === tabKey ? 'var(--accent)' : 'var(--surface)',
                    color: activeTab === tabKey ? '#fff' : 'var(--text)',
                    border: '1px solid var(--border)',
                    padding: '0.55rem 0.9rem',
                  }}
                  onClick={() => setActiveTab(tabKey as MonthlyTab)}
                >
                  {label}
                </button>
              ))}
            </div>

            {displayPeriodKey && displaySummary ? (
              <div className="text-muted" style={{ marginBottom: '0.9rem', fontSize: '0.78rem' }}>
                Mostrando {draftSummary ? 'borrador del período' : 'cierre guardado de'} <strong>{formatPeriodLabel(displayPeriodKey)}</strong>
                {comparison?.previousPeriodKey ? ` | Comparado contra ${formatPeriodLabel(comparison.previousPeriodKey)}` : ' | Sin periodo anterior comparable'}
              </div>
            ) : null}

            {!displaySummary && inventorySummaryPreview && previewPeriodKey ? (
              <div className="text-muted" style={{ marginBottom: '0.9rem', fontSize: '0.78rem' }}>
                Mostrando vista preliminar de ventas de <strong>{formatPeriodLabel(previewPeriodKey)}</strong>.
                {' '}Carga Balance y Estado de Resultados para completar el cierre financiero.
              </div>
            ) : null}

            {activeTab === 'summary' ? (
              displaySummary && displayPeriodKey ? (
                <div style={{ display: 'grid', gap: '1rem' }}>
                  <div>
                    <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>KPIs Balance</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem' }}>
                      <MetricCard title="Caja" value={formatCLP(displaySummary.balance.cashCLP)} />
                      <MetricCard title="Cuentas por Cobrar" value={formatCLP(displaySummary.balance.accountsReceivableCLP)} />
                      <MetricCard title="Inventario" value={formatCLP(displaySummary.balance.inventoryCLP)} />
                      <MetricCard title="Cuentas por Pagar" value={formatCLP(displaySummary.balance.accountsPayableCLP)} />
                      <MetricCard title="Capital de Trabajo" value={formatCLP(displaySummary.balance.workingCapitalCLP)} tone={displaySummary.balance.workingCapitalCLP >= 0 ? 'success' : 'warning'} />
                      <MetricCard title="Patrimonio" value={formatCLP(displaySummary.balance.equityCLP)} />
                    </div>
                  </div>

                  <div>
                    <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>KPIs Estado de Resultados</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem' }}>
                      <MetricCard title="Ventas" value={formatCLP(displaySummary.pnl.revenueCLP)} />
                      <MetricCard title="Costo de Ventas" value={formatCLP(displaySummary.pnl.costOfSalesCLP)} />
                      <MetricCard title="Utilidad Bruta" value={formatCLP(displaySummary.pnl.grossProfitCLP)} />
                      <MetricCard title="Margen Bruto" value={`${displaySummary.pnl.grossMarginPercent.toFixed(2)}%`} />
                      <MetricCard title="Utilidad Operativa" value={formatCLP(displaySummary.pnl.operatingIncomeCLP)} />
                      <MetricCard title="Utilidad Neta" value={formatCLP(displaySummary.pnl.netIncomeCLP)} tone={displaySummary.pnl.netIncomeCLP >= 0 ? 'success' : 'warning'} />
                    </div>
                  </div>

                  <div>
                    <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Ventas por Familia</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem' }}>
                      {INVENTORY_FAMILIES.map((family) => (
                        <MetricCard
                          key={family}
                          title={getInventoryFamilyLabel(family)}
                          value={formatQty(inventorySummaryPreview?.byFamily[family].exitsQty ?? 0)}
                          hint={`${formatCLP(inventorySummaryPreview?.byFamily[family].salesAmountCLP ?? 0)} · SKUs: ${inventorySummaryPreview?.byFamily[family].skuCount ?? 0}`}
                          tone="default"
                        />
                      ))}
                    </div>
                  </div>

                  {renderSalesBreakdownPanels({
                    implants: 'No hay ventas de implantes clasificadas en el periodo seleccionado.',
                    kits: 'No hay ventas de kits clasificadas en el periodo seleccionado.',
                    motors: 'No hay ventas de motores clasificadas en el periodo seleccionado.',
                    abutments: 'No hay ventas de aditamentos clasificadas en el periodo seleccionado.',
                    dispatch: 'No hay líneas de despacho en el periodo seleccionado.',
                  })}

                  {comparison ? (
                    <div style={{ display: 'grid', gap: '1rem' }}>
                      <ComparisonTable title="Comparación Balance" items={comparison.balance} />
                      <ComparisonTable title="Comparación ER" items={comparison.pnl} />
                      <ComparisonTable title="Comparación de Ventas" items={comparison.inventory} />
                    </div>
                  ) : null}
                </div>
              ) : inventorySummaryPreview ? (
                <div style={{ display: 'grid', gap: '1rem' }}>
                  <div style={{
                    padding: '0.9rem',
                    borderRadius: '12px',
                    border: '1px solid rgba(0,167,233,0.22)',
                    background: 'rgba(0,167,233,0.05)',
                  }}>
                    Ya puedes revisar ventas por familia e implantes con el archivo comercial del análisis diario.
                    {' '}Faltan Balance y Estado de Resultados para completar el dashboard financiero del mes.
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem' }}>
                    <MetricCard title="Total Ítems" value={formatQty(inventorySummaryPreview.totals.exitsQty)} />
                    <MetricCard title="Ventas Totales CLP" value={formatCLP(inventorySummaryPreview.totals.salesAmountCLP ?? 0)} />
                    <MetricCard title="Implantes Totales" value={formatQty(totalImplantsSold)} />
                    <MetricCard title="SKUs con Venta" value={formatQty(inventorySummaryPreview.totals.skuCount)} />
                    <MetricCard
                      title="SKUs sin Catálogo"
                      value={formatQty(inventorySummaryPreview.unmappedSkuCount)}
                      tone={inventorySummaryPreview.unmappedSkuCount ? 'warning' : 'default'}
                    />
                  </div>

                  <div>
                    <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Ventas por Familia</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem' }}>
                      {INVENTORY_FAMILIES.map((family) => (
                        <MetricCard
                          key={family}
                          title={getInventoryFamilyLabel(family)}
                          value={formatQty(inventorySummaryPreview.byFamily[family].exitsQty)}
                          hint={`${formatCLP(inventorySummaryPreview.byFamily[family].salesAmountCLP ?? 0)} · SKUs: ${inventorySummaryPreview.byFamily[family].skuCount}`}
                          tone="default"
                        />
                      ))}
                    </div>
                  </div>

                  {renderSalesBreakdownPanels({
                    implants: 'No hay ventas de implantes clasificadas en el archivo cargado.',
                    kits: 'No hay ventas de kits clasificadas en el archivo cargado.',
                    motors: 'No hay ventas de motores clasificadas en el archivo cargado.',
                    abutments: 'No hay ventas de aditamentos clasificadas en el archivo cargado.',
                    dispatch: 'No hay líneas de despacho en el archivo cargado.',
                  })}
                </div>
              ) : (
                <div style={{ padding: '1rem', border: '1px dashed var(--border)', borderRadius: '12px', background: 'var(--surface)' }}>
                  Carga los tres archivos del mes o selecciona un cierre guardado desde el historial para ver el dashboard.
                </div>
              )
            ) : null}

            {activeTab === 'balance' ? (
              displayCustomBalance ? (
                <div style={{ display: 'grid', gap: '1rem' }}>
                  {displayBalanceInlineWarnings.length ? (
                    <div style={{
                      padding: '0.9rem',
                      borderRadius: '12px',
                      border: '1px solid rgba(245,158,11,0.28)',
                      background: 'rgba(245,158,11,0.08)',
                      color: 'var(--warning)',
                      display: 'grid',
                      gap: '0.35rem',
                    }}>
                      {displayBalanceInlineWarnings.map((warning) => (
                        <div key={warning}>{warning}</div>
                      ))}
                    </div>
                  ) : null}

                  <div className="finance-card" style={{ padding: '1rem' }}>
                    <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Control de Cuadre</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                      <div>
                        <div className="text-muted" style={{ fontSize: '0.74rem', marginBottom: '0.35rem' }}>TOTAL ASSETS</div>
                        {renderCopyableCurrencyButton('balance-total-assets', totalAssetsLine?.amountCLP ?? 0, {
                          minWidth: '180px',
                        })}
                      </div>
                      <div>
                        <div className="text-muted" style={{ fontSize: '0.74rem', marginBottom: '0.35rem' }}>TOTAL LIABILITIES &amp; EQUITY</div>
                        {renderCopyableCurrencyButton('balance-total-liabilities-equity', totalLiabilitiesAndEquityLine?.amountCLP ?? 0, {
                          minWidth: '180px',
                        })}
                      </div>
                      <div>
                        <div className="text-muted" style={{ fontSize: '0.74rem', marginBottom: '0.35rem' }}>Diferencia</div>
                        {renderCopyableCurrencyButton('balance-difference', displayCustomBalance.balanceDifferenceCLP, {
                          minWidth: '180px',
                        })}
                      </div>
                    </div>
                    <div
                      style={{
                        marginTop: '0.75rem',
                        fontSize: '0.8rem',
                        color: displayCustomBalance.balanceDifferenceCLP === 0 ? 'var(--success)' : 'var(--warning)',
                        fontWeight: 600,
                      }}
                    >
                      {displayCustomBalance.balanceDifferenceCLP === 0
                        ? 'El balance cuadra correctamente.'
                        : 'El balance no cuadra. La diferencia se muestra arriba como advertencia visual.'}
                    </div>
                  </div>

                  <div className="finance-card" style={{ padding: '1rem' }}>
                    <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Control de Resultado</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                      <div>
                        <div className="text-muted" style={{ fontSize: '0.74rem', marginBottom: '0.35rem' }}>Resultado Fuente Balance</div>
                        {displayCustomBalance.sourceNetIncomeControlCLP === null || displayCustomBalance.sourceNetIncomeControlCLP === undefined ? (
                          <span className="text-muted">No detectado</span>
                        ) : renderCopyableCurrencyButton('balance-source-net-income', displayCustomBalance.sourceNetIncomeControlCLP, {
                          minWidth: '180px',
                        })}
                      </div>
                      <div>
                        <div className="text-muted" style={{ fontSize: '0.74rem', marginBottom: '0.35rem' }}>Net Income ER</div>
                        {renderCopyableCurrencyButton('balance-er-net-income', balanceNetIncomeLine?.amountCLP ?? 0, {
                          minWidth: '180px',
                        })}
                      </div>
                      <div>
                        <div className="text-muted" style={{ fontSize: '0.74rem', marginBottom: '0.35rem' }}>Diferencia</div>
                        {displayCustomBalance.netIncomeDifferenceCLP === null || displayCustomBalance.netIncomeDifferenceCLP === undefined ? (
                          <span className="text-muted">N/D</span>
                        ) : renderCopyableCurrencyButton('balance-net-income-difference', displayCustomBalance.netIncomeDifferenceCLP, {
                          minWidth: '180px',
                        })}
                      </div>
                    </div>
                    <div
                      style={{
                        marginTop: '0.75rem',
                        fontSize: '0.8rem',
                        color: displayCustomBalance.netIncomeDifferenceCLP === null || displayCustomBalance.netIncomeDifferenceCLP === 0
                          ? 'var(--success)'
                          : 'var(--warning)',
                        fontWeight: 600,
                      }}
                    >
                      {displayCustomBalance.sourceNetIncomeControlCLP === null || displayCustomBalance.sourceNetIncomeControlCLP === undefined
                        ? 'El archivo de balance no trajo una fila Resultado utilizable para control.'
                        : displayCustomBalance.netIncomeDifferenceCLP === 0
                          ? 'El Resultado del balance coincide con el Net Income del ER.'
                          : 'El Resultado del balance no coincide con el Net Income del ER.'}
                    </div>
                  </div>

                  <div className="finance-card" style={{ padding: '1rem' }}>
                    <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Balance Objetivo</h3>
                    <div className="table-container">
                      <table>
                        <thead>
                          <tr>
                            <th>Cuenta objetivo</th>
                            <th>Origen</th>
                            <th style={{ textAlign: 'right' }}>Monto CLP</th>
                          </tr>
                        </thead>
                        <tbody>
                          {MONTHLY_BALANCE_TARGET_SECTIONS.map((section) => (
                            <React.Fragment key={section.key}>
                              <tr>
                                <td colSpan={3} style={{ fontWeight: 900, letterSpacing: '0.04em', background: 'var(--surface)' }}>
                                  {section.label}
                                </td>
                              </tr>
                              {section.rows.map((row) => {
                                const line = displayBalanceLineIndex.get(row.key);
                                const amountCLP = line?.amountCLP ?? 0;
                                const originLabel = row.kind === 'header'
                                  ? 'Encabezado'
                                  : row.key === 'net_income' && !line?.sources.length
                                    ? 'Derivado desde ER'
                                    : line?.sources.length
                                      ? `${line.sources.length} cuenta(s) fuente`
                                      : 'Calculado';
                                const notes = line?.notes?.length ? line.notes : [];
                                const fontWeight = row.kind === 'grand_total'
                                  ? 900
                                  : row.kind === 'subtotal'
                                    ? 800
                                    : row.kind === 'header'
                                      ? 700
                                      : 500;

                                return (
                                  <tr key={row.key}>
                                    <td style={{ paddingLeft: `${row.level * 1.1}rem`, fontWeight }}>
                                      <div>{row.label}</div>
                                      {notes.length ? (
                                        <div className="text-muted" style={{ fontSize: '0.72rem', marginTop: '0.2rem' }}>
                                          {notes.join(' ')}
                                        </div>
                                      ) : null}
                                    </td>
                                    <td style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                                      <div>{originLabel}</div>
                                      {line?.sources.length
                                        ? renderSourceAccountList(line.sources)
                                        : null}
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                      {row.kind === 'header' ? (
                                        <span className="text-muted">-</span>
                                      ) : (
                                        renderCopyableCurrencyButton(`balance-target-${row.key}`, amountCLP, {
                                          subtle: true,
                                          minWidth: '160px',
                                          fontWeight,
                                        })
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {displayCustomBalance.unmappedSourceLines.length ? (
                    <div className="finance-card" style={{ padding: '1rem', borderColor: 'rgba(245,158,11,0.28)', background: 'rgba(245,158,11,0.06)' }}>
                      <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem', color: 'var(--warning)' }}>Cuentas nuevas / sin tratar</h3>
                      <div className="table-container">
                        <table>
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Código</th>
                              <th>Descripción</th>
                              <th>Sección fuente</th>
                              <th style={{ textAlign: 'right' }}>Monto CLP</th>
                            </tr>
                          </thead>
                          <tbody>
                            {displayCustomBalance.unmappedSourceLines.map((line) => (
                              <tr key={`balance-unmapped-${line.lineOrder}-${line.accountCode}-${line.accountName}`}>
                                <td>{line.lineOrder}</td>
                                <td>{line.accountCode || '-'}</td>
                                <td>{line.accountName}</td>
                                <td>{line.sourceSectionLabel || '-'}</td>
                                <td style={{ textAlign: 'right' }}>
                                  {renderCopyableCurrencyButton(`balance-unmapped-${line.lineOrder}`, line.amountCLP, {
                                    subtle: true,
                                    minWidth: '150px',
                                  })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}

                  <div className="finance-card" style={{ padding: '1rem' }}>
                    <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Trazabilidad Fuente</h3>
                    {displayBalanceTraceabilityRows.length ? (
                      <div className="table-container">
                        <table>
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Código fuente</th>
                              <th>Descripción fuente</th>
                              <th>Sección fuente</th>
                              <th>Fila objetivo</th>
                              <th style={{ textAlign: 'right' }}>Monto CLP</th>
                            </tr>
                          </thead>
                          <tbody>
                            {displayBalanceTraceabilityRows.map((row) => (
                              <tr key={`balance-trace-${row.targetKey}-${row.lineOrder}-${row.accountCode}-${row.accountName}`}>
                                <td>{row.lineOrder}</td>
                                <td>{row.accountCode || '-'}</td>
                                <td>{row.accountName}</td>
                                <td>{row.sourceSectionLabel || '-'}</td>
                                <td>{row.targetLabel}</td>
                                <td style={{ textAlign: 'right' }}>
                                  {renderCopyableCurrencyButton(`balance-trace-${row.targetKey}-${row.lineOrder}`, row.amountCLP, {
                                    subtle: true,
                                    minWidth: '150px',
                                  })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div style={{ padding: '1rem', border: '1px dashed var(--border)', borderRadius: '12px', background: 'var(--surface)' }}>
                        No hay cuentas fuente mapeadas todavía. Cuando conectemos el archivo fuente del balance, aquí verás la trazabilidad completa.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ padding: '1rem', border: '1px dashed var(--border)', borderRadius: '12px', background: 'var(--surface)' }}>
                  No hay líneas de balance disponibles.
                </div>
              )
            ) : null}

            {activeTab === 'pnl' ? (
              displayCustomPnl && displayPnlLines.length ? (
                <div style={{ display: 'grid', gap: '1rem' }}>
                  <div className="finance-card" style={{ padding: '1rem' }}>
                    <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Reparto Manual de REMUNERACIONES</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 320px))', gap: '0.75rem' }}>
                      <label style={{ fontSize: '0.8rem' }}>
                        Salaries (Admin, GM)
                        <input
                          type="number"
                          className="input-field"
                          value={displayManualInputs.adminSalaryManualCLP ?? ''}
                          disabled={!draft.pnl}
                          placeholder="Ingresa el monto CLP"
                          onChange={(event) => handleAdminSalaryInputChange(event.target.value)}
                        />
                      </label>
                      <div style={{ fontSize: '0.8rem' }}>
                        <div className="text-muted" style={{ marginBottom: '0.35rem' }}>Total Salaries Fuente</div>
                        {renderCopyableCurrencyButton('pnl-total-salaries-source', totalSalariesSourceCLP, {
                          minWidth: '180px',
                        })}
                      </div>
                      <div className="text-muted" style={{ fontSize: '0.76rem', gridColumn: '1 / -1' }}>
                        El resto de REMUNERACIONES se asignará a Salaries (Sales Rep). El total mostrado es solo visual y no agrega ninguna suma adicional.
                      </div>
                    </div>
                  </div>

                  {sourceNetProfitLine && appNetProfitLine ? (
                    <div className="finance-card" style={{ padding: '1rem' }}>
                      <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Control de Neto Fuente vs App</h3>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                        <div>
                          <div className="text-muted" style={{ fontSize: '0.74rem', marginBottom: '0.35rem' }}>Fuente: {sourceNetProfitLine.accountName}</div>
                          {renderCopyableCurrencyButton('pnl-source-net-profit', sourceNetProfitLine.amountCLP, {
                            minWidth: '180px',
                          })}
                        </div>
                        <div>
                          <div className="text-muted" style={{ fontSize: '0.74rem', marginBottom: '0.35rem' }}>App: Net profit(loss)</div>
                          {renderCopyableCurrencyButton('pnl-app-net-profit', appNetProfitLine.amountCLP, {
                            minWidth: '180px',
                          })}
                        </div>
                        <div>
                          <div className="text-muted" style={{ fontSize: '0.74rem', marginBottom: '0.35rem' }}>Diferencia</div>
                          {renderCopyableCurrencyButton('pnl-net-profit-difference', netProfitDifferenceCLP ?? 0, {
                            minWidth: '180px',
                          })}
                        </div>
                      </div>
                      <div
                        style={{
                          marginTop: '0.75rem',
                          fontSize: '0.8rem',
                          color: netProfitDifferenceCLP === 0 ? 'var(--success)' : 'var(--warning)',
                        }}
                      >
                        {netProfitDifferenceCLP === 0
                          ? 'El neto de la app coincide con el neto del archivo fuente.'
                          : 'El neto de la app no coincide con el archivo fuente.'}
                      </div>
                    </div>
                  ) : null}

                  {displayCustomPnl.errors.length ? (
                    <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.32)', borderRadius: '12px', padding: '0.85rem', color: 'var(--error)' }}>
                      {displayCustomPnl.errors.map((message) => (
                        <div key={message}>{message}</div>
                      ))}
                    </div>
                  ) : null}

                  <div className="finance-card" style={{ padding: '1rem' }}>
                    <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Estado de Resultados Objetivo</h3>
                    <div className="table-container">
                      <table>
                        <thead>
                          <tr>
                            <th>Cuenta objetivo</th>
                            <th>Origen</th>
                            <th style={{ textAlign: 'right' }}>Monto CLP</th>
                          </tr>
                        </thead>
                        <tbody>
                          {MONTHLY_PNL_TARGET_SECTIONS.map((section) => (
                            <React.Fragment key={section.key}>
                              <tr>
                                <td colSpan={3} style={{ fontWeight: 800, background: 'rgba(15,23,42,0.06)' }}>
                                  {section.label}
                                </td>
                              </tr>
                              {section.accounts.map((account) => {
                                const line = displayPnlLineIndex.get(account.key);
                                const originLabel = line?.isManual
                                  ? 'Manual'
                                  : line?.sources.length
                                    ? `${line.sources.length} cuenta(s) fuente`
                                    : 'Calculado';

                                return (
                                  <tr key={account.key}>
                                    <td style={{ fontWeight: account.kind === 'subtotal' ? 800 : 500 }}>
                                      <div>{account.label}</div>
                                      {account.notes?.length ? (
                                        <div className="text-muted" style={{ fontSize: '0.72rem', marginTop: '0.2rem' }}>
                                          {account.notes.join(' ')}
                                        </div>
                                      ) : null}
                                    </td>
                                    <td style={{ color: line?.isManual ? 'var(--warning)' : 'var(--text-muted)' }}>
                                      <div>{originLabel}</div>
                                      {line?.sources.length
                                        ? renderSourceAccountList(line.sources, {
                                          accent: line?.isManual ? 'var(--warning)' : 'var(--text-muted)',
                                        })
                                        : null}
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                      {renderCopyableCurrencyButton(`pnl-target-${account.key}`, line?.amountCLP ?? 0, {
                                        fontWeight: account.kind === 'subtotal' ? 800 : 600,
                                        subtle: true,
                                        minWidth: '160px',
                                      })}
                                    </td>
                                  </tr>
                                );
                              })}
                              <tr>
                                <td style={{ fontWeight: 800, background: 'rgba(2,132,199,0.08)' }}>
                                  {getPnlSectionTotalLabel(section.label)}
                                </td>
                                <td style={{ background: 'rgba(2,132,199,0.08)', color: 'var(--text-muted)' }}>
                                  Sección
                                </td>
                                <td style={{ textAlign: 'right', background: 'rgba(2,132,199,0.08)' }}>
                                  {renderCopyableCurrencyButton(`pnl-section-total-${section.key}`, displayPnlSectionTotalIndex.get(section.key) ?? 0, {
                                    fontWeight: 800,
                                    subtle: true,
                                    minWidth: '160px',
                                  })}
                                </td>
                              </tr>
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {displayCustomPnl.unmappedSourceLines.length ? (
                    <div className="finance-card" style={{ padding: '1rem', border: '1px solid rgba(239,68,68,0.24)', background: 'rgba(239,68,68,0.05)' }}>
                      <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem', color: 'var(--error)' }}>Cuentas nuevas / sin tratar</h3>
                      <div className="table-container">
                        <table>
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Código</th>
                              <th>Descripción</th>
                              <th>Sección fuente</th>
                              <th style={{ textAlign: 'right' }}>Monto CLP</th>
                            </tr>
                          </thead>
                          <tbody>
                            {displayCustomPnl.unmappedSourceLines.map((line) => (
                              <tr key={`unmapped-${line.lineOrder}-${line.accountCode}-${line.accountName}`}>
                                <td>{line.lineOrder}</td>
                                <td>{line.accountCode || '-'}</td>
                                <td style={{ fontWeight: 700 }}>{line.accountName}</td>
                                <td>{line.sourceSectionLabel || '-'}</td>
                                <td style={{ textAlign: 'right' }}>
                                  {renderCopyableCurrencyButton(`pnl-unmapped-${line.lineOrder}`, line.amountCLP, {
                                    subtle: true,
                                    minWidth: '160px',
                                  })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}

                  <div className="finance-card" style={{ padding: '1rem' }}>
                    <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Trazabilidad Fuente</h3>
                    {displayPnlTraceabilityRows.length ? (
                      <div className="table-container">
                        <table>
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Código fuente</th>
                              <th>Descripción fuente</th>
                              <th>Sección fuente</th>
                              <th>Cuenta objetivo</th>
                              <th style={{ textAlign: 'right' }}>Monto CLP</th>
                            </tr>
                          </thead>
                          <tbody>
                            {displayPnlTraceabilityRows.map((row) => (
                              <tr key={`${row.targetKey}-${row.lineOrder}-${row.accountCode}-${row.amountCLP}`}>
                                <td>{row.lineOrder}</td>
                                <td>{row.accountCode || '-'}</td>
                                <td style={{ fontWeight: row.isManual ? 700 : 500 }}>
                                  {row.accountName}
                                  {row.isManual ? ' (manual)' : ''}
                                </td>
                                <td>{row.sourceSectionLabel || '-'}</td>
                                <td>{row.targetLabel}</td>
                                <td style={{ textAlign: 'right' }}>
                                  {renderCopyableCurrencyButton(`pnl-trace-${row.targetKey}-${row.lineOrder}`, row.amountCLP, {
                                    subtle: true,
                                    minWidth: '160px',
                                  })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div style={{ padding: '0.85rem', border: '1px dashed var(--border)', borderRadius: '12px', background: 'var(--surface)' }}>
                        No hay cuentas fuente trazables para mostrar todavía.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ padding: '1rem', border: '1px dashed var(--border)', borderRadius: '12px', background: 'var(--surface)' }}>
                  No hay líneas de estado de resultados disponibles.
                </div>
              )
            ) : null}

            {activeTab === 'inventory' ? (
              displayInventoryMovements.length ? (
                <div style={{ display: 'grid', gap: '1rem' }}>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.4rem 0.6rem', background: '#fff', minWidth: '220px' }}>
                      <Search size={14} className="text-muted" />
                      <input
                        type="text"
                        className="input-field"
                        style={{ border: 'none', background: 'transparent', padding: 0 }}
                        placeholder="Buscar SKU o producto"
                        value={inventorySearch}
                        onChange={(event) => setInventorySearch(event.target.value)}
                      />
                    </div>
                    <select
                      className="input-field"
                      style={{ maxWidth: '220px' }}
                      value={familyFilter}
                      onChange={(event) => setFamilyFilter(event.target.value as 'ALL' | MonthlyInventoryFamily)}
                    >
                      <option value="ALL">Todas las familias</option>
                      <option value="IMPLANTES">Implantes</option>
                      <option value="KITS">Kits</option>
                      <option value="MOTOR">Motores</option>
                      <option value="ADITAMENTOS">Aditamentos</option>
                      <option value="DESPACHO">Despacho</option>
                      <option value="SIN_CLASIFICAR">Sin clasificar</option>
                    </select>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem' }}>
                    {inventorySummaryPreview ? (
                      INVENTORY_FAMILIES.map((family) => (
                        <MetricCard
                          key={family}
                          title={`${getInventoryFamilyLabel(family)} - Unidades`}
                          value={formatQty(inventorySummaryPreview.byFamily[family].exitsQty)}
                          hint={`${formatCLP(inventorySummaryPreview.byFamily[family].salesAmountCLP ?? 0)} · SKUs: ${inventorySummaryPreview.byFamily[family].skuCount}`}
                          tone="default"
                        />
                      ))
                    ) : null}
                  </div>

                  {renderSalesBreakdownPanels({
                    implants: 'No hay ventas de implantes clasificadas para desglosar.',
                    kits: 'No hay ventas de kits clasificadas para desglosar.',
                    motors: 'No hay ventas de motores clasificadas para desglosar.',
                    abutments: 'No hay ventas de aditamentos clasificadas para desglosar.',
                    dispatch: 'No hay líneas de despacho para desglosar.',
                  })}

                  <div className="table-container">
                    <table>
                      <thead>
                        <tr>
                          <th>SKU</th>
                          <th>Producto</th>
                          <th>Familia</th>
                          <th style={{ textAlign: 'right' }}>Ventas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredInventoryMovements.map((movement) => (
                          <tr key={movement.sku}>
                            <td style={{ fontWeight: 700 }}>{movement.sku}</td>
                            <td>{movement.productName}</td>
                            <td style={{ fontWeight: movement.family === 'SIN_CLASIFICAR' ? 700 : 500 }}>
                              {getInventoryFamilyLabel(movement.family)}
                            </td>
                            <td style={{ textAlign: 'right', color: 'var(--error)', fontWeight: 700 }}>{formatQty(movement.exitsQty)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '1rem', border: '1px dashed var(--border)', borderRadius: '12px', background: 'var(--surface)' }}>
                  No hay ventas por producto disponibles.
                </div>
              )
            ) : null}
          </div>
        </div>

        <aside className="finance-card" style={{ padding: '1rem', position: 'sticky', top: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.9rem' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '1rem' }}>
              <Boxes size={18} /> Historial de Cierres
            </h3>
            <div style={{ display: 'flex', gap: '0.45rem' }}>
              <button className="btn" style={{ padding: '0.45rem 0.7rem' }} onClick={openHistoryWindow}>
                Ver
              </button>
              <button className="btn" style={{ padding: '0.45rem 0.7rem' }} onClick={() => void refreshHistory({ preferredPeriodKey: displayPeriodKey ?? periodKey })}>
                <RefreshCw size={14} className={isLoadingHistory ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {history.length ? (
            <div style={{ display: 'grid', gap: '0.65rem', maxHeight: '70vh', overflowY: 'auto', paddingRight: '0.2rem' }}>
              {history.map((item) => {
                const isActive = item.periodKey === selectedClosure?.periodKey && !draftSummary;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void loadClosure(item.periodKey)}
                    style={{
                      border: `1px solid ${isActive ? 'var(--primary)' : 'var(--border)'}`,
                      borderRadius: '12px',
                      background: isActive ? 'rgba(0,167,233,0.08)' : '#fff',
                      padding: '0.85rem',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 800, marginBottom: '0.2rem' }}>{formatPeriodLabel(item.periodKey)}</div>
                    <div className="text-muted" style={{ fontSize: '0.75rem', marginBottom: '0.35rem' }}>
                      Actualizado: {item.updatedAt ? new Date(item.updatedAt).toLocaleString('es-CL') : 'N/D'}
                    </div>
                    <div style={{ fontSize: '0.76rem' }}>
                      Ventas: <strong>{formatCLP(item.summary.pnl.revenueCLP)}</strong>
                    </div>
                    <div style={{ fontSize: '0.76rem' }}>
                      Unidades vendidas: <strong>{formatQty(item.summary.inventory.totals.exitsQty)}</strong>
                    </div>
                    {item.summary.inventory.unmappedSkuCount ? (
                      <div style={{ fontSize: '0.74rem', color: 'var(--warning)', marginTop: '0.2rem' }}>
                        {item.summary.inventory.unmappedSkuCount} SKU(s) sin clasificar
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: '1rem', border: '1px dashed var(--border)', borderRadius: '12px', background: 'var(--surface)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                <FileSpreadsheet size={16} />
                <strong>Sin cierres guardados</strong>
              </div>
              <div className="text-muted" style={{ fontSize: '0.78rem' }}>
                Guarda el primer análisis mensual para empezar el historial.
              </div>
            </div>
          )}
        </aside>
      </div>

      {isHistoryWindowOpen ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.42)',
            display: 'grid',
            placeItems: 'center',
            padding: '1rem',
            zIndex: 90,
          }}
          onClick={() => setIsHistoryWindowOpen(false)}
        >
          <div
            className="glass card"
            style={{
              width: 'min(1080px, 100%)',
              maxHeight: '88vh',
              overflow: 'hidden',
              display: 'grid',
              gridTemplateRows: 'auto 1fr',
              gap: '1rem',
              textAlign: 'left',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                  <Boxes size={20} /> Cierres guardados
                </h3>
                <div className="text-muted" style={{ fontSize: '0.8rem' }}>
                  Abre un cierre anterior para recuperar su dashboard completo.
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button className="btn" onClick={() => void refreshHistory({ preferredPeriodKey: historyPreviewItem?.periodKey ?? displayPeriodKey ?? periodKey })}>
                  <RefreshCw size={14} className={isLoadingHistory ? 'animate-spin' : ''} /> Actualizar
                </button>
                <button className="btn" onClick={() => setIsHistoryWindowOpen(false)}>
                  <X size={14} /> Cerrar
                </button>
              </div>
            </div>

            {history.length ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(320px, 0.85fr)', gap: '1rem', minHeight: 0 }}>
                <div style={{ minHeight: 0, overflowY: 'auto', display: 'grid', gap: '0.65rem', paddingRight: '0.2rem' }}>
                  {history.map((item) => {
                    const isPreview = item.periodKey === historyPreviewItem?.periodKey;
                    const isLoaded = item.periodKey === selectedClosure?.periodKey && !draftSummary;

                    return (
                      <button
                        key={`history-window-${item.id}`}
                        type="button"
                        onClick={() => setHistoryPreviewPeriodKey(item.periodKey)}
                        style={{
                          border: `1px solid ${isPreview ? 'var(--primary)' : 'var(--border)'}`,
                          borderRadius: '12px',
                          background: isPreview ? 'rgba(0,167,233,0.08)' : '#fff',
                          padding: '0.9rem',
                          textAlign: 'left',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem', alignItems: 'center', marginBottom: '0.25rem' }}>
                          <div style={{ fontWeight: 800 }}>{formatPeriodLabel(item.periodKey)}</div>
                          {isLoaded ? (
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent)' }}>Cargado</span>
                          ) : null}
                        </div>
                        <div className="text-muted" style={{ fontSize: '0.75rem', marginBottom: '0.45rem' }}>
                          Actualizado: {item.updatedAt ? new Date(item.updatedAt).toLocaleString('es-CL') : 'N/D'}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: '0.45rem', fontSize: '0.76rem' }}>
                          <div>Ventas: <strong>{formatCLP(item.summary.pnl.revenueCLP)}</strong></div>
                          <div>Neto: <strong>{formatCLP(item.summary.pnl.netIncomeCLP)}</strong></div>
                          <div>Unidades: <strong>{formatQty(item.summary.inventory.totals.exitsQty)}</strong></div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="finance-card" style={{ padding: '1rem', minHeight: 0, overflowY: 'auto' }}>
                  {historyPreviewItem ? (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', marginBottom: '0.9rem', flexWrap: 'wrap' }}>
                        <div>
                          <div className="text-muted" style={{ fontSize: '0.76rem', marginBottom: '0.25rem' }}>Vista previa</div>
                          <div style={{ fontWeight: 900, fontSize: '1.1rem' }}>{formatPeriodLabel(historyPreviewItem.periodKey)}</div>
                          <div className="text-muted" style={{ fontSize: '0.76rem', marginTop: '0.25rem' }}>
                            Creado: {historyPreviewItem.createdAt ? new Date(historyPreviewItem.createdAt).toLocaleString('es-CL') : 'N/D'}
                          </div>
                          <div className="text-muted" style={{ fontSize: '0.76rem' }}>
                            Actualizado: {historyPreviewItem.updatedAt ? new Date(historyPreviewItem.updatedAt).toLocaleString('es-CL') : 'N/D'}
                          </div>
                        </div>
                        <button
                          className="btn btn-primary"
                          disabled={isLoadingDetail}
                          onClick={() => void handleOpenPreviewClosure()}
                        >
                          <Search size={14} /> {isLoadingDetail ? 'Abriendo...' : 'Abrir cierre'}
                        </button>
                      </div>

                      {hasDraftContent(draft) ? (
                        <div style={{
                          marginBottom: '0.9rem',
                          background: 'rgba(245,158,11,0.08)',
                          border: '1px solid rgba(245,158,11,0.32)',
                          borderRadius: '12px',
                          padding: '0.75rem',
                          color: '#92400e',
                          fontSize: '0.8rem',
                        }}>
                          Abrir un cierre guardado reemplaza el borrador actual que tienes en pantalla.
                        </div>
                      ) : null}

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: '0.65rem', marginBottom: '0.9rem' }}>
                        <MetricCard title="Ventas" value={formatCLP(historyPreviewItem.summary.pnl.revenueCLP)} />
                        <MetricCard title="Resultado Neto" value={formatCLP(historyPreviewItem.summary.pnl.netIncomeCLP)} tone={historyPreviewItem.summary.pnl.netIncomeCLP < 0 ? 'warning' : 'success'} />
                        <MetricCard title="Activos" value={formatCLP(historyPreviewItem.summary.balance.totalAssetsCLP)} />
                        <MetricCard title="Unidades Vendidas" value={formatQty(historyPreviewItem.summary.inventory.totals.exitsQty)} />
                      </div>

                      <div style={{ display: 'grid', gap: '0.55rem', fontSize: '0.8rem' }}>
                        <div><strong>Balance:</strong> {historyPreviewItem.balanceFileName || 'N/D'}</div>
                        <div><strong>Estado de Resultados:</strong> {historyPreviewItem.pnlFileName || 'N/D'}</div>
                        <div><strong>Ventas por Producto:</strong> {historyPreviewItem.inventoryFileName || 'N/D'}</div>
                        {historyPreviewItem.summary.inventory.unmappedSkuCount ? (
                          <div style={{ color: 'var(--warning)', fontWeight: 700 }}>
                            {historyPreviewItem.summary.inventory.unmappedSkuCount} SKU(s) sin clasificar
                          </div>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <div style={{ padding: '1rem', border: '1px dashed var(--border)', borderRadius: '12px', background: 'var(--surface)' }}>
                      No hay cierre seleccionado.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ padding: '1rem', border: '1px dashed var(--border)', borderRadius: '12px', background: 'var(--surface)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                  <FileSpreadsheet size={16} />
                  <strong>Sin cierres guardados</strong>
                </div>
                <div className="text-muted" style={{ fontSize: '0.78rem' }}>
                  Guarda el primer análisis mensual para abrirlo después desde esta ventana.
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default MonthlyAnalysisModule;
