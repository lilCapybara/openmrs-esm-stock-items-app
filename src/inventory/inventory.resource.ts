import useSWR from 'swr';
import { useMemo } from 'react';
import { openmrsFetch, restBaseUrl, useConfig } from '@openmrs/esm-framework';
import { type Config } from '../config-schema';
import { type InventoryRow, type StockItem } from '../types';
import { buildInventoryItems } from './inventory.utils';

interface PagedResponse<T> {
  results: Array<T>;
  links?: Array<{ rel: string; uri: string }>;
}

/** Trae todas las páginas de un recurso REST de OpenMRS siguiendo el link "next". */
async function fetchAllPages<T>(url: string): Promise<Array<T>> {
  const all: Array<T> = [];
  let next: string | null = url;
  let guard = 0;
  while (next && guard < 50) {
    const response = await openmrsFetch<PagedResponse<T>>(next);
    all.push(...(response.data?.results ?? []));
    const nextLink = response.data?.links?.find((l) => l.rel === 'next')?.uri ?? null;
    // El backend devuelve URLs absolutas (http://...); las usamos relativas al origen actual.
    next = nextLink ? nextLink.replace(/^https?:\/\/[^/]+/, '') : null;
    guard++;
  }
  return all;
}

export const stockItemsUrl = `${restBaseUrl}/stockmanagement/stockitem?v=full&limit=100`;
export const inventoryUrl = `${restBaseUrl}/stockmanagement/stockiteminventory?v=default&groupBy=LocationStockItem&includeStockItemName=true`;

export function useInventory() {
  const { sites, lowStockMarginPercent } = useConfig<Config>();

  const stockItems = useSWR<Array<StockItem>, Error>(stockItemsUrl, fetchAllPages<StockItem>);
  const inventory = useSWR<Array<InventoryRow>, Error>(inventoryUrl, fetchAllPages<InventoryRow>);

  const items = useMemo(
    () => buildInventoryItems(stockItems.data ?? [], inventory.data ?? [], sites, lowStockMarginPercent),
    [stockItems.data, inventory.data, sites, lowStockMarginPercent],
  );

  return {
    items,
    sites,
    isLoading: stockItems.isLoading || inventory.isLoading,
    isValidating: stockItems.isValidating || inventory.isValidating,
    error: stockItems.error ?? inventory.error,
    mutate: () => Promise.all([stockItems.mutate(), inventory.mutate()]),
  };
}
