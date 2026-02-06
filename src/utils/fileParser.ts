import * as XLSX from 'xlsx';
import Papa from 'papaparse';

export interface RawProduct {
    sku?: string;
    name: string;
    category: string;
    costUSD: number;
    msrpUSD?: number;
}

const normalize = (text: string): string => {
    return text.toString().toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
};

const findValue = (row: any, keywords: string[]): any => {
    const keys = Object.keys(row);
    const normalizedKeywords = keywords.map(normalize);

    const match = keys.find(key => {
        const normKey = normalize(key);
        return normalizedKeywords.some(kw => normKey === kw || normKey.includes(kw));
    });

    return match ? row[match] : null;
};

export const parseFile = (file: File): Promise<RawProduct[]> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        const extension = file.name.split('.').pop()?.toLowerCase();

        if (extension === 'csv') {
            reader.onload = (e) => {
                const text = e.target?.result as string;
                Papa.parse(text, {
                    header: true,
                    skipEmptyLines: true,
                    complete: (results: Papa.ParseResult<any>) => {
                        resolve(mapRowsToProducts(results.data));
                    },
                    error: (err: Error) => reject(err),
                });
            };
            reader.readAsText(file);
        } else if (extension === 'xlsx' || extension === 'xls') {
            reader.onload = (e) => {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];

                const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
                if (rows.length === 0) { resolve([]); return; }

                let headerRowIndex = 0;
                for (let i = 0; i < Math.min(rows.length, 10); i++) {
                    const rowText = rows[i].join(' ').toLowerCase();
                    if (rowText.includes('sku') || rowText.includes('nom') || rowText.includes('pre')) {
                        headerRowIndex = i;
                        break;
                    }
                }

                const jsonData = XLSX.utils.sheet_to_json(worksheet, { range: headerRowIndex }) as any[];
                resolve(mapRowsToProducts(jsonData));
            };
            reader.readAsArrayBuffer(file);
        } else {
            reject(new Error('Formato no soportado.'));
        }
    });
};

const mapRowsToProducts = (rows: any[]): RawProduct[] => {
    const uniqueProducts: Map<string, RawProduct> = new Map();

    rows.forEach((row, index) => {
        const sku = findValue(row, ['sku', 'codigo', 'cod']);
        const name = findValue(row, ['nombre', 'name', 'articulo', 'item']);
        const cost = findValue(row, ['precio', 'price', 'costo', 'cost', 'usd']);
        const category = findValue(row, ['categoria', 'category', 'familia', 'tipo']);

        // Fallback posicional
        const rv = Object.values(row);
        const finalSku = sku || (index === 0 ? null : rv[0]);
        const finalName = name || rv[1];
        const finalCost = cost || rv[3];

        const productName = finalName?.toString().trim() || '';
        if (!productName && !sku) return;

        // Solo guardar el primer encuentro de cada nombre
        if (productName && !uniqueProducts.has(normalizerKey(productName))) {
            uniqueProducts.set(normalizerKey(productName), {
                sku: finalSku?.toString().trim() || '',
                name: productName,
                category: category?.toString().trim() || 'General',
                costUSD: parseNumber(finalCost),
                msrpUSD: 0,
            });
        }
    });

    return Array.from(uniqueProducts.values());
};

const normalizerKey = (text: string): string => {
    return text.toString().toLowerCase().trim();
};

const parseNumber = (val: any): number => {
    if (val === null || val === undefined) return 0;
    const clean = val.toString().replace(/[^0-9.,]/g, '').replace(',', '.');
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
};
