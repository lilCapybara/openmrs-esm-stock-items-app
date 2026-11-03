import { describe, expect, it } from 'vitest';
import { buildInventoryItems, getStockStatus, worstStatus } from './inventory.utils';
import { type InventoryRow, type StockItem } from '../types';

const SM = '93918ee3-4cb9-49b3-8897-c480b1d895e3';
const SJ = '875bdd70-9e33-4fb7-87d0-840c53c925e6';
const sites = [
  { name: 'Residencia Santa María', locationUuid: SM },
  { name: 'Hogar San José', locationUuid: SJ },
];

function item(overrides: Partial<StockItem>): StockItem {
  return {
    uuid: 'item-1',
    drugUuid: null,
    drugName: null,
    conceptUuid: 'concept-1',
    conceptName: 'Ninguno',
    commonName: 'Pasta dental',
    acronym: 'PD',
    categoryName: 'Higiene personal',
    hasExpiration: false,
    reorderLevel: null,
    reorderLevelUoMName: null,
    reorderLevelUoMFactor: null,
    ...overrides,
  };
}

describe('getStockStatus', () => {
  it('marca sin stock cuando la existencia es 0, aunque no haya umbral', () => {
    expect(getStockStatus(0, null, 20)).toBe('outOfStock');
  });

  it('marca sin umbral cuando el artículo no tiene nivel de reposición', () => {
    expect(getStockStatus(5, null, 20)).toBe('noThreshold');
  });

  it('marca stock bajo cuando la existencia es igual o menor al umbral', () => {
    expect(getStockStatus(3, 3, 20)).toBe('low');
    expect(getStockStatus(2, 3, 20)).toBe('low');
  });

  it('marca cerca del umbral dentro del margen', () => {
    expect(getStockStatus(12, 10, 20)).toBe('nearThreshold');
    expect(getStockStatus(13, 10, 20)).toBe('ok');
  });
});

describe('worstStatus', () => {
  it('devuelve el estado más grave', () => {
    expect(worstStatus(['ok', 'low', 'noThreshold'])).toBe('low');
    expect(worstStatus(['ok', 'outOfStock'])).toBe('outOfStock');
  });
});

describe('buildInventoryItems', () => {
  it('cruza inventario y umbral por sede usando unidades base', () => {
    // Umbral: 2 Cajas de 10 = 20 unidades base
    const stockItems = [item({ reorderLevel: 2, reorderLevelUoMName: 'Caja', reorderLevelUoMFactor: 10 })];
    // Santa María: 1,5 Cajas (15 unidades) -> bajo. San José: 30 Unidad -> OK.
    const inventory: Array<InventoryRow> = [
      {
        stockItemUuid: 'item-1',
        locationUuid: SM,
        partyUuid: 'p1',
        quantity: '1.50000',
        quantityUoM: 'Caja',
        quantityFactor: '10',
      },
      {
        stockItemUuid: 'item-1',
        locationUuid: SJ,
        partyUuid: 'p2',
        quantity: 30,
        quantityUoM: 'Unidad',
        quantityFactor: 1,
      },
    ];

    const [result] = buildInventoryItems(stockItems, inventory, sites, 20);

    expect(result.thresholdBase).toBe(20);
    expect(result.thresholdDisplay).toBe('2 Caja');
    expect(result.sites[SM]).toMatchObject({ baseQuantity: 15, display: '1,5 Caja', status: 'low' });
    expect(result.sites[SJ]).toMatchObject({ baseQuantity: 30, status: 'ok' });
    expect(result.overallStatus).toBe('low');
  });

  it('una sede sin movimientos no cuenta para el estado (caso Shampoo / Pasta dental)', () => {
    const stockItems = [
      item({
        uuid: 'shampoo',
        commonName: 'Shampoo',
        reorderLevel: 10,
        reorderLevelUoMName: 'Unidad',
        reorderLevelUoMFactor: 1,
      }),
      item({ uuid: 'pasta', commonName: 'Pasta dental' }),
      item({ uuid: 'papel', commonName: 'Papel higiénico' }),
    ];
    const inventory: Array<InventoryRow> = [
      {
        stockItemUuid: 'shampoo',
        locationUuid: SM,
        partyUuid: 'p1',
        quantity: 6,
        quantityUoM: 'Unidad',
        quantityFactor: 1,
      },
      {
        stockItemUuid: 'pasta',
        locationUuid: SM,
        partyUuid: 'p1',
        quantity: 5,
        quantityUoM: 'Unidad',
        quantityFactor: 1,
      },
    ];

    const result = Object.fromEntries(buildInventoryItems(stockItems, inventory, sites, 20).map((r) => [r.uuid, r]));

    expect(result.shampoo.sites[SJ]).toMatchObject({ tracked: false, display: '—' });
    expect(result.shampoo.overallStatus).toBe('low');
    expect(result.pasta.overallStatus).toBe('noThreshold');
    // Sin movimientos en ninguna sede: Sin stock
    expect(result.papel.overallStatus).toBe('outOfStock');
  });

  it('una sede que tuvo stock y quedó en 0 sí cuenta como sin stock', () => {
    const [result] = buildInventoryItems(
      [item({ reorderLevel: 2, reorderLevelUoMFactor: 1 })],
      [
        {
          stockItemUuid: 'item-1',
          locationUuid: SM,
          partyUuid: 'p1',
          quantity: 9,
          quantityUoM: 'Unidad',
          quantityFactor: 1,
        },
        {
          stockItemUuid: 'item-1',
          locationUuid: SJ,
          partyUuid: 'p2',
          quantity: 0,
          quantityUoM: 'Unidad',
          quantityFactor: 1,
        },
      ],
      sites,
      20,
    );

    expect(result.sites[SJ]).toMatchObject({ tracked: true, status: 'outOfStock' });
    expect(result.overallStatus).toBe('outOfStock');
  });

  it('ordena primero los artículos en alerta y excluye los anulados', () => {
    const stockItems = [
      item({ uuid: 'a', commonName: 'Acondicionador', reorderLevel: 1, reorderLevelUoMFactor: 1 }),
      item({ uuid: 'b', commonName: 'Barbijo', reorderLevel: 10, reorderLevelUoMFactor: 1 }),
      item({ uuid: 'c', commonName: 'Anulado', voided: true }),
    ];
    const inventory: Array<InventoryRow> = [
      { stockItemUuid: 'a', locationUuid: SM, partyUuid: 'p1', quantity: 50, quantityUoM: 'Unidad', quantityFactor: 1 },
      { stockItemUuid: 'a', locationUuid: SJ, partyUuid: 'p2', quantity: 50, quantityUoM: 'Unidad', quantityFactor: 1 },
      { stockItemUuid: 'b', locationUuid: SM, partyUuid: 'p1', quantity: 4, quantityUoM: 'Unidad', quantityFactor: 1 },
      { stockItemUuid: 'b', locationUuid: SJ, partyUuid: 'p2', quantity: 40, quantityUoM: 'Unidad', quantityFactor: 1 },
    ];

    const result = buildInventoryItems(stockItems, inventory, sites, 20);

    expect(result.map((r) => r.name)).toEqual(['Barbijo', 'Acondicionador']);
  });
});
