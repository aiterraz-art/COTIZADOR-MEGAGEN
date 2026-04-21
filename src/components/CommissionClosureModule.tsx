import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertTriangle, Download, FileSpreadsheet, History, Save, Search, Trash2 } from 'lucide-react';
import type {
  CommissionClosureListItem,
  CommissionClosureProcessingResult,
  CommissionCompanyConfig,
  CommissionCompanyKey,
  CommissionExclusionRule,
} from '../types/commissions';
import { buildCommissionClosureSummary, buildCommissionProcessingResultFromClosure, mapClosureToCarryoverLines, processCommissionClosure } from '../utils/commissionEngine';
import { buildCommissionWorkbook } from '../utils/commissionWorkbook';
import { parseCommissionCarryoverFile, parseCommissionReceivablesFile, parseCommissionSalesFile } from '../utils/commissionParsers';
import { createDefaultCommissionConfig } from '../data/commissionDefaults';
import {
  deleteCommissionClosure,
  fetchCommissionClosureByPeriod,
  fetchCommissionClosures,
  fetchCommissionCompanyConfig,
  fetchLatestCommissionClosureBefore,
  upsertCommissionClosure,
  upsertCommissionCompanyConfig,
} from '../lib/commissionRepository';

interface CommissionClosureModuleProps {
  companyKey: CommissionCompanyKey;
  companyLabel: string;
  requiresProductClass: boolean;
  defaultClassConfig: string[];
}

const formatCLP = (value: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value);

const todayPeriod = new Date().toISOString().slice(0, 7);

const StatCard = ({ label, value }: { label: string; value: string | number }) => (
  <div className="finance-card">
    <div className="text-muted" style={{ fontSize: '0.68rem' }}>{label}</div>
    <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{value}</div>
  </div>
);

