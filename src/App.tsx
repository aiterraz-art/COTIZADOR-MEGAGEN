import React, { useState, useMemo, useRef, useEffect } from 'react';
// Force refresh - Fixed JSX Structure
import * as XLSX from 'xlsx';
import { initialProducts } from './data/mockProducts';
import type { Product } from './data/mockProducts';
import { parseCashFlowFile, parseDailySalesFile, parseFile, parseImportProductsFile } from './utils/fileParser';
import type { CashFlowSummary } from './utils/fileParser';
import type { DailySalesSummary } from './utils/fileParser';
import type { ImportItemRaw } from './utils/fileParser';
import { supabase } from './lib/supabase';
import html2canvas from 'html2canvas';
import logoMegaGen from './assets/MegaGen.jpg';
import {
  Calculator,
  DollarSign,
  Search,
  Plus,
  Trash2,
  Percent,
  Upload,
  Save,
  CloudUpload,
  Database,
  CheckCircle2,
  RefreshCw,
  History,
  Copy,
  Image as ImageIcon,
  FolderPlus,
  ArrowRight,
  X,
  LayoutGrid,
  BriefcaseBusiness,
  Users,
  ReceiptText,
  LineChart,
  FileSpreadsheet,
  Ship,
  Download
} from 'lucide-react';

const CUSTOM_CATEGORIES_STORAGE_KEY = 'megagen.customCategories';
const EXCHANGE_RATE_STORAGE_KEY = 'megagen.exchangeRate';
const EXCHANGE_RATE_UPDATED_STORAGE_KEY = 'megagen.exchangeRateUpdatedAt';
const CASH_FLOW_SUMMARY_STORAGE_KEY = 'megagen.analysis.cashFlowSummary';
const CASH_FLOW_FILE_STORAGE_KEY = 'megagen.analysis.cashFlowFileName';
const DAILY_SALES_SUMMARY_STORAGE_KEY = 'megagen.analysis.dailySalesSummary';
const DAILY_SALES_FILE_STORAGE_KEY = 'megagen.analysis.dailySalesFileName';
const IMPORT_CURRENCY_STORAGE_KEY = 'megagen.import.currency';
const IMPORT_USD_RATE_STORAGE_KEY = 'megagen.import.usdRate';
const EURO_RATE_STORAGE_KEY = 'megagen.euroRate';
const EURO_RATE_UPDATED_STORAGE_KEY = 'megagen.euroRateUpdatedAt';
const IMPORT_ITEMS_STORAGE_KEY = 'megagen.import.items';
const IMPORT_FILE_STORAGE_KEY = 'megagen.import.fileName';
const IMPORT_SHIPPING_STORAGE_KEY = 'megagen.import.shipping';
const IMPORT_SHIPPING_CURRENCY_STORAGE_KEY = 'megagen.import.shippingCurrency';
const IMPORT_CUSTOMS_STORAGE_KEY = 'megagen.import.customs';
const IMPORT_MARGIN_STORAGE_KEY = 'megagen.import.margin';

const readStoredJSON = <T,>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

// ... (rest of imports)

// Inside App component...



interface DealItem {
  product: Product;
  quantity: number;
}

interface SavedQuotation {
  id: string;
  created_at: string;
  sale_price_clp: number;
  exchange_rate: number;
  total_cost_usd: number;
  total_cost_clp: number;
  margin_percent: number;
  net_profit_clp: number;
  items: Array<{ name: string; qty: number; cost_usd: number; category?: string }>;
}

type ModuleKey = 'cotizador' | 'analysis' | 'imports' | 'crm' | 'clientes' | 'facturacion';

interface ImportItemCalculated extends ImportItemRaw {
  baseTotalForeign: number;
  baseTotalCLP: number;
  shippingCLPAllocated: number;
  customsCLPAllocated: number;
  landedTotalCLP: number;
  landedUnitCLP: number;
  suggestedNetUnitCLP: number;
  suggestedIvaUnitCLP: number;
}

