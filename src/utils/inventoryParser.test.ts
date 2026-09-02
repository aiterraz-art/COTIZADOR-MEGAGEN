import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseWarehouseLedgerFile } from './inventoryParser';

describe('warehouse ledger parser', () => {
  it('uses Cant. Saldo as units and the shared ST implant definition', async () => {
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['Codigo', 'Descripcion', 'Cant. Saldo', 'Saldo CLP'],
      ['ST-001', 'ST Internal Fixture [ST]', 2922, 123456],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Mayor auxiliar');
    const file = new File([
      XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }),
    ], 'mayor-auxiliar.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    const result = await parseWarehouseLedgerFile(file);

    expect(result.rows).toEqual([
      expect.objectContaining({
        sku: 'ST-001',
        category: 'ST',
        quantity: 2922,
        valueCLP: 123456,
      }),
    ]);
  });
});
