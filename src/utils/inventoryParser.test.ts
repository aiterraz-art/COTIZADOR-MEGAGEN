import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseWarehouseLedgerFile } from './inventoryParser';

describe('warehouse ledger parser', () => {
  it('uses Cant. Saldo as units and the shared ST implant definition', async () => {
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['Codigo', 'Descripcion', 'Cant. Saldo', 'Saldo $'],
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

  it('uses the balance amount column from the daily warehouse ledger', async () => {
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['Codigo', 'Descripcion', 'Fecha', 'Documento', 'N° Documento', 'Bodega', 'Cant. Entrada', 'Cant. Salida', 'Cant. Saldo', 'Valor Unit.', 'Entrada $', 'Salida $', 'Val. Saldo', 'Costo Unit.'],
      ['ST-001', 'ST Internal Fixture [ST]', '01/01/2026', 'Saldo Anterior', '1', 'Principal', 0, 0, 2922, 1000, 0, 0, 2913000, 800],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Mayor auxiliar');
    const file = new File([
      XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }),
    ], 'mayor-auxiliar.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    const result = await parseWarehouseLedgerFile(file);

    expect(result.rows[0]).toMatchObject({ quantity: 2922, valueCLP: 2913000 });
  });
});
