import React, { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, FileSpreadsheet, Filter, RefreshCw, Search, Users } from 'lucide-react';
import { parseCRMPeriodFile, parseWeeklySalesFile } from '../utils/crmParser';
import { buildClientAggregates, buildSalesRepSummary, mergeClientAggregates } from '../utils/crmEngine';
import { parseCrmMasterWorkbookFile } from '../utils/crmMasterWorkbookParser';
import { updateCrmMasterWorkbook } from '../utils/crmMasterWorkbookEngine';
import { MONTH_NAMES_ES } from '../utils/crmWorkbookAliases';
import type { CRMClientAggregate, CRMParseResult, CRMPeriodRow } from '../types/crm';
import type { CrmWorkbookMutationSummary, WeeklySalesBatch } from '../types/crmWorkbook';

const STORAGE_KEY = 'megagen.crm.singleFileData';

interface PersistedCRMData {
  sourceFileName: string;
  parseResult: CRMParseResult;
  rows: CRMPeriodRow[];
  clientsHistory?: CRMClientAggregate[];
  importedAt: string;
}

interface MasterWorkbookPreview {
  sourceFileName: string;
  availableMonths: number[];
  crmClientCount: number;
  sellerAssignmentCount: number;
}

type WorkflowTab = 'auto' | 'master';

const readStored = (): PersistedCRMData | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedCRMData;
  } catch {
    return null;
  }
};

const monthNames = [...MONTH_NAMES_ES];

const formatCLP = (value: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value);

const summaryCardStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))',
  gap: '0.75rem',
  marginBottom: '0.9rem',
};

const detailTableContainerStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: '12px',
  background: '#fff',
  overflow: 'hidden',
};

const StatCard = ({ label, value, tone }: { label: string; value: string | number; tone?: string }) => (
  <div className="finance-card">
    <div className="text-muted" style={{ fontSize: '0.68rem' }}>{label}</div>
    <div style={{ fontWeight: 800, fontSize: '1.2rem', color: tone }}>{value}</div>
  </div>
);

