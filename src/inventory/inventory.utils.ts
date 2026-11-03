import { type SiteConfig } from '../config-schema';
import {
  type InventoryItem,
  type InventoryRow,
  type SiteStock,
  type StockItem,
  type StockStatus,
} from '../types';

/** Orden de gravedad: el primero es el peor. */
const STATUS_SEVERITY: Array<StockStatus> = ['outOfStock', 'low', 'nearThreshold', 'ok', 'noThreshold'];

export function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Formatea cantidades sin ceros sobrantes: 6.00000 -> "6", 2.5 -> "2,5". */
export function formatQuantity(value: number): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(value);
}

export function getItemName(item: StockItem): string {
  return item.commonName || item.drugName || item.conceptName || item.uuid;
}

/**
 * Calcula el estado de una existencia frente al umbral (ambos en unidades base).
 * - Sin stock: existencia 0 (aunque no tenga umbral).
 * - Bajo: existencia <= umbral.
 * - Cerca del umbral: existencia <= umbral * (1 + margen%).
 */
export function getStockStatus(baseQuantity: number, thresholdBase: number | null, marginPercent: number): StockStatus {
  if (baseQuantity <= 0) {
    return 'outOfStock';
  }
  if (thresholdBase === null || thresholdBase <= 0) {
    return 'noThreshold';
  }
  if (baseQuantity <= thresholdBase) {
    return 'low';
  }
  if (baseQuantity <= thresholdBase * (1 + marginPercent / 100)) {
    return 'nearThreshold';
  }
  return 'ok';
}

export function worstStatus(statuses: Array<StockStatus>): StockStatus {
  if (statuses.length === 0) {
    return 'noThreshold';
  }
  return statuses.reduce((worst, current) =>
    STATUS_SEVERITY.indexOf(current) < STATUS_SEVERITY.indexOf(worst) ? current : worst,
  );
}

export function isAlertStatus(status: StockStatus): boolean {
  return status === 'outOfStock' || status === 'low';
}

/**
 * Cruza los artículos con el inventario agrupado por (ubicación, artículo)
 * y arma una fila por artículo con la existencia de cada sede configurada.
 */
export function buildInventoryItems(
  stockItems: Array<StockItem>,
  inventory: Array<InventoryRow>,
  sites: Array<SiteConfig>,
  marginPercent: number,
): Array<InventoryItem> {
  // índice: stockItemUuid -> locationUuid -> filas
  const index = new Map<string, Map<string, Array<InventoryRow>>>();
  for (const row of inventory) {
    if (!row.stockItemUuid || !row.locationUuid) {
      continue;
    }
    const byLocation = index.get(row.stockItemUuid) ?? new Map<string, Array<InventoryRow>>();
    const rows = byLocation.get(row.locationUuid) ?? [];
    rows.push(row);
    byLocation.set(row.locationUuid, rows);
    index.set(row.stockItemUuid, byLocation);
  }

  return stockItems
    .filter((item) => !item.voided)
    .map((item) => {
      const reorderLevel = item.reorderLevel === null ? null : toNumber(item.reorderLevel);
      const thresholdBase =
        reorderLevel !== null && reorderLevel > 0 ? reorderLevel * (toNumber(item.reorderLevelUoMFactor) || 1) : null;
      const thresholdDisplay =
        thresholdBase !== null ? `${formatQuantity(reorderLevel)} ${item.reorderLevelUoMName ?? ''}`.trim() : null;

      const sitesStock: Record<string, SiteStock> = {};
      for (const site of sites) {
        const rows = index.get(item.uuid)?.get(site.locationUuid) ?? [];
        const baseQuantity = rows.reduce((sum, r) => sum + toNumber(r.quantity) * (toNumber(r.quantityFactor) || 1), 0);
        // Si hay una sola fila mostramos la unidad que eligió el backend; si no, en unidades base.
        const display =
          rows.length === 1
            ? `${formatQuantity(toNumber(rows[0].quantity))} ${rows[0].quantityUoM ?? ''}`.trim()
            : formatQuantity(baseQuantity);
        sitesStock[site.locationUuid] = {
          locationUuid: site.locationUuid,
          baseQuantity,
          display,
          status: getStockStatus(baseQuantity, thresholdBase, marginPercent),
        };
      }

      return {
        uuid: item.uuid,
        name: getItemName(item),
        type: item.drugUuid ? 'drug' : 'nonDrug',
        category: item.categoryName,
        thresholdBase,
        thresholdDisplay,
        sites: sitesStock,
        overallStatus: worstStatus(Object.values(sitesStock).map((s) => s.status)),
      } satisfies InventoryItem;
    })
    .sort((a, b) => {
      const bySeverity = STATUS_SEVERITY.indexOf(a.overallStatus) - STATUS_SEVERITY.indexOf(b.overallStatus);
      return bySeverity !== 0 ? bySeverity : a.name.localeCompare(b.name, 'es');
    });
}