const App: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [dealItems, setDealItems] = useState<DealItem[]>([]);
  const [targetSalePrice, setTargetSalePrice] = useState<number>(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [exchangeRate, setExchangeRate] = useState<number>(() => {
    const storedRate = Number(localStorage.getItem(EXCHANGE_RATE_STORAGE_KEY));
    return Number.isFinite(storedRate) && storedRate > 0 ? storedRate : 950;
  });
  const [lastUpdated, setLastUpdated] = useState<string>(() => localStorage.getItem(EXCHANGE_RATE_UPDATED_STORAGE_KEY) || '');
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const analysisFileInputRef = useRef<HTMLInputElement>(null);
  const salesFileInputRef = useRef<HTMLInputElement>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  // Quotations Manager State
  const [activeTab, setActiveTab] = useState<'simulator' | 'history'>('simulator');
  const [activeModule, setActiveModule] = useState<ModuleKey>('cotizador');
  const [savedQuotations, setSavedQuotations] = useState<SavedQuotation[]>([]);
  const [isLoadingQuotations, setIsLoadingQuotations] = useState(false);
  const [cashFlowSummary, setCashFlowSummary] = useState<CashFlowSummary | null>(() => readStoredJSON<CashFlowSummary>(CASH_FLOW_SUMMARY_STORAGE_KEY));
  const [analysisSourceFile, setAnalysisSourceFile] = useState(() => localStorage.getItem(CASH_FLOW_FILE_STORAGE_KEY) || '');
  const [dailySalesSummary, setDailySalesSummary] = useState<DailySalesSummary | null>(() => readStoredJSON<DailySalesSummary>(DAILY_SALES_SUMMARY_STORAGE_KEY));
  const [salesSourceFile, setSalesSourceFile] = useState(() => localStorage.getItem(DAILY_SALES_FILE_STORAGE_KEY) || '');
  const [reportDate, setReportDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [salesTargetKUSD, setSalesTargetKUSD] = useState<number>(0);
  const [collectionTargetKUSD, setCollectionTargetKUSD] = useState<number>(0);
  const [fxSalesTargetEA, setFxSalesTargetEA] = useState<number>(0);
  const [hqPaymentTargetKUSD, setHqPaymentTargetKUSD] = useState<number>(0);
  const [hqPaymentActualKUSD, setHqPaymentActualKUSD] = useState<number>(0);
  const [hqCreditTargetKUSD, setHqCreditTargetKUSD] = useState<number>(0);
  const [hqCreditActualKUSD, setHqCreditActualKUSD] = useState<number>(0);
  const [copiedReport, setCopiedReport] = useState(false);
  const [copiedMetricKey, setCopiedMetricKey] = useState('');
  const [importCurrency, setImportCurrency] = useState<'USD' | 'EUR'>(() => {
    const stored = localStorage.getItem(IMPORT_CURRENCY_STORAGE_KEY);
    return stored === 'EUR' ? 'EUR' : 'USD';
  });
  const [importUsdRate, setImportUsdRate] = useState<number>(() => {
    const storedRate = Number(localStorage.getItem(IMPORT_USD_RATE_STORAGE_KEY));
    return Number.isFinite(storedRate) && storedRate > 0 ? storedRate : 950;
  });
  const [euroRate, setEuroRate] = useState<number>(() => {
    const storedRate = Number(localStorage.getItem(EURO_RATE_STORAGE_KEY));
    return Number.isFinite(storedRate) && storedRate > 0 ? storedRate : 1050;
  });
  const [euroLastUpdated, setEuroLastUpdated] = useState<string>(() => localStorage.getItem(EURO_RATE_UPDATED_STORAGE_KEY) || '');
  const [euroFetchError, setEuroFetchError] = useState(false);
  const [importItems, setImportItems] = useState<ImportItemRaw[]>(() => readStoredJSON<ImportItemRaw[]>(IMPORT_ITEMS_STORAGE_KEY) || []);
  const [importSourceFile, setImportSourceFile] = useState(() => localStorage.getItem(IMPORT_FILE_STORAGE_KEY) || '');
  const [shippingCostCLP, setShippingCostCLP] = useState<number>(() => Number(localStorage.getItem(IMPORT_SHIPPING_STORAGE_KEY)) || 0);
  const [shippingCurrency, setShippingCurrency] = useState<'CLP' | 'USD' | 'EUR'>(() => {
    const stored = localStorage.getItem(IMPORT_SHIPPING_CURRENCY_STORAGE_KEY);
    return stored === 'USD' || stored === 'EUR' ? stored : 'CLP';
  });
  const [customsCostCLP, setCustomsCostCLP] = useState<number>(() => Number(localStorage.getItem(IMPORT_CUSTOMS_STORAGE_KEY)) || 0);
  const [targetGrossMarginPercentImport, setTargetGrossMarginPercentImport] = useState<number>(() => Number(localStorage.getItem(IMPORT_MARGIN_STORAGE_KEY)) || 50);

  // Manual Product Creation
  const [showCreateProductModal, setShowCreateProductModal] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductCost, setNewProductCost] = useState('');
  const [showMoveProductModal, setShowMoveProductModal] = useState(false);
  const [productToMove, setProductToMove] = useState<Product | null>(null);
  const [targetMoveCategory, setTargetMoveCategory] = useState('');



  const normalizeText = (text: string) => {
    return text.toString().toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  };

  const checkIsAtCost = (item: { name: string; category?: string }) => {
    const name = item.name.toLowerCase();
    const category = item.category || 'General';
    return category === 'Productos Únicos' ||
      name.includes('item especial') ||
      name.includes('manual') ||
      name.includes('task');
  };

  // Fetch products on mount (exchange rate remains persistent until manually changed/refreshed)
  useEffect(() => {
    fetchProducts();
  }, []);

  // Fetch quotations when switching to history tab
  useEffect(() => {
    if (activeTab === 'history') {
      fetchSavedQuotations();
    }
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem(EXCHANGE_RATE_STORAGE_KEY, String(exchangeRate));
  }, [exchangeRate]);

  useEffect(() => {
    localStorage.setItem(EXCHANGE_RATE_UPDATED_STORAGE_KEY, lastUpdated);
  }, [lastUpdated]);

  useEffect(() => {
    if (cashFlowSummary) {
      localStorage.setItem(CASH_FLOW_SUMMARY_STORAGE_KEY, JSON.stringify(cashFlowSummary));
    } else {
      localStorage.removeItem(CASH_FLOW_SUMMARY_STORAGE_KEY);
    }
  }, [cashFlowSummary]);

  useEffect(() => {
    localStorage.setItem(CASH_FLOW_FILE_STORAGE_KEY, analysisSourceFile);
  }, [analysisSourceFile]);

  useEffect(() => {
    if (dailySalesSummary) {
      localStorage.setItem(DAILY_SALES_SUMMARY_STORAGE_KEY, JSON.stringify(dailySalesSummary));
    } else {
      localStorage.removeItem(DAILY_SALES_SUMMARY_STORAGE_KEY);
    }
  }, [dailySalesSummary]);

  useEffect(() => {
    localStorage.setItem(DAILY_SALES_FILE_STORAGE_KEY, salesSourceFile);
  }, [salesSourceFile]);

  useEffect(() => {
    localStorage.setItem(IMPORT_CURRENCY_STORAGE_KEY, importCurrency);
  }, [importCurrency]);

  useEffect(() => {
    localStorage.setItem(IMPORT_USD_RATE_STORAGE_KEY, String(importUsdRate));
  }, [importUsdRate]);

  useEffect(() => {
    localStorage.setItem(EURO_RATE_STORAGE_KEY, String(euroRate));
  }, [euroRate]);

  useEffect(() => {
    localStorage.setItem(EURO_RATE_UPDATED_STORAGE_KEY, euroLastUpdated);
  }, [euroLastUpdated]);

  useEffect(() => {
    if (importItems.length > 0) {
      localStorage.setItem(IMPORT_ITEMS_STORAGE_KEY, JSON.stringify(importItems));
    } else {
      localStorage.removeItem(IMPORT_ITEMS_STORAGE_KEY);
    }
  }, [importItems]);

  useEffect(() => {
    localStorage.setItem(IMPORT_FILE_STORAGE_KEY, importSourceFile);
  }, [importSourceFile]);

  useEffect(() => {
    localStorage.setItem(IMPORT_SHIPPING_STORAGE_KEY, String(shippingCostCLP));
  }, [shippingCostCLP]);

  useEffect(() => {
    localStorage.setItem(IMPORT_SHIPPING_CURRENCY_STORAGE_KEY, shippingCurrency);
  }, [shippingCurrency]);

  useEffect(() => {
    localStorage.setItem(IMPORT_CUSTOMS_STORAGE_KEY, String(customsCostCLP));
  }, [customsCostCLP]);

  useEffect(() => {
    localStorage.setItem(IMPORT_MARGIN_STORAGE_KEY, String(targetGrossMarginPercentImport));
  }, [targetGrossMarginPercentImport]);

  const fetchExchangeRate = async (retries = 2) => {
    setIsLoading(true);
    setFetchError(false);
    try {
      const response = await fetch(`https://mindicador.cl/api/dolar?t=${Date.now()}`);
      if (!response.ok) throw new Error('API Response not OK');

      const data = await response.json();
      if (data.serie && data.serie.length > 0) {
        const rate = data.serie[0].valor;
        const date = new Date(data.serie[0].fecha).toLocaleDateString('es-CL');
        setExchangeRate(rate);
        setLastUpdated(date);
        console.log('Tipo de cambio actualizado:', rate, 'Fecha:', date);
      } else {
        throw new Error('No data in series');
      }
    } catch (error) {
      console.error('Error fetching exchange rate:', error);
      if (retries > 0) {
        console.log(`Retrying fetch... (${retries} left)`);
        setTimeout(() => fetchExchangeRate(retries - 1), 2000);
      } else {
        setFetchError(true);
        // Silent error, no alert()
      }
    } finally {
      setIsLoading(false);
    }
  };

  const fetchEuroRate = async (retries = 2) => {
    setIsLoading(true);
    setEuroFetchError(false);
    try {
      const response = await fetch(`https://mindicador.cl/api/euro?t=${Date.now()}`);
      if (!response.ok) throw new Error('API Response not OK');

      const data = await response.json();
      if (data.serie && data.serie.length > 0) {
        const rate = data.serie[0].valor;
        const date = new Date(data.serie[0].fecha).toLocaleDateString('es-CL');
        setEuroRate(rate);
        setEuroLastUpdated(date);
      } else {
        throw new Error('No data in series');
      }
    } catch (error) {
      console.error('Error fetching euro rate:', error);
      if (retries > 0) {
        setTimeout(() => fetchEuroRate(retries - 1), 2000);
      } else {
        setEuroFetchError(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProducts = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        const mappedProducts: Product[] = data.map(p => ({
          id: p.id,
          sku: p.sku,
          name: p.name,
          category: p.category,
          costUSD: p.cost_usd,
          suggestedPriceUSD: p.msrp_usd
        }));
        setProducts(mappedProducts);
      } else {
        // Fallback to local mock data if DB is empty
        setProducts(initialProducts);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
      setProducts(initialProducts); // Fallback
    } finally {
      setIsLoading(false);
    }
  };

  const syncProductsToSupabase = async () => {
    if (products.length === 0) return;

    const confirmSync = confirm(
      "Esto reemplazará permanentemente el catálogo actual en la base de datos con la lista que acabas de subir. ¿Deseas continuar?"
    );
    if (!confirmSync) return;

    setIsSyncing(true);
    try {
      // 1. Delete all current products for a "Master Replace"
      const { error: deleteError } = await supabase
        .from('products')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete everything

      if (deleteError) throw deleteError;

      const productsToSync = products.map(p => ({
        sku: p.sku,
        name: p.name,
        category: p.category,
        cost_usd: p.costUSD,
        msrp_usd: p.suggestedPriceUSD
      }));

      // 2. Insert new products
      const { error: insertError } = await supabase
        .from('products')
        .insert(productsToSync);

      if (insertError) throw insertError;

      alert('Catálogo maestro actualizado con éxito. El sistema recordará esta lista hasta que subas otra.');
      fetchProducts(); // Refresh list from DB to ensure IDs are synced
    } catch (error) {
      console.error('Detailed Sync error:', error);
      alert('Error al sincronizar: ' + (error as Error).message + '\n\nRevisa la consola del navegador para más detalles.');
    } finally {
      setIsSyncing(false);
    }
  };

  const saveSimulation = async () => {
    if (dealItems.length === 0 || targetSalePrice <= 0) {
      alert('Ingresa una simulación válida antes de guardar.');
      return;
    }

    try {
      const { error } = await supabase
        .from('simulations')
        .insert({
          sale_price_clp: targetSalePrice,
          exchange_rate: exchangeRate,
          total_cost_usd: totalCostUSD,
          total_cost_clp: totalCostCLP,
          margin_percent: grossMarginPercent,
          net_profit_clp: grossMarginValue,
          items: dealItems.map(item => ({
            name: item.product.name,
            qty: item.quantity,
            cost_usd: item.product.costUSD,
            category: item.product.category
          }))
        });

      if (error) throw error;
      alert('Simulación guardada en el historial de Supabase.');
      fetchSavedQuotations(); // Refresh quotations list
    } catch (error) {
      alert('Error al guardar simulación: ' + (error as Error).message);
    }
  };

  const fetchSavedQuotations = async () => {
    setIsLoadingQuotations(true);
    try {
      const { data, error } = await supabase
        .from('simulations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSavedQuotations(data || []);
    } catch (error) {
      console.error('Error fetching quotations:', error);
      alert('Error al cargar cotizaciones: ' + (error as Error).message);
    } finally {
      setIsLoadingQuotations(false);
    }
  };

  // Custom List Management
  const [customCategories, setCustomCategories] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(CUSTOM_CATEGORIES_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((cat): cat is string => typeof cat === 'string' && cat.trim().length > 0);
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(CUSTOM_CATEGORIES_STORAGE_KEY, JSON.stringify(customCategories));
  }, [customCategories]);



  const categories = useMemo(() => {
    const productCats = Array.from(new Set(products.map(p => p.category)));
    // Ensure 'Productos Únicos' is always present along with custom categories
    const merged = new Set([...productCats, ...customCategories, 'Productos Únicos']);
    // Filter out fixed items to control order
    const result = Array.from(merged).filter(c =>
      c !== 'All' &&
      c !== 'Generales' &&
      c !== 'General' &&
      c !== 'Productos Únicos'
    );
    return ['All', 'Generales', ...result.sort(), 'Productos Únicos'];
  }, [products, customCategories]);

  const moveTargetCategories = useMemo(() => {
    const merged = new Set([...products.map(p => p.category), ...customCategories, 'General', 'Productos Únicos']);
    return Array.from(merged).filter(Boolean).sort((a, b) => a.localeCompare(b, 'es'));
  }, [products, customCategories]);

  const createNewList = () => {
    const listName = prompt("Ingresa el nombre de la nueva lista (Categoría):");
    if (listName && listName.trim() !== "") {
      const normalizedName = listName.trim();
      if (!categories.includes(normalizedName)) {
        setCustomCategories(prev => [...new Set([...prev, normalizedName])]);
        alert(`Lista "${normalizedName}" creada. Ahora puedes agregar productos a ella.`);
        setSelectedCategory(normalizedName);
      } else {
        alert("Esa lista ya existe.");
      }
    }
  };

  const deleteQuotation = async (id: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta cotización permanentemente?')) return;

    try {
      const { error } = await supabase
        .from('simulations')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setSavedQuotations(prev => prev.filter(q => q.id !== id));
      alert('Cotización eliminada con éxito.');
    } catch (error) {
      console.error('Error deleting quotation:', error);
      alert('Error al eliminar cotización: ' + (error as Error).message);
    }
  };

  const deleteProduct = async (product: Product) => {
    const isUnique = product.id.startsWith('unique-') || product.sku?.startsWith('UNIQUE-');
    const message = isUnique
      ? `¿Eliminar "${product.name}" permanentemente de la base de datos?`
      : `¿Eliminar "${product.name}" del catálogo? (Esto lo quitará de la base de datos)`;

    if (!confirm(message)) return;

    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', product.id);

      if (error) throw error;

      setProducts(prev => prev.filter(p => p.id !== product.id));
      alert('Producto eliminado con éxito.');
    } catch (error) {
      console.error('Error deleting product:', error);
      alert('Error al eliminar producto: ' + (error as Error).message);
    }
  };

  const createUniqueProduct = async () => {
    if (!newProductName || !newProductCost) {
      alert('Por favor completa nombre y costo');
      return;
    }

    const cost = parseFloat(newProductCost);
    if (isNaN(cost)) {
      alert('El costo debe ser un número válido');
      return;
    }

    // 1. Pre-check locally for duplicate name
    const existing = products.find(p => p.name.toLowerCase() === newProductName.toLowerCase());
    if (existing) {
      alert(`Ya existe un producto con el nombre "${newProductName}". Por favor usa un nombre diferente.`);
      return;
    }

    const newProduct: Product = {
      id: `unique-${Date.now()}`,
      name: newProductName,
      costUSD: cost, // Changed to match local Product interface
      suggestedPriceUSD: cost,
      category: 'Productos Únicos',
      sku: `UNIQUE-${Date.now()}`
    };

    // 2. Optimistic UI update
    setProducts(prev => [newProduct, ...prev]);
    const savedName = newProductName; // Backup for error handling
    setNewProductName('');
    setNewProductCost('');
    setShowCreateProductModal(false);

    // 3. Persist to Supabase
    try {
      const { data, error } = await supabase.from('products').insert([{
        name: newProduct.name,
        cost_usd: newProduct.costUSD,
        category: newProduct.category,
        sku: newProduct.sku,
        msrp_usd: newProduct.suggestedPriceUSD
      }]).select().single();

      if (error) {
        console.error('Error saving unique product to Supabase:', error);

        // Rollback optimistic update
        setProducts(prev => prev.filter(p => p.id !== newProduct.id));

        if (error.code === '23505') {
          alert(`El nombre "${savedName}" ya está en uso. Por favor elige otro.`);
        } else {
          alert('Error al guardar en la base de datos: ' + error.message);
        }

        // Restore modal values for retry
        setNewProductName(savedName);
        setNewProductCost(cost.toString());
        setShowCreateProductModal(true);
      } else if (data) {
        // Update local product with real ID from DB
        setProducts(prev => prev.map(p =>
          p.id === newProduct.id ? { ...p, id: data.id } : p
        ));
      }
    } catch (err) {
      console.error('Exception saving product:', err);
      // Generic rollback
      setProducts(prev => prev.filter(p => p.id !== newProduct.id));
    }

  };

  const moveProductToList = async (product: Product) => {
    setProductToMove(product);
    setTargetMoveCategory(product.category || 'General');
    setShowMoveProductModal(true);
  };

  const confirmMoveProduct = () => {
    if (!productToMove || !targetMoveCategory) return;
    updateProductCategory(productToMove, targetMoveCategory);
    setShowMoveProductModal(false);
    setProductToMove(null);
  };

  const updateProductCategory = async (product: Product, newCategory: string) => {
    try {
      const { error } = await supabase
        .from('products')
        .update({ category: newCategory })
        .eq('id', product.id);

      if (error) throw error;

      // Optimistic update
      setProducts(products.map(p =>
        p.id === product.id ? { ...p, category: newCategory } : p
      ));

      // If currently filtered by the old category, the product will disappear from view, which is expected.
      alert(`Producto movido a "${newCategory}".`);
    } catch (error) {
      console.error('Error moving product:', error);
      alert('Error al mover producto: ' + (error as Error).message);
    }
  };

  const removeProductFromList = async (product: Product) => {
    if (confirm(`¿Quitar "${product.name}" de esta lista? Volverá a la categoría "General".`)) {
      updateProductCategory(product, 'General');
    }
  };

  // Merged derived categories with empty custom ones - Consolidated into 'categories' above

  // Override the old 'categories' variable with this new one in the UI
  // Note: We need to update the useMemo at line 62 to use this logic or replace it.
  // Since I can't easily replace the generic 'categories' variable in the middle of the file without context, 
  // I will assume I replaced the useMemo block above. Wait, I should replace lines 62-65.

  const duplicateQuotation = (quotation: SavedQuotation) => {
    // Convert saved items back to DealItems format
    const recreatedItems: DealItem[] = quotation.items.map((item, index) => ({
      product: {
        id: `restored-${index}`,
        name: item.name,
        sku: '',
        category: item.category || 'Restaurado',
        costUSD: item.cost_usd,
        suggestedPriceUSD: 0
      },
      quantity: item.qty
    }));

    setDealItems(recreatedItems);
    setTargetSalePrice(quotation.sale_price_clp);
    setExchangeRate(quotation.exchange_rate);
    setActiveTab('simulator');
    alert('Cotización cargada. Puedes modificarla y guardarla nuevamente.');
  };

  const calculateIVA = (amount: number): number => {
    return Math.round(amount * 0.19);
  };

  const generateInternalExport = async (quotation: SavedQuotation) => {
    try {
      // Create a temporary element for the quotation
      const tempDiv = document.createElement('div');
      tempDiv.style.cssText = `
        position: absolute;
        left: -9999px;
        width: 800px;
        padding: 40px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        font-family: 'Inter', -apple-system, system-ui, sans-serif;
      `;

      const subtotal = Math.round(quotation.sale_price_clp);
      const iva = Math.round(subtotal * 0.19);
      const total = subtotal + iva;
      const date = new Date(quotation.created_at).toLocaleDateString('es-CL');

      const details = calculatePriceDetails(
        quotation.items.map(item => ({
          product: { name: item.name, category: item.category, costUSD: item.cost_usd } as any,
          quantity: item.qty
        })),
        quotation.sale_price_clp,
        quotation.exchange_rate
      );

      const marginVal = subtotal - quotation.total_cost_clp;
      const flexibleSaleVal = subtotal - details.totalAtCost;
      const displayMarginPercent = flexibleSaleVal > 0 ? (marginVal / flexibleSaleVal) * 100 : 0;

      tempDiv.innerHTML = `
        <div style="background: rgba(255,255,255,0.95); color: #1a1a2e; border-radius: 20px; padding: 30px;">
          <div style="text-align: center; border-bottom: 3px solid #667eea; padding-bottom: 20px; margin-bottom: 30px;">
            <img src="${logoMegaGen}" alt="MegaGen Chile" style="height: 60px; max-width: 100%; object-fit: contain;" />
            <p style="margin: 5px 0 0 0; font-size: 14px; color: #666;">Cotización Financiera</p>
            <p style="margin: 5px 0 0 0; font-size: 12px; color: #999;">Fecha: ${date}</p>
          </div>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
            <thead>
              <tr style="background: #f5f5f5; border-bottom: 2px solid #667eea;">
                <th style="padding: 12px; text-align: left; font-size: 13px;">Producto</th>
                <th style="padding: 12px; text-align: center; font-size: 13px;">Cantidad</th>
                <th style="padding: 12px; text-align: right; font-size: 13px;">Costo USD</th>
              </tr>
            </thead>
            <tbody>
              ${quotation.items.map((item) => {
        const isAtCost = checkIsAtCost({ name: item.name, category: item.category });
        return `
                <tr style="border-bottom: 1px solid #eee;">
                  <td style="padding: 10px; font-size: 12px;">${item.name}${isAtCost ? ' <span style="color:#16a34a; font-weight:bold;">(Al Costo)</span>' : ''}</td>
                  <td style="padding: 10px; text-align: center; font-size: 12px;">${item.qty}</td>
                  <td style="padding: 10px; text-align: right; font-size: 12px;">$${Math.round(item.cost_usd).toLocaleString('en-US')}</td>
                </tr>
              `;
      }).join('')}
            </tbody>
          </table>

          <div style="background: #f9f9f9; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px; border-bottom: 1px dashed #ddd; padding-bottom: 10px;">
              <span style="font-size: 14px; color: #666;">Costo Total (CLP):</span>
              <span style="font-size: 14px; font-weight: 600; color: #666;">$${quotation.total_cost_clp.toLocaleString('es-CL', { maximumFractionDigits: 0 })}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
              <span style="font-size: 14px; color: #666;">Subtotal (sin IVA):</span>
              <span style="font-size: 16px; font-weight: 600;">$${subtotal.toLocaleString('es-CL', { maximumFractionDigits: 0 })}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
              <span style="font-size: 14px; color: #666;">IVA (19%):</span>
              <span style="font-size: 16px; font-weight: 600;">$${iva.toLocaleString('es-CL', { maximumFractionDigits: 0 })}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding-top: 10px; border-top: 2px solid #667eea;">
              <span style="font-size: 18px; font-weight: 700; color: #667eea;">TOTAL (con IVA):</span>
              <span style="font-size: 22px; font-weight: 800; color: #667eea;">$${total.toLocaleString('es-CL', { maximumFractionDigits: 0 })}</span>
            </div>
          </div>

          <div style="background: ${displayMarginPercent >= 50 ? '#dcfce7' : displayMarginPercent >= 30 ? '#fef9c3' : '#fee2e2'}; padding: 15px; border-radius: 12px; text-align: center;">
            <p style="margin: 0; font-size: 12px; color: #666;">Margen Bruto (solo items con utilidad)</p>
            <p style="margin: 5px 0 0 0; font-size: 24px; font-weight: 700; color: ${displayMarginPercent >= 50 ? '#16a34a' : displayMarginPercent >= 30 ? '#ca8a04' : '#dc2626'};">
              ${Math.round(displayMarginPercent)}%
            </p>
          </div>
        </div>
      `;

      document.body.appendChild(tempDiv);

      // Generate image
      const canvas = await html2canvas(tempDiv, {
        backgroundColor: null,
        scale: 2,
        logging: false
      });

      document.body.removeChild(tempDiv);

      // Download the image
      const link = document.createElement('a');
      link.download = `cotizacion-megagen-${date.replace(/\//g, '-')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();

      alert('Imagen de cotización generada. ¡Lista para compartir!');
    } catch (error) {
      console.error('Error generating image:', error);
      alert('Error al generar imagen: ' + (error as Error).message);
    }
  };

  const generateClientExport = async (quotation: SavedQuotation) => {
    try {
      // Create a temporary element for the quotation
      const tempDiv = document.createElement('div');
      tempDiv.style.cssText = `
        position: absolute;
        left: -9999px;
        width: 800px;
        padding: 40px;
        background: white;
        color: #1a1a2e;
        font-family: 'Inter', -apple-system, system-ui, sans-serif;
      `;

      const subtotal = Math.round(quotation.sale_price_clp);
      const iva = Math.round(subtotal * 0.19);
      const total = subtotal + iva;
      const date = new Date(quotation.created_at).toLocaleDateString('es-CL');

      const details = calculatePriceDetails(
        quotation.items.map(item => ({
          product: { name: item.name, category: item.category, costUSD: item.cost_usd } as any,
          quantity: item.qty
        })),
        quotation.sale_price_clp,
        quotation.exchange_rate
      );

      tempDiv.innerHTML = `
        <div style="background: white; padding: 20px;">
          <div style="text-align: center; border-bottom: 3px solid #667eea; padding-bottom: 20px; margin-bottom: 30px;">
            <img src="${logoMegaGen}" alt="MegaGen Chile" style="height: 60px; max-width: 100%; object-fit: contain;" />
            <p style="margin: 5px 0 0 0; font-size: 14px; color: #666;">Cotización Formal</p>
            <p style="margin: 5px 0 0 0; font-size: 12px; color: #999;">Fecha: ${date}</p>
          </div>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
            <thead>
              <tr style="background: #f8fafc; border-bottom: 2px solid #667eea;">
                <th style="padding: 12px; text-align: left; font-size: 13px; color: #475569;">Producto</th>
                <th style="padding: 12px; text-align: center; font-size: 13px; color: #475569;">Cantidad</th>
                <th style="padding: 12px; text-align: right; font-size: 13px; color: #475569;">Precio Unit. (Neto)</th>
                <th style="padding: 12px; text-align: right; font-size: 13px; color: #475569;">Total (Neto)</th>
              </tr>
            </thead>
            <tbody>
              ${details.items.map((item) => {
        const unitPriceCLP = item.unitPriceNet;
        const lineTotalCLP = item.totalPriceNet;

        return `
                <tr style="border-bottom: 1px solid #eee;">
                  <td style="padding: 10px; font-size: 12px; color: #334155;">${item.product.name}</td>
                  <td style="padding: 10px; text-align: center; font-size: 12px; color: #334155;">${item.quantity}</td>
                  <td style="padding: 10px; text-align: right; font-size: 12px; color: #334155;">$${Math.round(unitPriceCLP).toLocaleString('es-CL', { maximumFractionDigits: 0 })}</td>
                  <td style="padding: 10px; text-align: right; font-size: 12px; font-weight: 600; color: #334155;">$${Math.round(lineTotalCLP).toLocaleString('es-CL', { maximumFractionDigits: 0 })}</td>
                </tr>
              `;
      }).join('')}
            </tbody>
          </table>

          <div style="display: flex; justify-content: flex-end;">
            <div style="width: 280px; background: #f8fafc; padding: 20px; border-radius: 12px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                <span style="font-size: 14px; color: #64748b;">Neto:</span>
                <span style="font-size: 16px; font-weight: 600; color: #334155;">$${subtotal.toLocaleString('es-CL', { maximumFractionDigits: 0 })}</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                <span style="font-size: 14px; color: #64748b;">IVA (19%):</span>
                <span style="font-size: 16px; font-weight: 600; color: #334155;">$${iva.toLocaleString('es-CL', { maximumFractionDigits: 0 })}</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding-top: 10px; border-top: 2px solid #667eea; margin-top: 10px;">
                <span style="font-size: 18px; font-weight: 700; color: #667eea;">TOTAL:</span>
                <span style="font-size: 22px; font-weight: 800; color: #667eea;">$${total.toLocaleString('es-CL', { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
          </div>

          <div style="margin-top: 40px; text-align: center; font-size: 10px; color: #94a3b8;">
            <p>Cotización válida por 15 días. Precios sujetos a disponibilidad de stock.</p>
          </div>
        </div>
      `;

      document.body.appendChild(tempDiv);

      // Generate image
      const canvas = await html2canvas(tempDiv, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false
      });

      document.body.removeChild(tempDiv);

      // Download the image
      const link = document.createElement('a');
      link.download = `cotizacion-cliente-${date.replace(/\//g, '-')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();

      alert('Cotización para cliente generada (Precios Netos + IVA).');
    } catch (error) {
      console.error('Error generating image:', error);
      alert('Error al generar imagen: ' + (error as Error).message);
    }
  };

  const clearDeal = () => {
    if (dealItems.length === 0) return;
    if (confirm('¿Estás seguro de que deseas limpiar la simulación actual?')) {
      setDealItems([]);
      setTargetSalePrice(0);
    }
  };

  const calculatePriceDetails = (items: DealItem[], salePrice: number, rate: number) => {
    const atCostItems = items.filter(i => checkIsAtCost({ name: i.product.name, category: i.product.category }));
    const flexItems = items.filter(i => !checkIsAtCost({ name: i.product.name, category: i.product.category }));

    const totalAtCost = atCostItems.reduce((acc, i) => acc + (i.product.costUSD * i.quantity * rate), 0);
    const totalFlexCost = flexItems.reduce((acc, i) => acc + (i.product.costUSD * i.quantity * rate), 0);

    const multiplier = totalFlexCost > 0 ? Math.max(0, (salePrice - totalAtCost) / totalFlexCost) : 1;

    const mappedItems = items.map(i => {
      const isAtCost = checkIsAtCost({ name: i.product.name, category: i.product.category });
      const unitPrice = i.product.costUSD * rate * (isAtCost ? 1 : multiplier);
      return {
        ...i,
        unitPriceNet: unitPrice,
        totalPriceNet: unitPrice * i.quantity,
        isAtCost
      };
    });

    return {
      items: mappedItems,
      totalCostCLP: (totalAtCost + totalFlexCost),
      multiplier,
      totalAtCost,
      totalFlexCost
    };
  };

  const filteredProducts = useMemo(() => {
    const searchWords = normalizeText(searchTerm).split(/\s+/).filter(w => w.length > 0);

    return products.filter(p => {
      const matchesCategory = selectedCategory === 'All'
        || (selectedCategory === 'Generales' && (p.category === 'General' || p.category === 'Generales'))
        || p.category === selectedCategory;
      if (!matchesCategory) return false;

      if (searchWords.length === 0) return true;

      const searchableText = normalizeText(`${p.name} ${p.sku || ''} ${p.category}`);
      return searchWords.every(word => searchableText.includes(word));
    });
  }, [products, searchTerm, selectedCategory]);

  const totalCostUSD = useMemo(() => {
    return dealItems.reduce((acc, item) => acc + (item.product.costUSD * item.quantity), 0);
  }, [dealItems]);

  const totalCostCLP = useMemo(() => {
    return totalCostUSD * exchangeRate;
  }, [totalCostUSD, exchangeRate]);

  const priceDetails = useMemo(() => {
    return calculatePriceDetails(dealItems, targetSalePrice, exchangeRate);
  }, [dealItems, targetSalePrice, exchangeRate]);

  // Auto-calculate the price needed for 50% margin
  const suggested50PercentPrice = useMemo(() => {
    // Target 50% margin ONLY on flexible items, then add fixed costs
    const flexibleSaleAt50 = priceDetails.totalFlexCost / 0.5;
    return flexibleSaleAt50 + priceDetails.totalAtCost;
  }, [priceDetails.totalFlexCost, priceDetails.totalAtCost]);

  const grossMarginValue = useMemo(() => {
    return targetSalePrice - totalCostCLP;
  }, [targetSalePrice, totalCostCLP]);

  const grossMarginPercent = useMemo(() => {
    if (targetSalePrice <= 0) return 0;
    return (grossMarginValue / targetSalePrice) * 100;
  }, [grossMarginValue, targetSalePrice]);

  // Auto-update targetSalePrice when deal items change (only if current price is 0)
  useEffect(() => {
    if (dealItems.length > 0 && targetSalePrice === 0) {
      setTargetSalePrice(Math.round(suggested50PercentPrice));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealItems.length, suggested50PercentPrice]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const uploadBatchId = Date.now();
      const rawProducts = await parseFile(file);
      const newProducts: Product[] = rawProducts.map((p, index) => ({
        id: `upl-${uploadBatchId}-${index}`,
        sku: p.sku,
        name: p.name,
        category: p.category,
        costUSD: p.costUSD,
        suggestedPriceUSD: p.msrpUSD
      }));
      setProducts(newProducts);
      setDealItems([]);
    } catch (error) {
      alert('Error al procesar el archivo: ' + (error as Error).message);
    }
  };

  const handleAnalysisFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const summary = await parseCashFlowFile(file);
      setCashFlowSummary(summary);
      setAnalysisSourceFile(file.name);
    } catch (error) {
      alert('Error al procesar movimientos de caja: ' + (error as Error).message);
    }
  };

  const handleSalesFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const summary = await parseDailySalesFile(file);
      setDailySalesSummary(summary);
      setSalesSourceFile(file.name);
    } catch (error) {
      alert('Error al procesar ventas del día: ' + (error as Error).message);
    }
  };

  const handleImportFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const items = await parseImportProductsFile(file);
      setImportItems(items);
      setImportSourceFile(file.name);
    } catch (error) {
      alert('Error al procesar archivo de importaciones: ' + (error as Error).message);
    }
  };

  const formatImportCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: importCurrency,
      maximumFractionDigits: 2
    }).format(value);
  };

  const copyKoreaReport = async () => {
    try {
      await navigator.clipboard.writeText(koreaCopyText);
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 1500);
    } catch {
      alert('No fue posible copiar automáticamente. Puedes copiar el texto manualmente.');
    }
  };

  const copyMetricValue = async (key: string, value: number, decimals = 2) => {
    try {
      await navigator.clipboard.writeText(value.toFixed(decimals));
      setCopiedMetricKey(key);
      setTimeout(() => setCopiedMetricKey(''), 1200);
    } catch {
      alert('No fue posible copiar al portapapeles.');
    }
  };

  const downloadImportCalculation = () => {
    if (!importCalculatedItems.length) {
      alert('Primero carga un archivo de importaciones.');
      return;
    }

    const headerRow = 12;
    const dataStartRow = headerRow + 1;
    const dataEndRow = dataStartRow + importItems.length - 1;
    const totalRow = dataEndRow + 1;
    const hRange = `$H$${dataStartRow}:$H$${dataEndRow}`;

    const summaryRows: Array<Array<string | number>> = [
      ['Resumen Costos de Importacion'],
      ['Archivo fuente', importSourceFile || '-'],
      ['USD Importacion (CLP)', Number(importUsdRate.toFixed(4))],
      ['EUR (CLP)', Number(euroRate.toFixed(4))],
      ['Moneda flete', shippingCurrency],
      ['Gasto envio original', Number(shippingCostCLP.toFixed(4))],
      ['Gasto envio convertido CLP', ''],
      ['Gasto aduana (CLP)', Math.round(customsCostCLP)],
      ['Margen bruto objetivo (%)', Number(targetGrossMarginPercentImport.toFixed(2))],
      [''],
      ['Tabla de productos y precios calculados'],
      ['SKU', 'Producto', 'Cantidad', 'Moneda', 'Costo Unitario Moneda', 'Costo Total Moneda', 'Tipo Cambio CLP', 'Costo Base CLP', 'Flete Asignado CLP', 'Aduana Asignada CLP', 'Costo Puesto Chile Total CLP', 'Costo Puesto Chile Unit CLP', 'Precio Venta Neto Unit CLP', 'Precio Venta Unit con IVA CLP'],
    ];

    const dataRows = importItems.map((item) => ([
      item.sku,
      item.name,
      item.quantity,
      importCurrency,
      Number(item.unitCost.toFixed(4)),
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]));

    const totalRowData: Array<string | number | null> = [
      'TOTAL',
      '',
      null,
      '',
      '',
      null,
      '',
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ];

    const worksheet = XLSX.utils.aoa_to_sheet([...summaryRows, ...dataRows, totalRowData]);

    worksheet.B7 = {
      t: 'n',
      f: '=IF(B5="USD",B6*B3,IF(B5="EUR",B6*B4,B6))'
    };

    for (let i = 0; i < importItems.length; i += 1) {
      const row = dataStartRow + i;
      worksheet[`F${row}`] = { t: 'n', f: `=C${row}*E${row}` };
      worksheet[`G${row}`] = { t: 'n', f: `=IF(D${row}="USD",$B$3,IF(D${row}="EUR",$B$4,1))` };
      worksheet[`H${row}`] = { t: 'n', f: `=F${row}*G${row}` };
      worksheet[`I${row}`] = { t: 'n', f: `=IF(SUM(${hRange})=0,0,$B$7*H${row}/SUM(${hRange}))` };
      worksheet[`J${row}`] = { t: 'n', f: `=IF(SUM(${hRange})=0,0,$B$8*H${row}/SUM(${hRange}))` };
      worksheet[`K${row}`] = { t: 'n', f: `=H${row}+I${row}+J${row}` };
      worksheet[`L${row}`] = { t: 'n', f: `=IF(C${row}=0,0,K${row}/C${row})` };
      worksheet[`M${row}`] = { t: 'n', f: `=IF(1-$B$9/100<=0,L${row},L${row}/(1-$B$9/100))` };
      worksheet[`N${row}`] = { t: 'n', f: `=M${row}*1.19` };
    }

    worksheet[`C${totalRow}`] = { t: 'n', f: `=SUM(C${dataStartRow}:C${dataEndRow})` };
    worksheet[`F${totalRow}`] = { t: 'n', f: `=SUM(F${dataStartRow}:F${dataEndRow})` };
    worksheet[`H${totalRow}`] = { t: 'n', f: `=SUM(H${dataStartRow}:H${dataEndRow})` };
    worksheet[`I${totalRow}`] = { t: 'n', f: `=SUM(I${dataStartRow}:I${dataEndRow})` };
    worksheet[`J${totalRow}`] = { t: 'n', f: `=SUM(J${dataStartRow}:J${dataEndRow})` };
    worksheet[`K${totalRow}`] = { t: 'n', f: `=SUM(K${dataStartRow}:K${dataEndRow})` };
    worksheet[`L${totalRow}`] = { t: 'n', f: `=IF(C${totalRow}=0,0,K${totalRow}/C${totalRow})` };
    worksheet[`M${totalRow}`] = { t: 'n', f: `=IF(C${totalRow}=0,0,SUMPRODUCT(M${dataStartRow}:M${dataEndRow},C${dataStartRow}:C${dataEndRow})/C${totalRow})` };
    worksheet[`N${totalRow}`] = { t: 'n', f: `=IF(C${totalRow}=0,0,SUMPRODUCT(N${dataStartRow}:N${dataEndRow},C${dataStartRow}:C${dataEndRow})/C${totalRow})` };

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Importaciones');
    const fileStamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `importaciones-calculadas-${fileStamp}.xlsx`);
  };

  const addItem = (product: Product) => {
    const isAtCost = checkIsAtCost({ name: product.name, category: product.category });
    const existing = dealItems.find(item => item.product.id === product.id);

    if (existing) {
      setDealItems(dealItems.map(item =>
        item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
      ));
    } else {
      setDealItems([...dealItems, { product, quantity: 1 }]);
    }

    if (isAtCost) {
      setTargetSalePrice(prev => prev + (product.costUSD * exchangeRate));
    }
  };

  const removeItem = (productId: string) => {
    const item = dealItems.find(i => i.product.id === productId);
    if (item && checkIsAtCost({ name: item.product.name, category: item.product.category })) {
      setTargetSalePrice(prev => Math.max(0, prev - (item.product.costUSD * item.quantity * exchangeRate)));
    }
    setDealItems(dealItems.filter(item => item.product.id !== productId));
  };

  const updateQuantity = (productId: string, quantity: number) => {
    const item = dealItems.find(i => i.product.id === productId);
    if (item && checkIsAtCost({ name: item.product.name, category: item.product.category })) {
      const diff = quantity - item.quantity;
      setTargetSalePrice(prev => Math.max(0, prev + (diff * item.product.costUSD * exchangeRate)));
    }
    if (quantity <= 0) {
      setDealItems(dealItems.filter(existingItem => existingItem.product.id !== productId));
      return;
    }

    setDealItems(dealItems.map(existingItem =>
      existingItem.product.id === productId ? { ...existingItem, quantity } : existingItem
    ));
  };

  const formatCLP = (value: number) => {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value);
  };

  const formatUSD = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
  };

  const formatKUSD = (value: number) => `${value.toFixed(2)} K USD`;

  const cashFlowMetrics = useMemo(() => {
    if (!cashFlowSummary || exchangeRate <= 0) return null;

    const toUSD = (valueCLP: number) => valueCLP / exchangeRate;
    const toKUSD = (valueCLP: number) => toUSD(valueCLP) / 1000;

    return {
      incomeUSD: toUSD(cashFlowSummary.totalIncomeCLP),
      expenseUSD: toUSD(cashFlowSummary.totalExpenseCLP),
      beginningBalanceUSD: toUSD(cashFlowSummary.beginningBalanceCLP),
      endingBalanceUSD: toUSD(cashFlowSummary.endingBalanceCLP),
      incomeKUSD: toKUSD(cashFlowSummary.totalIncomeCLP),
      expenseKUSD: toKUSD(cashFlowSummary.totalExpenseCLP),
      beginningBalanceKUSD: toKUSD(cashFlowSummary.beginningBalanceCLP),
      endingBalanceKUSD: toKUSD(cashFlowSummary.endingBalanceCLP),
    };
  }, [cashFlowSummary, exchangeRate]);

  const salesMetrics = useMemo(() => {
    if (!dailySalesSummary || exchangeRate <= 0) return null;

    const salesUSD = dailySalesSummary.totalSalesCLPExcludingDispatch / exchangeRate;
    const salesKUSD = salesUSD / 1000;
    const costUSD = dailySalesSummary.totalCostCLPExcludingDispatch / exchangeRate;
    const costKUSD = costUSD / 1000;

    return {
      salesUSD,
      salesKUSD,
      costUSD,
      costKUSD,
    };
  }, [dailySalesSummary, exchangeRate]);

  const importFxRate = importCurrency === 'USD' ? importUsdRate : euroRate;
  const shippingCostInCLP = useMemo(() => {
    if (shippingCurrency === 'USD') return shippingCostCLP * importUsdRate;
    if (shippingCurrency === 'EUR') return shippingCostCLP * euroRate;
    return shippingCostCLP;
  }, [shippingCostCLP, shippingCurrency, importUsdRate, euroRate]);

  const importCalculatedItems = useMemo<ImportItemCalculated[]>(() => {
    if (!importItems.length || importFxRate <= 0) return [];

    const baseRows = importItems.map((item) => {
      const baseTotalForeign = item.quantity * item.unitCost;
      const baseTotalCLP = baseTotalForeign * importFxRate;
      return {
        ...item,
        baseTotalForeign,
        baseTotalCLP,
      };
    });

    const baseTotalAllCLP = baseRows.reduce((acc, row) => acc + row.baseTotalCLP, 0);
    const marginRatio = Math.min(0.99, Math.max(0, targetGrossMarginPercentImport / 100));
    const divisor = 1 - marginRatio;

    return baseRows.map((row) => {
      const weight = baseTotalAllCLP > 0 ? row.baseTotalCLP / baseTotalAllCLP : 0;
      const shippingCLPAllocated = shippingCostInCLP * weight;
      const customsCLPAllocated = customsCostCLP * weight;
      const landedTotalCLP = row.baseTotalCLP + shippingCLPAllocated + customsCLPAllocated;
      const landedUnitCLP = row.quantity > 0 ? landedTotalCLP / row.quantity : 0;
      const suggestedNetUnitCLP = divisor > 0 ? landedUnitCLP / divisor : landedUnitCLP;
      const suggestedIvaUnitCLP = suggestedNetUnitCLP * 1.19;

      return {
        ...row,
        shippingCLPAllocated,
        customsCLPAllocated,
        landedTotalCLP,
        landedUnitCLP,
        suggestedNetUnitCLP,
        suggestedIvaUnitCLP,
      };
    });
  }, [importItems, importFxRate, shippingCostInCLP, customsCostCLP, targetGrossMarginPercentImport]);

  const importTotals = useMemo(() => {
    const baseForeign = importCalculatedItems.reduce((acc, row) => acc + row.baseTotalForeign, 0);
    const baseCLP = importCalculatedItems.reduce((acc, row) => acc + row.baseTotalCLP, 0);
    const landedCLP = importCalculatedItems.reduce((acc, row) => acc + row.landedTotalCLP, 0);
    const suggestedNetCLP = importCalculatedItems.reduce((acc, row) => acc + (row.suggestedNetUnitCLP * row.quantity), 0);
    const suggestedIvaCLP = importCalculatedItems.reduce((acc, row) => acc + (row.suggestedIvaUnitCLP * row.quantity), 0);
    const totalQty = importCalculatedItems.reduce((acc, row) => acc + row.quantity, 0);
    return {
      baseForeign,
      baseCLP,
      landedCLP,
      suggestedNetCLP,
      suggestedIvaCLP,
      totalQty,
    };
  }, [importCalculatedItems]);

  const dayLabel = useMemo(() => {
    if (!reportDate) return 'Today';
    const date = new Date(`${reportDate}T00:00:00`);
    if (Number.isNaN(date.getTime())) return reportDate;
    return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  }, [reportDate]);

  const percent = (actual: number, target: number) => {
    if (!target) return 0;
    return (actual / target) * 100;
  };

  const formatNumber = (value: number, decimals = 2) => value.toFixed(decimals);
  const formatPercentNumber = (value: number) => `${Math.round(value)}%`;

  const koreaCopyRows = useMemo(() => {
    const salesActualKUSD = salesMetrics?.salesKUSD ?? 0;
    const collectionActualKUSD = cashFlowMetrics?.incomeKUSD ?? 0;
    const fxActualEA = dailySalesSummary?.totalImplants ?? 0;
    const beginningBalanceKUSD = cashFlowMetrics?.beginningBalanceKUSD ?? 0;
    const cashInKUSD = cashFlowMetrics?.incomeKUSD ?? 0;
    const cashOutKUSD = cashFlowMetrics?.expenseKUSD ?? 0;
    const remainingBalanceKUSD = cashFlowMetrics?.endingBalanceKUSD ?? 0;

    return [
      ['Sales', 'Target (K USD)', formatNumber(salesTargetKUSD), ''],
      ['Sales', 'Actual (K USD)', formatNumber(salesActualKUSD), formatNumber(salesActualKUSD)],
      ['Sales', 'Achievement Rate (%)', formatPercentNumber(percent(salesActualKUSD, salesTargetKUSD)), ''],
      ['Sales', 'Growth Rate (%)', '#DIV/0!', ''],
      ['Collection', 'Target (K USD)', formatNumber(collectionTargetKUSD), ''],
      ['Collection', 'Actual (K USD)', formatNumber(collectionActualKUSD), formatNumber(collectionActualKUSD)],
      ['Collection', 'Achievement Rate (%)', formatPercentNumber(percent(collectionActualKUSD, collectionTargetKUSD)), ''],
      ['Collection', 'Growth Rate (%)', '#DIV/0!', ''],
      ['FX Sales', 'Target (EA)', formatNumber(fxSalesTargetEA, 0), ''],
      ['FX Sales', 'Actual (EA)', formatNumber(fxActualEA, 0), formatNumber(fxActualEA, 0)],
      ['FX Sales', 'Achievement Rate (%)', formatPercentNumber(percent(fxActualEA, fxSalesTargetEA)), ''],
      ['FX Sales', 'Growth Rate (%)', '#DIV/0!', ''],
      ['Cash Flow', 'Beginning Balance (K USD)', formatNumber(beginningBalanceKUSD), formatNumber(beginningBalanceKUSD)],
      ['Cash Flow', 'Cash-in (K USD)', formatNumber(cashInKUSD), formatNumber(cashInKUSD)],
      ['Cash Flow', 'Cash-out (K USD)', formatNumber(cashOutKUSD), formatNumber(cashOutKUSD)],
      ['Cash Flow', 'Remaining Balance (K USD)', formatNumber(remainingBalanceKUSD), formatNumber(remainingBalanceKUSD)],
      ['HQ Payment', 'Target (K USD)', formatNumber(hqPaymentTargetKUSD), ''],
      ['HQ Payment', 'Actual (K USD)', formatNumber(hqPaymentActualKUSD), formatNumber(hqPaymentActualKUSD)],
      ['HQ Payment', 'Achievement Rate (%)', formatPercentNumber(percent(hqPaymentActualKUSD, hqPaymentTargetKUSD)), ''],
      ['HQ Payment', 'Growth Rate (%)', '#DIV/0!', ''],
      ['HQ Credit', 'Target (K USD)', formatNumber(hqCreditTargetKUSD), ''],
      ['HQ Credit', 'Actual (K USD)', formatNumber(hqCreditActualKUSD), formatNumber(hqCreditActualKUSD)],
    ];
  }, [
    salesMetrics,
    cashFlowMetrics,
    dailySalesSummary,
    salesTargetKUSD,
    collectionTargetKUSD,
    fxSalesTargetEA,
    hqPaymentTargetKUSD,
    hqPaymentActualKUSD,
    hqCreditTargetKUSD,
    hqCreditActualKUSD,
  ]);

  const koreaCopyText = useMemo(() => {
    const header = ['Sorting', 'Description', 'Accum.', dayLabel];
    const lines = [header.join('\t'), ...koreaCopyRows.map((row) => row.join('\t'))];
    return lines.join('\n');
  }, [koreaCopyRows, dayLabel]);

  const parseInputNumber = (rawValue: string): number | null => {
    const normalized = rawValue.trim().replace(',', '.');
    if (!normalized) return 0;
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) return null;
    return parsed;
  };

  const handleNetSalePriceChange = (rawValue: string) => {
    const parsed = parseInputNumber(rawValue);
    if (parsed === null) return;
    setTargetSalePrice(Math.max(0, Math.round(parsed)));
  };

  const handleSalePriceWithIvaChange = (rawValue: string) => {
    const parsedGross = parseInputNumber(rawValue);
    if (parsedGross === null) return;
    const netPrice = parsedGross / 1.19;
    setTargetSalePrice(Math.max(0, Math.round(netPrice)));
  };

  const modules: Array<{
    key: ModuleKey;
    name: string;
    description: string;
    icon: React.ReactNode;
    isReady: boolean;
  }> = [
      {
        key: 'cotizador',
        name: 'Cotizador',
        description: 'Simulación de márgenes, historial y exportaciones.',
        icon: <Calculator size={18} />,
        isReady: true
      },
      {
        key: 'analysis',
        name: 'Análisis Diario',
        description: 'Consolidado operativo y reporte para HQ Korea.',
        icon: <LineChart size={18} />,
        isReady: true
      },
      {
        key: 'imports',
        name: 'Importaciones',
        description: 'Costo puesto en Chile, margen y precios de venta.',
        icon: <Ship size={18} />,
        isReady: true
      },
      {
        key: 'crm',
        name: 'CRM Comercial',
        description: 'Pipeline, oportunidades y seguimiento de cuentas.',
        icon: <BriefcaseBusiness size={18} />,
        isReady: false
      },
      {
        key: 'clientes',
        name: 'Gestión de Clientes',
        description: 'Fichas, contactos, estado y asignaciones.',
        icon: <Users size={18} />,
        isReady: false
      },
      {
        key: 'facturacion',
        name: 'Facturación',
        description: 'Documentos, pagos y control de cobranza.',
        icon: <ReceiptText size={18} />,
        isReady: false
      }
    ];
  const selectedModule = modules.find((module) => module.key === activeModule);

  return (
    <div className="app-container">
      <section className="modules-shell">
        <div className="modules-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <LayoutGrid size={18} />
            <div>
              <strong style={{ fontSize: '1rem' }}>Plataforma MegaGen</strong>
              <div className="text-muted" style={{ fontSize: '0.78rem' }}>Módulos operativos y próximos lanzamientos</div>
            </div>
          </div>
          <div className="global-rate-box">
            <div className="text-muted" style={{ fontSize: '0.68rem' }}>
              {fetchError ? 'ERROR DOLAR' : 'USD/CLP GLOBAL'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <input
                type="number"
                className="input-field"
                style={{ width: '95px', fontWeight: '700', padding: '0.35rem 0.45rem', textAlign: 'right' }}
                value={exchangeRate}
                onChange={(e) => setExchangeRate(parseFloat(e.target.value) || 0)}
              />
              <button
                onClick={() => fetchExchangeRate()}
                className="btn-icon"
                style={{ padding: '0.35rem', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', borderRadius: '6px', border: '1px solid var(--border)' }}
                title="Actualizar tipo de cambio"
              >
                <RefreshCw size={14} className={isLoading ? "text-muted animate-spin" : fetchError ? "text-error" : "text-muted"} style={{ color: fetchError ? 'var(--error)' : '' }} />
              </button>
            </div>
            {lastUpdated && (
              <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                Actualizado: {lastUpdated}
              </div>
            )}
          </div>
        </div>
        <div className="modules-grid">
          {modules.map((module) => (
            <button
              key={module.key}
              type="button"
              className={`module-card ${activeModule === module.key ? 'module-card-active' : ''}`}
              onClick={() => setActiveModule(module.key)}
            >
              <div className="module-card-title">
                {module.icon}
                <span>{module.name}</span>
              </div>
              <p style={{ fontSize: '0.8rem', marginTop: '0.5rem', color: 'var(--text-muted)', textAlign: 'left' }}>
                {module.description}
              </p>
              <span className={`module-state ${module.isReady ? 'module-state-ready' : 'module-state-soon'}`}>
                {module.isReady ? 'Disponible' : 'Próximamente'}
              </span>
            </button>
          ))}
        </div>
      </section>

      {activeModule === 'cotizador' ? (
        <>
          <header className="header">
        <div className="logo-group">
          <img src={logoMegaGen} alt="MegaGen Logo" style={{ height: '40px', objectFit: 'contain' }} />
          <div>
            <h1 style={{ display: 'none' }}>MegaGen Chile</h1>
            <p className="text-muted">Finance Deal Analyzer v2.6 (Supabase Cloud)</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>
            <Upload size={14} /> Importar
          </button>

          <button
            className="btn btn-secondary"
            style={{ background: 'var(--success)', color: 'white' }}
            onClick={syncProductsToSupabase}
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

      {/* Tab Navigation */}
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
          {/* Left Column: Product Selection */}
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

            <div style={{ marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
              {categories.map(cat => (
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

            {/* Create Product Modal */}
            {showCreateProductModal && (
              <div style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
              }}>
                <div style={{ background: '#1e1e1e', padding: '2rem', borderRadius: '12px', width: '90%', maxWidth: '400px', border: '1px solid var(--text-muted)' }}>
                  <h3 style={{ marginBottom: '1.5rem' }}>Nuevo Producto Único</h3>

                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Nombre del Item</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Ej: Pasaje Aéreo, Curso Especial"
                      value={newProductName}
                      onChange={(e) => setNewProductName(e.target.value)}
                      autoFocus
                    />
                  </div>

                  <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Costo (USD)</label>
                    <input
                      type="number"
                      className="input-field"
                      placeholder="0.00"
                      value={newProductCost}
                      onChange={(e) => setNewProductCost(e.target.value)}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                    <button className="btn" onClick={() => setShowCreateProductModal(false)}>Cancelar</button>
                    <button className="btn btn-primary" onClick={createUniqueProduct}>Crear Item</button>
                  </div>
                </div>
              </div>
            )}

            {/* Move Product Modal */}
            {showMoveProductModal && productToMove && (
              <div style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
              }}>
                <div style={{ background: '#1e1e1e', padding: '2rem', borderRadius: '12px', width: '90%', maxWidth: '420px', border: '1px solid var(--text-muted)' }}>
                  <h3 style={{ marginBottom: '1rem' }}>Mover Producto</h3>
                  <p style={{ marginBottom: '1rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                    Selecciona la lista destino para <strong style={{ color: '#fff' }}>{productToMove.name}</strong>.
                  </p>

                  <div style={{ marginBottom: '1.5rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Lista destino</label>
                    <select
                      className="input-field"
                      value={targetMoveCategory}
                      onChange={(e) => setTargetMoveCategory(e.target.value)}
                    >
                      {moveTargetCategories.map(category => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                    <button
                      className="btn"
                      onClick={() => {
                        setShowMoveProductModal(false);
                        setProductToMove(null);
                      }}
                    >
                      Cancelar
                    </button>
                    <button className="btn btn-primary" onClick={confirmMoveProduct}>
                      Mover
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div style={{ maxHeight: '550px', overflowY: 'auto', paddingRight: '0.5rem' }}>
              {filteredProducts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px' }}>
                  <Search size={40} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                  <p className="text-muted">No se encontraron productos.</p>
                  <button
                    className="btn"
                    style={{ marginTop: '1rem', fontSize: '0.8rem', background: 'rgba(255,255,255,0.1)' }}
                    onClick={() => { setSearchTerm(''); setSelectedCategory('All'); }}
                  >
                    Limpiar filtros
                  </button>
                </div>
              ) : (
                filteredProducts.map(product => (
                  <div key={product.id} className="finance-card" style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        className="btn"
                        style={{ padding: '0.4rem', background: 'rgba(255,255,255,0.1)', color: 'var(--text-muted)' }}
                        onClick={() => moveProductToList(product)}
                        title="Mover a otra lista"
                      >
                        <ArrowRight size={14} />
                      </button>

                      {selectedCategory !== 'All' && selectedCategory !== 'General' && product.category === selectedCategory && (
                        <button
                          className="btn"
                          style={{ padding: '0.4rem', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--error)' }}
                          onClick={() => removeProductFromList(product)}
                          title="Quitar de esta lista"
                        >
                          <X size={14} />
                        </button>
                      )}

                      {selectedCategory !== 'All' && (
                        <button
                          className="btn"
                          style={{ padding: '0.4rem', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--error)' }}
                          onClick={() => deleteProduct(product)}
                          title="Eliminar permanentemente"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}

                      <button className="btn btn-primary" style={{ padding: '0.4rem' }} onClick={() => addItem(product)}>
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                )))}
            </div>
          </div>

          {/* Right Column: Deal Summary & Margin */}
          <div>
            <div className="glass card" style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Calculator size={18} /> Simulación de Negocio
                </h3>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn" style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--error)', fontSize: '0.75rem' }} onClick={clearDeal}>
                    <Trash2 size={14} /> Limpiar
                  </button>
                  <button className="btn btn-primary" style={{ background: 'var(--secondary)', fontSize: '0.75rem' }} onClick={saveSimulation}>
                    <Save size={14} /> Guardar Deal
                  </button>
                </div>
              </div>

              <div className="table-container" style={{ maxHeight: '280px' }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: '30%' }}>Producto</th>
                      <th style={{ width: '10%', textAlign: 'center' }}>Cant.</th>
                      <th style={{ width: '15%', textAlign: 'right' }}>Unit. Ref</th>
                      <th style={{ width: '15%', textAlign: 'right' }}>Total Ref</th>
                      <th style={{ width: '15%', textAlign: 'right' }}>Costo Real</th>
                      <th style={{ width: '15%', textAlign: 'center' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priceDetails.items.map(item => {
                      const unitPriceRef = item.unitPriceNet;
                      const totalPriceRef = item.totalPriceNet;
                      const isAtCost = item.isAtCost;
                      const realCost = item.product.costUSD * item.quantity * exchangeRate;

                      return (
                        <tr key={item.product.id}>
                          <td style={{ fontSize: '0.75rem' }}>{item.product.name}</td>
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="number"
                              className="input-field"
                              style={{ width: '50px', padding: '0.2rem', textAlign: 'center' }}
                              value={item.quantity}
                              onChange={(e) => updateQuantity(item.product.id, parseInt(e.target.value) || 0)}
                            />
                          </td>
                          <td style={{ textAlign: 'right', fontSize: '0.85rem', color: isAtCost ? 'var(--success)' : 'var(--primary)', fontWeight: '600' }}>
                            {formatCLP(unitPriceRef)}
                          </td>
                          <td style={{ textAlign: 'right', fontSize: '0.85rem', color: isAtCost ? 'var(--success)' : 'var(--primary)', fontWeight: '600' }}>
                            {formatCLP(totalPriceRef)}
                          </td>
                          <td style={{ textAlign: 'right', fontSize: '0.85rem' }}>
                            {formatCLP(realCost)}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button onClick={() => removeItem(item.product.id)} style={{ background: 'transparent', border: 'none', color: 'var(--error)', cursor: 'pointer', padding: '0.2rem' }}>
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {dealItems.length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '1.5rem' }} className="text-muted">
                          Selecciona items del catálogo
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: '1.5rem', padding: '1.25rem', background: 'rgba(0,0,0,0.2)', borderRadius: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                    <DollarSign size={12} /> PRECIO DE VENTA DE LA OFERTA (CLP)
                  </label>
                  {dealItems.length > 0 && (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        className="btn"
                        style={{ fontSize: '0.65rem', padding: '0.25rem 0.5rem', background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.1)' }}
                        onClick={() => setTargetSalePrice(Math.round(totalCostCLP))}
                        title="Aplicar precio al costo (0% margen)"
                      >
                        Venta al Costo
                      </button>
                      <button
                        className="btn"
                        style={{ fontSize: '0.65rem', padding: '0.25rem 0.5rem', background: 'rgba(74, 222, 128, 0.1)', color: 'var(--success)' }}
                        onClick={() => setTargetSalePrice(Math.round(suggested50PercentPrice))}
                        title="Aplicar precio con 50% de margen"
                      >
                        50% → {formatCLP(Math.round(suggested50PercentPrice))}
                      </button>
                    </div>
                  )}
                </div>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '10px', fontWeight: 'bold', color: 'var(--success)' }}>$</span>
                  <input
                    type="number"
                    className="input-field"
                    style={{ paddingLeft: '28px', fontSize: '1.25rem', fontWeight: 'bold' }}
                    value={targetSalePrice}
                    onChange={(e) => handleNetSalePriceChange(e.target.value)}
                  />
                </div>
                {targetSalePrice > 0 && (
                  <div style={{ marginTop: '0.3rem', textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem' }}>
                    <span>Total con IVA:</span>
                    <div style={{ position: 'relative', width: '120px' }}>
                      <span style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', fontWeight: 'bold', color: '#fff' }}>$</span>
                      <input
                        type="number"
                        className="input-field"
                        style={{
                          width: '100%',
                          paddingLeft: '20px',
                          paddingRight: '5px',
                          textAlign: 'right',
                          fontWeight: '600',
                          color: '#fff',
                          background: 'rgba(255,255,255,0.1)',
                          border: '1px solid rgba(255,255,255,0.2)'
                        }}
                        value={Math.round(targetSalePrice * 1.19)}
                        onChange={(e) => handleSalePriceWithIvaChange(e.target.value)}
                      />
                    </div>
                  </div>
                )}
                {dealItems.length > 0 && targetSalePrice > 0 && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>Tu margen actual:</span>
                    <span className={grossMarginPercent >= 50 ? 'positive' : grossMarginPercent >= 30 ? 'warning' : 'negative'} style={{ fontWeight: 'bold' }}>
                      {Math.round(grossMarginPercent)}%
                    </span>
                  </div>
                )}

                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Percent size={12} /> CALCULAR PRECIO POR MARGEN OBJETIVO
                    </div>
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input
                        type="number"
                        placeholder="Ej: 40"
                        className="input-field"
                        style={{ paddingRight: '25px', width: '100%' }}
                        onChange={(e) => {
                          const margin = parseFloat(e.target.value);
                          if (!isNaN(margin) && margin > 0 && margin < 100 && priceDetails.totalFlexCost > 0) {
                            const newPrice = (priceDetails.totalFlexCost / (1 - (margin / 100))) + priceDetails.totalAtCost;
                            setTargetSalePrice(Math.round(newPrice));
                          }
                        }}
                      />
                      <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '0.8rem' }}>%</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', maxWidth: '160px', lineHeight: '1.2' }}>
                      Ingresa un % y el precio se ajustará automáticamente.
                    </div>
                  </div>
                </div>

                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginTop: '1rem' }}>
                  <div className="finance-card" style={{ padding: '0.75rem' }}>
                    <div className="text-muted" style={{ fontSize: '0.6rem' }}>COSTO TOTAL</div>
                    <div style={{ fontSize: '1rem', fontWeight: 'bold' }}>{formatCLP(totalCostCLP)}</div>
                    <div className="text-muted" style={{ fontSize: '0.55rem' }}>USD: {formatUSD(totalCostUSD)}</div>
                  </div>
                  <div className="finance-card" style={{ padding: '0.75rem' }}>
                    <div className="text-muted" style={{ fontSize: '0.6rem' }}>INGRESO BRUTO</div>
                    <div style={{ fontSize: '1rem', fontWeight: 'bold' }}>{formatCLP(targetSalePrice)}</div>
                  </div>
                  <div className="finance-card" style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <div className="text-muted" style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>TOTAL CON IVA</div>
                    <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#fff' }}>{formatCLP(targetSalePrice * 1.19)}</div>
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

              <div className="grid" style={{ gridTemplateColumns: '1.2fr 0.8fr', gap: '1.25rem' }}>
                <div>
                  <div className="text-muted" style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}>MARGEN BRUTO (%)</div>
                  <div style={{ fontSize: '2.2rem', fontWeight: '800' }} className={grossMarginPercent >= 50 ? 'positive' : grossMarginPercent >= 30 ? 'warning' : 'negative'}>
                    {grossMarginPercent.toFixed(1)}%
                  </div>
                  <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', marginTop: '0.75rem', overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.min(100, Math.max(0, grossMarginPercent))}%`,
                      height: '100%',
                      background: grossMarginPercent >= 50 ? 'var(--success)' : grossMarginPercent >= 30 ? 'var(--warning)' : 'var(--error)',
                      borderRadius: '4px',
                      transition: 'width 0.4s ease-out',
                    }}></div>
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
        </div >
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
                  <button
                    className="btn btn-primary"
                    style={{ marginTop: '1rem' }}
                    onClick={() => setActiveTab('simulator')}
                  >
                    Crear una cotización
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {savedQuotations.map((quotation) => {
                    const subtotal = quotation.sale_price_clp;
                    const iva = calculateIVA(subtotal);
                    const total = subtotal + iva;
                    const date = new Date(quotation.created_at).toLocaleDateString('es-CL', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    });

                    return (
                      <div key={quotation.id} className="finance-card" style={{ padding: '1.5rem' }}>
                        <div className="mobile-stack" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '2rem', flexWrap: 'wrap' }}>

                          {/* Left Group: Financials AND Products */}
                          <div className="mobile-full-width" style={{ flex: 1, minWidth: '300px' }}>
                            <div className="finance-summary-grid" style={{ display: 'flex', gap: '2rem', alignItems: 'center', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                              <div>
                                <div className="text-muted" style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>Total con IVA</div>
                                <div style={{ fontSize: '1.8rem', fontWeight: '800', color: 'var(--success)' }}>{formatCLP(total)}</div>
                              </div>
                              <div>
                                <div className="text-muted" style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>Margen Bruto</div>
                                <div
                                  style={{ fontSize: '1.8rem', fontWeight: '800' }}
                                  className={quotation.margin_percent >= 50 ? 'positive' : quotation.margin_percent >= 30 ? 'warning' : 'negative'}
                                >
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

                            {/* Prominent Product List */}
                            <div>
                              <div className="text-muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '0.75rem', letterSpacing: '1px' }}>Productos Incluidos ({quotation.items.length})</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {quotation.items.map((item, idx) => (
                                  <div
                                    key={idx}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '1rem',
                                      background: 'rgba(255,255,255,0.03)',
                                      padding: '0.75rem 1rem',
                                      borderRadius: '8px',
                                      border: '1px solid rgba(255,255,255,0.05)'
                                    }}
                                  >
                                    <div className="badge" style={{ fontSize: '1.1rem', padding: '0.3rem 0.8rem', background: 'var(--primary)', color: 'white' }}>
                                      {item.qty}
                                    </div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: '500', flex: 1 }}>{item.name}</div>
                                    <div className="text-muted" style={{ fontSize: '0.9rem' }}>${Math.round(item.cost_usd)} USD</div>
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

                          {/* Right Group: Actions */}
                          <div className="mobile-full-width" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <button
                              className="btn btn-secondary mobile-full-width"
                              style={{ background: 'var(--primary)', whiteSpace: 'nowrap', fontSize: '0.85rem', padding: '0.6rem 1rem' }}
                              onClick={() => duplicateQuotation(quotation)}
                              title="Cargar esta cotización en el simulador"
                            >
                              <Copy size={16} style={{ marginRight: '0.5rem' }} /> Duplicar
                            </button>
                            <button
                              className="btn btn-secondary mobile-full-width"
                              style={{ background: 'var(--success)', whiteSpace: 'nowrap', fontSize: '0.85rem', padding: '0.6rem 1rem' }}
                              onClick={() => generateInternalExport(quotation)}
                              title="Descargar imagen interna (con costos y margenes)"
                            >
                              <ImageIcon size={16} style={{ marginRight: '0.5rem' }} /> Exportar (Interno)
                            </button>
                            <button
                              className="btn btn-secondary mobile-full-width"
                              style={{ background: '#3b82f6', whiteSpace: 'nowrap', fontSize: '0.85rem', padding: '0.6rem 1rem', color: 'white' }}
                              onClick={() => generateClientExport(quotation)}
                              title="Descargar imagen para cliente (sin costos)"
                            >
                              <ImageIcon size={16} style={{ marginRight: '0.5rem' }} /> Exportar (Cliente)
                            </button>
                            <button
                              className="btn btn-secondary mobile-full-width"
                              style={{ background: 'var(--error)', whiteSpace: 'nowrap', fontSize: '0.85rem', padding: '0.6rem 1rem', color: 'white', marginTop: 'auto' }}
                              onClick={() => deleteQuotation(quotation.id)}
                              title="Eliminar esta cotización"
                            >
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
          </div >
        )
      }
        </>
      ) : activeModule === 'imports' ? (
        <section className="glass card" style={{ marginTop: '1rem', textAlign: 'left' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
            <div>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                <Ship size={22} /> Cálculo de Importaciones
              </h2>
              <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                Carga productos y calcula costo puesto en Chile, precio neto sugerido y precio con IVA.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={() => importFileInputRef.current?.click()}>
                <FileSpreadsheet size={14} /> Cargar Archivo de Importación
              </button>
              <input
                type="file"
                ref={importFileInputRef}
                style={{ display: 'none' }}
                accept=".xlsx,.xls,.csv"
                onChange={handleImportFileUpload}
              />
              <button className="btn" onClick={downloadImportCalculation} style={{ background: 'var(--accent)', color: 'white' }}>
                <Download size={14} /> Descargar Archivo Final
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gap: '0.9rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: '1rem' }}>
            <div className="finance-card">
              <div className="text-muted" style={{ fontSize: '0.7rem', marginBottom: '0.45rem' }}>MONEDA DE COSTO</div>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button
                  className="btn"
                  style={{ background: importCurrency === 'USD' ? 'var(--primary)' : 'var(--surface)', color: importCurrency === 'USD' ? 'white' : 'var(--text)' }}
                  onClick={() => setImportCurrency('USD')}
                >
                  USD
                </button>
                <button
                  className="btn"
                  style={{ background: importCurrency === 'EUR' ? 'var(--primary)' : 'var(--surface)', color: importCurrency === 'EUR' ? 'white' : 'var(--text)' }}
                  onClick={() => setImportCurrency('EUR')}
                >
                  EUR
                </button>
              </div>
            </div>

            <div className="finance-card">
              <div className="text-muted" style={{ fontSize: '0.7rem', marginBottom: '0.45rem' }}>VALOR USD IMPORTACIÓN (CLP)</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <input
                  type="number"
                  className="input-field"
                  style={{ width: '100px', textAlign: 'right' }}
                  value={importUsdRate}
                  onChange={(e) => setImportUsdRate(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="text-muted" style={{ fontSize: '0.68rem', marginTop: '0.3rem' }}>
                Aislado del USD global.
              </div>
            </div>

            <div className="finance-card">
              <div className="text-muted" style={{ fontSize: '0.7rem', marginBottom: '0.45rem' }}>VALOR EURO (CLP)</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <input
                  type="number"
                  className="input-field"
                  style={{ width: '100px', textAlign: 'right' }}
                  value={euroRate}
                  onChange={(e) => setEuroRate(parseFloat(e.target.value) || 0)}
                />
                <button className="btn" onClick={() => fetchEuroRate()} style={{ padding: '0.45rem 0.55rem' }} title="Actualizar euro mercado">
                  <RefreshCw size={14} className={isLoading ? "text-muted animate-spin" : "text-muted"} />
                </button>
              </div>
              <div className="text-muted" style={{ fontSize: '0.68rem', marginTop: '0.3rem' }}>
                {euroFetchError ? 'Error actualizando euro' : `Actualizado: ${euroLastUpdated || 'manual'}`}
              </div>
            </div>

            <label className="finance-card" style={{ display: 'block' }}>
              <div className="text-muted" style={{ fontSize: '0.7rem', marginBottom: '0.45rem' }}>COSTO TOTAL FLETE</div>
              <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.45rem' }}>
                <button
                  type="button"
                  className="btn"
                  style={{ padding: '0.3rem 0.5rem', fontSize: '0.72rem', background: shippingCurrency === 'CLP' ? 'var(--primary)' : 'var(--surface)', color: shippingCurrency === 'CLP' ? 'white' : 'var(--text)' }}
                  onClick={() => setShippingCurrency('CLP')}
                >
                  CLP
                </button>
                <button
                  type="button"
                  className="btn"
                  style={{ padding: '0.3rem 0.5rem', fontSize: '0.72rem', background: shippingCurrency === 'USD' ? 'var(--primary)' : 'var(--surface)', color: shippingCurrency === 'USD' ? 'white' : 'var(--text)' }}
                  onClick={() => setShippingCurrency('USD')}
                >
                  USD
                </button>
                <button
                  type="button"
                  className="btn"
                  style={{ padding: '0.3rem 0.5rem', fontSize: '0.72rem', background: shippingCurrency === 'EUR' ? 'var(--primary)' : 'var(--surface)', color: shippingCurrency === 'EUR' ? 'white' : 'var(--text)' }}
                  onClick={() => setShippingCurrency('EUR')}
                >
                  EUR
                </button>
              </div>
              <input
                type="number"
                className="input-field"
                value={shippingCostCLP}
                onChange={(e) => setShippingCostCLP(parseFloat(e.target.value) || 0)}
              />
              <div className="text-muted" style={{ fontSize: '0.68rem', marginTop: '0.3rem' }}>
                Equivalente CLP para cálculo: {formatCLP(shippingCostInCLP)}
              </div>
            </label>

            <label className="finance-card" style={{ display: 'block' }}>
              <div className="text-muted" style={{ fontSize: '0.7rem', marginBottom: '0.45rem' }}>COSTO TOTAL ADUANA (CLP)</div>
              <input
                type="number"
                className="input-field"
                value={customsCostCLP}
                onChange={(e) => setCustomsCostCLP(parseFloat(e.target.value) || 0)}
              />
            </label>

            <label className="finance-card" style={{ display: 'block' }}>
              <div className="text-muted" style={{ fontSize: '0.7rem', marginBottom: '0.45rem' }}>MARGEN BRUTO OBJETIVO (%)</div>
              <input
                type="number"
                className="input-field"
                value={targetGrossMarginPercentImport}
                onChange={(e) => setTargetGrossMarginPercentImport(parseFloat(e.target.value) || 0)}
              />
            </label>
          </div>

          <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', marginBottom: '1rem' }}>
            <div className="finance-card">
              <div className="text-muted" style={{ fontSize: '0.68rem' }}>TOTAL BASE ({importCurrency})</div>
              <div style={{ fontWeight: 800, fontSize: '1.15rem' }}>{formatImportCurrency(importTotals.baseForeign)}</div>
            </div>
            <div className="finance-card">
              <div className="text-muted" style={{ fontSize: '0.68rem' }}>TOTAL COSTO PUESTO CHILE (CLP)</div>
              <div style={{ fontWeight: 800, fontSize: '1.15rem' }}>{formatCLP(importTotals.landedCLP)}</div>
            </div>
            <div className="finance-card">
              <div className="text-muted" style={{ fontSize: '0.68rem' }}>TOTAL VENTA NETA SUGERIDA (CLP)</div>
              <div style={{ fontWeight: 800, fontSize: '1.15rem' }}>{formatCLP(importTotals.suggestedNetCLP)}</div>
            </div>
            <div className="finance-card">
              <div className="text-muted" style={{ fontSize: '0.68rem' }}>TOTAL VENTA CON IVA (CLP)</div>
              <div style={{ fontWeight: 800, fontSize: '1.15rem' }}>{formatCLP(importTotals.suggestedIvaCLP)}</div>
            </div>
          </div>

          {importCalculatedItems.length > 0 ? (
            <>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Producto</th>
                      <th style={{ textAlign: 'right' }}>Cant.</th>
                      <th style={{ textAlign: 'right' }}>Costo Unit ({importCurrency})</th>
                      <th style={{ textAlign: 'right' }}>Costo Total ({importCurrency})</th>
                      <th style={{ textAlign: 'right' }}>Base CLP</th>
                      <th style={{ textAlign: 'right' }}>Flete CLP</th>
                      <th style={{ textAlign: 'right' }}>Aduana CLP</th>
                      <th style={{ textAlign: 'right' }}>Costo Puesto Unit CLP</th>
                      <th style={{ textAlign: 'right' }}>Venta Neta Unit CLP</th>
                      <th style={{ textAlign: 'right' }}>Venta Unit c/IVA CLP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importCalculatedItems.map((item, idx) => (
                      <tr key={`${item.sku}-${idx}`}>
                        <td>{item.sku}</td>
                        <td>{item.name}</td>
                        <td style={{ textAlign: 'right' }}>{item.quantity}</td>
                        <td style={{ textAlign: 'right' }}>{formatImportCurrency(item.unitCost)}</td>
                        <td style={{ textAlign: 'right' }}>{formatImportCurrency(item.baseTotalForeign)}</td>
                        <td style={{ textAlign: 'right' }}>{formatCLP(item.baseTotalCLP)}</td>
                        <td style={{ textAlign: 'right' }}>{formatCLP(item.shippingCLPAllocated)}</td>
                        <td style={{ textAlign: 'right' }}>{formatCLP(item.customsCLPAllocated)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatCLP(item.landedUnitCLP)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>{formatCLP(item.suggestedNetUnitCLP)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--success)' }}>{formatCLP(item.suggestedIvaUnitCLP)}</td>
                      </tr>
                    ))}
                    <tr style={{ background: 'rgba(0, 167, 233, 0.08)' }}>
                      <td style={{ fontWeight: 800 }}>TOTAL</td>
                      <td style={{ fontWeight: 800 }}>-</td>
                      <td style={{ textAlign: 'right', fontWeight: 800 }}>{importTotals.totalQty}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800 }}>-</td>
                      <td style={{ textAlign: 'right', fontWeight: 800 }}>{formatImportCurrency(importTotals.baseForeign)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800 }}>{formatCLP(importTotals.baseCLP)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800 }}>{formatCLP(shippingCostInCLP)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800 }}>{formatCLP(customsCostCLP)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800 }}>{formatCLP(importTotals.totalQty > 0 ? importTotals.landedCLP / importTotals.totalQty : 0)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800 }}>{formatCLP(importTotals.totalQty > 0 ? importTotals.suggestedNetCLP / importTotals.totalQty : 0)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800 }}>{formatCLP(importTotals.totalQty > 0 ? importTotals.suggestedIvaCLP / importTotals.totalQty : 0)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="text-muted" style={{ fontSize: '0.78rem', marginTop: '0.6rem' }}>
                Archivo: <strong>{importSourceFile}</strong> | Productos: {importCalculatedItems.length} | Moneda: {importCurrency} | Tipo de cambio aplicado: {importFxRate.toFixed(2)} CLP
              </div>
            </>
          ) : (
            <div style={{ padding: '1rem', border: '1px dashed var(--border)', borderRadius: '12px', background: 'var(--surface)' }}>
              Carga un archivo de importación con columnas de SKU, nombre, cantidad y costo para calcular precios.
            </div>
          )}
        </section>
      ) : activeModule === 'analysis' ? (
        <section className="glass card" style={{ marginTop: '1rem', textAlign: 'left' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            <div>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <LineChart size={22} /> Daily Report - HQ Analysis
              </h2>
              <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                Carga movimientos bancarios y ventas del día para construir el informe diario de Chile en K USD.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
              <button className="btn btn-primary" onClick={() => analysisFileInputRef.current?.click()}>
                <FileSpreadsheet size={14} /> Cargar Movimientos
              </button>
              <input
                type="file"
                ref={analysisFileInputRef}
                style={{ display: 'none' }}
                accept=".xlsx,.xls"
                onChange={handleAnalysisFileUpload}
              />
              <button className="btn btn-primary" style={{ background: 'var(--secondary)' }} onClick={() => salesFileInputRef.current?.click()}>
                <FileSpreadsheet size={14} /> Cargar Ventas del Día
              </button>
              <input
                type="file"
                ref={salesFileInputRef}
                style={{ display: 'none' }}
                accept=".xlsx,.xls"
                onChange={handleSalesFileUpload}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gap: '1.25rem' }}>
            <div className="finance-card" style={{ padding: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.8rem' }}>
                <h3 style={{ fontSize: '1rem' }}>Bloque Copia Directa para Excel HQ</h3>
                <button className="btn btn-primary" onClick={copyKoreaReport}>
                  {copiedReport ? 'Copiado' : 'Copiar tabla para Korea'}
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.6rem', marginBottom: '0.8rem' }}>
                <label style={{ fontSize: '0.75rem' }}>Fecha reporte
                  <input type="date" className="input-field" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
                </label>
                <label style={{ fontSize: '0.75rem' }}>Sales Target (K USD)
                  <input type="number" className="input-field" value={salesTargetKUSD} onChange={(e) => setSalesTargetKUSD(parseFloat(e.target.value) || 0)} />
                </label>
                <label style={{ fontSize: '0.75rem' }}>Collection Target (K USD)
                  <input type="number" className="input-field" value={collectionTargetKUSD} onChange={(e) => setCollectionTargetKUSD(parseFloat(e.target.value) || 0)} />
                </label>
                <label style={{ fontSize: '0.75rem' }}>FX Sales Target (EA)
                  <input type="number" className="input-field" value={fxSalesTargetEA} onChange={(e) => setFxSalesTargetEA(parseFloat(e.target.value) || 0)} />
                </label>
                <label style={{ fontSize: '0.75rem' }}>HQ Payment Target (K USD)
                  <input type="number" className="input-field" value={hqPaymentTargetKUSD} onChange={(e) => setHqPaymentTargetKUSD(parseFloat(e.target.value) || 0)} />
                </label>
                <label style={{ fontSize: '0.75rem' }}>HQ Payment Actual (K USD)
                  <input type="number" className="input-field" value={hqPaymentActualKUSD} onChange={(e) => setHqPaymentActualKUSD(parseFloat(e.target.value) || 0)} />
                </label>
                <label style={{ fontSize: '0.75rem' }}>HQ Credit Target (K USD)
                  <input type="number" className="input-field" value={hqCreditTargetKUSD} onChange={(e) => setHqCreditTargetKUSD(parseFloat(e.target.value) || 0)} />
                </label>
                <label style={{ fontSize: '0.75rem' }}>HQ Credit Actual (K USD)
                  <input type="number" className="input-field" value={hqCreditActualKUSD} onChange={(e) => setHqCreditActualKUSD(parseFloat(e.target.value) || 0)} />
                </label>
              </div>
              <textarea
                className="input-field"
                style={{ minHeight: '180px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: '0.78rem' }}
                readOnly
                value={koreaCopyText}
              />
              <div className="text-muted" style={{ marginTop: '0.5rem', fontSize: '0.75rem' }}>
                Copia y pega directo en Excel. El formato es TSV (columnas separadas por tabulación).
              </div>
            </div>

            <div className="finance-card" style={{ padding: '1rem' }}>
              <h3 style={{ fontSize: '1rem', marginBottom: '0.8rem' }}>Copia Rápida de Índices</h3>
              <div style={{ display: 'grid', gap: '0.55rem' }}>
                {[
                  {
                    key: 'sales_actual_kusd',
                    label: 'Sales - Actual (K USD)',
                    value: salesMetrics?.salesKUSD ?? 0,
                    decimals: 2,
                  },
                  {
                    key: 'collection_actual_kusd',
                    label: 'Collection - Actual (K USD) / Cash-in',
                    value: cashFlowMetrics?.incomeKUSD ?? 0,
                    decimals: 2,
                  },
                  {
                    key: 'fx_actual_ea',
                    label: 'FX Sales - Actual (EA)',
                    value: dailySalesSummary?.totalImplants ?? 0,
                    decimals: 0,
                  },
                  {
                    key: 'cash_out_kusd',
                    label: 'Cash Flow - Cash-out (K USD)',
                    value: cashFlowMetrics?.expenseKUSD ?? 0,
                    decimals: 2,
                  },
                ].map((metric) => (
                  <div key={metric.key} style={{
                    display: 'grid',
                    gridTemplateColumns: '1.4fr auto auto',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.45rem 0.55rem',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    background: '#fff'
                  }}>
                    <div style={{ fontSize: '0.82rem' }}>{metric.label}</div>
                    <button
                      className="btn"
                      style={{ fontSize: '0.85rem', padding: '0.25rem 0.45rem', background: 'var(--surface)', border: '1px solid var(--border)' }}
                      onClick={() => copyMetricValue(metric.key, metric.value, metric.decimals)}
                      title="Copiar valor"
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
                        justifyContent: 'center'
                      }}
                      onClick={() => copyMetricValue(metric.key, metric.value, metric.decimals)}
                      title="Click para copiar"
                    >
                      {copiedMetricKey === metric.key ? 'Copiado' : metric.value.toFixed(metric.decimals)}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {cashFlowSummary && cashFlowMetrics ? (
              <div style={{ display: 'grid', gap: '1rem' }}>
                <h3 style={{ fontSize: '1rem' }}>Cash Flow (sin cambios)</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                  <div className="finance-card">
                    <div className="text-muted" style={{ fontSize: '0.68rem' }}>CASH-IN TOTAL</div>
                    <div style={{ fontWeight: 800, fontSize: '1.25rem' }}>{formatKUSD(cashFlowMetrics.incomeKUSD)}</div>
                    <div className="text-muted" style={{ fontSize: '0.75rem' }}>{formatUSD(cashFlowMetrics.incomeUSD)}</div>
                  </div>
                  <div className="finance-card">
                    <div className="text-muted" style={{ fontSize: '0.68rem' }}>CASH-OUT TOTAL</div>
                    <div style={{ fontWeight: 800, fontSize: '1.25rem' }}>{formatKUSD(cashFlowMetrics.expenseKUSD)}</div>
                    <div className="text-muted" style={{ fontSize: '0.75rem' }}>{formatUSD(cashFlowMetrics.expenseUSD)}</div>
                  </div>
                  <div className="finance-card">
                    <div className="text-muted" style={{ fontSize: '0.68rem' }}>SALDO FINAL</div>
                    <div style={{ fontWeight: 800, fontSize: '1.25rem' }}>{formatKUSD(cashFlowMetrics.endingBalanceKUSD)}</div>
                    <div className="text-muted" style={{ fontSize: '0.75rem' }}>{formatUSD(cashFlowMetrics.endingBalanceUSD)}</div>
                  </div>
                </div>
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Sorting</th>
                        <th>Description</th>
                        <th style={{ textAlign: 'right' }}>Accum. (K USD)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Cash Flow</td>
                        <td>Beginning Balance (K USD)</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatKUSD(cashFlowMetrics.beginningBalanceKUSD)}</td>
                      </tr>
                      <tr>
                        <td>Cash Flow</td>
                        <td>Cash-in (K USD)</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--success)' }}>{formatKUSD(cashFlowMetrics.incomeKUSD)}</td>
                      </tr>
                      <tr>
                        <td>Cash Flow</td>
                        <td>Cash-out (K USD)</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--error)' }}>{formatKUSD(cashFlowMetrics.expenseKUSD)}</td>
                      </tr>
                      <tr>
                        <td>Cash Flow</td>
                        <td>Remaining Balance (K USD)</td>
                        <td style={{ textAlign: 'right', fontWeight: 800 }}>{formatKUSD(cashFlowMetrics.endingBalanceKUSD)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="text-muted" style={{ fontSize: '0.78rem' }}>
                  Archivo: <strong>{analysisSourceFile}</strong> | Movimientos: {cashFlowSummary.movementCount} | Rango: {cashFlowSummary.dateFrom || '-'} a {cashFlowSummary.dateTo || '-'} | Dólar aplicado: {exchangeRate}
                </div>
              </div>
            ) : (
              <div style={{ padding: '1rem', border: '1px dashed var(--border)', borderRadius: '12px', background: 'var(--surface)' }}>
                Carga un archivo de movimientos para calcular automáticamente Cash-in/Cash-out en K USD.
              </div>
            )}

            {dailySalesSummary && salesMetrics ? (
              <div style={{ display: 'grid', gap: '1rem' }}>
                <h3 style={{ fontSize: '1rem' }}>Sales del Día (sin despacho)</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                  <div className="finance-card">
                    <div className="text-muted" style={{ fontSize: '0.68rem' }}>VENTA TOTAL SIN DESPACHO</div>
                    <div style={{ fontWeight: 800, fontSize: '1.25rem' }}>{formatKUSD(salesMetrics.salesKUSD)}</div>
                    <div className="text-muted" style={{ fontSize: '0.75rem' }}>{formatUSD(salesMetrics.salesUSD)}</div>
                  </div>
                  <div className="finance-card">
                    <div className="text-muted" style={{ fontSize: '0.68rem' }}>COSTO TOTAL SIN DESPACHO</div>
                    <div style={{ fontWeight: 800, fontSize: '1.25rem' }}>{formatKUSD(salesMetrics.costKUSD)}</div>
                    <div className="text-muted" style={{ fontSize: '0.75rem' }}>{formatUSD(salesMetrics.costUSD)}</div>
                  </div>
                  <div className="finance-card">
                    <div className="text-muted" style={{ fontSize: '0.68rem' }}>IMPLANTES TOTALES</div>
                    <div style={{ fontWeight: 800, fontSize: '1.25rem' }}>{dailySalesSummary.totalImplants.toFixed(0)}</div>
                    <div className="text-muted" style={{ fontSize: '0.75rem' }}>Unidades</div>
                  </div>
                </div>
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Implante</th>
                        <th style={{ textAlign: 'right' }}>Cantidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr><td>XPEED AnyRidge Internal Fixture [AR]</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{dailySalesSummary.implantsByModel.AR}</td></tr>
                      <tr><td>AnyOne Internal Fixture [AO]</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{dailySalesSummary.implantsByModel.AO}</td></tr>
                      <tr><td>ST Internal Fixture [ST]</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{dailySalesSummary.implantsByModel.ST}</td></tr>
                      <tr><td>BLUEDIAMOND IMPLANT [BD]</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{dailySalesSummary.implantsByModel.BD}</td></tr>
                      <tr><td>Mini Internal Fixture [MN]</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{dailySalesSummary.implantsByModel.MN}</td></tr>
                      <tr><td>ARi ExCon Implant [ARiE]</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{dailySalesSummary.implantsByModel.ARiE}</td></tr>
                      <tr><td><strong>Total Implantes</strong></td><td style={{ textAlign: 'right', fontWeight: 800 }}>{dailySalesSummary.totalImplants}</td></tr>
                    </tbody>
                  </table>
                </div>
                <div className="text-muted" style={{ fontSize: '0.78rem' }}>
                  Archivo: <strong>{salesSourceFile}</strong> | Registros: {dailySalesSummary.movementCount} | Rango: {dailySalesSummary.dateFrom || '-'} a {dailySalesSummary.dateTo || '-'} | Dólar aplicado: {exchangeRate}
                </div>
              </div>
            ) : (
              <div style={{ padding: '1rem', border: '1px dashed var(--border)', borderRadius: '12px', background: 'var(--surface)' }}>
                Carga el archivo de ventas para contar implantes por modelo y calcular venta total sin despacho en K USD.
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="glass card" style={{ marginTop: '1rem', textAlign: 'left' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            {selectedModule?.icon}
            {selectedModule?.name}
          </h2>
          <p className="text-muted" style={{ marginBottom: '1rem' }}>
            Este módulo quedará integrado en esta misma plataforma. El cotizador ya funciona como módulo independiente.
          </p>
          <div style={{
            padding: '1rem',
            borderRadius: '12px',
            border: '1px dashed var(--border)',
            background: 'var(--surface)'
          }}>
            <strong>Base lista:</strong> navegación por módulos, estado por módulo y layout común para escalar nuevas áreas.
          </div>
        </section>
      )}
    </div >
  );
};

export default App;
