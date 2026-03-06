import * as XLSX from 'xlsx';
import Papa from 'papaparse';

export interface RawProduct {
    sku?: string;
    name: string;
    category: string;
    costUSD: number;
    msrpUSD?: number;
}

export interface CashFlowSummary {
    totalIncomeCLP: number;
    totalExpenseCLP: number;
    endingBalanceCLP: number;
    beginningBalanceCLP: number;
    movementCount: number;
    dateFrom?: string;
    dateTo?: string;
}

export interface DailySalesSummary {
    totalSalesCLPExcludingDispatch: number;
    totalCostCLPExcludingDispatch: number;
    movementCount: number;
    dateFrom?: string;
    dateTo?: string;
    implantsByModel: Record<'AR' | 'AO' | 'ST' | 'BD' | 'MN' | 'ARiE', number>;
    totalImplants: number;
}

export interface ImportItemRaw {
    sku: string;
    name: string;
    quantity: number;
    unitCost: number;
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
        const finalCost = cost ?? extractFallbackCost(rv);

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

    const raw = val.toString().trim();
    const clean = raw.replace(/[^\d.,-]/g, '');
    if (!clean) return 0;

    const hasComma = clean.includes(',');
    const hasDot = clean.includes('.');
    let normalized = clean;

    // Handle thousand/decimal separators for both "1.234,56" and "1,234.56"
    if (hasComma && hasDot) {
        if (clean.lastIndexOf(',') > clean.lastIndexOf('.')) {
            normalized = clean.replace(/\./g, '').replace(',', '.');
        } else {
            normalized = clean.replace(/,/g, '');
        }
    } else if (hasComma) {
        normalized = clean.replace(',', '.');
    }

    const num = parseFloat(normalized);
    return isNaN(num) ? 0 : num;
};

const extractFallbackCost = (values: unknown[]): unknown => {
    // Prefer right-most numeric value since cost is usually near the end of rows.
    for (let i = values.length - 1; i >= 0; i -= 1) {
        const parsed = parseNumber(values[i]);
        if (parsed > 0) return values[i];
    }

    return values[3] ?? values[2] ?? values[1] ?? null;
};

const parseCurrencyCell = (value: unknown): number => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    return parseNumber(value);
};

const parseExcelDate = (value: unknown): Date | null => {
    if (typeof value === 'number') {
        const dateCode = XLSX.SSF.parse_date_code(value);
        if (!dateCode) return null;
        return new Date(dateCode.y, dateCode.m - 1, dateCode.d);
    }

    if (typeof value === 'string' && value.trim()) {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    return null;
};

export const parseCashFlowFile = (file: File): Promise<CashFlowSummary> => {
    return new Promise((resolve, reject) => {
        const extension = file.name.split('.').pop()?.toLowerCase();
        if (extension !== 'xlsx' && extension !== 'xls') {
            reject(new Error('El archivo de movimientos debe ser Excel (.xlsx o .xls).'));
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as unknown[][];

                if (rows.length === 0) {
                    reject(new Error('El archivo está vacío.'));
                    return;
                }

                const headerRowIndex = rows.findIndex((row) => {
                    const rowText = row.map((cell) => normalize(String(cell ?? ''))).join(' ');
                    return rowText.includes('fecha transaccion')
                        && rowText.includes('egreso')
                        && rowText.includes('ingreso')
                        && rowText.includes('saldo');
                });

                if (headerRowIndex === -1) {
                    reject(new Error('No se encontró la cabecera esperada de movimientos bancarios.'));
                    return;
                }

                const header = rows[headerRowIndex].map((cell) => normalize(String(cell ?? '')));
                const findColumn = (candidates: string[]): number => {
                    return header.findIndex((cell) => candidates.some((candidate) => cell.includes(candidate)));
                };

                const dateIdx = findColumn(['fecha transaccion', 'fecha']);
                const expenseIdx = findColumn(['egreso']);
                const incomeIdx = findColumn(['ingreso']);
                const balanceIdx = findColumn(['saldo']);

                if (dateIdx < 0 || expenseIdx < 0 || incomeIdx < 0 || balanceIdx < 0) {
                    reject(new Error('Faltan columnas requeridas (fecha, egreso, ingreso o saldo).'));
                    return;
                }

                let totalIncomeCLP = 0;
                let totalExpenseCLP = 0;
                let movementCount = 0;
                let endingBalanceCLP: number | null = null;
                const parsedDates: Date[] = [];

                for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
                    const row = rows[i];
                    const income = parseCurrencyCell(row[incomeIdx]);
                    const expense = parseCurrencyCell(row[expenseIdx]);
                    const balance = parseCurrencyCell(row[balanceIdx]);
                    const parsedDate = parseExcelDate(row[dateIdx]);

                    if (!income && !expense && !balance && !parsedDate) continue;

                    totalIncomeCLP += income;
                    totalExpenseCLP += expense;
                    if (income > 0 || expense > 0) movementCount += 1;
                    if (endingBalanceCLP === null && balance > 0) endingBalanceCLP = balance;
                    if (parsedDate) parsedDates.push(parsedDate);
                }

                if (movementCount === 0) {
                    reject(new Error('No se detectaron movimientos con ingreso/egreso.'));
                    return;
                }

                const safeEndingBalance = endingBalanceCLP ?? 0;
                const beginningBalanceCLP = safeEndingBalance - totalIncomeCLP + totalExpenseCLP;

                const timestamps = parsedDates.map((date) => date.getTime());
                const minTimestamp = timestamps.length ? Math.min(...timestamps) : null;
                const maxTimestamp = timestamps.length ? Math.max(...timestamps) : null;

                resolve({
                    totalIncomeCLP,
                    totalExpenseCLP,
                    endingBalanceCLP: safeEndingBalance,
                    beginningBalanceCLP,
                    movementCount,
                    dateFrom: minTimestamp ? new Date(minTimestamp).toLocaleDateString('es-CL') : undefined,
                    dateTo: maxTimestamp ? new Date(maxTimestamp).toLocaleDateString('es-CL') : undefined,
                });
            } catch (error) {
                reject(error instanceof Error ? error : new Error('No fue posible procesar el archivo.'));
            }
        };

        reader.readAsArrayBuffer(file);
    });
};

