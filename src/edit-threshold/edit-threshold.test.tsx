import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  getDefaultsFromConfigSchema,
  openmrsFetch,
  showSnackbar,
  useConfig,
  UserHasAccess,
} from '@openmrs/esm-framework';
import { configSchema, type Config } from '../config-schema';
import InventoryTable from '../inventory/inventory-table.component';
import { type StockItem } from '../types';
import { initialEditValues, NEW_UNIT, saveThreshold, validateEditThreshold } from './edit-threshold.resource';

const mockFetch = vi.mocked(openmrsFetch);

function stockItem(overrides: Partial<StockItem>): StockItem {
  return {
    uuid: 'shampoo',
    drugUuid: null,
    drugName: null,
    conceptUuid: 'c1',
    conceptName: null,
    commonName: 'Shampoo',
    acronym: 'SH',
    categoryName: 'Higiene personal',
    hasExpiration: false,
    reorderLevel: null,
    reorderLevelUoMName: null,
    reorderLevelUoMFactor: null,
    reorderLevelUoMUuid: null,
    packagingUnits: [{ uuid: 'pu-unidad', packagingUomUuid: 'u-unidad', packagingUomName: 'Unidad', factor: 1 }],
    ...overrides,
  };
}

type Post = { url: string; body: any };

function mockPosts() {
  const posts: Array<Post> = [];
  mockFetch.mockImplementation(async (url: string, init?: any) => {
    if (init?.method === 'POST') {
      posts.push({ url, body: JSON.parse(init.body) });
      if (url.endsWith('/stockitempackaginguom')) return { data: { uuid: 'pu-new' } } as any;
    }
    return { data: {} } as any;
  });
  return posts;
}

describe('edit-threshold.resource', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('precarga el nivel y la unidad actuales', () => {
    const values = initialEditValues(stockItem({ reorderLevel: 3, reorderLevelUoMUuid: 'pu-unidad' }));
    expect(values).toMatchObject({ reorderLevel: '3', reorderLevelUnit: 'pu-unidad' });
  });

  it('para un artículo sin unidades, la unidad nueva es la base', () => {
    const values = initialEditValues(stockItem({ packagingUnits: [] }));
    expect(values).toMatchObject({ reorderLevelUnit: NEW_UNIT, newUnitFactor: '1' });
    const errors = validateEditThreshold({ ...values, reorderLevel: '5' }, []);
    expect(errors.newUnitConceptUuid).toMatch(/unidad base/i);
  });

  it('valida la unidad mayor duplicada o con factor inválido', () => {
    const units = stockItem({}).packagingUnits!;
    const base = { reorderLevel: '', reorderLevelUnit: 'pu-unidad', newUnitFactor: '1' };
    expect(validateEditThreshold({ ...base, newUnitConceptUuid: 'u-unidad' }, units).newUnitConceptUuid).toBeDefined();
    expect(validateEditThreshold({ ...base, newUnitConceptUuid: 'u-caja' }, units).newUnitFactor).toBeDefined();
  });

  it('guarda el nivel en una unidad existente', async () => {
    const posts = mockPosts();
    await saveThreshold(stockItem({}), {
      reorderLevel: '4',
      reorderLevelUnit: 'pu-unidad',
      newUnitConceptUuid: '',
      newUnitFactor: '',
    });
    expect(posts).toEqual([
      {
        url: expect.stringMatching(/stockitem\/shampoo$/),
        body: { reorderLevel: 4, reorderLevelUoMUuid: 'pu-unidad' },
      },
    ]);
  });

  it('agrega una unidad mayor y expresa el nivel en ella', async () => {
    const posts = mockPosts();
    await saveThreshold(stockItem({}), {
      reorderLevel: '2',
      reorderLevelUnit: NEW_UNIT,
      newUnitConceptUuid: 'u-caja',
      newUnitFactor: '12',
    });
    expect(posts[0].body).toEqual({ stockItemUuid: 'shampoo', packagingUomUuid: 'u-caja', factor: 12 });
    expect(posts[1].body).toEqual({ reorderLevel: 2, reorderLevelUoMUuid: 'pu-new' });
  });

  it('a un artículo sin unidades le crea la base y la usa como unidad por defecto', async () => {
    const posts = mockPosts();
    await saveThreshold(stockItem({ packagingUnits: [] }), {
      reorderLevel: '10',
      reorderLevelUnit: NEW_UNIT,
      newUnitConceptUuid: 'u-unidad',
      newUnitFactor: '1',
    });
    expect(posts[0].body.factor).toBe(1);
    expect(posts[1].body).toEqual({
      reorderLevel: 10,
      reorderLevelUoMUuid: 'pu-new',
      dispensingUnitPackagingUoMUuid: 'pu-new',
      defaultStockOperationsUoMUuid: 'pu-new',
    });
  });

  it('con el nivel vacío quita el umbral', async () => {
    const posts = mockPosts();
    await saveThreshold(stockItem({ reorderLevel: 3, reorderLevelUoMUuid: 'pu-unidad' }), {
      reorderLevel: '',
      reorderLevelUnit: 'pu-unidad',
      newUnitConceptUuid: '',
      newUnitFactor: '',
    });
    expect(posts).toEqual([{ url: expect.stringMatching(/stockitem\/shampoo$/), body: { reorderLevelUoMUuid: '' } }]);
  });
});

describe('Editar nivel de reposición desde la tabla', () => {
  it('agrega Caja de 12 al shampoo y le carga un nivel de 2 Cajas', async () => {
    const user = userEvent.setup();
    const config = getDefaultsFromConfigSchema(configSchema) as Config;
    vi.mocked(useConfig<Config>).mockReturnValue(config);
    vi.mocked(UserHasAccess).mockImplementation((props: any) => props.children);

    const posts: Array<Post> = [];
    mockFetch.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'POST') {
        posts.push({ url, body: JSON.parse(init.body) });
        return { data: { uuid: 'pu-new' } } as any;
      }
      if (url.includes(config.packagingUnitsConceptUuid)) {
        return {
          data: {
            answers: [
              { uuid: 'u-unidad', display: 'Unidad' },
              { uuid: 'u-caja', display: 'Caja' },
            ],
          },
        } as any;
      }
      if (url.includes('/stockmanagement/stockitem?')) return { data: { results: [stockItem({})] } } as any;
      return { data: { results: [] } } as any;
    });

    render(<InventoryTable />);

    await screen.findByText('Shampoo');
    const row = screen.getByRole('row', { name: /shampoo/i });
    expect(within(row).getByText('Sin stock')).toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: /editar nivel de reposición/i }));

    const dialog = await screen.findByRole('dialog', { name: 'Shampoo' });
    expect(within(dialog).getByText('Unidad (base)')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('combobox', { name: 'Agregar unidad mayor (opcional)' }));
    await user.click(await within(dialog).findByRole('option', { name: 'Caja' }));
    await user.type(within(dialog).getByLabelText(/cantidad por/i), '12');
    await user.type(within(dialog).getByLabelText('Nivel de reposición'), '2');
    await user.click(within(dialog).getByRole('combobox', { name: 'Expresado en' }));
    await user.click(await within(dialog).findByRole('option', { name: 'Caja (nueva)' }));
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(showSnackbar).toHaveBeenCalledWith(expect.objectContaining({ kind: 'success' })));
    expect(posts.map((p) => p.body)).toEqual([
      { stockItemUuid: 'shampoo', packagingUomUuid: 'u-caja', factor: 12 },
      { reorderLevel: 2, reorderLevelUoMUuid: 'pu-new' },
    ]);
  });
});
