import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { updateCrmMasterWorkbook } from './crmMasterWorkbookEngine';
import { parseCrmMasterWorkbook } from './crmMasterWorkbookParser';
import type { WeeklySalesBatch } from '../types/crmWorkbook';

const buildWorkbook = () => {
  const workbook = XLSX.utils.book_new();

  const crmSheet = XLSX.utils.aoa_to_sheet([
    ['CRM KPI', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['No.', 'Sales Rep', 'RUT', 'Customer Name', '25Y Purchase Amount', '26Y Purchase Amount', 'First sold date', 'Total Purchase Amount', 'Recent Sold Date', '31-Jan', '28-Feb', '31-Mar', '30-Apr', '31-May', '30-Jun', '31-Jul', '31-Aug', '30-Sep', '31-Oct', '30-Nov', '31-Dec', '3months No Shipments', 'A/R'],
    [1, 'Rep Antiguo', '11111111-1', 'Cliente Existente', 0, 0, new Date('2026-01-10T00:00:00'), 0, new Date('2026-02-10T00:00:00'), 100, 150, 0, '', '', '', '', '', '', '', '', '', 'Active', ''],
  ]);
  crmSheet.D1 = { t: 's', f: 'SUBTOTAL(3,D3:D1048576)&" Customers"' };
  crmSheet.F1 = { t: 'n', f: 'SUBTOTAL(9,F2:F3)*0.0012' };
  crmSheet.W1 = { t: 'n', f: 'SUBTOTAL(9,W2:W3)*0.0012' };
  crmSheet.E3 = { t: 'n', f: "IFERROR(VLOOKUP(C3,'25Y Sales'!A:D,4,FALSE),0)" };
  crmSheet.F3 = { t: 'n', f: 'SUM(J3:U3)' };
  crmSheet.H3 = { t: 'n', f: 'SUM(E3,F3)' };
  crmSheet.J3 = { t: 'n', f: "IFERROR(VLOOKUP(C3,'26년 1월'!A:C,3,FALSE),0)" };
  crmSheet.K3 = { t: 'n', f: "IFERROR(XLOOKUP(C3,'26년 2월'!A:A,'26년 2월'!D:D,0,0,1),0)" };
  crmSheet.L3 = { t: 'n', f: "IFERROR(XLOOKUP(C3,'26년 3 '!A:A,'26년 3 '!D:D,0,0,1),0)" };
  crmSheet.V3 = { t: 's', f: 'IF(DAYS(TODAY(),I3)>90,"Inactive","Active")' };

  const janSheet = XLSX.utils.aoa_to_sheet([
    ['Informe Consolidado x Cliente', '', '', '', ''],
    ['Periodo del 01/01/2026 al 31/01/2026', '', '', '', ''],
    ['Cliente', 'Venta Neta Esperada', 'Venta Neta Real', 'Diferencia', '%Desc/Rec'],
    ['11111111-1', 'Cliente Existente', 100, 0, 0],
    ['TOTAL VENTA', 500, 100, -400, -0.8],
  ]);

  const febSheet = XLSX.utils.aoa_to_sheet([
    ['RUT', 'Nombre', 'Venta Neta Esperada', 'Venta Neta Real', 'Diferencia', '%Desc/Rec'],
    ['11111111-1', 'Cliente Existente', 200, 150, 0, 0],
    ['', '', '', '', '', ''],
  ]);

  const marSheet = XLSX.utils.aoa_to_sheet([
    ['RUT', 'Cliente', 'Venta Neta Esperada', 'Venta Neta Real', 'Diferencia', '%Desc/Rec'],
    ['', '', '', '', '', ''],
  ]);

  const annualSheet = XLSX.utils.aoa_to_sheet([
    ['Cliente', 'Venta Neta Esperada', 'Venta Neta Real', 'Diferencia', '%Desc/Rec'],
    ['11111111-1', 350, 250, -100, -0.2857],
    ['TOTAL VENTA', 350, 250, -100, -0.2857],
  ]);

  const sellersSheet = XLSX.utils.aoa_to_sheet([
    ['Codigo del Cliente', 'Nombre del Vendedor'],
    ['11111111-1', 'Rep Antiguo'],
    ['11111111-1', 'Rep Antiguo Duplicado'],
  ]);

  const reportSheet = XLSX.utils.aoa_to_sheet([
    ['', 'Sales Rep.', '2026 KPI'],
    ['', 'Rep Antiguo', 1000],
  ]);
  reportSheet.D4 = { t: 'n', f: 'COUNTIFS(CRM!$B:$B,Report!B4)' };

  const history25 = XLSX.utils.aoa_to_sheet([
    ['RUT', 'Cliente', 'Venta Neta Esperada', 'Venta Neta Real'],
    ['11111111-1', 'Cliente Existente', 0, 0],
  ]);

  XLSX.utils.book_append_sheet(workbook, reportSheet, 'Report');
  XLSX.utils.book_append_sheet(workbook, crmSheet, 'CRM');
  XLSX.utils.book_append_sheet(workbook, history25, '25Y Sales');
  XLSX.utils.book_append_sheet(workbook, annualSheet, '26Y Sales');
  XLSX.utils.book_append_sheet(workbook, janSheet, '26년 1월');
  XLSX.utils.book_append_sheet(workbook, febSheet, '26년 2월');
  XLSX.utils.book_append_sheet(workbook, marSheet, '26년 3 ');
  XLSX.utils.book_append_sheet(workbook, sellersSheet, '영업사원별');

  return workbook;
};

describe('crmMasterWorkbookEngine', () => {
  it('actualiza el workbook maestro, crea meses futuros y genera fórmulas nuevas', () => {
    const model = parseCrmMasterWorkbook(buildWorkbook(), 'Chile CRM.xlsx');
    const weeklyBatch: WeeklySalesBatch = {
      rows: [
        {
          saleDate: '2026-02-20',
          clientRut: '11111111-1',
          clientName: 'Cliente Existente',
          salesRep: 'Rep Nuevo',
          netAmount: 25,
          sourceRowIndex: 2,
        },
        {
          saleDate: '2026-04-02',
          clientRut: '22222222-2',
          clientName: 'Cliente Abril',
          salesRep: 'Rep Abril',
          netAmount: 80,
          sourceRowIndex: 3,
        },
      ],
      totalRows: 2,
      validRows: 2,
      discardedRows: 0,
      periodFrom: '2026-02-20',
      periodTo: '2026-04-02',
      warnings: [],
    };

    const result = updateCrmMasterWorkbook(model, weeklyBatch);
    const workbook = result.workbook;
    const febSheet = workbook.Sheets['26년 2월'];
    const aprSheet = workbook.Sheets['26년 4월'];
    const crmSheet = workbook.Sheets.CRM;
    const annualSheet = workbook.Sheets['26Y Sales'];
    const sellersSheet = workbook.Sheets['영업사원별'];

    expect(result.summary.updatedMonthlyRows).toBe(1);
    expect(result.summary.insertedMonthlyRows).toBe(1);
    expect(result.summary.createdMonthlySheets).toEqual(['26년 4월']);
    expect(result.summary.updatedCrmRows).toBe(1);
    expect(result.summary.insertedCrmRows).toBe(1);
    expect(result.summary.sellerChanges).toEqual([
      {
        clientRut: '11111111-1',
        previousSalesRep: 'Rep Antiguo',
        nextSalesRep: 'Rep Nuevo',
      },
    ]);

    expect(febSheet.D2?.v).toBe(175);
    expect(febSheet.E2?.f).toBe('IF(C2="","",D2-C2)');
    expect(febSheet.F2?.f).toBe('IF(OR(C2="",C2=0),"",E2/C2)');

    expect(aprSheet.A2?.v).toBe('22222222-2');
    expect(aprSheet.B2?.v).toBe('Cliente Abril');
    expect(aprSheet.D2?.v).toBe(80);
    expect(aprSheet.E2?.f).toBe('IF(C2="","",D2-C2)');
    expect(aprSheet.F2?.f).toBe('IF(OR(C2="",C2=0),"",E2/C2)');

    expect(crmSheet.B3?.v).toBe('Rep Nuevo');
    expect(crmSheet.I3?.t).toBe('d');
    expect(crmSheet.M3?.f).toBe("IFERROR(XLOOKUP(C3,'26년 4월'!A:A,'26년 4월'!D:D,0,0,1),0)");

    expect(crmSheet.A4?.v).toBe(2);
    expect(crmSheet.B4?.v).toBe('Rep Abril');
    expect(crmSheet.C4?.v).toBe('22222222-2');
    expect(crmSheet.D4?.v).toBe('Cliente Abril');
    expect(crmSheet.G4?.t).toBe('d');
    expect(crmSheet.E4?.f).toBe("IFERROR(VLOOKUP(C4,'25Y Sales'!A:D,4,FALSE),0)");
    expect(crmSheet.F4?.f).toBe('SUM(J4:U4)');
    expect(crmSheet.H4?.f).toBe('SUM(E4,F4)');
    expect(crmSheet.M4?.f).toBe("IFERROR(XLOOKUP(C4,'26년 4월'!A:A,'26년 4월'!D:D,0,0,1),0)");
    expect(crmSheet.V4?.f).toBe('IF(DAYS(TODAY(),I4)>90,"Inactive","Active")');

    expect(sellersSheet.A2?.v).toBe('11111111-1');
    expect(sellersSheet.B2?.v).toBe('Rep Nuevo');
    expect(sellersSheet.A3?.v).toBe('22222222-2');
    expect(sellersSheet.B3?.v).toBe('Rep Abril');

    expect(annualSheet.A2?.v).toBe('11111111-1');
    expect(annualSheet.C2?.v).toBe(275);
    expect(annualSheet.D2?.f).toBe('IF(OR(B2="",B2=0),"",C2-B2)');
    expect(annualSheet.A3?.v).toBe('22222222-2');
    expect(annualSheet.C3?.v).toBe(80);
    expect(annualSheet.D3?.f).toBe('IF(OR(B3="",B3=0),"",C3-B3)');
    expect(annualSheet.A5?.v).toBe('TOTAL VENTA');
    expect(annualSheet.B5?.f).toBe('SUM(B2:B3)');
    expect(annualSheet.C5?.f).toBe('SUM(C2:C3)');

    expect(((workbook.Workbook as { CalcPr?: Record<string, string> } | undefined)?.CalcPr?.forceFullCalc)).toBe('1');
    expect(result.downloadFileName).toBe('Chile CRM-actualizado-2026-04-02.xlsx');
  });
});