export const parseDailySalesFile = (file: File): Promise<DailySalesSummary> => {
    return new Promise((resolve, reject) => {
        const extension = file.name.split('.').pop()?.toLowerCase();
        if (extension !== 'xlsx' && extension !== 'xls') {
            reject(new Error('El archivo de ventas debe ser Excel (.xlsx o .xls).'));
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as unknown[][];

                if (rows.length === 0) {
                    reject(new Error('El archivo está vacío.'));
                    return;
                }

                const headerRowIndex = rows.findIndex((row) => {
                    const rowText = row.map((cell) => normalize(String(cell ?? ''))).join(' ');
                    return rowText.includes('desc. producto')
                        && rowText.includes('cantidad')
                        && rowText.includes('total detalle')
                        && rowText.includes('costo vigente');
                });

                if (headerRowIndex === -1) {
                    reject(new Error('No se encontró la cabecera esperada de ventas.'));
                    return;
                }

                const header = rows[headerRowIndex].map((cell) => normalize(String(cell ?? '')));
                const findColumn = (candidates: string[]): number => {
                    return header.findIndex((cell) => candidates.some((candidate) => cell.includes(candidate)));
                };

                const dateIdx = findColumn(['fecha']);
                const codeIdx = findColumn(['cod. producto', 'cod producto']);
                const descriptionIdx = findColumn(['desc. producto', 'desc producto']);
                const quantityIdx = findColumn(['cantidad']);
                const totalIdx = findColumn(['total detalle']);
                const costIdx = findColumn(['costo vigente']);

                if (descriptionIdx < 0 || quantityIdx < 0 || totalIdx < 0 || costIdx < 0) {
                    reject(new Error('Faltan columnas requeridas (producto, cantidad, total o costo).'));
                    return;
                }

                const implantMatchers: Array<{ key: 'AR' | 'AO' | 'ST' | 'BD' | 'MN' | 'ARiE'; label: string }> = [
                    { key: 'AR', label: 'xpeed anyridge internal fixture [ar]' },
                    { key: 'AO', label: 'anyone internal fixture [ao]' },
                    { key: 'ST', label: 'st internal fixture [st]' },
                    { key: 'BD', label: 'bluediamond implant [bd]' },
                    { key: 'MN', label: 'mini internal fixture [mn]' },
                    { key: 'ARiE', label: 'ari excon implant [arie]' },
                ];

                const implantsByModel: Record<'AR' | 'AO' | 'ST' | 'BD' | 'MN' | 'ARiE', number> = {
                    AR: 0,
                    AO: 0,
                    ST: 0,
                    BD: 0,
                    MN: 0,
                    ARiE: 0,
                };

                let totalSalesCLPExcludingDispatch = 0;
                let totalCostCLPExcludingDispatch = 0;
                let movementCount = 0;
                const parsedDates: Date[] = [];

                for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
                    const row = rows[i];
                    const descriptionRaw = String(row[descriptionIdx] ?? '');
                    const codeRaw = String(codeIdx >= 0 ? row[codeIdx] ?? '' : '');
                    const quantity = parseCurrencyCell(row[quantityIdx]);
                    const totalDetail = parseCurrencyCell(row[totalIdx]);
                    const currentCost = parseCurrencyCell(row[costIdx]);
                    const parsedDate = dateIdx >= 0 ? parseExcelDate(row[dateIdx]) : null;

                    if (!descriptionRaw && !codeRaw && !quantity && !totalDetail && !currentCost) continue;

                    const normalizedDescription = normalize(descriptionRaw);
                    const normalizedCode = normalize(codeRaw);
                    const isDispatch = normalizedCode === 'despacho'
                        || normalizedDescription.includes('servicio despacho')
                        || normalizedDescription.includes('despacho');

                    if (parsedDate) parsedDates.push(parsedDate);
                    if (isDispatch) continue;

                    totalSalesCLPExcludingDispatch += totalDetail;
                    totalCostCLPExcludingDispatch += currentCost * quantity;
                    movementCount += 1;

                    const implant = implantMatchers.find((model) => normalizedDescription.includes(model.label));
                    if (implant) {
                        implantsByModel[implant.key] += quantity;
                    }
                }

                const totalImplants = Object.values(implantsByModel).reduce((acc, qty) => acc + qty, 0);
                const timestamps = parsedDates.map((date) => date.getTime());
                const minTimestamp = timestamps.length ? Math.min(...timestamps) : null;
                const maxTimestamp = timestamps.length ? Math.max(...timestamps) : null;

                resolve({
                    totalSalesCLPExcludingDispatch,
                    totalCostCLPExcludingDispatch,
                    movementCount,
                    dateFrom: minTimestamp ? new Date(minTimestamp).toLocaleDateString('es-CL') : undefined,
                    dateTo: maxTimestamp ? new Date(maxTimestamp).toLocaleDateString('es-CL') : undefined,
                    implantsByModel,
                    totalImplants,
                });
            } catch (error) {
                reject(error instanceof Error ? error : new Error('No fue posible procesar el archivo.'));
            }
        };

        reader.readAsArrayBuffer(file);
    });
};

