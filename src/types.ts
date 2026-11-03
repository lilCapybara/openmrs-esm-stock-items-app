/** Artículo tal como lo devuelve GET stockmanagement/stockitem?v=full (solo los campos que usamos). */
export interface StockItem {
  uuid: string;
  drugUuid: string | null;
  drugName: string | null;
  conceptUuid: string | null;
  conceptName: string | null;
  commonName: string | null;
  acronym: string | null;
  categoryName: string | null;
  hasExpiration: boolean;
  reorderLevel: number | null;
  reorderLevelUoMName: string | null;
  reorderLevelUoMFactor: number | null;
  reorderLevelUoMUuid?: string | null;
  packagingUnits?: Array<PackagingUnit>;
  voided?: boolean;
}

/** Unidad de empaque de un artículo (stockitempackaginguom). */
export interface PackagingUnit {
  uuid: string;
  packagingUomUuid: string;
  packagingUomName: string;
  factor: number | string;
}

/** Fila de GET stockmanagement/stockiteminventory?groupBy=LocationStockItem. */
export interface InventoryRow {
  stockItemUuid: string | null;
  locationUuid: string | null;
  partyUuid: string | null;
  /** Cantidad expresada en quantityUoM (el backend elige la unidad más conveniente). */
  quantity: number | string;
  quantityUoM: string | null;
  /** Cuántas unidades base equivalen a 1 quantityUoM. */
  quantityFactor: number | string | null;
}

export type StockStatus = 'outOfStock' | 'low' | 'nearThreshold' | 'ok' | 'noThreshold';

export interface SiteStock {
  locationUuid: string;
  /** Existencia en unidades base (factor 1). */
  baseQuantity: number;
  /** Texto para mostrar, ej. "6 Unidad". */
  display: string;
  status: StockStatus;
  /** false si el artículo nunca tuvo movimientos en esta sede: no se considera para el estado. */
  tracked: boolean;
}

export interface InventoryItem {
  uuid: string;
  name: string;
  type: 'drug' | 'nonDrug';
  category: string | null;
  /** Umbral en unidades base, o null si el artículo no tiene nivel de reposición. */
  thresholdBase: number | null;
  thresholdDisplay: string | null;
  sites: Record<string, SiteStock>;
  /** Peor estado entre todas las sedes. */
  overallStatus: StockStatus;
  /** Artículo original, para poder editarlo. */
  stockItem: StockItem;
}
