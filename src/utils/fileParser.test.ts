import { describe, expect, it } from 'vitest';
import { mapRowsToImportItems } from './fileParser';

describe('fileParser import rows', () => {
    it('prioriza la columna de nombre correcta y limpia el SKU repetido en la descripción', () => {
        const items = mapRowsToImportItems([
            {
                'Item Code': 'AR384507C',
                'Item Name': 'AR384507C XPEED AnyRidge Internal Fixture [AR]',
                Quantity: 10,
                'Unit Cost': 12.5,
            },
        ]);

        expect(items).toEqual([
            {
                sku: 'AR384507C',
                name: 'XPEED AnyRidge Internal Fixture [AR]',
                quantity: 10,
                unitCost: 12.5,
            },
        ]);
    });

    it('no confunde item code con item name cuando ambas columnas existen', () => {
        const items = mapRowsToImportItems([
            {
                'Item Code': 'BM10605',
                'Product Name': 'Bone Matrix I',
                Qty: 2,
                Price: 30,
            },
        ]);

        expect(items[0]).toMatchObject({
            sku: 'BM10605',
            name: 'Bone Matrix I',
        });
    });
});