export const parseImportProductsFile = (file: File): Promise<ImportItemRaw[]> => {
    return new Promise((resolve, reject) => {
        const extension = file.name.split('.').pop()?.toLowerCase();
        if (extension !== 'xlsx' && extension !== 'xls' && extension !== 'csv') {
            reject(new Error('El archivo de importaciones debe ser .xlsx, .xls o .csv.'));
            return;
        }

        const mapRowsToImportItems = (rows: Record<string, unknown>[]) => {
            const items: ImportItemRaw[] = [];

            rows.forEach((row, index) => {
                const sku = findValue(row, ['sku', 'codigo', 'cod', 'item code']);
                const name = findValue(row, ['nombre', 'name', 'descripcion', 'description', 'producto', 'item']);
                const quantity = findValue(row, ['cantidad', 'qty', 'quantity', 'cant']);
                const unitCost = findValue(row, ['costo', 'cost', 'precio', 'price', 'valor unitario', 'unit cost']);

                const values = Object.values(row);
                const fallbackSku = values[0];
                const fallbackName = values[1];
                const fallbackQty = values[2];
                const fallbackCost = values[3] ?? extractFallbackCost(values);

                const finalSku = (sku ?? fallbackSku ?? `row-${index + 1}`).toString().trim();
                const finalName = (name ?? fallbackName ?? '').toString().trim();
                const finalQty = parseNumber(quantity ?? fallbackQty);
                const finalUnitCost = parseNumber(unitCost ?? fallbackCost);

                if (!finalName && !finalSku) return;
                if (finalQty <= 0 || finalUnitCost <= 0) return;

                items.push({
                    sku: finalSku,
                    name: finalName || finalSku,
                    quantity: finalQty,
                    unitCost: finalUnitCost,
                });
            });

            return items;
        };

        const reader = new FileReader();
        if (extension === 'csv') {
            reader.onload = (e) => {
                const text = e.target?.result as string;
                Papa.parse(text, {
                    header: true,
                    skipEmptyLines: true,
                    complete: (results: Papa.ParseResult<Record<string, unknown>>) => {
                        const items = mapRowsToImportItems(results.data);
                        if (!items.length) {
                            reject(new Error('No se detectaron productos válidos en el archivo.'));
                            return;
                        }
                        resolve(items);
                    },
                    error: (err: Error) => reject(err),
                });
            };
            reader.readAsText(file);
            return;
        }

        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const rows = XLSX.utils.sheet_to_json(worksheet) as Record<string, unknown>[];
                const items = mapRowsToImportItems(rows);
                if (!items.length) {
                    reject(new Error('No se detectaron productos válidos en el archivo.'));
                    return;
                }
                resolve(items);
            } catch (error) {
                reject(error instanceof Error ? error : new Error('No fue posible procesar el archivo.'));
            }
        };

        reader.readAsArrayBuffer(file);
    });
};
