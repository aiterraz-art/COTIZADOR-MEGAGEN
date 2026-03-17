import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertTriangle,
  Database,
  Download,
  Factory,
  RefreshCw,
  Upload,
} from 'lucide-react';
import type {
  CurrentStock,
  DatasetUploadMeta,
  InventorySettings,
  InventoryStatus,
  InventoryUploadMetadata,
  ProductRotation,
  ProductSupplier,
} from '../types/inventory';
import {
  fetchRotation90d,
  fetchSupplierMaster,
  fetchWeeklyStock,
  uploadRotation90d,
  uploadSupplierMaster,
  uploadWeeklyStock,
} from '../lib/inventorySupabase';
import {
  parseRotationFile,
  parseStockFile,
  parseSupplierMasterFile,
} from '../utils/inventoryParser';
import { buildInventoryCalculations } from '../utils/inventoryEngine';

const META_STORAGE_KEY = 'megagen.inventory.uploadMeta';
const SETTINGS_STORAGE_KEY = 'megagen.inventory.settings';
const FILTER_STORAGE_KEY = 'megagen.inventory.supplierFilter';

type InventoryInnerTab = 'dashboard' | 'history';

const statusColors: Record<InventoryStatus, string> = {
  CRITICAL: 'var(--error)',
  WARNING: 'var(--warning)',
  OK: 'var(--success)',
};

const defaultSettings: InventorySettings = {
  safetyDays: 15,
  coverageDays: 30,
};

const readStoredSettings = (): InventorySettings => {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw) as Partial<InventorySettings>;
    return {
      safetyDays: Number(parsed.safetyDays ?? defaultSettings.safetyDays),
      coverageDays: Number(parsed.coverageDays ?? defaultSettings.coverageDays),
    };
  } catch {
    return defaultSettings;
  }
};

