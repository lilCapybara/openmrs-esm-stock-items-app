import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { getDefaultsFromConfigSchema, openmrsFetch, useConfig, UserHasAccess } from '@openmrs/esm-framework';
import { configSchema, type Config } from '../config-schema';
import InventoryTable from '../inventory/inventory-table.component';
import LowStockTile from './low-stock-tile.component';

const SM = '93918ee3-4cb9-49b3-8897-c480b1d895e3';

const stockItems = [
  {
    uuid: 'shampoo',
    commonName: 'Shampoo',
    drugUuid: null,
    reorderLevel: 10,
    reorderLevelUoMName: 'Unidad',
    reorderLevelUoMFactor: 1,
  },
  { uuid: 'pasta', commonName: 'Pasta dental', drugUuid: null, reorderLevel: null },
  {
    uuid: 'papel',
    commonName: 'Papel higiénico',
    drugUuid: null,
    reorderLevel: 50,
    reorderLevelUoMName: 'Unidad',
    reorderLevelUoMFactor: 1,
  },
];
const inventory: Record<string, Array<object>> = {
  shampoo: [{ locationUuid: SM, quantity: 6, quantityUoM: 'Unidad', quantityFactor: 1 }],
  pasta: [{ locationUuid: SM, quantity: 5, quantityUoM: 'Unidad', quantityFactor: 1 }],
  papel: [],
};

function setup() {
  vi.mocked(useConfig<Config>).mockReturnValue(getDefaultsFromConfigSchema(configSchema) as Config);
  vi.mocked(UserHasAccess).mockImplementation((props: any) => props.children);
  vi.mocked(openmrsFetch).mockImplementation(async (url: string) => {
    if (url.includes('stockiteminventory')) {
      const uuid = new URL(url, 'http://x').searchParams.get('stockItemUuid') ?? '';
      return { data: { results: inventory[uuid] ?? [] } } as any;
    }
    return { data: { results: stockItems } } as any;
  });
}

describe('Tarjeta de stock a reponer', () => {
  it('cuenta los artículos sin stock y con stock bajo y enlaza al inventario filtrado', async () => {
    setup();
    render(<LowStockTile />);

    // Papel: sin movimientos -> sin stock. Shampoo: 6 <= 10 -> stock bajo. Pasta: sin umbral.
    expect(await screen.findByText('2')).toBeInTheDocument();
    expect(screen.getByText('Stock a reponer')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /ver artículos/i });
    expect(link).toHaveAttribute('href', expect.stringMatching(/home\/inventario\?soloStockBajo=1$/));
  });
});

describe('Filtro desde la URL', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('con ?soloStockBajo=1 la tabla arranca mostrando solo los artículos a reponer', async () => {
    setup();
    window.history.replaceState({}, '', '/openmrs/spa/home/inventario?soloStockBajo=1');

    render(<InventoryTable />);

    expect(await screen.findByText('Shampoo')).toBeInTheDocument();
    expect(screen.getByText('Papel higiénico')).toBeInTheDocument();
    expect(screen.queryByText('Pasta dental')).not.toBeInTheDocument();
    expect(screen.getByRole('switch')).toBeChecked();
  });
});
