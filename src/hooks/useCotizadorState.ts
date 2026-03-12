import { useMemo, useState } from 'react';
import type { Product } from '../data/mockProducts';
import { calculateQuote } from '../utils/quotePricingEngine';
import type { LinePricingMode, QuoteLineDraft, QuotePricingConfig } from '../types/quotation';

const DEFAULT_QUOTE_MARGIN_PERCENT = 50;

interface UseCotizadorStateArgs {
  products: Product[];
  exchangeRate: number;
  normalizeText: (text: string) => string;
  checkIsAtCost: (item: { name: string; category?: string }) => boolean;
}

export const useCotizadorState = ({
  products,
  exchangeRate,
  normalizeText,
  checkIsAtCost,
}: UseCotizadorStateArgs) => {
  const [quoteLines, setQuoteLines] = useState<QuoteLineDraft[]>([]);
  const [quotePricingConfig, setQuotePricingConfig] = useState<QuotePricingConfig>({
    mode: 'global_margin',
    targetMarginPercent: DEFAULT_QUOTE_MARGIN_PERCENT,
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [activeTab, setActiveTab] = useState<'simulator' | 'history'>('simulator');

  const parseInputNumber = (rawValue: string): number | null => {
    const normalized = rawValue.trim().replace(',', '.');
    if (!normalized) return 0;
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) return null;
    return parsed;
  };

  const createQuoteLineFromProduct = (product: Product): QuoteLineDraft => ({
    productId: product.id,
    productName: product.name,
    sku: product.sku,
    quantity: 1,
    costUSD: product.costUSD,
    category: product.category,
    pricingMode: checkIsAtCost({ name: product.name, category: product.category }) ? 'at_cost' : 'inherit',
    value: undefined,
    locked: false,
  });

  const filteredProducts = useMemo(() => {
    const searchWords = normalizeText(searchTerm).split(/\s+/).filter((word) => word.length > 0);

    return products.filter((product) => {
      const matchesCategory = selectedCategory === 'All'
        || (selectedCategory === 'Generales' && (product.category === 'General' || product.category === 'Generales'))
        || product.category === selectedCategory;
      if (!matchesCategory) return false;

      if (searchWords.length === 0) return true;

      const searchableText = normalizeText(`${product.name} ${product.sku || ''} ${product.category}`);
      return searchWords.every((word) => searchableText.includes(word));
    });
  }, [products, searchTerm, selectedCategory, normalizeText]);

  const totalCostUSD = useMemo(() => {
    return quoteLines.reduce((acc, item) => acc + (item.costUSD * item.quantity), 0);
  }, [quoteLines]);

  const quoteResult = useMemo(() => {
    return calculateQuote({
      exchangeRate,
      lines: quoteLines,
      pricingConfig: quotePricingConfig,
    });
  }, [exchangeRate, quoteLines, quotePricingConfig]);

  const targetSalePrice = quoteResult.totalNetCLP;
  const grossMarginValue = quoteResult.totalProfitCLP;
  const grossMarginPercent = quoteResult.totalMarginPercent;

  const clearDeal = () => {
    if (quoteLines.length === 0) return;
    if (confirm('¿Estás seguro de que deseas limpiar la simulación actual?')) {
      setQuoteLines([]);
      setQuotePricingConfig({
        mode: 'global_margin',
        targetMarginPercent: DEFAULT_QUOTE_MARGIN_PERCENT,
      });
    }
  };

  const addItem = (product: Product) => {
    const existing = quoteLines.find((item) => item.productId === product.id);
    if (existing) {
      setQuoteLines(quoteLines.map((item) =>
        item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item
      ));
      return;
    }

    setQuoteLines([...quoteLines, createQuoteLineFromProduct(product)]);
  };

  const removeItem = (productId: string) => {
    setQuoteLines(quoteLines.filter((item) => item.productId !== productId));
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      setQuoteLines(quoteLines.filter((item) => item.productId !== productId));
      return;
    }

    setQuoteLines(quoteLines.map((item) =>
      item.productId === productId ? { ...item, quantity } : item
    ));
  };

  const updateQuoteLineMode = (productId: string, pricingMode: LinePricingMode) => {
    setQuoteLines((prev) => prev.map((line) => {
      if (line.productId !== productId) return line;

      const nextValue = pricingMode === 'inherit' || pricingMode === 'at_cost' ? undefined : line.value ?? 0;
      return {
        ...line,
        pricingMode,
        value: nextValue,
        locked: pricingMode === 'manual_net_unit' ? true : line.locked,
      };
    }));
  };

  const updateQuoteLineValue = (productId: string, rawValue: string) => {
    const parsed = parseInputNumber(rawValue);
    if (parsed === null) return;

    setQuoteLines((prev) => prev.map((line) => (
      line.productId === productId
        ? { ...line, value: parsed, locked: line.pricingMode === 'manual_net_unit' ? true : line.locked }
        : line
    )));
  };

  const toggleQuoteLineLock = (productId: string) => {
    setQuoteLines((prev) => prev.map((line) => (
      line.productId === productId ? { ...line, locked: !line.locked } : line
    )));
  };

  const handleNetSalePriceChange = (rawValue: string) => {
    const parsed = parseInputNumber(rawValue);
    if (parsed === null) return;
    setQuotePricingConfig((prev) => ({
      ...prev,
      mode: 'global_net',
      targetNetTotalCLP: Math.max(0, Math.round(parsed)),
    }));
  };

  const handleSalePriceWithIvaChange = (rawValue: string) => {
    const parsedGross = parseInputNumber(rawValue);
    if (parsedGross === null) return;
    const netPrice = parsedGross / 1.19;
    setQuotePricingConfig((prev) => ({
      ...prev,
      mode: 'global_net',
      targetNetTotalCLP: Math.max(0, Math.round(netPrice)),
    }));
  };

  const handleGlobalMarginChange = (rawValue: string) => {
    const parsed = parseInputNumber(rawValue);
    if (parsed === null) return;
    setQuotePricingConfig((prev) => ({
      ...prev,
      mode: 'global_margin',
      targetMarginPercent: Math.max(0, Math.min(99, parsed)),
    }));
  };

  const applyPricingPreset = (mode: QuotePricingConfig['mode']) => {
    if (mode === 'at_cost') {
      setQuotePricingConfig({ mode: 'at_cost' });
      return;
    }

    if (mode === 'manual_lines') {
      setQuotePricingConfig({ mode: 'manual_lines' });
      setQuoteLines((prev) => prev.map((line, index) => ({
        ...line,
        pricingMode: 'manual_net_unit',
        value: quoteResult.lines[index]?.netUnitCLP ?? line.value ?? Math.round(line.costUSD * exchangeRate),
        locked: true,
      })));
      return;
    }

    if (mode === 'global_net') {
      setQuotePricingConfig({
        mode: 'global_net',
        targetNetTotalCLP: quoteResult.totalNetCLP,
        targetMarginPercent: quotePricingConfig.targetMarginPercent,
      });
      return;
    }

    setQuotePricingConfig({
      mode: 'global_margin',
      targetMarginPercent: DEFAULT_QUOTE_MARGIN_PERCENT,
      targetNetTotalCLP: quoteResult.totalNetCLP,
    });
  };

  return {
    quoteLines,
    setQuoteLines,
    quotePricingConfig,
    setQuotePricingConfig,
    searchTerm,
    setSearchTerm,
    selectedCategory,
    setSelectedCategory,
    activeTab,
    setActiveTab,
    filteredProducts,
    totalCostUSD,
    quoteResult,
    targetSalePrice,
    grossMarginValue,
    grossMarginPercent,
    clearDeal,
    addItem,
    removeItem,
    updateQuantity,
    updateQuoteLineMode,
    updateQuoteLineValue,
    toggleQuoteLineLock,
    handleNetSalePriceChange,
    handleSalePriceWithIvaChange,
    handleGlobalMarginChange,
    applyPricingPreset,
  };
};
