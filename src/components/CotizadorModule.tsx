import React from 'react';
import type { Product } from '../data/mockProducts';
import type { SavedSimulationRecord } from '../lib/appDataRepository';
import type { QuoteCalculationResult, QuotePricingConfig } from '../types/quotation';
import type { LinePricingMode } from '../types/quotation';
import {
  Calculator,
  CloudUpload,
  Copy,
  Database,
  DollarSign,
  FolderPlus,
  History,
  Image as ImageIcon,
  Percent,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Upload,
  X,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';

const DEFAULT_QUOTE_MARGIN_PERCENT = 50;

const LINE_PRICING_MODE_OPTIONS: Array<{ value: LinePricingMode; label: string }> = [
  { value: 'inherit', label: 'Heredar global' },
  { value: 'fixed_net_unit', label: 'Precio neto unit.' },
  { value: 'fixed_net_total', label: 'Precio neto total' },
  { value: 'fixed_profit_unit', label: 'Utilidad unit. CLP' },
  { value: 'fixed_profit_total', label: 'Utilidad total CLP' },
  { value: 'fixed_margin_percent', label: 'Margen fijo %' },
  { value: 'at_cost', label: 'Al costo' },
  { value: 'manual_net_unit', label: 'Manual unit.' },
];

const QUOTE_MODE_OPTIONS: Array<{ value: QuotePricingConfig['mode']; label: string }> = [
  { value: 'global_margin', label: 'Margen global' },
  { value: 'global_net', label: 'Neto global' },
  { value: 'at_cost', label: 'Venta al costo' },
  { value: 'manual_lines', label: 'Manual por producto' },
];

const getQuoteModeLabel = (mode?: string) => {
  if (!mode || mode === 'legacy_global_net') return 'Cotizacion clasica';
  return QUOTE_MODE_OPTIONS.find((option) => option.value === mode)?.label || 'Cotizacion flexible';
};

const getQuoteTypeLabel = (mode?: string) => {
  return !mode || mode === 'legacy_global_net' ? 'Cotizacion clasica' : 'Cotizacion flexible';
};

const getQuoteStatus = (warnings?: string[]) => {
  if (!warnings || warnings.length === 0) {
    return {
      label: 'Valida',
      color: '#86efac',
      background: 'rgba(34, 197, 94, 0.15)',
    };
  }

  return {
    label: warnings.length > 1 ? 'Inconsistente' : 'Con advertencias',
    color: '#fca5a5',
    background: 'rgba(239, 68, 68, 0.15)',
  };
};

interface CotizadorModuleProps {
  activeTab: 'simulator' | 'history';
  setActiveTab: React.Dispatch<React.SetStateAction<'simulator' | 'history'>>;
  logoMegaGen: string;
  backendLabel: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  syncProductsToDatabase: () => Promise<void>;
  isSyncing: boolean;
  products: Product[];
  isLoading: boolean;
  searchTerm: string;
  setSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  selectedCategory: string;
  setSelectedCategory: React.Dispatch<React.SetStateAction<string>>;
  categories: string[];
  createNewList: () => void;
  showCreateProductModal: boolean;
  setShowCreateProductModal: React.Dispatch<React.SetStateAction<boolean>>;
  newProductName: string;
  setNewProductName: React.Dispatch<React.SetStateAction<string>>;
  newProductCost: string;
  setNewProductCost: React.Dispatch<React.SetStateAction<string>>;
  createUniqueProduct: () => Promise<void>;
  showMoveProductModal: boolean;
  productToMove: Product | null;
  targetMoveCategory: string;
  setTargetMoveCategory: React.Dispatch<React.SetStateAction<string>>;
  moveTargetCategories: string[];
  setShowMoveProductModal: React.Dispatch<React.SetStateAction<boolean>>;
  setProductToMove: React.Dispatch<React.SetStateAction<Product | null>>;
  confirmMoveProduct: () => void;
  filteredProducts: Product[];
  moveProductToList: (product: Product) => void;
  removeProductFromList: (product: Product) => Promise<void>;
  deleteProduct: (product: Product) => Promise<void>;
  addItem: (product: Product) => void;
  clearDeal: () => void;
  saveSimulation: () => Promise<void>;
  quotePricingConfig: QuotePricingConfig;
  setQuotePricingConfig: React.Dispatch<React.SetStateAction<QuotePricingConfig>>;
  handleGlobalMarginChange: (rawValue: string) => void;
  handleNetSalePriceChange: (rawValue: string) => void;
  handleSalePriceWithIvaChange: (rawValue: string) => void;
  applyPricingPreset: (mode: QuotePricingConfig['mode']) => void;
  quoteLines: Array<{ locked?: boolean; pricingMode: LinePricingMode }>;
  quoteResult: QuoteCalculationResult;
  targetSalePrice: number;
  updateQuantity: (productId: string, quantity: number) => void;
  updateQuoteLineMode: (productId: string, pricingMode: LinePricingMode) => void;
  updateQuoteLineValue: (productId: string, rawValue: string) => void;
  toggleQuoteLineLock: (productId: string) => void;
  removeItem: (productId: string) => void;
  grossMarginPercent: number;
  grossMarginValue: number;
  totalCostUSD: number;
  exchangeRate: number;
  formatCLP: (value: number) => string;
  formatUSD: (value: number) => string;
  savedQuotations: SavedSimulationRecord[];
  isLoadingQuotations: boolean;
  duplicateQuotation: (quotation: SavedSimulationRecord) => void;
  generateInternalExport: (quotation: SavedSimulationRecord) => Promise<void>;
  generateClientExport: (quotation: SavedSimulationRecord) => Promise<void>;
  deleteQuotation: (id: string) => Promise<void>;
  calculateIVA: (amount: number) => number;
}

const CotizadorModule: React.FC<CotizadorModuleProps> = ({
  activeTab,
  setActiveTab,
  logoMegaGen,
  backendLabel,
  fileInputRef,
  handleFileUpload,
  syncProductsToDatabase,
  isSyncing,
  products,
  isLoading,
  searchTerm,
  setSearchTerm,
  selectedCategory,
  setSelectedCategory,
  categories,
  createNewList,
  showCreateProductModal,
  setShowCreateProductModal,
  newProductName,
  setNewProductName,
  newProductCost,
  setNewProductCost,
  createUniqueProduct,
  showMoveProductModal,
  productToMove,
  targetMoveCategory,
  setTargetMoveCategory,
  moveTargetCategories,
  setShowMoveProductModal,
  setProductToMove,
  confirmMoveProduct,
  filteredProducts,
  moveProductToList,
  removeProductFromList,
  deleteProduct,
  addItem,
  clearDeal,
  saveSimulation,
  quotePricingConfig,
  setQuotePricingConfig,
  handleGlobalMarginChange,
  handleNetSalePriceChange,
  handleSalePriceWithIvaChange,
  applyPricingPreset,
  quoteLines,
  quoteResult,
  targetSalePrice,
  updateQuantity,
  updateQuoteLineMode,
  updateQuoteLineValue,
  toggleQuoteLineLock,
  removeItem,
  grossMarginPercent,
  grossMarginValue,
  totalCostUSD,
  exchangeRate,
  formatCLP,
  formatUSD,
  savedQuotations,
  isLoadingQuotations,
  duplicateQuotation,
  generateInternalExport,
  generateClientExport,
  deleteQuotation,
  calculateIVA,
}) => {
  return (
    <>
      <header className="header">
        <div className="logo-group">
          <img src={logoMegaGen} alt="MegaGen Logo" style={{ height: '40px', objectFit: 'contain' }} />
          <div>
            <h1 style={{ display: 'none' }}>MegaGen Chile</h1>
            <p className="text-muted">Finance Deal Analyzer v2.6 ({backendLabel})</p>
          </div>
        </div>

        <div className="quote-header-actions" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>
            <Upload size={14} /> Importar
          </button>

          <button
            className="btn btn-secondary"
            style={{ background: 'var(--success)', color: 'white' }}
            onClick={syncProductsToDatabase}
            disabled={isSyncing}
          >
            <CloudUpload size={14} /> {isSyncing ? 'Sincronizando...' : 'Sincronizar DB'}
          </button>

          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            accept=".csv,.xlsx,.xls"
            onChange={handleFileUpload}
          />
        </div>
      </header>

      <div className="tabs-nav" style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', borderBottom: '2px solid var(--border)', padding: '0 0.5rem' }}>
        <button
          className={`btn ${activeTab === 'simulator' ? 'btn-primary' : ''}`}
          style={{
            background: activeTab === 'simulator' ? 'var(--primary)' : 'transparent',
            borderRadius: '8px 8px 0 0',
            border: 'none',
            borderBottom: activeTab === 'simulator' ? '3px solid var(--primary)' : '3px solid transparent',
            padding: '0.75rem 1.5rem'
          }}
          onClick={() => setActiveTab('simulator')}
        >
          <Calculator size={16} style={{ marginRight: '0.5rem' }} />
          Simulador
        </button>
        <button
          className={`btn ${activeTab === 'history' ? 'btn-primary' : ''}`}
          style={{
            background: activeTab === 'history' ? 'var(--primary)' : 'transparent',
            borderRadius: '8px 8px 0 0',
            border: 'none',
            borderBottom: activeTab === 'history' ? '3px solid var(--primary)' : '3px solid transparent',
            padding: '0.75rem 1.5rem'
          }}
          onClick={() => setActiveTab('history')}
        >
          <History size={16} style={{ marginRight: '0.5rem' }} />
          Historial de Cotizaciones
        </button>
      </div>

      {activeTab === 'simulator' && (
        <div className="grid-cols-2">
          <div className="glass card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Database size={18} /> Catálogo {isLoading ? '(Cargando...)' : ''}
              </h3>
              <span className="badge">{products.length} Items</span>
            </div>

            <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#f1f5f9', padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <Search size={18} className="text-muted" />
              <input
                type="text"
                placeholder="Buscar por nombre o categoría..."
                className="input-field"
                style={{ border: 'none', background: 'transparent' }}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>

            <div className="quote-category-row" style={{ marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`badge ${selectedCategory === cat ? 'active-badge' : ''}`}
                  style={{
                    cursor: 'pointer',
                    border: '1px solid var(--secondary)',
                    background: selectedCategory === cat ? 'var(--secondary)' : 'transparent',
                    color: selectedCategory === cat ? 'white' : 'var(--secondary)',
                    padding: '0.3rem 0.75rem',
                    fontSize: '0.7rem',
                    fontWeight: '600',
                    transition: 'all 0.2s'
                  }}
                >
                  {cat}
                </button>
              ))}
              <button
                onClick={createNewList}
                className="badge"
                style={{
                  cursor: 'pointer',
                  border: '1px dashed var(--text-muted)',
                  background: 'transparent',
                  padding: '0.3rem 0.75rem',
                  fontSize: '0.7rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  opacity: 0.7
                }}
                title="Crear nueva lista"
              >
                <FolderPlus size={12} /> Nueva Lista
              </button>

              {selectedCategory === 'Productos Únicos' && (
                <button
                  onClick={() => setShowCreateProductModal(true)}
                  className="badge"
                  style={{
                    cursor: 'pointer',
                    border: '1px solid var(--primary)',
                    background: 'rgba(52, 211, 153, 0.1)',
                    color: 'var(--primary)',
                    padding: '0.3rem 0.75rem',
                    fontSize: '0.7rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    fontWeight: 'bold'
                  }}
                  title="Crear un producto especial"
                >
                  <Plus size={12} /> Crear Item Especial
                </button>
              )}
            </div>

            {showCreateProductModal && (
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                <div style={{ background: '#1e1e1e', padding: '2rem', borderRadius: '12px', width: '90%', maxWidth: '400px', border: '1px solid var(--text-muted)' }}>
                  <h3 style={{ marginBottom: '1.5rem' }}>Nuevo Producto Único</h3>
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Nombre del Item</label>
                    <input type="text" className="input-field" placeholder="Ej: Pasaje Aéreo, Curso Especial" value={newProductName} onChange={(e) => setNewProductName(e.target.value)} autoFocus />
                  </div>
                  <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Costo (USD)</label>
                    <input type="number" className="input-field" placeholder="0.00" value={newProductCost} onChange={(e) => setNewProductCost(e.target.value)} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                    <button className="btn" onClick={() => setShowCreateProductModal(false)}>Cancelar</button>
                    <button className="btn btn-primary" onClick={createUniqueProduct}>Crear Item</button>
                  </div>
                </div>
              </div>
            )}

            {showMoveProductModal && productToMove && (
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                <div style={{ background: '#1e1e1e', padding: '2rem', borderRadius: '12px', width: '90%', maxWidth: '420px', border: '1px solid var(--text-muted)' }}>
                  <h3 style={{ marginBottom: '1rem' }}>Mover Producto</h3>
                  <p style={{ marginBottom: '1rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                    Selecciona la lista destino para <strong style={{ color: '#fff' }}>{productToMove.name}</strong>.
                  </p>
                  <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Lista destino</label>
                    <select className="input-field" value={targetMoveCategory} onChange={(e) => setTargetMoveCategory(e.target.value)}>
                      {moveTargetCategories.map((category) => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                    <button className="btn" onClick={() => { setShowMoveProductModal(false); setProductToMove(null); }}>Cancelar</button>
                    <button className="btn btn-primary" onClick={confirmMoveProduct}>Mover</button>
                  </div>
                </div>
              </div>
            )}

            <div style={{ maxHeight: '550px', overflowY: 'auto', paddingRight: '0.5rem' }}>
              {filteredProducts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px' }}>
                  <Search size={40} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                  <p className="text-muted">No se encontraron productos.</p>
                  <button className="btn" style={{ marginTop: '1rem', fontSize: '0.8rem', background: 'rgba(255,255,255,0.1)' }} onClick={() => { setSearchTerm(''); setSelectedCategory('All'); }}>
                    Limpiar filtros
                  </button>
                </div>
              ) : (
                filteredProducts.map((product) => (
                  <div key={product.id} className="finance-card quote-catalog-card" style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="text-muted" style={{ fontSize: '0.7rem' }}>[{product.sku || 'S/SKU'}]</span>
                        <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>{product.name}</div>
                      </div>
                      <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                        USD: {formatUSD(product.costUSD)} | CLP: {formatCLP(product.costUSD * exchangeRate)}
                      </div>
                      <div className="badge" style={{ marginTop: '0.2rem', padding: '0.05rem 0.3rem', fontSize: '0.6rem', opacity: 0.8 }}>{product.category}</div>
                    </div>
                    <div className="quote-catalog-actions" style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn" style={{ padding: '0.4rem', background: 'rgba(255,255,255,0.1)', color: 'var(--text-muted)' }} onClick={() => moveProductToList(product)} title="Mover a otra lista">
                        <ArrowRight size={14} />
                      </button>
                      {selectedCategory !== 'All' && selectedCategory !== 'General' && product.category === selectedCategory && (
                        <button className="btn" style={{ padding: '0.4rem', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--error)' }} onClick={() => removeProductFromList(product)} title="Quitar de esta lista">
                          <X size={14} />
                        </button>
                      )}
                      {selectedCategory !== 'All' && (
                        <button className="btn" style={{ padding: '0.4rem', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--error)' }} onClick={() => deleteProduct(product)} title="Eliminar permanentemente">
                          <Trash2 size={14} />
                        </button>
                      )}
                      <button className="btn btn-primary" style={{ padding: '0.4rem' }} onClick={() => addItem(product)}>
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <div className="glass card" style={{ marginBottom: '1.5rem' }}>
              <div className="quote-card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Calculator size={18} /> Configuración de la Oferta
                </h3>
                <div className="quote-card-head-actions" style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn" style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--error)', fontSize: '0.75rem' }} onClick={clearDeal}>
                    <Trash2 size={14} /> Limpiar
                  </button>
                  <button className="btn btn-primary" style={{ background: 'var(--secondary)', fontSize: '0.75rem' }} onClick={saveSimulation}>
                    <Save size={14} /> Guardar Deal
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: '1rem', padding: '1rem', borderRadius: '12px', background: 'rgba(0,0,0,0.18)' }}>
                <div className="quote-strategy-grid" style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr', gap: '0.75rem', alignItems: 'end' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>MODO DE CALCULO</label>
                    <select className="input-field" value={quotePricingConfig.mode} onChange={(e) => setQuotePricingConfig((prev) => ({ ...prev, mode: e.target.value as QuotePricingConfig['mode'] }))}>
                      {QUOTE_MODE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>

                  {quotePricingConfig.mode === 'global_margin' ? (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>MARGEN GLOBAL %</label>
                      <input type="number" className="input-field" value={quotePricingConfig.targetMarginPercent ?? DEFAULT_QUOTE_MARGIN_PERCENT} onChange={(e) => handleGlobalMarginChange(e.target.value)} />
                    </div>
                  ) : quotePricingConfig.mode === 'global_net' ? (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>NETO GLOBAL CLP</label>
                      <input type="number" className="input-field" value={quotePricingConfig.targetNetTotalCLP ?? targetSalePrice} onChange={(e) => handleNetSalePriceChange(e.target.value)} />
                    </div>
                  ) : (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>REFERENCIA</label>
                      <div className="finance-card" style={{ padding: '0.7rem', minHeight: '42px' }}>
                        {quotePricingConfig.mode === 'at_cost' ? 'Toda la oferta al costo' : 'Control por producto'}
                      </div>
                    </div>
                  )}

                  <div>
                    <label style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>TOTAL CON IVA</label>
                    <input type="number" className="input-field" value={quoteResult.totalWithIvaCLP} onChange={(e) => handleSalePriceWithIvaChange(e.target.value)} disabled={quotePricingConfig.mode === 'manual_lines' || quotePricingConfig.mode === 'at_cost'} />
                  </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.85rem' }}>
                  <button className="btn" style={{ fontSize: '0.7rem', background: 'rgba(255,255,255,0.08)' }} onClick={() => applyPricingPreset('at_cost')}>Todo al costo</button>
                  <button className="btn" style={{ fontSize: '0.7rem', background: 'rgba(74, 222, 128, 0.12)', color: 'var(--success)' }} onClick={() => applyPricingPreset('global_margin')}>Margen global 50%</button>
                  <button className="btn" style={{ fontSize: '0.7rem', background: 'rgba(59, 130, 246, 0.18)', color: '#93c5fd' }} onClick={() => applyPricingPreset('global_net')}>Fijar neto total</button>
                  <button className="btn" style={{ fontSize: '0.7rem', background: 'rgba(245, 158, 11, 0.14)', color: '#fbbf24' }} onClick={() => applyPricingPreset('manual_lines')}>Pasar todo a manual</button>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.85rem' }}>
                  <span className="badge">Bloqueadas: {quoteLines.filter((line) => line.locked).length}</span>
                  <span className="badge">Ajustables: {quoteLines.filter((line) => !line.locked && line.pricingMode === 'inherit').length}</span>
                  <span className="badge">Modo actual: {QUOTE_MODE_OPTIONS.find((option) => option.value === quotePricingConfig.mode)?.label}</span>
                </div>
              </div>

              <div className="table-container quote-line-table" style={{ maxHeight: '340px' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th style={{ textAlign: 'center' }}>Cant.</th>
                      <th style={{ textAlign: 'right' }}>Costo Unit.</th>
                      <th style={{ textAlign: 'right' }}>Costo Total</th>
                      <th>Modo</th>
                      <th>Valor Regla</th>
                      <th style={{ textAlign: 'right' }}>Neto Unit.</th>
                      <th style={{ textAlign: 'right' }}>Neto Total</th>
                      <th style={{ textAlign: 'right' }}>Utilidad</th>
                      <th style={{ textAlign: 'right' }}>Margen</th>
                      <th style={{ textAlign: 'center' }}>Bloq.</th>
                      <th style={{ textAlign: 'center' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quoteResult.lines.map((item) => {
                      const lineModeLabel = LINE_PRICING_MODE_OPTIONS.find((option) => option.value === item.pricingMode)?.label || item.pricingMode;
                      return (
                        <tr key={item.productId}>
                          <td style={{ fontSize: '0.75rem' }}>{item.productName}</td>
                          <td style={{ textAlign: 'center' }}>
                            <input type="number" className="input-field" style={{ width: '50px', padding: '0.2rem', textAlign: 'center' }} value={item.quantity} onChange={(e) => updateQuantity(item.productId, parseInt(e.target.value) || 0)} />
                          </td>
                          <td style={{ textAlign: 'right', fontSize: '0.85rem' }}>{formatCLP(item.costUnitCLP)}</td>
                          <td style={{ textAlign: 'right', fontSize: '0.85rem' }}>{formatCLP(item.costTotalCLP)}</td>
                          <td style={{ minWidth: '150px' }}>
                            <select className="input-field" style={{ minWidth: '140px' }} value={item.pricingMode} onChange={(e) => updateQuoteLineMode(item.productId, e.target.value as LinePricingMode)} title={lineModeLabel}>
                              {LINE_PRICING_MODE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </td>
                          <td style={{ minWidth: '110px' }}>
                            <input type="number" className="input-field" disabled={item.pricingMode === 'inherit' || item.pricingMode === 'at_cost'} value={item.value ?? ''} onChange={(e) => updateQuoteLineValue(item.productId, e.target.value)} placeholder={item.pricingMode === 'fixed_margin_percent' ? '%' : 'CLP'} />
                          </td>
                          <td style={{ textAlign: 'right', fontSize: '0.85rem', color: item.effectiveMode === 'at_cost' ? 'var(--success)' : 'var(--primary)', fontWeight: '600' }}>{formatCLP(item.netUnitCLP)}</td>
                          <td style={{ textAlign: 'right', fontSize: '0.85rem', color: item.effectiveMode === 'at_cost' ? 'var(--success)' : 'var(--primary)', fontWeight: '600' }}>{formatCLP(item.netTotalCLP)}</td>
                          <td style={{ textAlign: 'right', fontSize: '0.85rem' }} className={item.profitTotalCLP >= 0 ? 'positive' : 'negative'}>{formatCLP(item.profitTotalCLP)}</td>
                          <td style={{ textAlign: 'right', fontSize: '0.85rem' }} className={item.marginPercent >= 0 ? 'positive' : 'negative'}>{item.marginPercent.toFixed(1)}%</td>
                          <td style={{ textAlign: 'center' }}>
                            <input type="checkbox" checked={item.locked} onChange={() => toggleQuoteLineLock(item.productId)} />
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button onClick={() => removeItem(item.productId)} style={{ background: 'transparent', border: 'none', color: 'var(--error)', cursor: 'pointer', padding: '0.2rem' }}>
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {quoteLines.length === 0 && (
                      <tr>
                        <td colSpan={12} style={{ textAlign: 'center', padding: '1.5rem' }} className="text-muted">Selecciona items del catálogo</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="quote-line-cards">
                {quoteResult.lines.map((item) => (
                  <div key={`card-${item.productId}`} className="finance-card quote-line-card">
                    <div className="quote-line-card-head">
                      <div style={{ fontWeight: 700 }}>{item.productName}</div>
                      <button onClick={() => removeItem(item.productId)} style={{ background: 'transparent', border: 'none', color: 'var(--error)', cursor: 'pointer', padding: 0 }}>
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="quote-line-card-grid">
                      <label>
                        <span className="text-muted quote-field-label">Cantidad</span>
                        <input type="number" className="input-field" value={item.quantity} onChange={(e) => updateQuantity(item.productId, parseInt(e.target.value) || 0)} />
                      </label>
                      <label>
                        <span className="text-muted quote-field-label">Modo</span>
                        <select className="input-field" value={item.pricingMode} onChange={(e) => updateQuoteLineMode(item.productId, e.target.value as LinePricingMode)}>
                          {LINE_PRICING_MODE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span className="text-muted quote-field-label">Valor regla</span>
                        <input
                          type="number"
                          className="input-field"
                          disabled={item.pricingMode === 'inherit' || item.pricingMode === 'at_cost'}
                          value={item.value ?? ''}
                          onChange={(e) => updateQuoteLineValue(item.productId, e.target.value)}
                          placeholder={item.pricingMode === 'fixed_margin_percent' ? '%' : 'CLP'}
                        />
                      </label>
                      <label className="quote-lock-field">
                        <span className="text-muted quote-field-label">Bloquear</span>
                        <input type="checkbox" checked={item.locked} onChange={() => toggleQuoteLineLock(item.productId)} />
                      </label>
                    </div>

                    <div className="quote-line-metrics">
                      <div><span className="text-muted">Costo</span><strong>{formatCLP(item.costTotalCLP)}</strong></div>
                      <div><span className="text-muted">Neto</span><strong>{formatCLP(item.netTotalCLP)}</strong></div>
                      <div><span className="text-muted">Utilidad</span><strong className={item.profitTotalCLP >= 0 ? 'positive' : 'negative'}>{formatCLP(item.profitTotalCLP)}</strong></div>
                      <div><span className="text-muted">Margen</span><strong className={item.marginPercent >= 0 ? 'positive' : 'negative'}>{item.marginPercent.toFixed(1)}%</strong></div>
                    </div>
                  </div>
                ))}
                {quoteLines.length === 0 && (
                  <div className="finance-card text-muted" style={{ textAlign: 'center' }}>
                    Selecciona items del catálogo
                  </div>
                )}
              </div>

              <div style={{ marginTop: '1.5rem', padding: '1.25rem', background: 'rgba(0,0,0,0.2)', borderRadius: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                    <DollarSign size={12} /> PRECIO DE VENTA DE LA OFERTA (CLP)
                  </label>
                  {quoteLines.length > 0 && (
                  <div className="quote-price-actions" style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn" style={{ fontSize: '0.65rem', padding: '0.25rem 0.5rem', background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.1)' }} onClick={() => applyPricingPreset('at_cost')} title="Aplicar precio al costo (0% margen)">Venta al Costo</button>
                      <button className="btn" style={{ fontSize: '0.65rem', padding: '0.25rem 0.5rem', background: 'rgba(74, 222, 128, 0.1)', color: 'var(--success)' }} onClick={() => applyPricingPreset('global_margin')} title="Aplicar precio con 50% de margen">50% → {formatCLP(quoteResult.totalNetCLP)}</button>
                    </div>
                  )}
                </div>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '10px', fontWeight: 'bold', color: 'var(--success)' }}>$</span>
                  <input type="number" className="input-field" style={{ paddingLeft: '28px', fontSize: '1.25rem', fontWeight: 'bold' }} value={targetSalePrice} onChange={(e) => handleNetSalePriceChange(e.target.value)} disabled={quotePricingConfig.mode === 'manual_lines' || quotePricingConfig.mode === 'at_cost'} />
                </div>
                {targetSalePrice > 0 && (
                  <div className="quote-iva-row" style={{ marginTop: '0.3rem', textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem' }}>
                    <span>Total con IVA:</span>
                    <div style={{ position: 'relative', width: '120px' }}>
                      <span style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', fontWeight: 'bold', color: '#fff' }}>$</span>
                      <input
                        type="number"
                        className="input-field"
                        style={{ width: '100%', paddingLeft: '20px', paddingRight: '5px', textAlign: 'right', fontWeight: '600', color: '#fff', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}
                        value={Math.round(targetSalePrice * 1.19)}
                        onChange={(e) => handleSalePriceWithIvaChange(e.target.value)}
                        disabled={quotePricingConfig.mode === 'manual_lines' || quotePricingConfig.mode === 'at_cost'}
                      />
                    </div>
                  </div>
                )}
                {quoteLines.length > 0 && targetSalePrice > 0 && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>Tu margen actual:</span>
                    <span className={grossMarginPercent >= 50 ? 'positive' : grossMarginPercent >= 30 ? 'warning' : 'negative'} style={{ fontWeight: 'bold' }}>{Math.round(grossMarginPercent)}%</span>
                  </div>
                )}

                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Percent size={12} /> CALCULAR PRECIO POR MARGEN OBJETIVO
                    </div>
                  </label>
                  <div className="quote-margin-row" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input type="number" placeholder="Ej: 40" className="input-field" style={{ paddingRight: '25px', width: '100%' }} value={quotePricingConfig.mode === 'global_margin' ? (quotePricingConfig.targetMarginPercent ?? DEFAULT_QUOTE_MARGIN_PERCENT) : ''} onChange={(e) => handleGlobalMarginChange(e.target.value)} />
                      <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.8rem' }}>%</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', maxWidth: '160px', lineHeight: '1.2' }}>
                      Ingresa un % y el motor recalcula el neto de las lineas ajustables.
                    </div>
                  </div>
                </div>

                {quoteResult.warnings.length > 0 && (
                  <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {quoteResult.warnings.map((warning, index) => (
                      <div key={`${warning}-${index}`} className="badge" style={{ width: 'fit-content', background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5' }}>
                        {warning}
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid quote-summary-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.75rem', marginTop: '1rem' }}>
                  <div className="finance-card" style={{ padding: '0.75rem' }}>
                    <div className="text-muted" style={{ fontSize: '0.6rem' }}>COSTO TOTAL</div>
                    <div style={{ fontSize: '1rem', fontWeight: 'bold' }}>{formatCLP(quoteResult.totalCostCLP)}</div>
                    <div className="text-muted" style={{ fontSize: '0.55rem' }}>USD: {formatUSD(totalCostUSD)}</div>
                  </div>
                  <div className="finance-card" style={{ padding: '0.75rem' }}>
                    <div className="text-muted" style={{ fontSize: '0.6rem' }}>NETO TOTAL</div>
                    <div style={{ fontSize: '1rem', fontWeight: 'bold' }}>{formatCLP(quoteResult.totalNetCLP)}</div>
                  </div>
                  <div className="finance-card" style={{ padding: '0.75rem' }}>
                    <div className="text-muted" style={{ fontSize: '0.6rem' }}>UTILIDAD TOTAL</div>
                    <div style={{ fontSize: '1rem', fontWeight: 'bold' }} className={quoteResult.totalProfitCLP >= 0 ? 'positive' : 'negative'}>{formatCLP(quoteResult.totalProfitCLP)}</div>
                  </div>
                  <div className="finance-card" style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <div className="text-muted" style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>TOTAL CON IVA</div>
                    <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#fff' }}>{formatCLP(quoteResult.totalWithIvaCLP)}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="glass card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Percent size={18} /> Rentabilidad
                </h3>
              </div>

              <div className="grid quote-profit-grid" style={{ gridTemplateColumns: '1.2fr 0.8fr', gap: '1.25rem' }}>
                <div>
                  <div className="text-muted" style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}>MARGEN BRUTO (%)</div>
                  <div style={{ fontSize: '2.2rem', fontWeight: '800' }} className={grossMarginPercent >= 50 ? 'positive' : grossMarginPercent >= 30 ? 'warning' : 'negative'}>
                    {grossMarginPercent.toFixed(1)}%
                  </div>
                  <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', marginTop: '0.75rem', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, Math.max(0, grossMarginPercent))}%`, height: '100%', background: grossMarginPercent >= 50 ? 'var(--success)' : grossMarginPercent >= 30 ? 'var(--warning)' : 'var(--error)', borderRadius: '4px', transition: 'width 0.4s ease-out' }} />
                  </div>
                  <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.65rem' }} className="text-muted">
                    <CheckCircle2 size={12} className={grossMarginPercent >= 50 ? 'positive' : 'text-muted'} /> Objetivo Gerencial: 50.0%
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div className="finance-card" style={{ padding: '0.6rem', borderLeft: `3px solid ${grossMarginPercent >= 50 ? 'var(--success)' : 'var(--error)'}` }}>
                    <div className="text-muted" style={{ fontSize: '0.6rem' }}>DELTA OBJETIVO</div>
                    <div style={{ fontSize: '1rem', fontWeight: 'bold' }} className={grossMarginPercent >= 50 ? 'positive' : 'negative'}>
                      {grossMarginPercent >= 50 ? '+' : ''}{Math.round(grossMarginPercent - 50)}%
                    </div>
                  </div>
                  <div className="finance-card" style={{ padding: '0.6rem' }}>
                    <div className="text-muted" style={{ fontSize: '0.6rem' }}>UTILIDAD NETA (CLP)</div>
                    <div style={{ fontSize: '1rem', fontWeight: 'bold' }} className={grossMarginValue >= 0 ? 'positive' : 'negative'}>
                      {formatCLP(grossMarginValue)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div className="glass card">
            <h2 style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <History size={24} />
              Cotizaciones Guardadas
            </h2>

            {isLoadingQuotations ? (
              <div style={{ textAlign: 'center', padding: '3rem' }}>
                <RefreshCw size={32} className="spin" style={{ opacity: 0.5 }} />
                <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>Cargando cotizaciones...</p>
              </div>
            ) : savedQuotations.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem' }}>
                <Database size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                <p className="text-muted">No hay cotizaciones guardadas aún.</p>
                <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={() => setActiveTab('simulator')}>
                  Crear una cotización
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {savedQuotations.map((quotation) => {
                  const subtotal = quotation.sale_price_clp;
                  const iva = calculateIVA(subtotal);
                  const total = subtotal + iva;
                  const quoteStatus = getQuoteStatus(quotation.warnings);
                  const date = new Date(quotation.created_at).toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

                  return (
                    <div key={quotation.id} className="finance-card" style={{ padding: '1.5rem' }}>
                      <div className="mobile-stack" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '2rem', flexWrap: 'wrap' }}>
                        <div className="mobile-full-width" style={{ flex: 1, minWidth: '300px' }}>
                          <div className="finance-summary-grid" style={{ display: 'flex', gap: '2rem', alignItems: 'center', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                            <div>
                              <div className="text-muted" style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>Total con IVA</div>
                              <div style={{ fontSize: '1.8rem', fontWeight: '800', color: 'var(--success)' }}>{formatCLP(total)}</div>
                            </div>
                            <div>
                              <div className="text-muted" style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>Margen Bruto</div>
                              <div style={{ fontSize: '1.8rem', fontWeight: '800' }} className={quotation.margin_percent >= 50 ? 'positive' : quotation.margin_percent >= 30 ? 'warning' : 'negative'}>
                                {Math.round(quotation.margin_percent)}%
                              </div>
                            </div>
                            <div style={{ marginLeft: 'auto', textAlign: 'right', display: 'flex', gap: '1.5rem' }} className="mobile-stack mobile-full-width mobile-col-span-full">
                              <div>
                                <div className="text-muted" style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>Neto</div>
                                <div style={{ fontWeight: '600', fontSize: '1.1rem' }}>{formatCLP(subtotal)}</div>
                              </div>
                              <div>
                                <div className="text-muted" style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>IVA (19%)</div>
                                <div style={{ fontWeight: '600', fontSize: '1.1rem', color: 'var(--warning)' }}>{formatCLP(iva)}</div>
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                            <span className="badge" style={{ background: 'rgba(59,130,246,0.16)', color: '#93c5fd' }}>{getQuoteTypeLabel(quotation.pricing_mode)}</span>
                            <span className="badge" style={{ background: 'rgba(168,85,247,0.16)', color: '#d8b4fe' }}>{getQuoteModeLabel(quotation.pricing_mode)}</span>
                            <span className="badge" style={{ background: quoteStatus.background, color: quoteStatus.color }}>{quoteStatus.label}</span>
                            {quotation.target_margin_percent != null && quotation.pricing_mode === 'global_margin' && (
                              <span className="badge">Objetivo: {Math.round(quotation.target_margin_percent)}%</span>
                            )}
                          </div>

                          {quotation.warnings && quotation.warnings.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '1rem' }}>
                              {quotation.warnings.map((warning, index) => (
                                <div key={`${quotation.id}-warning-${index}`} className="badge" style={{ width: 'fit-content', background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5' }}>
                                  {warning}
                                </div>
                              ))}
                            </div>
                          )}

                          <div>
                            <div className="text-muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '0.75rem', letterSpacing: '1px' }}>Productos Incluidos ({quotation.items.length})</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                              {quotation.items.map((item, idx) => (
                                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'rgba(255,255,255,0.03)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                  <div className="badge" style={{ fontSize: '1.1rem', padding: '0.3rem 0.8rem', background: 'var(--primary)', color: 'white' }}>{item.qty}</div>
                                  <div style={{ fontSize: '1.1rem', fontWeight: '500', flex: 1 }}>{item.name}</div>
                                  {item.pricing_mode && item.pricing_mode !== 'inherit' && (
                                    <div className="badge" style={{ fontSize: '0.68rem', background: 'rgba(168,85,247,0.14)', color: '#d8b4fe' }}>
                                      {LINE_PRICING_MODE_OPTIONS.find((option) => option.value === item.pricing_mode)?.label || item.pricing_mode}
                                    </div>
                                  )}
                                  <div className="text-muted" style={{ fontSize: '0.9rem' }}>${Math.round(item.cost_usd)} USD</div>
                                  {item.net_total_clp != null && <div style={{ fontSize: '0.9rem', fontWeight: '600' }}>{formatCLP(item.net_total_clp)}</div>}
                                </div>
                              ))}
                            </div>
                          </div>

                          <details style={{ marginTop: '1rem' }}>
                            <summary style={{ cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                              <History size={12} /> Ver fecha y hora
                            </summary>
                            <div style={{ marginTop: '0.5rem', padding: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                              Creada el: <strong style={{ color: '#fff' }}>{date}</strong>
                            </div>
                          </details>
                        </div>

                        <div className="mobile-full-width" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          <button className="btn btn-secondary mobile-full-width" style={{ background: 'var(--primary)', whiteSpace: 'nowrap', fontSize: '0.85rem', padding: '0.6rem 1rem' }} onClick={() => duplicateQuotation(quotation)} title="Cargar esta cotización en el simulador">
                            <Copy size={16} style={{ marginRight: '0.5rem' }} /> Duplicar
                          </button>
                          <button className="btn btn-secondary mobile-full-width" style={{ background: 'var(--success)', whiteSpace: 'nowrap', fontSize: '0.85rem', padding: '0.6rem 1rem' }} onClick={() => generateInternalExport(quotation)} title="Descargar imagen interna (con costos y margenes)">
                            <ImageIcon size={16} style={{ marginRight: '0.5rem' }} /> Exportar (Interno)
                          </button>
                          <button className="btn btn-secondary mobile-full-width" style={{ background: '#3b82f6', whiteSpace: 'nowrap', fontSize: '0.85rem', padding: '0.6rem 1rem', color: 'white' }} onClick={() => generateClientExport(quotation)} title="Descargar imagen para cliente (sin costos)">
                            <ImageIcon size={16} style={{ marginRight: '0.5rem' }} /> Exportar (Cliente)
                          </button>
                          <button className="btn btn-secondary mobile-full-width" style={{ background: 'var(--error)', whiteSpace: 'nowrap', fontSize: '0.85rem', padding: '0.6rem 1rem', color: 'white', marginTop: 'auto' }} onClick={() => deleteQuotation(quotation.id)} title="Eliminar esta cotización">
                            <Trash2 size={16} style={{ marginRight: '0.5rem' }} /> Eliminar
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default CotizadorModule;