const readStoredMetadata = (): InventoryUploadMetadata => {
  try {
    const raw = localStorage.getItem(META_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as InventoryUploadMetadata;
  } catch {
    return {};
  }
};

const InventoryModule: React.FC = () => {
  const supplierInputRef = useRef<HTMLInputElement>(null);
  const rotationInputRef = useRef<HTMLInputElement>(null);
  const stockInputRef = useRef<HTMLInputElement>(null);

  const [suppliers, setSuppliers] = useState<ProductSupplier[]>([]);
  const [rotations, setRotations] = useState<ProductRotation[]>([]);
  const [stocks, setStocks] = useState<CurrentStock[]>([]);
  const [settings, setSettings] = useState<InventorySettings>(() => readStoredSettings());
  const [selectedSupplier, setSelectedSupplier] = useState<string>(() => localStorage.getItem(FILTER_STORAGE_KEY) || 'Todos');
  const [statusFilter, setStatusFilter] = useState<InventoryStatus | 'ALL'>('ALL');
  const [activeTab, setActiveTab] = useState<InventoryInnerTab>('dashboard');
  const [uploadMeta, setUploadMeta] = useState<InventoryUploadMetadata>(() => readStoredMetadata());
  const [isLoading, setIsLoading] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(FILTER_STORAGE_KEY, selectedSupplier);
  }, [selectedSupplier]);

  useEffect(() => {
    localStorage.setItem(META_STORAGE_KEY, JSON.stringify(uploadMeta));
  }, [uploadMeta]);

  const loadAllDatasets = async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const [supplierData, rotationData, stockData] = await Promise.all([
        fetchSupplierMaster(),
        fetchRotation90d(),
        fetchWeeklyStock(),
      ]);
      setSuppliers(supplierData);
      setRotations(rotationData);
      setStocks(stockData);
    } catch (error) {
      setErrorMessage(`Error cargando datos de inventario: ${(error as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadAllDatasets();
  }, []);

  const updateDatasetMeta = (dataset: keyof InventoryUploadMetadata, meta: DatasetUploadMeta) => {
    setUploadMeta((prev) => ({ ...prev, [dataset]: meta }));
  };

  const handleSupplierUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setErrorMessage('');
    try {
      const result = await parseSupplierMasterFile(file);
      await uploadSupplierMaster(result.rows);
      updateDatasetMeta('suppliers', {
        fileName: file.name,
        updatedAt: new Date().toISOString(),
        totalRows: result.totalRows,
        validRows: result.validRows,
        discardedRows: result.discardedRows,
      });
      await loadAllDatasets();
    } catch (error) {
      setErrorMessage(`Error al cargar proveedores: ${(error as Error).message}`);
    } finally {
      event.target.value = '';
    }
  };

  const handleRotationUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setErrorMessage('');
    try {
      const result = await parseRotationFile(file);
      await uploadRotation90d(result.rows);
      updateDatasetMeta('rotation', {
        fileName: file.name,
        updatedAt: new Date().toISOString(),
        totalRows: result.totalRows,
        validRows: result.validRows,
        discardedRows: result.discardedRows,
      });
      await loadAllDatasets();
    } catch (error) {
      setErrorMessage(`Error al cargar rotación: ${(error as Error).message}`);
    } finally {
      event.target.value = '';
    }
  };

  const handleStockUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setErrorMessage('');
    try {
      const result = await parseStockFile(file);
      await uploadWeeklyStock(result.rows);
      updateDatasetMeta('stock', {
        fileName: file.name,
        updatedAt: new Date().toISOString(),
        totalRows: result.totalRows,
        validRows: result.validRows,
        discardedRows: result.discardedRows,
      });
      await loadAllDatasets();
    } catch (error) {
      setErrorMessage(`Error al cargar stock: ${(error as Error).message}`);
    } finally {
      event.target.value = '';
    }
  };

  const handleRecalculate = () => {
    setIsRecalculating(true);
    setTimeout(() => setIsRecalculating(false), 250);
  };

  const calculations = useMemo(() => {
    return buildInventoryCalculations(suppliers, rotations, stocks, settings);
  }, [suppliers, rotations, stocks, settings]);

  const suppliersList = useMemo(() => {
    const providerSet = new Set(calculations.map((item) => item.supplierName || 'SIN_PROVEEDOR'));
    return ['Todos', ...Array.from(providerSet).sort((a, b) => a.localeCompare(b, 'es'))];
  }, [calculations]);

  const filteredCalculations = useMemo(() => {
    return calculations.filter((item) => {
      const supplierMatch = selectedSupplier === 'Todos' || item.supplierName === selectedSupplier;
      const statusMatch = statusFilter === 'ALL' || item.status === statusFilter;
      return supplierMatch && statusMatch;
    });
  }, [calculations, selectedSupplier, statusFilter]);

  const statusCounts = useMemo(() => {
    return {
      CRITICAL: calculations.filter((item) => item.status === 'CRITICAL').length,
      WARNING: calculations.filter((item) => item.status === 'WARNING').length,
      OK: calculations.filter((item) => item.status === 'OK').length,
    };
  }, [calculations]);

  const isDatasetIncomplete = suppliers.length === 0 || rotations.length === 0 || stocks.length === 0;

  const exportPurchaseOrder = () => {
    if (selectedSupplier === 'Todos') {
      alert('Selecciona un proveedor específico para exportar su Orden de Compra.');
      return;
    }

    const rows = filteredCalculations
      .filter((item) => item.suggestedOrderQuantity > 0)
      .map((item) => ({
        SKU: item.sku,
        Nombre: item.name,
        'Cantidad Sugerida': Math.ceil(item.suggestedOrderQuantity),
      }));

    if (!rows.length) {
      alert('No hay cantidades sugeridas para exportar con el proveedor actual.');
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'PO');

    const datePart = new Date().toISOString().slice(0, 10);
    const providerSafe = selectedSupplier.replace(/[\\/:*?"<>|]/g, '_');
    XLSX.writeFile(workbook, `PO-${providerSafe}-${datePart}.xlsx`);
  };

  const downloadImporterTemplate = (dataset: 'suppliers' | 'rotation' | 'stock') => {
    let rows: Array<Record<string, string | number>> = [];
    let filename = '';

    if (dataset === 'suppliers') {
      rows = [
        { SKU: 'AR384507C', Nombre: 'XPEED AnyRidge Internal Fixture [AR]', Proveedor: 'MEGAGEN KOREA', 'Lead Time (dias)': 35 },
        { SKU: 'IF4008C', Nombre: 'AnyOne Internal Fixture [AO]', Proveedor: 'MEGAGEN KOREA', 'Lead Time (dias)': 35 },
      ];
      filename = 'importador-base-proveedores.xlsx';
    }

    if (dataset === 'rotation') {
      rows = [
        { SKU: 'AR384507C', 'Salidas 90 dias': 120 },
        { SKU: 'IF4008C', 'Salidas 90 dias': 60 },
      ];
      filename = 'importador-rotacion-90d.xlsx';
    }

    if (dataset === 'stock') {
      rows = [
        { SKU: 'AR384507C', Stock: 45, Fecha: '2026-03-06' },
        { SKU: 'IF4008C', Stock: 20, Fecha: '2026-03-06' },
      ];
      filename = 'importador-stock-semanal.xlsx';
    }

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Importador');
    XLSX.writeFile(workbook, filename);
  };

  const renderUploadMeta = (meta?: DatasetUploadMeta) => {
    if (!meta) return <span className="text-muted" style={{ fontSize: '0.74rem' }}>Sin cargas recientes</span>;

    return (
      <div className="text-muted" style={{ fontSize: '0.74rem' }}>
        <div>Archivo: {meta.fileName}</div>
        <div>Actualizado: {new Date(meta.updatedAt).toLocaleString('es-CL')}</div>
        <div>Filas: {meta.validRows}/{meta.totalRows} (descartadas: {meta.discardedRows})</div>
      </div>
    );
  };

  return (
    <section className="glass card" style={{ marginTop: '1rem', textAlign: 'left' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <h2 style={{ marginBottom: '0.25rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <Factory size={22} /> Control de Inventario y Pedidos
          </h2>
          <p className="text-muted" style={{ fontSize: '0.82rem' }}>
            Predicción de quiebres y cálculo automático de compra por proveedor.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn" style={{ background: activeTab === 'dashboard' ? 'var(--primary)' : 'var(--surface)', color: activeTab === 'dashboard' ? '#fff' : 'var(--text)' }} onClick={() => setActiveTab('dashboard')}>
            Dashboard
          </button>
          <button className="btn" style={{ background: activeTab === 'history' ? 'var(--primary)' : 'var(--surface)', color: activeTab === 'history' ? '#fff' : 'var(--text)' }} onClick={() => setActiveTab('history')}>
            Historial de cargas
          </button>
        </div>
      </div>

      {errorMessage && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '10px', padding: '0.7rem', color: 'var(--error)', marginBottom: '1rem' }}>
          {errorMessage}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(270px,1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
        <div className="finance-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <strong style={{ fontSize: '0.9rem' }}>Base Proveedores</strong>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <button className="btn" style={{ padding: '0.35rem 0.6rem' }} onClick={() => downloadImporterTemplate('suppliers')}>
                <Download size={14} />
              </button>
              <button className="btn btn-primary" style={{ padding: '0.35rem 0.6rem' }} onClick={() => supplierInputRef.current?.click()}>
                <Upload size={14} />
              </button>
            </div>
          </div>
          {renderUploadMeta(uploadMeta.suppliers)}
          <input ref={supplierInputRef} type="file" style={{ display: 'none' }} accept=".csv,.xlsx,.xls" onChange={handleSupplierUpload} />
        </div>

        <div className="finance-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <strong style={{ fontSize: '0.9rem' }}>Rotación 3 meses</strong>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <button className="btn" style={{ padding: '0.35rem 0.6rem' }} onClick={() => downloadImporterTemplate('rotation')}>
                <Download size={14} />
              </button>
              <button className="btn btn-primary" style={{ padding: '0.35rem 0.6rem' }} onClick={() => rotationInputRef.current?.click()}>
                <Upload size={14} />
              </button>
            </div>
          </div>
          {renderUploadMeta(uploadMeta.rotation)}
          <input ref={rotationInputRef} type="file" style={{ display: 'none' }} accept=".csv,.xlsx,.xls" onChange={handleRotationUpload} />
        </div>

        <div className="finance-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <strong style={{ fontSize: '0.9rem' }}>Stock semanal</strong>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <button className="btn" style={{ padding: '0.35rem 0.6rem' }} onClick={() => downloadImporterTemplate('stock')}>
                <Download size={14} />
              </button>
              <button className="btn btn-primary" style={{ padding: '0.35rem 0.6rem' }} onClick={() => stockInputRef.current?.click()}>
                <Upload size={14} />
              </button>
            </div>
          </div>
          {renderUploadMeta(uploadMeta.stock)}
          <input ref={stockInputRef} type="file" style={{ display: 'none' }} accept=".csv,.xlsx,.xls" onChange={handleStockUpload} />
        </div>
      </div>

      {activeTab === 'history' ? (
        <div style={{ display: 'grid', gap: '0.8rem' }}>
          {(['suppliers', 'rotation', 'stock'] as const).map((key) => (
            <div key={key} className="finance-card" style={{ padding: '0.8rem' }}>
              <strong style={{ display: 'block', marginBottom: '0.4rem' }}>
                {key === 'suppliers' ? 'Base Proveedores' : key === 'rotation' ? 'Rotación 3 meses' : 'Stock semanal'}
              </strong>
              {renderUploadMeta(uploadMeta[key])}
            </div>
          ))}
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
            <label className="finance-card" style={{ display: 'block' }}>
              <div className="text-muted" style={{ fontSize: '0.72rem', marginBottom: '0.35rem' }}>Días de seguridad</div>
              <input
                type="number"
                className="input-field"
                value={settings.safetyDays}
                onChange={(e) => setSettings((prev) => ({ ...prev, safetyDays: Math.max(0, Number(e.target.value) || 0) }))}
              />
            </label>

            <label className="finance-card" style={{ display: 'block' }}>
              <div className="text-muted" style={{ fontSize: '0.72rem', marginBottom: '0.35rem' }}>Cobertura para pedido (días)</div>
              <input
                type="number"
                className="input-field"
                value={settings.coverageDays}
                onChange={(e) => setSettings((prev) => ({ ...prev, coverageDays: Math.max(0, Number(e.target.value) || 0) }))}
              />
            </label>

            <label className="finance-card" style={{ display: 'block' }}>
              <div className="text-muted" style={{ fontSize: '0.72rem', marginBottom: '0.35rem' }}>Proveedor</div>
              <select className="input-field" value={selectedSupplier} onChange={(e) => setSelectedSupplier(e.target.value)}>
                {suppliersList.map((provider) => (
                  <option key={provider} value={provider}>{provider}</option>
                ))}
              </select>
            </label>

            <div className="finance-card" style={{ display: 'flex', alignItems: 'end', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={handleRecalculate} disabled={isRecalculating || isLoading}>
                <RefreshCw size={14} className={isRecalculating ? 'animate-spin' : ''} /> Recalcular
              </button>
              <button className="btn" style={{ background: 'var(--accent)', color: '#fff' }} onClick={exportPurchaseOrder}>
                <Download size={14} /> Descargar Orden Compra
              </button>
            </div>
          </div>

          {isDatasetIncomplete && (
            <div style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: '10px', padding: '0.7rem', marginBottom: '0.8rem' }}>
              <strong style={{ color: 'var(--warning)' }}>Estado incompleto:</strong>
              <span className="text-muted" style={{ marginLeft: '0.4rem' }}>
                Carga los 3 archivos (proveedores, rotación, stock) para activar cálculo completo.
              </span>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '0.7rem', marginBottom: '0.9rem' }}>
            {(['CRITICAL', 'WARNING', 'OK'] as const).map((status) => (
              <button
                key={status}
                className="finance-card"
                onClick={() => setStatusFilter((prev) => (prev === status ? 'ALL' : status))}
                style={{
                  textAlign: 'left',
                  border: statusFilter === status ? `2px solid ${statusColors[status]}` : '1px solid var(--border)',
                  cursor: 'pointer',
                }}
              >
                <div className="text-muted" style={{ fontSize: '0.68rem' }}>{status}</div>
                <div style={{ fontSize: '1.45rem', fontWeight: 800, color: statusColors[status] }}>{statusCounts[status]}</div>
              </button>
            ))}

            <button
              className="finance-card"
              onClick={() => setStatusFilter('ALL')}
              style={{ textAlign: 'left', cursor: 'pointer', border: statusFilter === 'ALL' ? '2px solid var(--primary)' : '1px solid var(--border)' }}
            >
              <div className="text-muted" style={{ fontSize: '0.68rem' }}>TODOS</div>
              <div style={{ fontSize: '1.45rem', fontWeight: 800 }}>{calculations.length}</div>
            </button>
          </div>

          <div className="table-container" style={{ maxHeight: '65vh' }}>
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Producto</th>
                  <th>Proveedor</th>
                  <th style={{ textAlign: 'right' }}>Lead Time</th>
                  <th style={{ textAlign: 'right' }}>Stock</th>
                  <th style={{ textAlign: 'right' }}>Salidas 90d</th>
                  <th style={{ textAlign: 'right' }}>ADU</th>
                  <th style={{ textAlign: 'right' }}>Safety Stock</th>
                  <th style={{ textAlign: 'right' }}>ROP</th>
                  <th style={{ textAlign: 'right' }}>Pedido Sugerido</th>
                  <th style={{ textAlign: 'center' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filteredCalculations.map((item) => (
                  <tr key={item.sku}>
                    <td>{item.sku}</td>
                    <td>{item.name}</td>
                    <td>{item.supplierName}</td>
                    <td style={{ textAlign: 'right' }}>{item.leadTimeDays.toFixed(0)}</td>
                    <td style={{ textAlign: 'right' }}>{item.currentStock.toFixed(2)}</td>
                    <td style={{ textAlign: 'right' }}>{item.totalExits90Days.toFixed(2)}</td>
                    <td style={{ textAlign: 'right' }}>{item.averageDailyUsage.toFixed(2)}</td>
                    <td style={{ textAlign: 'right' }}>{item.safetyStock.toFixed(2)}</td>
                    <td style={{ textAlign: 'right' }}>{item.reorderPoint.toFixed(2)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{Math.ceil(item.suggestedOrderQuantity)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          color: '#fff',
                          background: statusColors[item.status],
                          borderRadius: '999px',
                          padding: '0.18rem 0.5rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                        }}
                      >
                        {item.status === 'CRITICAL' ? <AlertTriangle size={12} /> : <Database size={12} />}
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}

                {filteredCalculations.length === 0 && (
                  <tr>
                    <td colSpan={11} style={{ textAlign: 'center', padding: '1.25rem' }} className="text-muted">
                      No hay resultados para los filtros aplicados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
};

export default InventoryModule;
