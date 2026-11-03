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

export function inventoryUrlFor(stockItemUuid: string) {
  return `${restBaseUrl}/stockmanagement/stockiteminventory?v=default&groupBy=LocationStockItem&stockItemUuid=${stockItemUuid}`;
}

/** Cuántos pedidos de inventario se hacen a la vez. */
const CONCURRENCY = 6;

/**
 * El endpoint de inventario del módulo de stock no devuelve nada si no se le indica un artículo
 * (requireItemGroupFilters), así que se consulta artículo por artículo. Además, en esa respuesta
 * stockItemUuid viene vacío: se lo asignamos acá a partir del artículo consultado.
 */
export async function fetchInventoryForItems(stockItemUuids: Array<string>): Promise<Array<InventoryRow>> {
  const results: Array<Array<InventoryRow>> = new Array(stockItemUuids.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < stockItemUuids.length) {
      const index = cursor++;
      const uuid = stockItemUuids[index];
      const rows = await fetchAllPages<InventoryRow>(inventoryUrlFor(uuid));
      results[index] = rows.map((row) => ({ ...row, stockItemUuid: uuid }));
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, stockItemUuids.length) }, worker));
  return results.flat();
}

export function useInventory() {
  const { sites, lowStockMarginPercent } = useConfig<Config>();

  const stockItems = useSWR<Array<StockItem>, Error>(stockItemsUrl, fetchAllPages<StockItem>);

  const activeUuids = useMemo(
    () => (stockItems.data ?? []).filter((i) => !i.voided).map((i) => i.uuid),
    [stockItems.data],
  );
  const inventory = useSWR<Array<InventoryRow>, Error>(
    stockItems.data ? ['stock-inventory', ...activeUuids] : null,
    () => fetchInventoryForItems(activeUuids),
  );

  const items = useMemo(
    () => buildInventoryItems(stockItems.data ?? [], inventory.data ?? [], sites, lowStockMarginPercent),
    [stockItems.data, inventory.data, sites, lowStockMarginPercent],
  );

  return {
    items,
    sites,
    isLoading: stockItems.isLoading || (!!stockItems.data && inventory.isLoading),
    isValidating: stockItems.isValidating || inventory.isValidating,
    error: stockItems.error ?? inventory.error,
    mutate: () => Promise.all([stockItems.mutate(), inventory.mutate()]),
  };
}
