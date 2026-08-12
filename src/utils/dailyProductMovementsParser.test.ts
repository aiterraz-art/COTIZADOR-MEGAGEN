import { describe, expect, it } from 'vitest';
import { parseDailyProductMovementsFile } from './dailyProductMovementsParser';

describe('dailyProductMovementsParser', () => {
  it('tolera filas CSV con comillas mal formadas del mayor auxiliar', async () => {
    const csv = [
      '"Periodo";"11/08/2026 al 11/08/2026"',
      '"Codigo";"Descripcion";"Fecha";"Documento";"Numero";"Bodega";"Entrada";"Salida";"Saldo";"Valor Unitario";"Monto Entrada";"Monto Salida";"Monto Saldo";"Costo Unitario"',
      '"H-DHIF4510";""""AnyOne Internal Dummy (Hands-on) (C4.1) 4.5/ L10.0"""";;Saldo Anterior;;;;;0;;;;0;0',
      '"MKASB3000M";""""Scan Bar Kit [CM] "";;Saldo Anterior;;;;;0;;;;0;0',
      '"MKASB3000M";""""Scan Bar Kit [CM] "";11/08/2026;PARTE ENTRADA IMPORT;187;BODEGA CENTRAL;2;0;2;1506450;3012900;0;3012900;1506450',
    ].join('\r\n');

    const file = new File([csv], 'mayor-auxiliar.csv', { type: 'text/csv' });
    const result = await parseDailyProductMovementsFile(file);

    expect(result.totalRows).toBe(3);
    expect(result.openingRows).toBe(2);
    expect(result.movementRows).toBe(1);
    expect(result.rows[0]?.description).toBe('"AnyOne Internal Dummy (Hands-on) (C4.1) 4.5/ L10.0"');
    expect(result.rows[1]?.description).toBe('"Scan Bar Kit [CM] "');
    expect(result.rows[2]?.document).toBe('PARTE ENTRADA IMPORT');
    expect(result.totalEntryQty).toBe(2);
    expect(result.totalEntryAmountCLP).toBe(3_012_900);
  });
});
