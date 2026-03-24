import { describe, expect, it } from 'vitest';
import { parseWeeklySalesRows } from './crmParser';

describe('crmParser', () => {
  it('parsea ventas semanales con aliases flexibles y descarta filas inválidas', () => {
    const result = parseWeeklySalesRows([
      {
        'Fecha ultima compra': '2026-02-14',
        Rut: '12.345.678-k',
        'Razon Social': 'Cliente Uno',
        Vendedor: 'Rep Uno',
        'Monto Compra': '125.000',
      },
      {
        'Última compra': '14/03/2026',
        'Codigo Cliente': '98765432-1',
        Cliente: 'Cliente Dos',
        'Sales Rep': 'Rep Dos',
        Total: 90000,
      },
      {
        Fecha: '',
        Rut: '',
        Total: '',
      },
    ]);

    expect(result.totalRows).toBe(3);
    expect(result.validRows).toBe(2);
    expect(result.discardedRows).toBe(1);
    expect(result.rows[0]).toMatchObject({
      clientRut: '12345678-K',
      clientName: 'Cliente Uno',
      salesRep: 'Rep Uno',
      netAmount: 125000,
      saleDate: '2026-02-14',
    });
    expect(result.rows[1]).toMatchObject({
      clientRut: '98765432-1',
      clientName: 'Cliente Dos',
      salesRep: 'Rep Dos',
      netAmount: 90000,
      saleDate: '2026-03-14',
    });
    expect(result.warnings.some((warning) => warning.includes('RUT no válido'))).toBe(true);
  });
});
