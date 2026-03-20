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
} from 'lucide-react';
import type { Product } from '../data/mockProducts';
import {
  fetchMonthlyClosureByPeriod,
  fetchMonthlyClosures,
  upsertMonthlyClosure,
} from '../lib/monthlyAnalysisRepository';
import type {
  MonthlyAnalysisSummary,
  MonthlyBalanceLine,
  MonthlyComparisonItem,
  MonthlyInventoryFamily,
  MonthlyInventoryMovement,
  MonthlyParseResult,
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

type MonthlyTab = 'summary' | 'balance' | 'pnl' | 'inventory';
type UploadKind = 'balance' | 'pnl' | 'inventory';
const MONTHLY_ANALYSIS_STORAGE_KEY = 'megagen.monthlyAnalysis.viewState';
const MONTHLY_ANALYSIS_STORAGE_VERSION = 2;

interface MonthlyAnalysisModuleProps {
  products: Product[];
}

interface MonthlyDraftState {
  balance: MonthlyParseResult<MonthlyBalanceLine> | null;
  pnl: MonthlyParseResult<MonthlyPnlLine> | null;
  inventory: MonthlyParseResult<MonthlyInventoryMovement> | null;
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

    return {
      version: MONTHLY_ANALYSIS_STORAGE_VERSION,
      periodKey: typeof parsed.periodKey === 'string' && parsed.periodKey ? parsed.periodKey : currentMonth(),
      activeTab: parsed.activeTab === 'balance' || parsed.activeTab === 'pnl' || parsed.activeTab === 'inventory' ? parsed.activeTab : 'summary',
      draft: parsed.draft ?? initialDraftState(),
      selectedClosurePeriodKey: typeof parsed.selectedClosurePeriodKey === 'string' && parsed.selectedClosurePeriodKey
        ? parsed.selectedClosurePeriodKey
        : null,
    };
  } catch {
    return null;
  }
};

