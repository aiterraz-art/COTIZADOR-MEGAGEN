import type { CRMClientAggregate, CRMPeriodRow } from '../types/crm';

const normalizeClientCode = (value: string): string => value.trim().toUpperCase();

export const buildClientAggregates = (
  rows: CRMPeriodRow[],
  activeThresholdDays = 90,
): CRMClientAggregate[] => {
  const map = new Map<string, CRMClientAggregate>();
  const now = Date.now();

  for (const row of rows) {
    const key = normalizeClientCode(row.clientCode);
    const existing = map.get(key);
    const saleTs = new Date(row.saleDate).getTime();

    if (!existing) {
      const monthlySales: Record<number, number> = {};
      for (let m = 1; m <= 12; m += 1) monthlySales[m] = 0;
      const month = new Date(row.saleDate).getMonth() + 1;
      monthlySales[month] += row.totalDetail;

      map.set(key, {
        salesRep: row.salesRep || '#N/A',
        clientCode: row.clientCode,
        clientName: row.clientName,
        totalNetSales: row.totalDetail,
        recentSoldDate: row.saleDate,
        status: 'Active',
        invoiceCount: row.documentNumber ? 1 : 0,
        transactionCount: 1,
        monthlySales,
      });
      continue;
    }

    existing.totalNetSales += row.totalDetail;
    existing.transactionCount += 1;
    if (row.documentNumber) existing.invoiceCount += 1;

    const existingTs = new Date(existing.recentSoldDate).getTime();
    if (saleTs > existingTs) {
      existing.recentSoldDate = row.saleDate;
      existing.salesRep = row.salesRep || existing.salesRep;
      existing.clientName = row.clientName || existing.clientName;
    }

    const month = new Date(row.saleDate).getMonth() + 1;
    existing.monthlySales[month] = (existing.monthlySales[month] ?? 0) + row.totalDetail;
  }

  const result: CRMClientAggregate[] = Array.from(map.values()).map((item) => {
    const daysWithoutPurchase = (now - new Date(item.recentSoldDate).getTime()) / (1000 * 60 * 60 * 24);
    return {
      ...item,
      status: daysWithoutPurchase > activeThresholdDays ? ('Inactive' as const) : ('Active' as const),
    };
  });

  result.sort((a, b) => b.totalNetSales - a.totalNetSales);
  return result;
};

export const buildSalesRepSummary = (clients: CRMClientAggregate[]) => {
  const repMap = new Map<string, {
    salesRep: string;
    customerCount: number;
    activeCount: number;
    inactiveCount: number;
    totalSales: number;
  }>();

  for (const client of clients) {
    const key = client.salesRep || '#N/A';
    const existing = repMap.get(key) ?? {
      salesRep: key,
      customerCount: 0,
      activeCount: 0,
      inactiveCount: 0,
      totalSales: 0,
    };

    existing.customerCount += 1;
    existing.totalSales += client.totalNetSales;
    if (client.status === 'Active') existing.activeCount += 1;
    else existing.inactiveCount += 1;

    repMap.set(key, existing);
  }

  return Array.from(repMap.values()).sort((a, b) => b.totalSales - a.totalSales);
};
