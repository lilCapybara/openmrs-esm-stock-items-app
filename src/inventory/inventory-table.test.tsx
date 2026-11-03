import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getDefaultsFromConfigSchema, openmrsFetch, useConfig } from '@openmrs/esm-framework';
import { configSchema, type Config } from '../config-schema';
import InventoryTable from './inventory-table.component';

const mockOpenmrsFetch = vi.mocked(openmrsFetch);
const mockUseConfig = vi.mocked(useConfig<Config>);

const SM = '93918ee3-4cb9-49b3-8897-c480b1d895e3';
const SJ = '875bdd70-9e33-4fb7-87d0-840c53c925e6';

const stockItems = [
  {
    uuid: 'pasta',
    commonName: 'Pasta dental',
    drugUuid: null,
    categoryName: 'Higiene personal',
    reorderLevel: 3,
    reorderLevelUoMName: 'Unidad',
    reorderLevelUoMFactor: 1,
  },
  {
    uuid: 'ibu',
    commonName: 'Ibuprofeno 400 mg',
    drugUuid: 'drug-1',
    categoryName: 'Medicamento',
    reorderLevel: 3,
    reorderLevelUoMName: 'Caja',
    reorderLevelUoMFactor: 10,
  },
];

const inventory = [
  { stockItemUuid: 'pasta', locationUuid: SM, quantity: 5, quantityUoM: 'Unidad', quantityFactor: 1 },
  { stockItemUuid: 'pasta', locationUuid: SJ, quantity: 8, quantityUoM: 'Unidad', quantityFactor: 1 },
  { stockItemUuid: 'ibu', locationUuid: SM, quantity: 2, quantityUoM: 'Caja', quantityFactor: 10 },
];

describe('InventoryTable', () => {
  it('muestra la existencia por sede, el umbral y el aviso de stock bajo', async () => {
    mockUseConfig.mockReturnValue(getDefaultsFromConfigSchema(configSchema) as Config);
    // Simula al backend real: el inventario solo responde si se pide un artículo puntual
    // (stockItemUuid) y devuelve las filas con stockItemUuid vacío.
    mockOpenmrsFetch.mockImplementation((url: string) => {
      if (url.includes('stockiteminventory')) {
        const uuid = new URL(url, 'http://x').searchParams.get('stockItemUuid');
        const rows = uuid
          ? inventory.filter((r) => r.stockItemUuid === uuid).map((r) => ({ ...r, stockItemUuid: null }))
          : [];
        return Promise.resolve({ data: { results: rows } } as any);
      }
      return Promise.resolve({ data: { results: stockItems } } as any);
    });

    render(<InventoryTable />);

    expect(await screen.findByText('Ibuprofeno 400 mg')).toBeInTheDocument();
    expect(screen.getByText('Residencia Santa María')).toBeInTheDocument();
    expect(screen.getByText('Hogar San José')).toBeInTheDocument();
    expect(screen.getByText('2 Caja')).toBeInTheDocument();
    expect(screen.getByText('3 Caja')).toBeInTheDocument();
    // Ibuprofeno: 20 unidades en SM (< 30) y sin movimientos en SJ -> Stock bajo; aparece el aviso
    expect(screen.getByText('Reposición necesaria')).toBeInTheDocument();
    expect(screen.getByText('Stock bajo')).toBeInTheDocument();
    expect(screen.queryByText('Sin stock')).not.toBeInTheDocument();

    // El filtro "Solo stock bajo" deja solo el ibuprofeno (la pasta está OK en ambas sedes)
    await userEvent.click(screen.getByRole('switch'));
    expect(screen.queryByText('Pasta dental')).not.toBeInTheDocument();
    expect(screen.getByText('Ibuprofeno 400 mg')).toBeInTheDocument();
  });
});