const MessageList = ({
  title,
  messages,
  tone,
}: {
  title: string;
  messages: string[];
  tone: 'error' | 'warning';
}) => {
  if (!messages.length) return null;
  const styles = tone === 'error'
    ? { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: 'var(--error)' }
    : { background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', color: '#9A5A00' };
  return (
    <div style={{ ...styles, borderRadius: '12px', padding: '0.85rem', marginTop: '0.85rem' }}>
      <div style={{ fontWeight: 700, marginBottom: '0.4rem' }}>{title}</div>
      <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
        {messages.map((message) => <li key={message}>{message}</li>)}
      </ul>
    </div>
  );
};

const DetailTable = ({
  title,
  columns,
  rows,
  emptyLabel,
}: {
  title: string;
  columns: string[];
  rows: Array<Array<string | number>>;
  emptyLabel: string;
}) => (
  <div style={{ marginTop: '1rem' }}>
    <div style={{ fontWeight: 700, marginBottom: '0.45rem' }}>{title}</div>
    <div className="table-container" style={{ maxHeight: '280px' }}>
      <table>
        <thead>
          <tr>
            {columns.map((column) => <th key={column}>{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length > 0 ? rows.map((row, rowIndex) => (
            <tr key={`${title}-${rowIndex}`}>
              {row.map((cell, columnIndex) => <td key={`${title}-${rowIndex}-${columnIndex}`}>{cell}</td>)}
            </tr>
          )) : (
            <tr>
              <td colSpan={columns.length} style={{ textAlign: 'center', padding: '1rem' }} className="text-muted">
                {emptyLabel}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
);

const createEmptyRule = (): CommissionExclusionRule => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  field: 'description',
  operator: 'contains',
  value: '',
  note: '',
});

const CommissionClosureModule: React.FC<CommissionClosureModuleProps> = ({
  companyKey,
  companyLabel,
  requiresProductClass,
  defaultClassConfig,
}) => {
  const salesInputRef = useRef<HTMLInputElement>(null);
  const receivablesInputRef = useRef<HTMLInputElement>(null);
  const carryoverInputRef = useRef<HTMLInputElement>(null);
  const [periodKey, setPeriodKey] = useState(todayPeriod);
  const [config, setConfig] = useState<CommissionCompanyConfig>(() => createDefaultCommissionConfig(companyKey));
  const [salesFileName, setSalesFileName] = useState('');
  const [salesParseResult, setSalesParseResult] = useState<Awaited<ReturnType<typeof parseCommissionSalesFile>> | null>(null);
  const [receivablesFileName, setReceivablesFileName] = useState('');
  const [receivablesParseResult, setReceivablesParseResult] = useState<Awaited<ReturnType<typeof parseCommissionReceivablesFile>> | null>(null);
  const [carryoverFileName, setCarryoverFileName] = useState('');
  const [carryoverParseResult, setCarryoverParseResult] = useState<Awaited<ReturnType<typeof parseCommissionCarryoverFile>> | null>(null);
  const [processedResult, setProcessedResult] = useState<CommissionClosureProcessingResult | null>(null);
  const [savedClosures, setSavedClosures] = useState<CommissionClosureListItem[]>([]);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const loadSavedClosures = async () => {
    setIsLoadingHistory(true);
    try {
      const closures = await fetchCommissionClosures(companyKey);
      setSavedClosures(closures);
    } catch (error) {
      console.error('Error fetching commission closures:', error);
      setErrorMessage((error as Error).message);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      setIsLoadingConfig(true);
      setErrorMessage('');
      try {
        const [storedConfig, closures] = await Promise.all([
          fetchCommissionCompanyConfig(companyKey),
          fetchCommissionClosures(companyKey),
        ]);
        setConfig(storedConfig);
        setSavedClosures(closures);
      } catch (error) {
        console.error('Error loading commission module:', error);
        setConfig(createDefaultCommissionConfig(companyKey));
        setErrorMessage((error as Error).message);
      } finally {
        setIsLoadingConfig(false);
      }
    };
    load();
  }, [companyKey]);

  const resetProcessedResult = () => {
    setProcessedResult(null);
  };

  const handleSalesUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setErrorMessage('');
    resetProcessedResult();
    try {
      const parsed = await parseCommissionSalesFile(file, companyKey);
      setSalesFileName(file.name);
      setSalesParseResult(parsed);
    } catch (error) {
      setSalesFileName('');
      setSalesParseResult(null);
      setErrorMessage((error as Error).message);
    } finally {
      event.target.value = '';
    }
  };

  const handleReceivablesUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setErrorMessage('');
    resetProcessedResult();
    try {
      const parsed = await parseCommissionReceivablesFile(file);
      setReceivablesFileName(file.name);
      setReceivablesParseResult(parsed);
    } catch (error) {
      setReceivablesFileName('');
      setReceivablesParseResult(null);
      setErrorMessage((error as Error).message);
    } finally {
      event.target.value = '';
    }
  };

  const handleCarryoverUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setErrorMessage('');
    resetProcessedResult();
    try {
      const parsed = await parseCommissionCarryoverFile(file, companyKey);
      setCarryoverFileName(file.name);
      setCarryoverParseResult(parsed);
    } catch (error) {
      setCarryoverFileName('');
      setCarryoverParseResult(null);
      setErrorMessage((error as Error).message);
    } finally {
      event.target.value = '';
    }
  };

  const processCurrentClosure = async () => {
    setIsProcessing(true);
    setErrorMessage('');
    try {
      const warnings = [
        ...(salesParseResult?.warnings ?? []),
        ...(receivablesParseResult?.warnings ?? []),
        ...(carryoverParseResult?.warnings ?? []),
      ];

      let carryoverLines = carryoverParseResult?.rows ?? [];
      let usedCarryoverSource: 'manual' | 'saved' | 'none' = carryoverParseResult ? 'manual' : 'none';
      let effectiveCarryoverFileName = carryoverFileName;

      if (!carryoverParseResult) {
        const previousClosure = await fetchLatestCommissionClosureBefore(companyKey, periodKey);
        if (previousClosure) {
          carryoverLines = mapClosureToCarryoverLines(previousClosure);
          usedCarryoverSource = 'saved';
          effectiveCarryoverFileName = `Cierre ${previousClosure.periodKey}`;
          if (!carryoverLines.length) {
            warnings.push(`El cierre ${previousClosure.periodKey} no dejó líneas pendientes vigentes.`);
          }
        }
      }

      const result = processCommissionClosure({
        companyKey,
        periodKey,
        config,
        salesLines: salesParseResult?.rows ?? [],
        receivableRows: receivablesParseResult?.rows ?? [],
        carryoverLines,
        salesFileName,
        receivablesFileName,
        carryoverFileName: effectiveCarryoverFileName,
        usedCarryoverSource,
        initialWarnings: warnings,
      });

      setProcessedResult(result);
    } catch (error) {
      console.error('Error processing commission closure:', error);
      setErrorMessage((error as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const saveCurrentClosure = async () => {
    if (!processedResult) {
      setErrorMessage('Primero procesa el cierre.');
      return;
    }
    if (processedResult.blockingErrors.length > 0) {
      setErrorMessage('Corrige los errores bloqueantes antes de guardar.');
      return;
    }

    setIsSaving(true);
    setErrorMessage('');
    try {
      const summary = buildCommissionClosureSummary(processedResult);
      await upsertCommissionCompanyConfig(config);
      await upsertCommissionClosure({
        companyKey,
        periodKey: processedResult.periodKey,
        salesFileName: processedResult.salesFileName,
        receivablesFileName: processedResult.receivablesFileName,
        carryoverFileName: processedResult.carryoverFileName,
        summary,
        lines: processedResult.lines,
      });
      await loadSavedClosures();
      alert(`Cierre de ${companyLabel} guardado correctamente.`);
    } catch (error) {
      console.error('Error saving commission closure:', error);
      setErrorMessage((error as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const downloadCurrentWorkbook = () => {
    if (!processedResult) {
      setErrorMessage('Primero procesa el cierre.');
      return;
    }
    if (processedResult.blockingErrors.length > 0) {
      setErrorMessage('Corrige los errores bloqueantes antes de descargar.');
      return;
    }

    const { workbook, downloadFileName } = buildCommissionWorkbook(processedResult);
    XLSX.writeFile(workbook, downloadFileName, { bookType: 'xlsx', cellStyles: true });
  };

  const openSavedClosure = async (periodToOpen: string) => {
    setErrorMessage('');
    try {
      const record = await fetchCommissionClosureByPeriod(companyKey, periodToOpen);
      if (!record) {
        setErrorMessage('No se encontró el cierre solicitado.');
        return;
      }
      setConfig(record.summary.configSnapshot);
      setPeriodKey(record.periodKey);
      setSalesFileName(record.salesFileName);
      setSalesParseResult(null);
      setReceivablesFileName(record.receivablesFileName);
      setReceivablesParseResult(null);
      setCarryoverFileName(record.carryoverFileName);
      setCarryoverParseResult(null);
      setProcessedResult(buildCommissionProcessingResultFromClosure(record));
      setShowHistory(false);
    } catch (error) {
      console.error('Error opening commission closure:', error);
      setErrorMessage((error as Error).message);
    }
  };

  const downloadSavedClosure = async (periodToDownload: string) => {
    setErrorMessage('');
    try {
      const record = await fetchCommissionClosureByPeriod(companyKey, periodToDownload);
      if (!record) {
        setErrorMessage('No se encontró el cierre solicitado.');
        return;
      }
      const result = buildCommissionProcessingResultFromClosure(record);
      const { workbook, downloadFileName } = buildCommissionWorkbook(result);
      XLSX.writeFile(workbook, downloadFileName, { bookType: 'xlsx', cellStyles: true });
    } catch (error) {
      console.error('Error downloading commission closure:', error);
      setErrorMessage((error as Error).message);
    }
  };

  const deleteSavedClosure = async (periodToDelete: string) => {
    if (!confirm(`¿Eliminar el cierre ${periodToDelete} de ${companyLabel}?`)) return;
    try {
      await deleteCommissionClosure(companyKey, periodToDelete);
      await loadSavedClosures();
      if (processedResult?.periodKey === periodToDelete) {
        setProcessedResult(null);
      }
    } catch (error) {
      console.error('Error deleting commission closure:', error);
      setErrorMessage((error as Error).message);
    }
  };

  const filteredClosures = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return savedClosures;
    return savedClosures.filter((closure) =>
      `${closure.periodKey} ${closure.salesFileName} ${closure.receivablesFileName}`.toLowerCase().includes(query));
  }, [savedClosures, searchTerm]);

  const sellerSummaryRows = useMemo(() => (
    processedResult?.sellerSummaries.map((summary) => ([
      summary.salesRep,
      formatCLP(summary.currentPaidNetCLP),
      formatCLP(summary.carryoverPaidNetCLP),
      formatCLP(summary.negativeAdjustmentsNetCLP),
      formatCLP(summary.totalBaseNetCLP),
      formatCLP(summary.totalCommissionCLP),
    ])) ?? []
  ), [processedResult]);

  const currentPaidRows = useMemo(() => (
    processedResult?.currentPaidLines.map((line) => ([
      line.documentNumber,
      line.salesRep,
      line.clientName || line.clientCode,
      line.productDescription || line.productCode,
      line.productClass || '-',
      formatCLP(line.netAmountCLP),
      `${line.ratePercent}%`,
      formatCLP(line.commissionAmountCLP),
    ])) ?? []
  ), [processedResult]);

  const carryoverPaidRows = useMemo(() => (
    processedResult?.carryoverPaidLines.map((line) => ([
      line.originPeriodKey || '-',
      line.documentNumber,
      line.salesRep,
      line.clientName || line.clientCode,
      line.productDescription || line.productCode,
      line.productClass || '-',
      formatCLP(line.netAmountCLP),
      `${line.ratePercent}%`,
      formatCLP(line.commissionAmountCLP),
    ])) ?? []
  ), [processedResult]);

  const unpaidRows = useMemo(() => (
    processedResult?.unpaidLines.map((line) => ([
      line.originPeriodKey || processedResult.periodKey,
      line.documentNumber,
      line.salesRep,
      line.clientName || line.clientCode,
      line.productDescription || line.productCode,
      line.productClass || '-',
      formatCLP(line.netAmountCLP),
      `${line.ratePercent}%`,
    ])) ?? []
  ), [processedResult]);

  const excludedRows = useMemo(() => (
    processedResult?.excludedLines.map((line) => ([
      line.documentNumber,
      line.salesRep,
      line.productCode,
      line.productDescription || '-',
      line.exclusionReason || '-',
      formatCLP(line.netAmountCLP),
    ])) ?? []
  ), [processedResult]);

  return (
    <section className="glass card" style={{ marginTop: '1rem', textAlign: 'left' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileSpreadsheet size={22} /> Cierre Comisiones {companyLabel}
          </h2>
          <p className="text-muted" style={{ fontSize: '0.83rem' }}>
            Cruza ventas del mes, cuentas por cobrar y arrastres pendientes para calcular comisión sobre ventas efectivamente pagadas.
          </p>
          {requiresProductClass && (
            <p className="text-muted" style={{ fontSize: '0.76rem', marginTop: '0.35rem' }}>
              Clases permitidas: <strong>{defaultClassConfig.join(', ')}</strong>
            </p>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => salesInputRef.current?.click()}>
            <FileSpreadsheet size={14} /> Cargar ventas del mes
          </button>
          <button className="btn" style={{ background: 'var(--accent)', color: '#fff' }} onClick={() => receivablesInputRef.current?.click()}>
            <FileSpreadsheet size={14} /> Cargar cuentas por cobrar
          </button>
          <button className="btn" style={{ background: 'rgba(15,76,129,0.08)', color: '#0f4c81' }} onClick={() => carryoverInputRef.current?.click()}>
            <FileSpreadsheet size={14} /> Cargar arrastre anterior
          </button>
          <button className="btn" style={{ background: '#0f4c81', color: '#fff' }} onClick={processCurrentClosure}>
            <Search size={14} /> {isProcessing ? 'Procesando...' : 'Procesar cierre'}
          </button>
          <button className="btn" style={{ background: '#0f766e', color: '#fff' }} onClick={saveCurrentClosure} disabled={isSaving}>
            <Save size={14} /> {isSaving ? 'Guardando...' : 'Guardar cierre'}
          </button>
          <button className="btn" style={{ background: '#1d4ed8', color: '#fff' }} onClick={downloadCurrentWorkbook}>
            <Download size={14} /> Descargar Excel
          </button>
          <button className="btn" onClick={() => setShowHistory(true)}>
            <History size={14} /> Ver cierres guardados
          </button>
          <input ref={salesInputRef} type="file" style={{ display: 'none' }} accept=".xlsx,.xls,.csv" onChange={handleSalesUpload} />
          <input ref={receivablesInputRef} type="file" style={{ display: 'none' }} accept=".xlsx,.xls,.csv" onChange={handleReceivablesUpload} />
          <input ref={carryoverInputRef} type="file" style={{ display: 'none' }} accept=".xlsx,.xls,.csv" onChange={handleCarryoverUpload} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
        <label>
          <div className="text-muted" style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}>Periodo</div>
          <input type="month" className="input-field" value={periodKey} onChange={(event) => { setPeriodKey(event.target.value); resetProcessedResult(); }} />
        </label>

        {companyKey === 'megagen' ? (
          <label>
            <div className="text-muted" style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}>Tasa comisión MegaGen (%)</div>
            <input
              type="number"
              className="input-field"
              value={config.globalRatePercent ?? ''}
              onChange={(event) => { setConfig((prev) => ({ ...prev, globalRatePercent: Number(event.target.value) || 0 })); resetProcessedResult(); }}
            />
          </label>
        ) : (
          <>
            <label>
              <div className="text-muted" style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}>Tasa implantes (%)</div>
              <input
                type="number"
                className="input-field"
                value={config.implantRatePercent ?? ''}
                onChange={(event) => { setConfig((prev) => ({ ...prev, implantRatePercent: Number(event.target.value) || 0 })); resetProcessedResult(); }}
              />
            </label>
            <label>
              <div className="text-muted" style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}>Tasa 3Dental (%)</div>
              <input
                type="number"
                className="input-field"
                value={config.threeDentalRatePercent ?? ''}
                onChange={(event) => { setConfig((prev) => ({ ...prev, threeDentalRatePercent: Number(event.target.value) || 0 })); resetProcessedResult(); }}
              />
            </label>
          </>
        )}
      </div>

      <div className="text-muted" style={{ marginBottom: '0.9rem' }}>
        Ventas: <strong>{salesFileName || 'No cargado'}</strong>
        {' '}| CxC: <strong>{receivablesFileName || 'No cargado'}</strong>
        {' '}| Arrastre: <strong>{carryoverFileName || 'Automático desde historial si existe'}</strong>
        {' '}| Configuración: <strong>{isLoadingConfig ? 'Cargando...' : 'Lista'}</strong>
      </div>

      {errorMessage && (
        <div style={{ marginBottom: '0.8rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '0.7rem', color: 'var(--error)' }}>
          {errorMessage}
        </div>
      )}

      <div style={{ marginBottom: '1rem' }}>
        <div style={{ fontWeight: 700, marginBottom: '0.45rem' }}>Catálogo de exclusión</div>
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          {config.exclusionRules.map((rule) => (
            <div key={rule.id} style={{ display: 'grid', gridTemplateColumns: '130px 130px 1fr 1fr 44px', gap: '0.5rem', alignItems: 'center' }}>
              <select
                className="input-field"
                value={rule.field}
                onChange={(event) => {
                  setConfig((prev) => ({
                    ...prev,
                    exclusionRules: prev.exclusionRules.map((entry) => entry.id === rule.id ? { ...entry, field: event.target.value as CommissionExclusionRule['field'] } : entry),
                  }));
                  resetProcessedResult();
                }}
              >
                <option value="sku">SKU</option>
                <option value="description">Descripción</option>
              </select>
              <select
                className="input-field"
                value={rule.operator}
                onChange={(event) => {
                  setConfig((prev) => ({
                    ...prev,
                    exclusionRules: prev.exclusionRules.map((entry) => entry.id === rule.id ? { ...entry, operator: event.target.value as CommissionExclusionRule['operator'] } : entry),
                  }));
                  resetProcessedResult();
                }}
              >
                <option value="equals">equals</option>
                <option value="contains">contains</option>
              </select>
              <input
                type="text"
                className="input-field"
                value={rule.value}
                placeholder="Valor a excluir"
                onChange={(event) => {
                  setConfig((prev) => ({
                    ...prev,
                    exclusionRules: prev.exclusionRules.map((entry) => entry.id === rule.id ? { ...entry, value: event.target.value } : entry),
                  }));
                  resetProcessedResult();
                }}
              />
              <input
                type="text"
                className="input-field"
                value={rule.note}
                placeholder="Nota / motivo"
                onChange={(event) => {
                  setConfig((prev) => ({
                    ...prev,
                    exclusionRules: prev.exclusionRules.map((entry) => entry.id === rule.id ? { ...entry, note: event.target.value } : entry),
                  }));
                  resetProcessedResult();
                }}
              />
              <button
                className="btn"
                style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--error)', padding: '0.5rem' }}
                onClick={() => {
                  setConfig((prev) => ({
                    ...prev,
                    exclusionRules: prev.exclusionRules.filter((entry) => entry.id !== rule.id),
                  }));
                  resetProcessedResult();
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <div>
            <button
              className="btn"
              onClick={() => {
                setConfig((prev) => ({ ...prev, exclusionRules: [...prev.exclusionRules, createEmptyRule()] }));
                resetProcessedResult();
              }}
            >
              Añadir exclusión
            </button>
          </div>
        </div>
      </div>

      {processedResult && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '0.75rem' }}>
          <StatCard label="Facturas cobradas mes" value={processedResult.stats.paidCurrentInvoices} />
          <StatCard label="Facturas arrastre cobradas" value={processedResult.stats.paidCarryoverInvoices} />
          <StatCard label="Facturas pendientes vigentes" value={processedResult.stats.unpaidInvoices} />
          <StatCard label="Líneas excluidas" value={processedResult.stats.excludedLines} />
          <StatCard label="Vendedores afectados" value={processedResult.stats.affectedSellers} />
          <StatCard label="Comisión total" value={formatCLP(processedResult.stats.totalCommissionCLP)} />
        </div>
      )}

      <MessageList title="Errores bloqueantes" messages={processedResult?.blockingErrors ?? []} tone="error" />
      <MessageList title="Advertencias" messages={processedResult?.warnings ?? []} tone="warning" />

      <DetailTable
        title="Resumen por vendedor"
        columns={['Vendedor', 'Cobrado mes', 'Arrastres cobrados', 'Descuentos', 'Base', 'Comisión']}
        rows={sellerSummaryRows}
        emptyLabel="Procesa un cierre para ver el resumen por vendedor."
      />

      <DetailTable
        title="Ventas cobradas del mes"
        columns={['Factura', 'Vendedor', 'Cliente', 'Producto', 'Clase', 'Neto', 'Tasa', 'Comisión']}
        rows={currentPaidRows}
        emptyLabel="No hay ventas cobradas del mes en este cierre."
      />

      <DetailTable
        title="Arrastres cobrados"
        columns={['Periodo Origen', 'Factura', 'Vendedor', 'Cliente', 'Producto', 'Clase', 'Neto', 'Tasa', 'Comisión']}
        rows={carryoverPaidRows}
        emptyLabel="No hay arrastres cobrados en este cierre."
      />

      <DetailTable
        title="No cobradas vigentes"
        columns={['Periodo Origen', 'Factura', 'Vendedor', 'Cliente', 'Producto', 'Clase', 'Neto', 'Tasa']}
        rows={unpaidRows}
        emptyLabel="No quedaron facturas pendientes vigentes."
      />

      <DetailTable
        title="Excluidas"
        columns={['Factura', 'Vendedor', 'SKU', 'Producto', 'Motivo', 'Neto']}
        rows={excludedRows}
        emptyLabel="No hay líneas excluidas en este cierre."
      />

      {showHistory && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1300,
        }}>
          <div className="glass card" style={{ width: '92%', maxWidth: '980px', maxHeight: '84vh', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem', alignItems: 'center' }}>
              <div>
                <h3 style={{ marginBottom: '0.3rem' }}>Cierres guardados {companyLabel}</h3>
                <div className="text-muted" style={{ fontSize: '0.8rem' }}>Un cierre por período; reprocesar reemplaza el existente.</div>
              </div>
              <button className="btn" onClick={() => setShowHistory(false)}>Cerrar</button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.4rem 0.6rem', background: '#fff', marginBottom: '0.9rem' }}>
              <Search size={14} className="text-muted" />
              <input
                type="text"
                className="input-field"
                style={{ border: 'none', background: 'transparent', padding: 0 }}
                placeholder="Buscar por período o archivo..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>

            {isLoadingHistory ? (
              <div className="text-muted">Cargando cierres...</div>
            ) : (
              <div className="table-container" style={{ maxHeight: '60vh' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Periodo</th>
                      <th>Ventas</th>
                      <th>CxC</th>
                      <th style={{ textAlign: 'right' }}>Comisión total</th>
                      <th style={{ textAlign: 'right' }}>Vendedores</th>
                      <th style={{ textAlign: 'right' }}>Actualizado</th>
                      <th style={{ textAlign: 'center' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClosures.map((closure) => (
                      <tr key={`${closure.companyKey}-${closure.periodKey}`}>
                        <td>{closure.periodKey}</td>
                        <td>{closure.salesFileName || '-'}</td>
                        <td>{closure.receivablesFileName || '-'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatCLP(closure.summary.stats.totalCommissionCLP)}</td>
                        <td style={{ textAlign: 'right' }}>{closure.summary.stats.affectedSellers}</td>
                        <td style={{ textAlign: 'right' }}>{new Date(closure.updatedAt).toLocaleString('es-CL')}</td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.35rem' }}>
                            <button className="btn btn-primary" style={{ padding: '0.35rem 0.55rem' }} onClick={() => openSavedClosure(closure.periodKey)}>
                              Abrir
                            </button>
                            <button
                              className="btn"
                              style={{ padding: '0.35rem 0.55rem', background: '#1d4ed8', color: '#fff' }}
                              onClick={() => downloadSavedClosure(closure.periodKey)}
                            >
                              Excel
                            </button>
                            <button
                              className="btn"
                              style={{ padding: '0.35rem 0.55rem', background: 'rgba(239,68,68,0.12)', color: 'var(--error)' }}
                              onClick={() => deleteSavedClosure(closure.periodKey)}
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!filteredClosures.length && (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '1rem' }} className="text-muted">
                          No hay cierres guardados para el filtro aplicado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ marginTop: '0.85rem', display: 'flex', gap: '0.45rem', alignItems: 'center', color: '#9A5A00', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '10px', padding: '0.7rem' }}>
              <AlertTriangle size={15} />
              <span>Al abrir un cierre guardado se reemplaza la vista previa actual del módulo.</span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default CommissionClosureModule;
