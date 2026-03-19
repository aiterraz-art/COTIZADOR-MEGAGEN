import { describe, expect, it } from 'vitest';
import type { Product } from '../data/mockProducts';
import { parseBalanceRows, parseInventoryRows, parsePnlRows } from './monthlyAnalysisParser';

const products: Product[] = [
  {
    id: 'imp-001',
    sku: 'IMP-001',
    name: 'Implante X',
    category: 'Implantes',
    costUSD: 10,
  },
  {
    id: 'ad-001',
    sku: 'AD-001',
    name: 'Aditamento Y',
    category: 'Aditamentos',
    costUSD: 8,
  },
  {
    id: 'kit-name-001',
    name: 'Llave Dinamometrica',
    category: 'Kits',
    costUSD: 14,
  },
];

describe('monthlyAnalysisParser', () => {
  it('parsea balance con aliases y detecta secciones contables', () => {
    const result = parseBalanceRows([
      {
        Cuenta: '1101',
        Descripcion: 'Caja y Bancos',
        'Saldo Final': '1.200.000',
        Seccion: 'Activo Corriente',
        Periodo: '2026-02',
      },
      {
        Cuenta: '2101',
        Descripcion: 'Proveedores',
        'Saldo Final': '450000',
        Seccion: 'Pasivo Corriente',
        Periodo: '2026-02',
      },
      {
        Cuenta: '3101',
        Descripcion: 'Capital',
        'Saldo Final': '750000',
        Seccion: 'Patrimonio',
        Periodo: '2026-02',
      },
    ], '2026-02');

    expect(result.errors).toEqual([]);
    expect(result.detectedPeriodKeys).toEqual(['2026-02']);
    expect(result.validRows).toBe(3);
    expect(result.rows[0]?.section).toBe('ACTIVO_CORRIENTE');
    expect(result.rows[1]?.section).toBe('PASIVO_CORRIENTE');
    expect(result.rows[2]?.section).toBe('PATRIMONIO');
  });

  it('parsea ER completo y detecta resultados explícitos', () => {
    const result = parsePnlRows([
      {
        Codigo: '4101',
        Descripcion: 'Ventas Netas',
        Resultado: '2.000.000',
        Grupo: 'Ingresos',
        Periodo: 'Febrero 2026',
      },
      {
        Codigo: '5101',
        Descripcion: 'Costo de Venta',
        Resultado: '800000',
        Grupo: 'Costo de Ventas',
        Periodo: 'Febrero 2026',
      },
      {
        Codigo: '6101',
        Descripcion: 'Gastos Operacionales',
        Resultado: '300000',
        Grupo: 'Gastos',
        Periodo: 'Febrero 2026',
      },
      {
        Codigo: '9999',
        Descripcion: 'Utilidad Neta',
        Resultado: '900000',
        Grupo: 'Resultados',
        Periodo: 'Febrero 2026',
      },
    ], '2026-02');

    expect(result.errors).toEqual([]);
    expect(result.detectedPeriodKeys).toEqual(['2026-02']);
    expect(result.rows.at(-1)?.isSubtotal).toBe(true);
    expect(result.rows.at(-1)?.section).toBe('RESULTADOS');
  });

  it('clasifica inventario por nombre, agrega movimientos y conserva no mapeados', () => {
    const result = parseInventoryRows([
      {
        SKU: 'IMP-001',
        Nombre: 'Implante X',
        'Stock Inicial': 10,
        Entradas: 5,
        Salidas: 3,
        Ajustes: 1,
        'Stock Final': 13,
        Periodo: '2026-02',
      },
      {
        SKU: 'AD-001',
        Nombre: 'Aditamento Y',
        'Tipo Movimiento': 'Entrada',
        Cantidad: 4,
        Periodo: '2026-02',
      },
      {
        SKU: 'AD-001',
        Nombre: 'Aditamento Y',
        'Tipo Movimiento': 'Salida',
        Cantidad: 2,
        Periodo: '2026-02',
      },
      {
        SKU: 'KIT-404',
        Nombre: 'Llave Dinamométrica',
        'Stock Inicial': 3,
        Entradas: 0,
        Salidas: 1,
        Ajustes: 0,
        'Stock Final': 2,
        Periodo: '2026-02',
      },
      {
        SKU: 'COX-001',
        Nombre: 'Coxo Surgical Motor',
        'Stock Inicial': 1,
        Entradas: 1,
        Salidas: 0,
        Ajustes: 0,
        'Stock Final': 2,
        Periodo: '2026-02',
      },
    ], '2026-02', products);

    expect(result.errors).toEqual([]);
    expect(result.validRows).toBe(4);
    expect(result.rows.find((row) => row.sku === 'IMP-001')?.family).toBe('IMPLANTES');
    expect(result.rows.find((row) => row.sku === 'AD-001')?.family).toBe('ADITAMENTOS');
    expect(result.rows.find((row) => row.sku === 'AD-001')?.entriesQty).toBe(4);
    expect(result.rows.find((row) => row.sku === 'AD-001')?.exitsQty).toBe(2);
    expect(result.rows.find((row) => row.sku === 'KIT-404')?.family).toBe('KITS');
    expect(result.rows.find((row) => row.sku === 'COX-001')?.family).toBe('MOTOR');
  });

  it('usa el nombre del producto para clasificar ventas aunque el SKU no exista en catalogo', () => {
    const result = parseInventoryRows([
      {
        'Nombre Doc': '33 Factura Electronica',
        Fecha: '2026-02-04',
        'Cod. Producto': 'ZZ-999',
        'Desc. Producto': 'Llave Dinamométrica',
        Cantidad: 2,
        'Precio Unitario': 25000,
        'Total Detalle': 50000,
        'Costo Vigente': 12000,
      },
    ], '2026-02', products);

    expect(result.errors).toEqual([]);
    expect(result.validRows).toBe(1);
    expect(result.rows[0]?.sku).toBe('ZZ-999');
    expect(result.rows[0]?.productName).toBe('Llave Dinamométrica');
    expect(result.rows[0]?.family).toBe('KITS');
  });

  it('adapta el reporte comercial diario como salidas mensuales por SKU', () => {
    const result = parseInventoryRows([
      {
        'Nombre Doc': '33 Factura Electronica',
        'Nmero del Documento': 1175,
        'Nombre del Vendedor': 'YESSIKA ARRIECHE',
        'Código del Cliente': '78.409.120-1',
        'Nombre del Cliente': 'CLINICA ODONTOLOGICA PRODENTAL LTDA',
        Fecha: '2026-02-04',
        'Cod. Producto': 'HA4050',
        'Desc. Producto': 'Healing Abutment [AO]',
        Cantidad: 5,
        'Precio Unitario': 9880,
        'Total Detalle': 49400,
        'Costo Vigente': 4810,
      },
    ], '2026-02', products);

    expect(result.errors).toEqual([]);
    expect(result.validRows).toBe(1);
    expect(result.rows[0]?.sku).toBe('HA4050');
    expect(result.rows[0]?.exitsQty).toBe(5);
    expect(result.rows[0]?.closingQty).toBe(0);
    expect(result.warnings.some((warning) => warning.includes('cantidades vendidas como salidas'))).toBe(true);
  });
});
