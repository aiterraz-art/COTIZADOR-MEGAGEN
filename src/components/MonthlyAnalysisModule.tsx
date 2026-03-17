import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Boxes,
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

type MonthlyTab = 'summary' | 'balance' | 'pnl' | 'inventory';
type UploadKind = 'balance' | 'pnl' | 'inventory';

interface MonthlyAnalysisModuleProps {
  products: Product[];
}

interface MonthlyDraftState {
  balance: MonthlyParseResult<MonthlyBalanceLine> | null;
  pnl: MonthlyParseResult<MonthlyPnlLine> | null;
  inventory: MonthlyParseResult<MonthlyInventoryMovement> | null;
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
  const balanceInputRef = useRef<HTMLInputElement>(null);
  const pnlInputRef = useRef<HTMLInputElement>(null);
  const inventoryInputRef = useRef<HTMLInputElement>(null);

  const [periodKey, setPeriodKey] = useState(currentMonth);
  const [activeTab, setActiveTab] = useState<MonthlyTab>('summary');
  const [draft, setDraft] = useState<MonthlyDraftState>(() => initialDraftState());
  const [history, setHistory] = useState<MonthlyCloseListItem[]>([]);
  const [selectedClosure, setSelectedClosure] = useState<MonthlyCloseRecord | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [inventorySearch, setInventorySearch] = useState('');
  const [familyFilter, setFamilyFilter] = useState<'ALL' | MonthlyInventoryFamily>('ALL');

  const loadClosure = useCallback(async (nextPeriodKey: string): Promise<void> => {
    setIsLoadingDetail(true);
    setErrorMessage('');
    setInfoMessage('');
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

  const refreshHistory = useCallback(async (preferredPeriodKey?: string): Promise<void> => {
    setIsLoadingHistory(true);
    setErrorMessage('');
    try {
      const rows = await fetchMonthlyClosures();
      setHistory(rows);

      const targetPeriodKey = preferredPeriodKey ?? rows[0]?.periodKey;
      if (targetPeriodKey) {
        await loadClosure(targetPeriodKey);
      } else {
        setSelectedClosure(null);
      }
    } catch (error) {
      setErrorMessage(`Error cargando historial mensual: ${(error as Error).message}`);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [loadClosure]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

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

  const filteredInventoryMovements = useMemo(() => {
    const query = inventorySearch.toLowerCase().trim();
    return displayInventoryMovements.filter((movement) => {
      const familyMatches = familyFilter === 'ALL' || movement.family === familyFilter;
      const queryMatches = !query
        || `${movement.sku} ${movement.productName}`.toLowerCase().includes(query);
      return familyMatches && queryMatches;
    });
  }, [displayInventoryMovements, familyFilter, inventorySearch]);

  const existingPeriod = history.find((item) => item.periodKey === periodKey) ?? null;

  const handleFileUpload = async (kind: UploadKind, file: File): Promise<void> => {
    setErrorMessage('');
    setInfoMessage('');
    setSelectedClosure(null);

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

      await refreshHistory(periodKey);
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
            Advertencias: {result.warnings.length}
          </div>
        ) : null}

        {result?.errors.length ? (
          <div style={{ marginBottom: '0.65rem', fontSize: '0.75rem', color: 'var(--error)' }}>
            Errores: {result.errors.length}
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
          <button className="btn" onClick={() => void refreshHistory(displayPeriodKey ?? periodKey)}>
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
            {renderUploadCard('inventory', 'Movimientos de Inventario', 'Movimientos de implantes, aditamentos y kits por SKU.', draft.inventory, inventoryInputRef)}
          </div>

          <div className="finance-card" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              {[
                ['summary', 'Resumen'],
                ['balance', 'Balance'],
                ['pnl', 'Estado de Resultados'],
                ['inventory', 'Inventario'],
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
                    <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Inventario por Familia</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem' }}>
                      {(['IMPLANTES', 'ADITAMENTOS', 'KITS', 'SIN_CLASIFICAR'] as MonthlyInventoryFamily[]).map((family) => (
                        <MetricCard
                          key={family}
                          title={family}
                          value={formatQty(displaySummary.inventory.byFamily[family].closingQty)}
                          hint={`Neto: ${formatQty(displaySummary.inventory.byFamily[family].netChangeQty)} | SKUs: ${displaySummary.inventory.byFamily[family].skuCount}`}
                          tone={family === 'SIN_CLASIFICAR' ? 'warning' : 'default'}
                        />
                      ))}
                    </div>
                  </div>

                  {comparison ? (
                    <div style={{ display: 'grid', gap: '1rem' }}>
                      <ComparisonTable title="Comparación Balance" items={comparison.balance} />
                      <ComparisonTable title="Comparación ER" items={comparison.pnl} />
                      <ComparisonTable title="Comparación Inventario" items={comparison.inventory} />
                    </div>
                  ) : null}
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
                      <option value="ADITAMENTOS">Aditamentos</option>
                      <option value="KITS">Kits</option>
                      <option value="SIN_CLASIFICAR">Sin clasificar</option>
                    </select>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem' }}>
                    {displaySummary ? (
                      (['IMPLANTES', 'ADITAMENTOS', 'KITS', 'SIN_CLASIFICAR'] as MonthlyInventoryFamily[]).map((family) => (
                        <MetricCard
                          key={family}
                          title={`${family} - Stock Final`}
                          value={formatQty(displaySummary.inventory.byFamily[family].closingQty)}
                          hint={`Entradas: ${formatQty(displaySummary.inventory.byFamily[family].entriesQty)} | Salidas: ${formatQty(displaySummary.inventory.byFamily[family].exitsQty)}`}
                          tone={family === 'SIN_CLASIFICAR' ? 'warning' : 'default'}
                        />
                      ))
                    ) : null}
                  </div>

                  <div className="table-container">
                    <table>
                      <thead>
                        <tr>
                          <th>SKU</th>
                          <th>Producto</th>
                          <th>Familia</th>
                          <th style={{ textAlign: 'right' }}>Stock Inicial</th>
                          <th style={{ textAlign: 'right' }}>Entradas</th>
                          <th style={{ textAlign: 'right' }}>Salidas</th>
                          <th style={{ textAlign: 'right' }}>Ajustes</th>
                          <th style={{ textAlign: 'right' }}>Stock Final</th>
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
                            <td style={{ textAlign: 'right' }}>{formatQty(movement.openingQty)}</td>
                            <td style={{ textAlign: 'right', color: 'var(--success)', fontWeight: 700 }}>{formatQty(movement.entriesQty)}</td>
                            <td style={{ textAlign: 'right', color: 'var(--error)', fontWeight: 700 }}>{formatQty(movement.exitsQty)}</td>
                            <td style={{ textAlign: 'right' }}>{formatQty(movement.adjustmentsQty)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 800 }}>{formatQty(movement.closingQty)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '1rem', border: '1px dashed var(--border)', borderRadius: '12px', background: 'var(--surface)' }}>
                  No hay movimientos de inventario disponibles.
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
            <button className="btn" style={{ padding: '0.45rem 0.7rem' }} onClick={() => void refreshHistory(displayPeriodKey ?? periodKey)}>
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
                      Stock final: <strong>{formatQty(item.summary.inventory.totals.closingQty)}</strong>
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
