import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Boxes, FileSpreadsheet, RefreshCw, Search, Upload } from 'lucide-react';
import type {
  DailyProductMovementDocumentSummary,
  DailyProductMovementRow,
  DailyProductMovementsParseResult,
  ProductMovementClassification,
  ProductMovementDirection,
} from '../types/dailyProductMovements';
import { parseDailyProductMovementsFile } from '../utils/dailyProductMovementsParser';

const STORAGE_KEY = 'megagen.dailyProductMovements.state';

interface PersistedState {
  sourceFileName: string;
  parsed: DailyProductMovementsParseResult;
}

const formatCLP = (value: number): string => new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
}).format(value);

const formatQty = (value: number): string => new Intl.NumberFormat('es-CL', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
}).format(value);

const readStoredState = (): PersistedState | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedState;
  } catch {
    return null;
  }
};

const classificationLabel: Record<ProductMovementClassification, string> = {
  opening_balance: 'Saldo inicial',
  sale_exit: 'Salida venta',
  dispatch_guide: 'Guía despacho',
  credit_note_entry: 'Entrada NC',
  other: 'Por revisar',
};

const classificationTone: Record<ProductMovementClassification, string> = {
  opening_balance: '#64748b',
  sale_exit: 'var(--error)',
  dispatch_guide: '#2563eb',
  credit_note_entry: 'var(--success)',
  other: 'var(--warning)',
};

const directionLabel: Record<ProductMovementDirection, string> = {
  entry: 'Entrada',
  exit: 'Salida',
  opening: 'Saldo anterior',
  neutral: 'Sin dirección',
};

