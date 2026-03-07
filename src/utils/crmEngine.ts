import type { CRMClientAggregate, CRMPeriodRow } from '../types/crm';

const normalizeClientCode = (value: string): string => value.trim().toUpperCase();
const MONTHS = 12;

const toMonthlySalesRecord = (source?: Record<number, number>): Record<number, number> => {
  const monthlySales: Record<number, number> = {};
  for (let month = 1; month <= MONTHS; month += 1) {
    monthlySales[month] = Number(source?.[month] ?? 0);
  }
  return monthlySales;
};

const toTimestamp = (date: string): number => {
  const ts = new Date(date).getTime();
  return Number.isFinite(ts) ? ts : 0;
};

const resolveStatus = (recentSoldDate: string, activeThresholdDays: number): CRMClientAggregate['status'] => {
  const now = Date.now();
  const daysWithoutPurchase = (now - toTimestamp(recentSoldDate)) / (1000 * 60 * 60 * 24);
  return daysWithoutPurchase > activeThresholdDays ? 'Inactive' : 'Active';
};

export const buildClientAggregates = (
  rows: CRMPeriodRow[],
  activeThresholdDays = 90,
): CRMClientAggregate[] => {
  const map = new Map<string, CRMClientAggregate>();

  for (const row of rows) {
    const key = normalizeClientCode(row.clientCode);
    const existing = map.get(key);
    const saleTs = toTimestamp(row.saleDate);

    if (!existing) {
      const monthlySales = toMonthlySalesRecord();
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

    const existingTs = toTimestamp(existing.recentSoldDate);
    if (saleTs > existingTs) {
      existing.recentSoldDate = row.saleDate;
      existing.salesRep = row.salesRep || existing.salesRep;
      existing.clientName = row.clientName || existing.clientName;
    }

    const month = new Date(row.saleDate).getMonth() + 1;
    existing.monthlySales[month] = (existing.monthlySales[month] ?? 0) + row.totalDetail;
  }

  const result: CRMClientAggregate[] = Array.from(map.values()).map((item) => ({
    ...item,
    status: resolveStatus(item.recentSoldDate, activeThresholdDays),
  }));

  result.sort((a, b) => b.totalNetSales - a.totalNetSales);
  return result;
};

export const mergeClientAggregates = (
  previousClients: CRMClientAggregate[],
  newClients: CRMClientAggregate[],
  activeThresholdDays = 90,
): CRMClientAggregate[] => {
  const map = new Map<string, CRMClientAggregate>();

  for (const client of previousClients) {
    const key = normalizeClientCode(client.clientCode);
    map.set(key, {
      ...client,
      monthlySales: toMonthlySalesRecord(client.monthlySales),
    });
  }

  for (const client of newClients) {
    const key = normalizeClientCode(client.clientCode);
    const existing = map.get(key);

    if (!existing) {
      map.set(key, {
        ...client,
        monthlySales: toMonthlySalesRecord(client.monthlySales),
      });
      continue;
    }

    existing.totalNetSales += client.totalNetSales;
    existing.invoiceCount += client.invoiceCount;
    existing.transactionCount += client.transactionCount;

    for (let month = 1; month <= MONTHS; month += 1) {
      existing.monthlySales[month] = (existing.monthlySales[month] ?? 0) + (client.monthlySales[month] ?? 0);
    }

    if (client.clientName) {
      existing.clientName = client.clientName;
    }

    if (toTimestamp(client.recentSoldDate) >= toTimestamp(existing.recentSoldDate)) {
      existing.recentSoldDate = client.recentSoldDate;
      if (client.salesRep) {
        existing.salesRep = client.salesRep;
      }
    }
  }

  const merged = Array.from(map.values()).map((item) => ({
    ...item,
    status: resolveStatus(item.recentSoldDate, activeThresholdDays),
  }));

  merged.sort((a, b) => b.totalNetSales - a.totalNetSales);
  return merged;
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