const INVENTORY_FAMILIES: MonthlyInventoryFamily[] = ['IMPLANTES', 'KITS', 'MOTOR', 'ADITAMENTOS', 'SIN_CLASIFICAR'];

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

  const draftSummary = useMemo<MonthlyAnalysisSummary | null>(() => {
    if (!draft.balance || !draft.pnl || !draft.inventory) return null;
    if (draft.balance.errors.length || draft.pnl.errors.length || draft.inventory.errors.length) return null;

    return buildMonthlyAnalysisSummary(
      draft.balance.rows,
      draft.pnl.rows,
      draft.inventory.rows,
    );
  }, [draft.balance, draft.inventory, draft.pnl]);

  const displaySummary = draftSummary ?? selectedClosure?.summary ?? null;
  const displayPeriodKey = draftSummary ? periodKey : selectedClosure?.periodKey ?? null;
  const previousPeriodKey = displayPeriodKey ? getPreviousPeriodKey(displayPeriodKey) : null;
  const previousSummary = previousPeriodKey ? history.find((item) => item.periodKey === previousPeriodKey)?.summary ?? null : null;
  const comparison = displaySummary && displayPeriodKey
    ? buildMonthlyComparison(displayPeriodKey, displaySummary, previousPeriodKey, previousSummary)
    : null;

  const draftMessages = useMemo(() => combineMessages(draft.balance, draft.pnl, draft.inventory), [draft.balance, draft.inventory, draft.pnl]);
  const draftValidationErrors = useMemo(() => {
    const errors: string[] = [];

    if (draft.balance && !hasMinimumBalanceStructure(draft.balance.rows)) {
      errors.push('El balance no contiene líneas suficientes para activos y pasivos/patrimonio.');
    }

    if (draft.pnl && !hasMinimumPnlStructure(draft.pnl.rows)) {
      errors.push('El estado de resultados no contiene líneas suficientes de ingresos y costos/gastos.');
    }

    return errors;
  }, [draft.balance, draft.pnl]);

  const canSaveDraft = Boolean(
    draft.balance
    && draft.pnl
    && draft.inventory
    && !draftMessages.errors.length
    && !draftValidationErrors.length
    && draftSummary,
  );

  const displayBalanceLines = draft.balance?.rows ?? selectedClosure?.balanceLines ?? [];
  const displayPnlLines = draft.pnl?.rows ?? selectedClosure?.pnlLines ?? [];
  const displayInventoryMovements = useMemo(
    () => draft.inventory?.rows ?? selectedClosure?.inventoryMovements ?? [],
    [draft.inventory, selectedClosure?.inventoryMovements],
  );
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

      totals.openingQty += movement.openingQty;
      totals.entriesQty += movement.entriesQty;
      totals.exitsQty += movement.exitsQty;
      totals.adjustmentsQty += movement.adjustmentsQty;
      totals.closingQty += movement.closingQty;
      totals.netChangeQty += movement.closingQty - movement.openingQty;

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
    family: Exclude<MonthlyInventoryFamily, 'IMPLANTES' | 'SIN_CLASIFICAR'>,
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

  const existingPeriod = history.find((item) => item.periodKey === periodKey) ?? null;

  const copyMetricValue = async (key: string, value: number): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value.toFixed(0));
      setCopiedMetricKey(key);
      setTimeout(() => setCopiedMetricKey(''), 1200);
    } catch {
      setErrorMessage('No fue posible copiar el valor al portapapeles.');
    }
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
                          title={family}
                          value={formatQty(inventorySummaryPreview?.byFamily[family].exitsQty ?? 0)}
                          hint={`SKUs: ${inventorySummaryPreview?.byFamily[family].skuCount ?? 0}`}
                          tone={family === 'SIN_CLASIFICAR' ? 'warning' : 'default'}
                        />
                      ))}
                    </div>
                  </div>

                  {renderSalesBreakdownPanels({
                    implants: 'No hay ventas de implantes clasificadas en el periodo seleccionado.',
                    kits: 'No hay ventas de kits clasificadas en el periodo seleccionado.',
                    motors: 'No hay ventas de motores clasificadas en el periodo seleccionado.',
                    abutments: 'No hay ventas de aditamentos clasificadas en el periodo seleccionado.',
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
                    <MetricCard title="Ventas Totales" value={formatQty(inventorySummaryPreview.totals.exitsQty)} />
                    <MetricCard title="Implantes Totales" value={formatQty(totalImplantsSold)} />
                    <MetricCard title="SKUs con Venta" value={formatQty(inventorySummaryPreview.totals.skuCount)} />
                    <MetricCard
                      title="SKUs sin Clasificar"
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
                          title={family}
                          value={formatQty(inventorySummaryPreview.byFamily[family].exitsQty)}
                          hint={`SKUs: ${inventorySummaryPreview.byFamily[family].skuCount}`}
                          tone={family === 'SIN_CLASIFICAR' ? 'warning' : 'default'}
                        />
                      ))}
                    </div>
                  </div>

                  {renderSalesBreakdownPanels({
                    implants: 'No hay ventas de implantes clasificadas en el archivo cargado.',
                    kits: 'No hay ventas de kits clasificadas en el archivo cargado.',
                    motors: 'No hay ventas de motores clasificadas en el archivo cargado.',
                    abutments: 'No hay ventas de aditamentos clasificadas en el archivo cargado.',
                  })}
                </div>
              ) : (
                <div style={{ padding: '1rem', border: '1px dashed var(--border)', borderRadius: '12px', background: 'var(--surface)' }}>
                  Carga los tres archivos del mes o selecciona un cierre guardado desde el historial para ver el dashboard.
                </div>
              )
            ) : null}

            {activeTab === 'balance' ? (
              displayBalanceLines.length ? (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Código</th>
                        <th>Cuenta</th>
                        <th>Sección</th>
                        <th>Subsección</th>
                        <th style={{ textAlign: 'right' }}>Monto CLP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayBalanceLines.map((line) => (
                        <tr key={`${line.lineOrder}-${line.accountCode}-${line.accountName}`}>
                          <td>{line.lineOrder}</td>
                          <td>{line.accountCode || '-'}</td>
                          <td style={{ fontWeight: line.isSubtotal ? 800 : 500 }}>{line.accountName}</td>
                          <td>{line.section}</td>
                          <td>{line.subsection || '-'}</td>
                          <td style={{ textAlign: 'right', fontWeight: line.isSubtotal ? 800 : 600 }}>{formatCLP(line.amountCLP)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ padding: '1rem', border: '1px dashed var(--border)', borderRadius: '12px', background: 'var(--surface)' }}>
                  No hay líneas de balance disponibles.
                </div>
              )
            ) : null}

            {activeTab === 'pnl' ? (
              displayPnlLines.length ? (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Código</th>
                        <th>Cuenta</th>
                        <th>Sección</th>
                        <th>Subsección</th>
                        <th style={{ textAlign: 'right' }}>Monto CLP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayPnlLines.map((line) => (
                        <tr key={`${line.lineOrder}-${line.accountCode}-${line.accountName}`}>
                          <td>{line.lineOrder}</td>
                          <td>{line.accountCode || '-'}</td>
                          <td style={{ fontWeight: line.isSubtotal ? 800 : 500 }}>{line.accountName}</td>
                          <td>{line.section}</td>
                          <td>{line.subsection || '-'}</td>
                          <td style={{ textAlign: 'right', fontWeight: line.isSubtotal ? 800 : 600 }}>{formatCLP(line.amountCLP)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
                      <option value="MOTOR">Motor</option>
                      <option value="ADITAMENTOS">Aditamentos</option>
                      <option value="SIN_CLASIFICAR">Sin clasificar</option>
                    </select>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem' }}>
                    {inventorySummaryPreview ? (
                      INVENTORY_FAMILIES.map((family) => (
                        <MetricCard
                          key={family}
                          title={`${family} - Ventas`}
                          value={formatQty(inventorySummaryPreview.byFamily[family].exitsQty)}
                          hint={`SKUs: ${inventorySummaryPreview.byFamily[family].skuCount}`}
                          tone={family === 'SIN_CLASIFICAR' ? 'warning' : 'default'}
                        />
                      ))
                    ) : null}
                  </div>

                  {renderSalesBreakdownPanels({
                    implants: 'No hay ventas de implantes clasificadas para desglosar.',
                    kits: 'No hay ventas de kits clasificadas para desglosar.',
                    motors: 'No hay ventas de motores clasificadas para desglosar.',
                    abutments: 'No hay ventas de aditamentos clasificadas para desglosar.',
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
                            <td style={{ color: movement.family === 'SIN_CLASIFICAR' ? 'var(--warning)' : 'inherit', fontWeight: movement.family === 'SIN_CLASIFICAR' ? 700 : 500 }}>
                              {movement.family}
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
            <button className="btn" style={{ padding: '0.45rem 0.7rem' }} onClick={() => void refreshHistory({ preferredPeriodKey: displayPeriodKey ?? periodKey })}>
              <RefreshCw size={14} className={isLoadingHistory ? 'animate-spin' : ''} />
            </button>
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
    </section>
  );
};

export default MonthlyAnalysisModule;
