import { describe, expect, it } from 'vitest';
import type { CommissionCarryoverLine, CommissionCompanyConfig, CommissionReceivableRow, CommissionSalesRawLine } from '../types/commissions';
import { processCommissionClosure } from './commissionEngine';

const baseConfig: CommissionCompanyConfig = {
  companyKey: '3dental',
  globalRatePercent: null,
  implantRatePercent: 10,
  threeDentalRatePercent: 5,
  exclusionRules: [
    {
      id: 'exclude-despacho',
      field: 'description',
      operator: 'contains',
      value: 'despacho',
      note: 'No comisionable',
    },
  ],
};

const salesLines: CommissionSalesRawLine[] = [
  {
    sourceRowIndex: 2,
    documentType: 'FACTURA',
    documentNumber: '1001',
    clientCode: 'C001',
    clientName: 'Clinica Uno',
    salesRep: 'Vendedor A',
    saleDate: '2026-02-10',
    productCode: 'IMP-001',
    productDescription: 'Implante Alpha',
    quantity: 2,
    netAmountCLP: 1000,
    productClass: 'IMPLANTES',
  },
  {
    sourceRowIndex: 3,
    documentType: 'FACTURA',
    documentNumber: '1001',
    clientCode: 'C001',
    clientName: 'Clinica Uno',
    salesRep: 'Vendedor A',
    saleDate: '2026-02-10',
    productCode: '3D-001',
    productDescription: 'Scanner 3Dental',
    quantity: 1,
    netAmountCLP: 500,
    productClass: '3DENTAL',
  },
  {
    sourceRowIndex: 4,
    documentType: 'FACTURA',
    documentNumber: '1002',
    clientCode: 'C001',
    clientName: 'Clinica Uno',
    salesRep: 'Vendedor A',
    saleDate: '2026-02-11',
    productCode: 'SRV-001',
    productDescription: 'Despacho Santiago',
    quantity: 1,
    netAmountCLP: 200,
    productClass: '',
  },
  {
    sourceRowIndex: 5,
    documentType: 'FACTURA',
    documentNumber: '1003',
    clientCode: 'C001',
    clientName: 'Clinica Uno',
    salesRep: 'Vendedor A',
    saleDate: '2026-02-12',
    productCode: 'UNK-001',
    productDescription: 'Producto sin clase',
    quantity: 1,
    netAmountCLP: 300,
    productClass: '',
  },
  {
    sourceRowIndex: 6,
    documentType: 'FACTURA',
    documentNumber: '1004',
    clientCode: 'C001',
    clientName: 'Clinica Uno',
    salesRep: 'Vendedor A',
    saleDate: '2026-02-13',
    productCode: 'IMP-002',
    productDescription: 'Implante pendiente',
    quantity: 1,
    netAmountCLP: 800,
    productClass: 'IMPLANTES',
  },
  {
    sourceRowIndex: 7,
    documentType: 'NOTA CREDITO',
    documentNumber: '1005',
    clientCode: 'C001',
    clientName: 'Clinica Uno',
    salesRep: 'Vendedor A',
    saleDate: '2026-02-14',
    productCode: 'IMP-003',
    productDescription: 'Descuento implante',
    quantity: -1,
    netAmountCLP: -200,
    productClass: 'IMPLANTES',
  },
];

const receivableRows: CommissionReceivableRow[] = [
  {
    sourceRowIndex: 2,
    documentNumber: '1004',
    balanceAmountCLP: 800,
  },
  {
    sourceRowIndex: 3,
    documentNumber: '0998',
    balanceAmountCLP: 700,
  },
];