const WarningBox = ({ messages }: { messages: string[] }) => {
  if (!messages.length) return null;
  return (
    <div style={{ marginBottom: '0.8rem', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.35)', borderRadius: '12px', padding: '0.8rem', color: '#9A5A00' }}>
      <div style={{ fontWeight: 700, marginBottom: '0.35rem' }}>Advertencias</div>
      <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
        {messages.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
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
  <div style={{ marginTop: '0.9rem' }}>
    <div style={{ fontWeight: 700, marginBottom: '0.45rem' }}>{title}</div>
    <div className="table-container" style={{ maxHeight: '280px', ...detailTableContainerStyle }}>
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

const CRMModule: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const masterWorkbookInputRef = useRef<HTMLInputElement>(null);
  const weeklySalesInputRef = useRef<HTMLInputElement>(null);
  const persisted = useMemo(() => readStored(), []);
  const initialClientHistory = useMemo(() => {
    if (persisted?.clientsHistory?.length) {
      return persisted.clientsHistory;
    }
    if (persisted?.rows?.length) {
      return buildClientAggregates(persisted.rows);
    }
    return [];
  }, [persisted]);

  const [workflowTab, setWorkflowTab] = useState<WorkflowTab>('auto');
  const [rows, setRows] = useState<CRMPeriodRow[]>(persisted?.rows ?? []);
  const [parseResult, setParseResult] = useState<CRMParseResult | null>(persisted?.parseResult ?? null);
  const [sourceFileName, setSourceFileName] = useState<string>(persisted?.sourceFileName ?? '');
  const [clientHistory, setClientHistory] = useState<CRMClientAggregate[]>(initialClientHistory);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [search, setSearch] = useState('');
  const [repFilter, setRepFilter] = useState('Todos');

  const [masterWorkbookFile, setMasterWorkbookFile] = useState<File | null>(null);
  const [masterWorkbookPreview, setMasterWorkbookPreview] = useState<MasterWorkbookPreview | null>(null);
  const [weeklySalesFileName, setWeeklySalesFileName] = useState('');
  const [weeklyBatch, setWeeklyBatch] = useState<WeeklySalesBatch | null>(null);
  const [masterErrorMessage, setMasterErrorMessage] = useState('');
  const [isMasterLoading, setIsMasterLoading] = useState(false);
  const [isWeeklyLoading, setIsWeeklyLoading] = useState(false);
  const [isProcessingWorkbook, setIsProcessingWorkbook] = useState(false);
  const [processedWorkbookSummary, setProcessedWorkbookSummary] = useState<CrmWorkbookMutationSummary | null>(null);
  const [processedWorkbook, setProcessedWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [processedWorkbookName, setProcessedWorkbookName] = useState('');

  const clients = useMemo(() => clientHistory, [clientHistory]);
  const salesRepSummary = useMemo(() => buildSalesRepSummary(clients), [clients]);

  const reps = useMemo(
    () => ['Todos', ...Array.from(new Set(clients.map((item) => item.salesRep))).sort((a, b) => a.localeCompare(b, 'es'))],
    [clients],
  );

  const filteredClients = useMemo(() => {
    const q = search.toLowerCase().trim();
    return clients.filter((client) => {
      const byRep = repFilter === 'Todos' || client.salesRep === repFilter;
      const byQuery = !q || `${client.clientCode} ${client.clientName}`.toLowerCase().includes(q);
      return byRep && byQuery;
    });
  }, [clients, repFilter, search]);

  const activeCount = filteredClients.filter((client) => client.status === 'Active').length;
  const inactiveCount = filteredClients.filter((client) => client.status === 'Inactive').length;
  const totalSales = filteredClients.reduce((acc, client) => acc + client.totalNetSales, 0);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setErrorMessage('');
    try {
      const result = await parseCRMPeriodFile(file);
      const batchClients = buildClientAggregates(result.rows);
      const mergedClients = mergeClientAggregates(clientHistory, batchClients);
      setRows(result.rows);
      setParseResult(result);
      setSourceFileName(file.name);
      setClientHistory(mergedClients);
      const payload: PersistedCRMData = {
        sourceFileName: file.name,
        parseResult: result,
        rows: result.rows,
        clientsHistory: mergedClients,
        importedAt: new Date().toISOString(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsLoading(false);
      event.target.value = '';
    }
  };

  const clearAutoData = () => {
    setRows([]);
    setParseResult(null);
    setSourceFileName('');
    setClientHistory([]);
    setSearch('');
    setRepFilter('Todos');
    localStorage.removeItem(STORAGE_KEY);
  };

  const exportCRMWorkbook = () => {
    if (!rows.length) {
      alert('Primero sube un archivo de ventas.');
      return;
    }

    const periodRows = rows.map((row) => ({
      'Nombre Doc': row.documentName,
      'Numero Documento': row.documentNumber,
      'Nombre Vendedor': row.salesRep,
      'Codigo Cliente': row.clientCode,
      'Nombre Cliente': row.clientName,
      Fecha: row.saleDate,
      'Cod Producto': row.productCode,
      'Desc Producto': row.productDescription,
      Cantidad: row.quantity,
      'Precio Unitario': row.unitPrice,
      'Total Detalle': row.totalDetail,
      'Costo Vigente': row.currentCost,
    }));

    const crmRows = clients.map((client, index) => {
      const monthData: Record<string, number> = {};
      for (let month = 1; month <= 12; month += 1) {
        monthData[monthNames[month - 1]] = client.monthlySales[month] ?? 0;
      }

      return {
        'No.': index + 1,
        'Sales Rep': client.salesRep,
        RUT: client.clientCode,
        'Customer Name': client.clientName,
        '26Y Purchase Amount (Accum)': client.totalNetSales,
        'Recent Sold Date': client.recentSoldDate,
        Status: client.status,
        Facturas: client.invoiceCount,
        Transacciones: client.transactionCount,
        ...monthData,
      };
    });

    const summaryRows = salesRepSummary.map((rep) => ({
      Vendedor: rep.salesRep,
      Clientes: rep.customerCount,
      Activos: rep.activeCount,
      Inactivos: rep.inactiveCount,
      'Venta Neta Acum': rep.totalSales,
    }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(periodRows), 'Periodo');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(crmRows), 'CRM_Auto');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), 'Resumen_Vendedor');

    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `CRM-AUTO-${stamp}.xlsx`);
  };

  const clearMasterWorkflow = () => {
    setMasterWorkbookFile(null);
    setMasterWorkbookPreview(null);
    setWeeklySalesFileName('');
    setWeeklyBatch(null);
    setMasterErrorMessage('');
    setProcessedWorkbookSummary(null);
    setProcessedWorkbook(null);
    setProcessedWorkbookName('');
  };

  const handleMasterWorkbookUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsMasterLoading(true);
    setMasterErrorMessage('');
    setProcessedWorkbookSummary(null);
    setProcessedWorkbook(null);
    setProcessedWorkbookName('');
    try {
      const model = await parseCrmMasterWorkbookFile(file);
      setMasterWorkbookFile(file);
      setMasterWorkbookPreview({
        sourceFileName: file.name,
        availableMonths: Array.from(model.monthlySheets.keys()).sort((a, b) => a - b),
        crmClientCount: model.crmRowsByRut.size,
        sellerAssignmentCount: model.salesRepAssignmentsByRut.size,
      });
    } catch (error) {
      setMasterWorkbookFile(null);
      setMasterWorkbookPreview(null);
      setMasterErrorMessage((error as Error).message);
    } finally {
      setIsMasterLoading(false);
      event.target.value = '';
    }
  };

  const handleWeeklySalesUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsWeeklyLoading(true);
    setMasterErrorMessage('');
    setProcessedWorkbookSummary(null);
    setProcessedWorkbook(null);
    setProcessedWorkbookName('');
    try {
      const batch = await parseWeeklySalesFile(file);
      setWeeklyBatch(batch);
      setWeeklySalesFileName(file.name);
    } catch (error) {
      setWeeklyBatch(null);
      setWeeklySalesFileName('');
      setMasterErrorMessage((error as Error).message);
    } finally {
      setIsWeeklyLoading(false);
      event.target.value = '';
    }
  };

  const processMasterWorkbook = async () => {
    if (!masterWorkbookFile || !weeklyBatch) {
      setMasterErrorMessage('Debes cargar el workbook maestro y el archivo semanal antes de procesar.');
      return;
    }

    setIsProcessingWorkbook(true);
    setMasterErrorMessage('');
    try {
      const model = await parseCrmMasterWorkbookFile(masterWorkbookFile);
      const result = updateCrmMasterWorkbook(model, weeklyBatch);
      setProcessedWorkbook(result.workbook);
      setProcessedWorkbookName(result.downloadFileName);
      setProcessedWorkbookSummary(result.summary);
    } catch (error) {
      setMasterErrorMessage((error as Error).message);
    } finally {
      setIsProcessingWorkbook(false);
    }
  };

  const downloadProcessedWorkbook = () => {
    if (!processedWorkbook || !processedWorkbookName) {
      alert('Primero procesa el workbook maestro.');
      return;
    }
    XLSX.writeFile(processedWorkbook, processedWorkbookName, { bookType: 'xlsx', cellStyles: true });
  };

  const renderAutoWorkflow = () => (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users size={22} /> CRM Comercial (Automático)
          </h2>
          <p className="text-muted" style={{ fontSize: '0.83rem' }}>
            Sube un archivo de ventas del periodo y se calculan automáticamente clientes, vendedor, montos y última compra.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>
            <FileSpreadsheet size={14} /> {isLoading ? 'Procesando...' : 'Cargar Archivo Periodo'}
          </button>
          <button className="btn" style={{ background: 'var(--accent)', color: '#fff' }} onClick={exportCRMWorkbook}>
            <Download size={14} /> Exportar CRM Auto
          </button>
          <button className="btn" style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--error)' }} onClick={clearAutoData}>
            Limpiar
          </button>
          <input ref={fileInputRef} type="file" style={{ display: 'none' }} accept=".xlsx,.xls,.csv" onChange={handleUpload} />
        </div>
      </div>

      {errorMessage && (
        <div style={{ marginBottom: '0.8rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '0.65rem', color: 'var(--error)' }}>
          {errorMessage}
        </div>
      )}

      {parseResult ? (
        <div style={{ marginBottom: '0.8rem' }} className="text-muted">
          Archivo: <strong>{sourceFileName}</strong> | Filas válidas: {parseResult.validRows}/{parseResult.totalRows} | Descartadas: {parseResult.discardedRows} | Periodo: {parseResult.periodFrom || '-'} a {parseResult.periodTo || '-'} | Clientes históricos: {clients.length}
        </div>
      ) : (
        <div style={{ marginBottom: '0.8rem' }} className="text-muted">No hay archivo cargado.</div>
      )}

      <div style={summaryCardStyle}>
        <StatCard label="Clientes" value={filteredClients.length} />
        <StatCard label="Activos" value={activeCount} tone="var(--success)" />
        <StatCard label="Inactivos" value={inactiveCount} tone="var(--warning)" />
        <StatCard label="Venta Neta Acum." value={formatCLP(totalSales)} />
      </div>

      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.8rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.4rem 0.6rem', background: '#fff' }}>
          <Search size={14} className="text-muted" />
          <input
            type="text"
            className="input-field"
            style={{ border: 'none', background: 'transparent', padding: 0, minWidth: '180px' }}
            placeholder="Buscar cliente o RUT"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.4rem 0.6rem', background: '#fff' }}>
          <Filter size={14} className="text-muted" />
          <select className="input-field" style={{ border: 'none', background: 'transparent', padding: 0 }} value={repFilter} onChange={(event) => setRepFilter(event.target.value)}>
            {reps.map((rep) => <option key={rep} value={rep}>{rep}</option>)}
          </select>
        </div>
        <button className="btn" onClick={() => { setSearch(''); setRepFilter('Todos'); }}>
          <RefreshCw size={14} /> Reset Filtros
        </button>
      </div>

      <div className="table-container" style={{ maxHeight: '62vh' }}>
        <table>
          <thead>
            <tr>
              <th>RUT</th>
              <th>Cliente</th>
              <th>Vendedor</th>
              <th style={{ textAlign: 'right' }}>Venta Neta Acum.</th>
              <th style={{ textAlign: 'right' }}>Facturas</th>
              <th style={{ textAlign: 'right' }}>Última Compra</th>
              <th style={{ textAlign: 'center' }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {filteredClients.map((client) => (
              <tr key={client.clientCode}>
                <td>{client.clientCode}</td>
                <td>{client.clientName}</td>
                <td>{client.salesRep}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatCLP(client.totalNetSales)}</td>
                <td style={{ textAlign: 'right' }}>{client.invoiceCount}</td>
                <td style={{ textAlign: 'right' }}>{client.recentSoldDate}</td>
                <td style={{ textAlign: 'center' }}>
                  <span className="badge" style={{ background: client.status === 'Active' ? 'var(--success)' : 'var(--warning)' }}>
                    {client.status}
                  </span>
                </td>
              </tr>
            ))}
            {filteredClients.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '1.2rem' }} className="text-muted">
                  No hay clientes para los filtros aplicados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );

  const renderMasterWorkflow = () => (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileSpreadsheet size={22} /> CRM Chile Maestro
          </h2>
          <p className="text-muted" style={{ fontSize: '0.83rem' }}>
            Carga el workbook maestro y las ventas semanales para devolver un Excel actualizado con hojas, fórmulas y asignación de vendedor vigentes.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => masterWorkbookInputRef.current?.click()}>
            <FileSpreadsheet size={14} /> {isMasterLoading ? 'Validando workbook...' : 'Cargar Workbook Maestro'}
          </button>
          <button className="btn" style={{ background: 'var(--accent)', color: '#fff' }} onClick={() => weeklySalesInputRef.current?.click()}>
            <FileSpreadsheet size={14} /> {isWeeklyLoading ? 'Leyendo ventas...' : 'Cargar Ventas Semanales'}
          </button>
          <button className="btn" style={{ background: '#0f4c81', color: '#fff' }} onClick={processMasterWorkbook}>
            <RefreshCw size={14} /> {isProcessingWorkbook ? 'Procesando workbook...' : 'Procesar Workbook Maestro'}
          </button>
          <button className="btn" style={{ background: 'rgba(15,76,129,0.12)', color: '#0f4c81' }} onClick={downloadProcessedWorkbook}>
            <Download size={14} /> Descargar Workbook Actualizado
          </button>
          <button className="btn" style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--error)' }} onClick={clearMasterWorkflow}>
            Limpiar
          </button>
          <input ref={masterWorkbookInputRef} type="file" style={{ display: 'none' }} accept=".xlsx,.xls" onChange={handleMasterWorkbookUpload} />
          <input ref={weeklySalesInputRef} type="file" style={{ display: 'none' }} accept=".xlsx,.xls,.csv" onChange={handleWeeklySalesUpload} />
        </div>
      </div>

      {masterErrorMessage && (
        <div style={{ marginBottom: '0.8rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '0.65rem', color: 'var(--error)' }}>
          {masterErrorMessage}
        </div>
      )}

      <div className="text-muted" style={{ marginBottom: '0.8rem' }}>
        Workbook maestro: <strong>{masterWorkbookPreview?.sourceFileName || 'No cargado'}</strong>
        {' '}| Ventas semanales: <strong>{weeklySalesFileName || 'No cargado'}</strong>
        {' '}| Archivo listo: <strong>{processedWorkbookName || 'Pendiente'}</strong>
      </div>

      <div style={summaryCardStyle}>
        <StatCard
          label="Meses detectados"
          value={masterWorkbookPreview?.availableMonths.map((month) => monthNames[month - 1]).join(', ') || '-'}
        />
        <StatCard label="Clientes CRM" value={masterWorkbookPreview?.crmClientCount ?? 0} />
        <StatCard label="RUTs con vendedor" value={masterWorkbookPreview?.sellerAssignmentCount ?? 0} />
        <StatCard
          label="Filas semanales válidas"
          value={weeklyBatch ? `${weeklyBatch.validRows}/${weeklyBatch.totalRows}` : '0/0'}
          tone={weeklyBatch?.validRows ? 'var(--success)' : undefined}
        />
      </div>

      {weeklyBatch && (
        <div style={{ marginBottom: '0.8rem' }} className="text-muted">
          Periodo semanal detectado: <strong>{weeklyBatch.periodFrom || '-'}</strong> a <strong>{weeklyBatch.periodTo || '-'}</strong> | Descartadas: {weeklyBatch.discardedRows}
        </div>
      )}

      <WarningBox messages={[...(weeklyBatch?.warnings ?? []), ...(processedWorkbookSummary?.warnings ?? [])]} />

      {processedWorkbookSummary ? (
        <>
          <div style={summaryCardStyle}>
            <StatCard label="Filas mensuales actualizadas" value={processedWorkbookSummary.updatedMonthlyRows} />
            <StatCard label="Filas mensuales nuevas" value={processedWorkbookSummary.insertedMonthlyRows} />
            <StatCard label="Clientes CRM actualizados" value={processedWorkbookSummary.updatedCrmRows} />
            <StatCard label="Clientes CRM nuevos" value={processedWorkbookSummary.insertedCrmRows} />
            <StatCard label="Asignaciones vendedor nuevas" value={processedWorkbookSummary.insertedSellerAssignments} />
            <StatCard label="Filas 26Y Sales" value={processedWorkbookSummary.rebuiltAnnualRows} />
          </div>

          <div style={{ marginBottom: '0.8rem' }} className="text-muted">
            Meses afectados: <strong>{processedWorkbookSummary.affectedMonths.map((month) => monthNames[month - 1]).join(', ') || '-'}</strong>
            {' '}| Hojas creadas: <strong>{processedWorkbookSummary.createdMonthlySheets.join(', ') || 'Ninguna'}</strong>
          </div>

          <DetailTable
            title="Clientes con fila mensual nueva"
            columns={['RUT', 'Razón Social', 'Vendedor', 'Mes', 'Delta']}
            rows={processedWorkbookSummary.newClients.map((client) => [
              client.clientRut,
              client.clientName,
              client.salesRep,
              monthNames[client.month - 1],
              formatCLP(client.netAmountDelta),
            ])}
            emptyLabel="No hubo clientes nuevos en las hojas mensuales."
          />

          <DetailTable
            title="Clientes actualizados"
            columns={['RUT', 'Razón Social', 'Vendedor', 'Mes', 'Delta']}
            rows={processedWorkbookSummary.updatedClients.map((client) => [
              client.clientRut,
              client.clientName,
              client.salesRep,
              monthNames[client.month - 1],
              formatCLP(client.netAmountDelta),
            ])}
            emptyLabel="No hubo filas mensuales existentes actualizadas."
          />

          <DetailTable
            title="Cambios de vendedor aplicados"
            columns={['RUT', 'Vendedor anterior', 'Vendedor vigente']}
            rows={processedWorkbookSummary.sellerChanges.map((change) => [
              change.clientRut,
              change.previousSalesRep,
              change.nextSalesRep,
            ])}
            emptyLabel="No hubo conflictos de vendedor en esta carga."
          />
        </>
      ) : (
        <div style={{ ...detailTableContainerStyle, padding: '1rem' }} className="text-muted">
          Carga ambos archivos y procesa el workbook para ver la vista previa de cambios antes de descargar.
        </div>
      )}
    </>
  );

  return (
    <section className="glass card" style={{ marginTop: '1rem', textAlign: 'left' }}>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <button
          className="btn"
          style={{ background: workflowTab === 'auto' ? 'var(--primary)' : 'rgba(15,76,129,0.08)', color: workflowTab === 'auto' ? '#fff' : '#0f4c81' }}
          onClick={() => setWorkflowTab('auto')}
        >
          CRM Automático
        </button>
        <button
          className="btn"
          style={{ background: workflowTab === 'master' ? 'var(--primary)' : 'rgba(15,76,129,0.08)', color: workflowTab === 'master' ? '#fff' : '#0f4c81' }}
          onClick={() => setWorkflowTab('master')}
        >
          CRM Chile Maestro
        </button>
      </div>

      {workflowTab === 'auto' ? renderAutoWorkflow() : renderMasterWorkflow()}
    </section>
  );
};

export default CRMModule;
