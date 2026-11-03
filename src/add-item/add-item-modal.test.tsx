import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

const mockFetch = vi.mocked(openmrsFetch);

const UNITS = [
  { uuid: 'u-unidad', display: 'Unidad' },
  { uuid: 'u-caja', display: 'Caja' },
];
const CATEGORIES = [{ uuid: 'c-desc', display: 'Material descartable' }];

function setup() {
  const config = getDefaultsFromConfigSchema(configSchema) as Config;
  vi.mocked(useConfig<Config>).mockReturnValue(config);
  vi.mocked(UserHasAccess).mockImplementation((props: any) => props.children);

  const posts: Array<{ url: string; body: any }> = [];
  let pu = 0;
  mockFetch.mockImplementation(async (url: string, init?: any) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(init.body);
      posts.push({ url, body });
      if (url.endsWith('/concept')) return { data: { uuid: 'concept-new' } } as any;
      if (url.endsWith('/stockmanagement/stockitem')) return { data: { uuid: 'item-new' } } as any;
      if (url.endsWith('/stockitempackaginguom')) return { data: { uuid: `pu-${++pu}` } } as any;
      return { data: {} } as any;
    }
    if (url.includes(config.packagingUnitsConceptUuid)) return { data: { answers: UNITS } } as any;
    if (url.includes(config.categoriesConceptUuid)) return { data: { answers: CATEGORIES } } as any;
    // listado de inventario, búsquedas de conceptos: vacíos
    return { data: { results: [] } } as any;
  });
  return { posts };
}

describe('Alta de artículo desde la tabla', () => {
  it('crea un descartable con unidad mayor y nivel de reposición en cajas', async () => {
    const user = userEvent.setup();
    const { posts } = setup();

    render(<InventoryTable />);

    await user.click(await screen.findByRole('button', { name: /nuevo artículo/i }));

    await user.type(screen.getByLabelText('Nombre'), 'Guantes descartables');

    await user.click(screen.getByRole('combobox', { name: 'Categoría' }));
    await user.click(await screen.findByRole('option', { name: 'Material descartable' }));

    await user.click(screen.getByRole('combobox', { name: 'Unidad base' }));
    await user.click(await screen.findByRole('option', { name: 'Unidad' }));

    await user.click(screen.getByRole('combobox', { name: 'Unidad mayor (opcional)' }));
    await user.click(await screen.findByRole('option', { name: 'Caja' }));
    await user.type(screen.getByLabelText(/cantidad por/i), '100');

    await user.type(screen.getByLabelText('Nivel de reposición (opcional)'), '2');
    await user.click(screen.getByRole('combobox', { name: 'Expresado en' }));
    await user.click(await screen.findByRole('option', { name: 'Caja' }));

    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(showSnackbar).toHaveBeenCalledWith(expect.objectContaining({ kind: 'success' })));

    const item = posts.find((p) => p.url.endsWith('/stockmanagement/stockitem'));
    expect(item?.body).toMatchObject({
      conceptUuid: 'concept-new',
      commonName: 'Guantes descartables',
      categoryUuid: 'c-desc',
      dispensingUnitUuid: 'u-unidad',
    });
    const packaging = posts.filter((p) => p.url.endsWith('/stockitempackaginguom')).map((p) => p.body);
    expect(packaging).toEqual([
      { stockItemUuid: 'item-new', packagingUomUuid: 'u-unidad', factor: 1 },
      { stockItemUuid: 'item-new', packagingUomUuid: 'u-caja', factor: 100 },
    ]);
    const update = posts.find((p) => p.url.endsWith('/stockitem/item-new'));
    expect(update?.body).toMatchObject({ reorderLevel: 2, reorderLevelUoMUuid: 'pu-2' });
  });

  it('muestra los errores de validación y no llama al backend', async () => {
    const user = userEvent.setup();
    const { posts } = setup();

    render(<InventoryTable />);

    await user.click(await screen.findByRole('button', { name: /nuevo artículo/i }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Ingresá el nombre del artículo.')).toBeInTheDocument();
    expect(screen.getByText('Elegí una categoría.')).toBeInTheDocument();
    expect(posts).toHaveLength(0);
  });
});
