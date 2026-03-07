import React, { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, FileSpreadsheet, Filter, RefreshCw, Search, Users } from 'lucide-react';
import { parseCRMPeriodFile } from '../utils/crmParser';
import { buildClientAggregates, buildSalesRepSummary, mergeClientAggregates } from '../utils/crmEngine';
import type { CRMClientAggregate, CRMParseResult, CRMPeriodRow } from '../types/crm';

const STORAGE_KEY = 'megagen.crm.singleFileData';

interface PersistedCRMData {
  sourceFileName: string;
  parseResult: CRMParseResult;
  rows: CRMPeriodRow[];
  clientsHistory?: CRMClientAggregate[];
  importedAt: string;
}

const readStored = (): PersistedCRMData | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedCRMData;
  } catch {
    return null;
  }
};

const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const formatCLP = (value: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value);

const CRMModule: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const [rows, setRows] = useState<CRMPeriodRow[]>(persisted?.rows ?? []);
  const [parseResult, setParseResult] = useState<CRMParseResult | null>(persisted?.parseResult ?? null);
  const [sourceFileName, setSourceFileName] = useState<string>(persisted?.sourceFileName ?? '');
  const [clientHistory, setClientHistory] = useState<CRMClientAggregate[]>(initialClientHistory);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [search, setSearch] = useState('');
  const [repFilter, setRepFilter] = useState('Todos');

  const clients = useMemo(() => clientHistory, [clientHistory]);
  const salesRepSummary = useMemo(() => buildSalesRepSummary(clients), [clients]);

  const reps = useMemo(() => ['Todos', ...Array.from(new Set(clients.map((item) => item.salesRep))).sort((a, b) => a.localeCompare(b, 'es'))], [clients]);

  const filteredClients = useMemo(() => {
    const q = search.toLowerCase().trim();
    return clients.filter((client) => {
      const byRep = repFilter === 'Todos' || client.salesRep === repFilter;
      const byQuery = !q || `${client.clientCode} ${client.clientName}`.toLowerCase().includes(q);
      return byRep && byQuery;
    });
  }, [clients, repFilter, search]);

  const activeCount = filteredClients.filter((c) => c.status === 'Active').length;
  const inactiveCount = filteredClients.filter((c) => c.status === 'Inactive').length;
  const totalSales = filteredClients.reduce((acc, c) => acc + c.totalNetSales, 0);

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

  const clearData = () => {
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

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(periodRows), 'Periodo');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(crmRows), 'CRM_Auto');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Resumen_Vendedor');

    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `CRM-AUTO-${stamp}.xlsx`);
  };

  return (
    <section className="glass card" style={{ marginTop: '1rem', textAlign: 'left' }}>
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
          <button className="btn" style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--error)' }} onClick={clearData}>
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '0.75rem', marginBottom: '0.9rem' }}>
        <div className="finance-card"><div className="text-muted" style={{ fontSize: '0.68rem' }}>Clientes</div><div style={{ fontWeight: 800, fontSize: '1.2rem' }}>{filteredClients.length}</div></div>
        <div className="finance-card"><div className="text-muted" style={{ fontSize: '0.68rem' }}>Activos</div><div style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--success)' }}>{activeCount}</div></div>
        <div className="finance-card"><div className="text-muted" style={{ fontSize: '0.68rem' }}>Inactivos</div><div style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--warning)' }}>{inactiveCount}</div></div>
        <div className="finance-card"><div className="text-muted" style={{ fontSize: '0.68rem' }}>Venta Neta Acum.</div><div style={{ fontWeight: 800, fontSize: '1.2rem' }}>{formatCLP(totalSales)}</div></div>
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
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.4rem 0.6rem', background: '#fff' }}>
          <Filter size={14} className="text-muted" />
          <select className="input-field" style={{ border: 'none', background: 'transparent', padding: 0 }} value={repFilter} onChange={(e) => setRepFilter(e.target.value)}>
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
    </section>
  );
};

export default CRMModule;