const SummaryCard = ({ label, value, helper, tone }: { label: string; value: string; helper?: string; tone?: string }) => (
  <div className="finance-card">
    <div className="text-muted" style={{ fontSize: '0.7rem' }}>{label}</div>
    <div style={{ fontWeight: 800, fontSize: '1.2rem', color: tone }}>{value}</div>
    {helper ? <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.2rem' }}>{helper}</div> : null}
  </div>
);

const DailyProductMovementsModule: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stored = useMemo(() => readStoredState(), []);
  const [parsed, setParsed] = useState<DailyProductMovementsParseResult | null>(stored?.parsed ?? null);
  const [sourceFileName, setSourceFileName] = useState<string>(stored?.sourceFileName ?? '');
  const [search, setSearch] = useState('');
  const [documentFilter, setDocumentFilter] = useState('Todos');
  const [directionFilter, setDirectionFilter] = useState<'ALL' | ProductMovementDirection>('ALL');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!parsed || !sourceFileName) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sourceFileName, parsed }));
  }, [parsed, sourceFileName]);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setErrorMessage('');
    try {
      const result = await parseDailyProductMovementsFile(file);
      setParsed(result);
      setSourceFileName(file.name);
      setDocumentFilter('Todos');
      setDirectionFilter('ALL');
      setSearch('');
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsLoading(false);
      event.target.value = '';
    }
  };

  const clearData = () => {
    setParsed(null);
    setSourceFileName('');
    setErrorMessage('');
    setSearch('');
    setDocumentFilter('Todos');
    setDirectionFilter('ALL');
    localStorage.removeItem(STORAGE_KEY);
  };

  const documentOptions = useMemo(() => (
    parsed
      ? ['Todos', ...parsed.documentSummaries.map((item) => item.document)]
      : ['Todos']
  ), [parsed]);

  const filteredRows = useMemo(() => {
    if (!parsed) return [];
    const query = search.toLowerCase().trim();

    return parsed.rows.filter((row) => {
      const matchesDocument = documentFilter === 'Todos' || row.document === documentFilter;
      const matchesDirection = directionFilter === 'ALL' || row.direction === directionFilter;
      const content = `${row.sku} ${row.description} ${row.document} ${row.documentNumber} ${row.warehouse}`.toLowerCase();
      const matchesSearch = !query || content.includes(query);
      return matchesDocument && matchesDirection && matchesSearch;
    });
  }, [parsed, search, documentFilter, directionFilter]);

  return (
    <section className="glass card" style={{ marginTop: '1rem', textAlign: 'left' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Boxes size={22} /> Movimientos Diarios de Productos
          </h2>
          <p className="text-muted" style={{ fontSize: '0.85rem' }}>
            Carga el mayor auxiliar para clasificar entradas, salidas y saldos por producto y documento.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>
            <FileSpreadsheet size={14} /> Cargar archivo
          </button>
          <button className="btn" onClick={clearData} disabled={!parsed}>
            <RefreshCw size={14} /> Limpiar
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            style={{ display: 'none' }}
            onChange={(event) => { void handleUpload(event); }}
          />
        </div>
      </div>

      <div style={{ marginBottom: '1rem', padding: '0.85rem 1rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'rgba(37, 99, 235, 0.04)' }}>
        <div style={{ fontWeight: 700, marginBottom: '0.35rem' }}>Reglas actuales</div>
        <div className="text-muted" style={{ fontSize: '0.82rem', lineHeight: 1.6 }}>
          `Saldo Anterior` se toma como saldo inicial.
          `REBAJA STOCK` se clasifica como salida.
          `52 Guia de Despacho` respeta las columnas de entrada/salida para detectar traslados entre bodegas.
          `PARTE DE ENTRADA NC` se clasifica como entrada.
        </div>
      </div>

      {errorMessage ? (
        <div style={{ marginBottom: '1rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '12px', padding: '0.8rem', color: 'var(--error)' }}>
          {errorMessage}
        </div>
      ) : null}

      {parsed ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
            <SummaryCard label="Filas de movimiento" value={formatQty(parsed.movementRows)} helper={`Saldo inicial: ${formatQty(parsed.openingRows)}`} />
            <SummaryCard label="Entradas" value={formatQty(parsed.totalEntryQty)} helper={formatCLP(parsed.totalEntryAmountCLP)} tone="var(--success)" />
            <SummaryCard label="Salidas" value={formatQty(parsed.totalExitQty)} helper={formatCLP(parsed.totalExitAmountCLP)} tone="var(--error)" />
            <SummaryCard label="Tipos de documento" value={formatQty(parsed.documentSummaries.length)} helper={parsed.sourcePeriodLabel || 'Sin periodo'} />
          </div>

          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'minmax(260px, 0.9fr) minmax(0, 1.6fr)', marginBottom: '1rem' }}>
            <div className="finance-card" style={{ padding: '1rem' }}>
              <div style={{ fontWeight: 700, marginBottom: '0.6rem' }}>Documentos detectados</div>
              <div style={{ display: 'grid', gap: '0.55rem', maxHeight: '420px', overflow: 'auto' }}>
                {parsed.documentSummaries.map((summary: DailyProductMovementDocumentSummary) => (
                  <div key={summary.document} style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '0.7rem 0.8rem', background: '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.35rem', alignItems: 'center' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{summary.document}</div>
                      <span style={{ fontSize: '0.72rem', padding: '0.18rem 0.45rem', borderRadius: '999px', background: 'rgba(15,23,42,0.06)', color: classificationTone[summary.classification] }}>
                        {classificationLabel[summary.classification]}
                      </span>
                    </div>
                    <div className="text-muted" style={{ fontSize: '0.78rem', lineHeight: 1.55 }}>
                      Filas: {formatQty(summary.rows)} | Entradas: {formatQty(summary.entryQty)} | Salidas: {formatQty(summary.exitQty)}
                    </div>
                    <div className="text-muted" style={{ fontSize: '0.78rem', lineHeight: 1.55 }}>
                      CLP entrada: {formatCLP(summary.entryAmountCLP)} | CLP salida: {formatCLP(summary.exitAmountCLP)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="finance-card" style={{ padding: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.8rem' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>Detalle de movimientos</div>
                  <div className="text-muted" style={{ fontSize: '0.78rem' }}>
                    Archivo: <strong>{sourceFileName}</strong>
                    {parsed.dateFrom && parsed.dateTo ? ` | Rango: ${parsed.dateFrom} a ${parsed.dateTo}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.65rem', border: '1px solid var(--border)', borderRadius: '10px', background: '#fff' }}>
                    <Search size={14} />
                    <input
                      className="input-field"
                      style={{ border: 'none', padding: 0, minWidth: '180px', background: 'transparent' }}
                      placeholder="Buscar SKU, producto, doc..."
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </label>
                  <select className="input-field" value={documentFilter} onChange={(event) => setDocumentFilter(event.target.value)}>
                    {documentOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                  <select className="input-field" value={directionFilter} onChange={(event) => setDirectionFilter(event.target.value as 'ALL' | ProductMovementDirection)}>
                    <option value="ALL">Todas las direcciones</option>
                    <option value="entry">Entradas</option>
                    <option value="exit">Salidas</option>
                    <option value="opening">Saldo anterior</option>
                    <option value="neutral">Sin dirección</option>
                  </select>
                </div>
              </div>

              {parsed.unknownDocuments.length ? (
                <div style={{ marginBottom: '0.8rem', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '12px', padding: '0.8rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 700, color: '#9A5A00', marginBottom: '0.25rem' }}>
                    <AlertTriangle size={15} /> Documentos por revisar
                  </div>
                  <div className="text-muted" style={{ fontSize: '0.8rem' }}>
                    {parsed.unknownDocuments.join(' | ')}
                  </div>
                </div>
              ) : null}

              <div className="table-container" style={{ maxHeight: '520px' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Documento</th>
                      <th>Número</th>
                      <th>Bodega</th>
                      <th>SKU</th>
                      <th>Producto</th>
                      <th>Clasificación</th>
                      <th>Dirección</th>
                      <th style={{ textAlign: 'right' }}>Entrada</th>
                      <th style={{ textAlign: 'right' }}>Salida</th>
                      <th style={{ textAlign: 'right' }}>Saldo</th>
                      <th style={{ textAlign: 'right' }}>CLP mov.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.length ? filteredRows.map((row: DailyProductMovementRow, index) => (
                      <tr key={`${row.dateISO}-${row.document}-${row.documentNumber}-${row.sku}-${row.warehouse}-${index}`}>
                        <td>{row.date}</td>
                        <td>{row.document}</td>
                        <td>{row.documentNumber || '-'}</td>
                        <td>{row.warehouse || '-'}</td>
                        <td>{row.sku}</td>
                        <td>{row.description}</td>
                        <td>{classificationLabel[row.classification]}</td>
                        <td>{directionLabel[row.direction]}</td>
                        <td style={{ textAlign: 'right', color: 'var(--success)', fontWeight: 700 }}>{row.entryQty > 0 ? formatQty(row.entryQty) : '-'}</td>
                        <td style={{ textAlign: 'right', color: 'var(--error)', fontWeight: 700 }}>{row.exitQty > 0 ? formatQty(row.exitQty) : '-'}</td>
                        <td style={{ textAlign: 'right' }}>{formatQty(row.balanceQty)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{row.effectiveAmountCLP ? formatCLP(row.effectiveAmountCLP) : '-'}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={12} style={{ textAlign: 'center', padding: '1rem' }} className="text-muted">
                          {isLoading ? 'Procesando archivo...' : 'No hay filas para los filtros seleccionados.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="text-muted" style={{ border: '1px dashed var(--border)', borderRadius: '14px', padding: '1.2rem', background: 'rgba(255,255,255,0.6)' }}>
          Sube el mayor auxiliar diario de productos para detectar entradas, salidas, saldo inicial y movimientos por bodega.
        </div>
      )}

      {isLoading ? (
        <div className="text-muted" style={{ marginTop: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <Upload size={14} /> Procesando archivo...
        </div>
      ) : null}
    </section>
  );
};

export default DailyProductMovementsModule;
