import { describe, expect, it } from 'vitest';
import { processCommissionClosure } from './commissionEngine';
import { buildCommissionWorkbook } from './commissionWorkbook';

describe('commissionWorkbook', () => {
  it('genera el workbook de comisiones con hojas y fórmulas reimportables', () => {
    const result = processCommissionClosure({
      companyKey: '3dental',
      periodKey: '2026-02',
      config: {
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
      },
      salesLines: [
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
          sourceRowIndex: 4,
          documentType: 'FACTURA',
          documentNumber: '1003',
          clientCode: 'C001',
          clientName: 'Clinica Uno',
          salesRep: 'Vendedor A',
          saleDate: '2026-02-12',
          productCode: 'IMP-002',
          productDescription: 'Implante pendiente',
          quantity: 1,
          netAmountCLP: 500,
          productClass: 'IMPLANTES',
        },
      ],
      receivableRows: [
        {
          sourceRowIndex: 2,
          documentNumber: '1003',
          balanceAmountCLP: 500,
        },
      ],
      carryoverLines: [
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
      ],
      salesFileName: 'ventas febrero.xlsx',
      receivablesFileName: 'cobranzas febrero.xlsx',
      carryoverFileName: 'arrastre enero.xlsx',
      usedCarryoverSource: 'manual',
    });

    const { workbook, downloadFileName } = buildCommissionWorkbook(result);
    const summarySheet = workbook.Sheets.Resumen_Comisiones;
    const currentSheet = workbook.Sheets.Ventas_Cobradas_Mes;
    const carryoverSheet = workbook.Sheets.Arrastres_Cobrados;
    const unpaidSheet = workbook.Sheets.No_Cobradas_Vigentes;
    const excludedSheet = workbook.Sheets.Excluidas;
    const configSheet = workbook.Sheets.Configuracion;

    expect(workbook.SheetNames).toEqual([
      'Configuracion',
      'Resumen_Comisiones',
      'Ventas_Cobradas_Mes',
      'Arrastres_Cobrados',
      'No_Cobradas_Vigentes',
      'Excluidas',
    ]);
    expect(configSheet.B2?.v).toBe('3Dental');
    expect(configSheet.B9?.v).toBe(10);
    expect(configSheet.B10?.v).toBe(5);
    expect(summarySheet.B4?.f).toBe("SUMIFS('Ventas_Cobradas_Mes'!$G:$G,'Ventas_Cobradas_Mes'!$C:$C,$A$3,'Ventas_Cobradas_Mes'!$H:$H,\"IMPLANTES\",'Ventas_Cobradas_Mes'!$G:$G,\">0\")");
    expect(summarySheet.B16?.f).toBe('SUM(B9,B15)');
    expect(currentSheet.J2?.f).toBe('G2*I2/100');
    expect(carryoverSheet.J2?.f).toBe('G2*I2/100');
    expect(unpaidSheet.A2?.v).toBe('3Dental');
    expect(unpaidSheet.B2?.v).toBe('2026-02');
    expect(unpaidSheet.D2?.v).toBe('1003');
    expect(excludedSheet.I2?.v).toBe('No comisionable');
    expect(((workbook.Workbook as { CalcPr?: Record<string, string> } | undefined)?.CalcPr?.forceFullCalc)).toBe('1');
    expect(downloadFileName).toBe('comisiones-3dental-2026-02.xlsx');
  });
});