const carryoverLines: CommissionCarryoverLine[] = [
  {
    sourceRowIndex: 2,
    sourceType: 'saved_closure',
    sourceCompanyKey: '3dental',
    originPeriodKey: '2026-01',
    documentType: 'FACTURA',
    documentNumber: '0999',
    clientCode: 'C900',
    clientName: 'Cliente Arrastre',
    salesRep: 'Vendedor A',
    saleDate: '2026-01-20',
    productCode: '3D-900',
    productDescription: 'Scanner arrastre',
    quantity: 1,
    netAmountCLP: 400,
    productClass: '3DENTAL',
    ratePercent: 6,
  },
  {
    sourceRowIndex: 3,
    sourceType: 'saved_closure',
    sourceCompanyKey: '3dental',
    originPeriodKey: '2026-01',
    documentType: 'FACTURA',
    documentNumber: '0998',
    clientCode: 'C901',
    clientName: 'Cliente Pendiente',
    salesRep: 'Vendedor A',
    saleDate: '2026-01-22',
    productCode: 'IMP-901',
    productDescription: 'Implante arrastre',
    quantity: 1,
    netAmountCLP: 700,
    productClass: 'IMPLANTES',
    ratePercent: 9,
  },
];

describe('commissionEngine', () => {
  it('calcula comisiones por línea, congela tasa de arrastre y separa pendientes/excluidas', () => {
    const result = processCommissionClosure({
      companyKey: '3dental',
      periodKey: '2026-02',
      config: baseConfig,
      salesLines,
      receivableRows,
      carryoverLines,
      salesFileName: 'ventas febrero.xlsx',
      receivablesFileName: 'cobranzas febrero.xlsx',
      carryoverFileName: 'arrastre enero.xlsx',
      usedCarryoverSource: 'manual',
    });

    expect(result.blockingErrors).toContain('La factura 1003 tiene líneas sin clase válida de comisión.');
    expect(result.currentPaidLines).toHaveLength(3);
    expect(result.carryoverPaidLines).toHaveLength(1);
    expect(result.unpaidLines).toHaveLength(2);
    expect(result.excludedLines).toHaveLength(2);
    expect(result.stats.paidCurrentInvoices).toBe(2);
    expect(result.stats.paidCarryoverInvoices).toBe(1);
    expect(result.stats.unpaidInvoices).toBe(2);
    expect(result.stats.excludedLines).toBe(2);

    const implantSale = result.currentPaidLines.find((line) => line.documentNumber === '1001' && line.productClass === 'IMPLANTES');
    const class3dSale = result.currentPaidLines.find((line) => line.documentNumber === '1001' && line.productClass === '3DENTAL');
    const creditNote = result.currentPaidLines.find((line) => line.documentNumber === '1005');
    const carryoverPaid = result.carryoverPaidLines.find((line) => line.documentNumber === '0999');
    const unpaidCarryover = result.unpaidLines.find((line) => line.documentNumber === '0998');
    const excluded = result.excludedLines.find((line) => line.documentNumber === '1002');
    const invalidClassLine = result.excludedLines.find((line) => line.documentNumber === '1003');

    expect(implantSale?.commissionAmountCLP).toBe(100);
    expect(class3dSale?.commissionAmountCLP).toBe(25);
    expect(creditNote?.commissionAmountCLP).toBe(-20);
    expect(carryoverPaid?.ratePercent).toBe(6);
    expect(carryoverPaid?.commissionAmountCLP).toBe(24);
    expect(unpaidCarryover?.ratePercent).toBe(9);
    expect(unpaidCarryover?.status).toBe('unpaid');
    expect(excluded?.status).toBe('excluded');
    expect(excluded?.exclusionReason).toBe('No comisionable');
    expect(invalidClassLine?.status).toBe('excluded');
    expect(invalidClassLine?.exclusionReason).toBe('Clase de comisión inválida');
    expect(result.stats.totalCommissionCLP).toBe(129);
    expect(result.sellerSummaries[0]).toMatchObject({
      salesRep: 'Vendedor A',
      currentPaidNetCLP: 1500,
      carryoverPaidNetCLP: 400,
      negativeAdjustmentsNetCLP: -200,
      totalBaseNetCLP: 1700,
      totalCommissionCLP: 129,
    });
    expect(result.sellerSummaries[0]?.byClass.IMPLANTES?.totalCommissionCLP).toBe(80);
    expect(result.sellerSummaries[0]?.byClass['3DENTAL']?.totalCommissionCLP).toBe(49);
  });
});
