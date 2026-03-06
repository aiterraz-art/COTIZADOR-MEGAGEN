import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url';

export interface PdfImportItem {
  sku: string;
  name: string;
  quantity: number;
  value: number;
}

type PdfTextItem = {
  str: string;
  transform: number[];
};

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

const normalize = (text: string) => text
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim();

const parseNumber = (raw: string): number => {
  const clean = raw.replace(/[^\d.,-]/g, '');
  if (!clean) return 0;
  const hasComma = clean.includes(',');
  const hasDot = clean.includes('.');
  let normalized = clean;
  if (hasComma && hasDot) {
    if (clean.lastIndexOf(',') > clean.lastIndexOf('.')) {
      normalized = clean.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = clean.replace(/,/g, '');
    }
  } else if (hasComma) {
    normalized = clean.replace(',', '.');
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
};

const shouldSkipLine = (line: string): boolean => {
  const n = normalize(line);
  return (
    !n ||
    n.includes('subtotal') ||
    n.includes('total') ||
    n.includes('iva') ||
    n.includes('pagina') ||
    n.includes('descripcion') ||
    n.includes('cantidad') ||
    n.includes('sku')
  );
};

const buildLines = (items: PdfTextItem[]): string[] => {
  const buckets = new Map<number, PdfTextItem[]>();
  for (const item of items) {
    if (!item.str?.trim()) continue;
    const y = Math.round(item.transform[5] / 2) * 2;
    const group = buckets.get(y) ?? [];
    group.push(item);
    buckets.set(y, group);
  }

  const lines = Array.from(buckets.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([, row]) => row.sort((a, b) => a.transform[4] - b.transform[4]).map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  return lines;
};

const parseLineToItem = (line: string): PdfImportItem | null => {
  if (shouldSkipLine(line)) return null;

  const tokens = line.split(/\s+/);
  if (tokens.length < 4) return null;

  const numericIndexes: Array<{ idx: number; value: number }> = [];
  tokens.forEach((token, idx) => {
    const value = parseNumber(token);
    if (value !== 0) numericIndexes.push({ idx, value });
  });
  if (numericIndexes.length === 0) return null;

  const skuIdx = tokens.findIndex((token) => /^[A-Z0-9][A-Z0-9\-_.]{2,}$/i.test(token));
  if (skuIdx === -1) return null;

  const lastNumber = numericIndexes[numericIndexes.length - 1];
  const qtyCandidate = numericIndexes.find((entry) => entry.idx > skuIdx && Number.isInteger(entry.value) && entry.value > 0 && entry.value < 100000);
  const quantity = qtyCandidate?.value ?? 1;
  const value = Math.abs(lastNumber.value);
  if (value <= 0 || quantity <= 0) return null;

  const nameStart = skuIdx + 1;
  const nameEnd = qtyCandidate ? qtyCandidate.idx : lastNumber.idx;
  const name = tokens.slice(nameStart, Math.max(nameStart + 1, nameEnd)).join(' ').trim();
  if (!name) return null;

  return {
    sku: tokens[skuIdx],
    name,
    quantity,
    value: value / quantity,
  };
};

export const parseImportItemsFromPdf = async (file: File): Promise<PdfImportItem[]> => {
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const parsedItems: PdfImportItem[] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const textItems = content.items as PdfTextItem[];
    const lines = buildLines(textItems);
    for (const line of lines) {
      const item = parseLineToItem(line);
      if (item) parsedItems.push(item);
    }
  }

  if (!parsedItems.length) return [];

  const merged = new Map<string, PdfImportItem>();
  for (const item of parsedItems) {
    const key = `${item.sku}||${item.name}`.toLowerCase();
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...item });
      continue;
    }
    const totalQty = existing.quantity + item.quantity;
    const totalValue = (existing.value * existing.quantity) + (item.value * item.quantity);
    merged.set(key, {
      ...existing,
      quantity: totalQty,
      value: totalQty > 0 ? totalValue / totalQty : existing.value,
    });
  }

  return Array.from(merged.values());
};
