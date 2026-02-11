import React, { useState, useMemo, useRef, useEffect } from 'react';
// Force refresh - Fixed JSX Structure
import { initialProducts } from './data/mockProducts';
import type { Product } from './data/mockProducts';
import { parseFile } from './utils/fileParser';
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
  X
} from 'lucide-react';

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
  items: Array<{ name: string; qty: number; cost_usd: number }>;
}

const App: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [dealItems, setDealItems] = useState<DealItem[]>([]);
  const [targetSalePrice, setTargetSalePrice] = useState<number>(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [exchangeRate, setExchangeRate] = useState<number>(950);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Quotations Manager State
  const [activeTab, setActiveTab] = useState<'simulator' | 'history'>('simulator');
  const [savedQuotations, setSavedQuotations] = useState<SavedQuotation[]>([]);
  const [isLoadingQuotations, setIsLoadingQuotations] = useState(false);

  // Manual Product Creation
  const [showCreateProductModal, setShowCreateProductModal] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductCost, setNewProductCost] = useState('');



  const normalizeText = (text: string) => {
    return text.toString().toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  };

  // Fetch products and exchange rate on mount
  useEffect(() => {
    fetchProducts();
    fetchExchangeRate();

    // Refresh exchange rate every 30 minutes if page is left open
    const interval = setInterval(fetchExchangeRate, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch quotations when switching to history tab
  useEffect(() => {
    if (activeTab === 'history') {
      fetchSavedQuotations();
    }
  }, [activeTab]);

  const [lastUpdated, setLastUpdated] = useState<string>('');

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
            cost_usd: item.product.costUSD
          }))
        });

      if (error) throw error;
      alert('Simulación guardada en el historial de Supabase.');
      fetchExchangeRate(); // Refresh rate on save
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
  const [customCategories, setCustomCategories] = useState<string[]>([]);



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

  const createNewList = () => {
    const listName = prompt("Ingresa el nombre de la nueva lista (Categoría):");
    if (listName && listName.trim() !== "") {
      const normalizedName = listName.trim();
      if (!categories.includes(normalizedName)) {
        setCustomCategories([...customCategories, normalizedName]);
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
    const targetList = prompt(`Mover "${product.name}" a qué lista?\n\nListas disponibles:\n${categories.filter(c => c !== 'All').join('\n')}`);

    if (targetList && categories.includes(targetList)) {
      updateProductCategory(product, targetList);
    } else if (targetList) {
      // Allow creating on the fly if user types a new name
      if (confirm(`La lista "${targetList}" no existe. ¿Deseas crearla y mover el producto ahí?`)) {
        setCustomCategories([...customCategories, targetList]);
        updateProductCategory(product, targetList);
      }
    }
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
        category: 'Restaurado',
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

      // Recalculate refined margin for display
      const totalAtCostVal = quotation.items.reduce((acc, item) =>
        item.name.toLowerCase().includes('item especial') || item.name.toLowerCase().includes('manual')
          ? acc + (item.cost_usd * item.qty * quotation.exchange_rate)
          : acc, 0);
      const marginVal = subtotal - quotation.total_cost_clp;
      const flexibleSaleVal = subtotal - totalAtCostVal;
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
        const isItemEspecial = item.name.toLowerCase().includes('item especial') || item.name.toLowerCase().includes('manual');
        return `
                <tr style="border-bottom: 1px solid #eee;">
                  <td style="padding: 10px; font-size: 12px;">${item.name}${isItemEspecial ? ' <span style="color:#16a34a; font-weight:bold;">(Al Costo)</span>' : ''}</td>
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

      // Calculate multipliers based on special items (at cost)
      const totalAtCostCLP = quotation.items.reduce((acc, item) =>
        (item.name.toLowerCase().includes('item especial') || item.name.toLowerCase().includes('manual'))
          ? acc + (item.cost_usd * item.qty * quotation.exchange_rate)
          : acc, 0);

      const totalFlexibleCostCLP = quotation.items.reduce((acc, item) =>
        !(item.name.toLowerCase().includes('item especial') || item.name.toLowerCase().includes('manual'))
          ? acc + (item.cost_usd * item.qty * quotation.exchange_rate)
          : acc, 0);

      const flexMultiplier = totalFlexibleCostCLP > 0
        ? (quotation.sale_price_clp - totalAtCostCLP) / totalFlexibleCostCLP
        : 1;

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
              ${quotation.items.map((item) => {
        // Derive CORRECT unit price based on cost * multiplier
        const isItemEspecial = item.name.toLowerCase().includes('item especial') || item.name.toLowerCase().includes('manual');
        const itemMultiplier = isItemEspecial ? 1 : flexMultiplier;
        const unitCostCLP = item.cost_usd * quotation.exchange_rate;
        const unitPriceCLP = unitCostCLP * itemMultiplier;
        const lineTotalCLP = unitPriceCLP * item.qty;

        return `
                <tr style="border-bottom: 1px solid #eee;">
                  <td style="padding: 10px; font-size: 12px; color: #334155;">${item.name}</td>
                  <td style="padding: 10px; text-align: center; font-size: 12px; color: #334155;">${item.qty}</td>
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

  const filteredProducts = useMemo(() => {
    const searchWords = normalizeText(searchTerm).split(/\s+/).filter(w => w.length > 0);

    return products.filter(p => {
      const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
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

  const totalAtCostCLP = useMemo(() => {
    return dealItems.reduce((acc, item) =>
      item.product.category === 'Productos Únicos' ? acc + (item.product.costUSD * item.quantity * exchangeRate) : acc, 0);
  }, [dealItems, exchangeRate]);

  const totalFlexibleCostCLP = useMemo(() => {
    return dealItems.reduce((acc, item) =>
      item.product.category !== 'Productos Únicos' ? acc + (item.product.costUSD * item.quantity * exchangeRate) : acc, 0);
  }, [dealItems, exchangeRate]);

  const flexibleMultiplier = useMemo(() => {
    if (totalFlexibleCostCLP === 0) return 1;
    return Math.max(0, (targetSalePrice - totalAtCostCLP) / totalFlexibleCostCLP);
  }, [targetSalePrice, totalAtCostCLP, totalFlexibleCostCLP]);

  // Auto-calculate the price needed for 50% margin
  const suggested50PercentPrice = useMemo(() => {
    // Formula: Sale Price = Cost / 0.5
    return totalCostCLP / 0.5;
  }, [totalCostCLP]);

  const grossMarginValue = useMemo(() => {
    return targetSalePrice - totalCostCLP;
  }, [targetSalePrice, totalCostCLP]);

  const grossMarginPercent = useMemo(() => {
    const flexibleSalePriceCLP = targetSalePrice - totalAtCostCLP;
    if (flexibleSalePriceCLP <= 0) return 0;
    return (grossMarginValue / flexibleSalePriceCLP) * 100;
  }, [grossMarginValue, targetSalePrice, totalAtCostCLP]);

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
      const rawProducts = await parseFile(file);
      const newProducts: Product[] = rawProducts.map((p, index) => ({
        id: p.sku || `upl-${Date.now()}-${index}`,
        sku: p.sku,
        name: p.name,
        category: p.category,
        costUSD: p.costUSD,
        suggestedPriceUSD: p.msrpUSD
      }));
      setProducts(newProducts);
      setDealItems([]);
      fetchExchangeRate(); // Update rate on new file upload
    } catch (error) {
      alert('Error al procesar el archivo: ' + (error as Error).message);
    }
  };

  const addItem = (product: Product) => {
    const existing = dealItems.find(item => item.product.id === product.id);
    if (existing) {
      setDealItems(dealItems.map(item =>
        item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
      ));
    } else {
      setDealItems([...dealItems, { product, quantity: 1 }]);
    }
    fetchExchangeRate(); // Refresh rate when adding item
  };

  const removeItem = (productId: string) => {
    setDealItems(dealItems.filter(item => item.product.id !== productId));
  };

  const updateQuantity = (productId: string, quantity: number) => {
    setDealItems(dealItems.map(item =>
      item.product.id === productId ? { ...item, quantity: Math.max(0, quantity) } : item
    ));
  };

  const formatCLP = (value: number) => {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value);
  };

  const formatUSD = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
  };

  return (
    <div className="app-container">
      <header className="header">
        <div className="logo-group">
          <img src={logoMegaGen} alt="MegaGen Logo" style={{ height: '40px', objectFit: 'contain' }} />
          <div>
            <h1 style={{ display: 'none' }}>MegaGen Chile</h1>
            <p className="text-muted">Finance Deal Analyzer v2.6 (Supabase Cloud)</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <div className="finance-card" style={{ padding: '0.4rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.8rem', border: fetchError ? '1px solid var(--error)' : '1px solid var(--border)' }}>
            <div className="text-muted" style={{ fontSize: '0.65rem', color: fetchError ? 'var(--error)' : 'inherit' }}>
              {fetchError ? 'ERROR DOLAR' : 'TIPO DE CAMBIO'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <input
                type="number"
                className="input-field"
                style={{ width: '70px', fontWeight: 'bold', padding: '0.25rem', textAlign: 'right', border: 'none', background: 'transparent', color: fetchError ? 'var(--error)' : 'inherit' }}
                value={exchangeRate}
                onChange={(e) => setExchangeRate(parseFloat(e.target.value) || 0)}
              />
              <button
                onClick={() => fetchExchangeRate()}
                className="btn-icon"
                style={{ padding: '0.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', background: fetchError ? 'rgba(239, 68, 68, 0.1)' : '#f1f5f9', borderRadius: '4px', border: '1px solid var(--border)' }}
                title="Actualizar tipo de cambio"
              >
                <RefreshCw size={14} className={isLoading ? "text-muted animate-spin" : fetchError ? "text-error" : "text-muted"} style={{ color: fetchError ? 'var(--error)' : '' }} />
              </button>
            </div>
            {lastUpdated && (
              <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                ({lastUpdated})
              </div>
            )}
          </div>

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

                      <button
                        className="btn"
                        style={{ padding: '0.4rem', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--error)' }}
                        onClick={() => deleteProduct(product)}
                        title="Eliminar permanentemente"
                      >
                        <Trash2 size={14} />
                      </button>

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
                    {dealItems.map(item => {
                      const isAtCost = item.product.category === 'Productos Únicos';
                      const multiplier = isAtCost ? 1 : flexibleMultiplier;
                      const unitCostCLP = item.product.costUSD * exchangeRate;
                      const unitPriceRef = unitCostCLP * multiplier;
                      const totalPriceRef = unitPriceRef * item.quantity;

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
                          <td style={{ textAlign: 'right', fontSize: '0.85rem', color: 'var(--primary)', fontWeight: '600' }}>
                            {formatCLP(unitPriceRef)}
                          </td>
                          <td style={{ textAlign: 'right', fontSize: '0.85rem', color: 'var(--primary)', fontWeight: '600' }}>
                            {formatCLP(totalPriceRef)}
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
                    onChange={(e) => setTargetSalePrice(parseFloat(e.target.value) || 0)}
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
                        onChange={(e) => {
                          const priceWithIva = parseFloat(e.target.value);
                          if (!isNaN(priceWithIva)) {
                            setTargetSalePrice(Math.round(priceWithIva / 1.19));
                          } else {
                            setTargetSalePrice(0);
                          }
                        }}
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
                          if (!isNaN(margin) && margin > 0 && margin < 100 && totalCostCLP > 0) {
                            const newPrice = totalCostCLP / (1 - (margin / 100));
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

      {
        activeTab === 'history' && (
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
    </div >
  );
};

export default App;
