import { describe, expect, it } from 'vitest';
import { parseCommissionCarryoverRows, parseCommissionReceivableRows, parseCommissionSalesRows } from './commissionParsers';

describe('commissionParsers', () => {
  it('parsea ventas 3Dental con encabezados dañados y clases de producto', () => {
    const result = parseCommissionSalesRows([
      {
        'Nombre Doc': 'FACTURA ELECTRONICA',
        'Nmero del Documento': '1001',
        'C o del Cliente': '76123456-7',
        'Nombre del Cliente': 'Clinica Uno',
        'Nombre del Vendedor': 'Vendedor A',
        Fecha: '15/02/2026',
        'Cod. Producto': 'SKU-IMP',
        'Desc. Producto': 'Implante premium',
        Cantidad: '2',
        'Total Neto Linea': '125000',
        'Cat. Prod.': 'IMPLANTES',
      },
      {
        'Nombre Doc': '',
        'Nmero del Documento': '',
        'Nombre del Cliente': '',
      },
    ], '3dental');

    expect(result.validRows).toBe(1);
    expect(result.discardedRows).toBe(1);
    expect(result.periodFrom).toBe('2026-02-15');
    expect(result.periodTo).toBe('2026-02-15');
    expect(result.rows[0]).toMatchObject({
      documentNumber: '1001',
      clientCode: '76123456-7',
      clientName: 'Clinica Uno',
      salesRep: 'Vendedor A',
      saleDate: '2026-02-15',
      productCode: 'SKU-IMP',
      productDescription: 'Implante premium',
      quantity: 2,
      netAmountCLP: 125000,
      productClass: 'IMPLANTES',
    });
  });

  it('parsea cuentas por cobrar usando solo documentos con saldo positivo', () => {
    const result = parseCommissionReceivableRows([
      { Nmero: '1001', 'Saldo $': '54000', Nombre: 'Cliente A' },
      { Nmero: '1002', 'Saldo $': '0', Nombre: 'Cliente B' },
      { Nmero: '', 'Saldo $': '15000', Nombre: 'Cliente C' },
    ]);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      documentNumber: '1001',
      balanceAmountCLP: 54000,
      clientName: 'Cliente A',
    });
    expect(result.warnings).toContain('Fila 4: cuenta por cobrar sin número de documento; se descartó.');
  });

  it('parsea arrastres reimportables desde la hoja No_Cobradas_Vigentes', () => {
    const result = parseCommissionCarryoverRows([
      {
        Empresa: '3Dental',
        'Periodo Origen': '2026-01',
        'Nombre Doc': 'FACTURA ELECTRONICA',
        'Numero Documento': '9901',
        'Codigo Cliente': '76123456-7',
        'Nombre Cliente': 'Clinica Uno',
        'Nombre del Vendedor': 'Vendedor A',
        Fecha: '2026-01-28',
        'Cod. Producto': 'SKU-ARR',
        'Desc. Producto': 'Scanner',
        Cantidad: '1',
        'Total Neto Linea': '80000',
        'Clase Comision': '3DENTAL',
        'Tasa Comision %': '7.5',
        Estado: 'PENDIENTE',
        Observacion: 'Arrastre enero',
      },
    ], 'workbook_carryover', '3dental');

    expect(result.sourceType).toBe('workbook_carryover');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      sourceCompanyKey: '3dental',
      originPeriodKey: '2026-01',
      documentNumber: '9901',
      clientCode: '76123456-7',
      clientName: 'Clinica Uno',
      salesRep: 'Vendedor A',
      saleDate: '2026-01-28',
      productCode: 'SKU-ARR',
      productDescription: 'Scanner',
      netAmountCLP: 80000,
      productClass: '3DENTAL',
      ratePercent: 7.5,
      sourceStatus: 'PENDIENTE',
      observation: 'Arrastre enero',
    });
  });
});
