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
  useSession,
} from '@openmrs/esm-framework';
import { configSchema, type Config } from '../config-schema';
import InventoryTable from '../inventory/inventory-table.component';
import { type StockItem } from '../types';
import { registerMovement } from './movement.resource';
import { allocateFefo, type MovementFormValues, validateMovement } from './movement.utils';

const mockFetch = vi.mocked(openmrsFetch);
const SM = '93918ee3-4cb9-49b3-8897-c480b1d895e3';

const units = [
  { uuid: 'pu-unidad', packagingUomUuid: 'u-unidad', packagingUomName: 'Unidad', factor: 1 },
  { uuid: 'pu-caja', packagingUomUuid: 'u-caja', packagingUomName: 'Caja', factor: 10 },
];

function stockItem(overrides: Partial<StockItem> = {}): StockItem {
  return {
    uuid: 'papel',
    drugUuid: null,
    drugName: null,
    conceptUuid: 'c1',
    conceptName: null,
    commonName: 'Papel higiénico',
    acronym: 'PH',
    categoryName: 'Higiene personal',
    hasExpiration: false,
    reorderLevel: 50,
    reorderLevelUoMName: 'Unidad',
    reorderLevelUoMFactor: 1,
    reorderLevelUoMUuid: 'pu-unidad',
    packagingUnits: units,
    ...overrides,
  };
}

function values(overrides: Partial<MovementFormValues>): MovementFormValues {
  return {
    kind: 'in',
    siteLocationUuid: SM,
    quantity: '30',
    unitUuid: 'pu-unidad',
    sourcePartyUuid: 'party-proveedor',
    batchNo: '',
    expiration: '',
    reasonUuid: 'r-consumo',
    remarks: '',
    ...overrides,
  };
}

const config = {
  receiptOperationTypeUuid: 'op-receipt',
  adjustmentOperationTypeUuid: 'op-adjustment',
  noBatchNumber: 'SIN-LOTE',
};

function mockPosts() {
  const posts: Array<{ url: string; body: any }> = [];
  mockFetch.mockImplementation(async (url: string, init?: any) => {
    if (init?.method === 'POST') {
      posts.push({ url, body: JSON.parse(init.body) });
      return { data: { uuid: 'operation-1' } } as any;
    }
    return { data: { results: [] } } as any;
  });
  return posts;
}

describe('allocateFefo', () => {
  it('descuenta primero del lote que vence antes y deja al final los que no vencen', () => {
    const batches = [
      { stockBatchUuid: 'sin-venc', batchNumber: 'SIN-LOTE', expiration: null, baseQuantity: 100 },
      { stockBatchUuid: 'b-2027', batchNumber: 'L2', expiration: '2027-06-01T00:00:00.000Z', baseQuantity: 5 },
      { stockBatchUuid: 'b-2026', batchNumber: 'L1', expiration: '2026-12-01T00:00:00.000Z', baseQuantity: 3 },
    ];
    expect(allocateFefo(batches, 10)).toEqual([
      { stockBatchUuid: 'b-2026', batchNumber: 'L1', baseQuantity: 3 },
      { stockBatchUuid: 'b-2027', batchNumber: 'L2', baseQuantity: 5 },
      { stockBatchUuid: 'sin-venc', batchNumber: 'SIN-LOTE', baseQuantity: 2 },
    ]);
  });

  it('devuelve null si no alcanza la existencia', () => {
    expect(allocateFefo([{ stockBatchUuid: 'b', batchNumber: null, expiration: null, baseQuantity: 4 }], 5)).toBeNull();
  });
});

describe('validateMovement', () => {
  const today = new Date(2026, 10, 3);

  it('un ingreso exige origen, y lote y vencimiento futuro si el artículo vence', () => {
    const errors = validateMovement(values({ sourcePartyUuid: '', expiration: '2026-11-03' }), {
      units,
      hasExpiration: true,
      availableBase: null,
      today,
    });
    expect(Object.keys(errors).sort()).toEqual(['batchNo', 'expiration', 'sourcePartyUuid']);
  });

  it('un egreso no puede superar la existencia (convirtiendo unidades)', () => {
    // 2 Cajas = 20 unidades, hay 15
    const errors = validateMovement(values({ kind: 'out', quantity: '2', unitUuid: 'pu-caja' }), {
      units,
      hasExpiration: false,
      availableBase: 15,
    });
    expect(errors.quantity).toMatch(/suficiente/);
  });

  it('avisa si el artículo no tiene unidades', () => {
    const errors = validateMovement(values({ unitUuid: '' }), { units: [], hasExpiration: false, availableBase: null });
    expect(errors.unitUuid).toMatch(/unidad base/);
  });
});

describe('registerMovement', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('ingreso: crea un Receipt con lote SIN-LOTE y lo completa', async () => {
    const posts = mockPosts();
    await registerMovement(stockItem(), values({ quantity: '3', unitUuid: 'pu-caja' }), config, {
      sitePartyUuid: 'party-sm',
      responsibleUserUuid: 'user-1',
      batches: [],
      now: new Date('2026-11-03T12:00:00.000Z'),
    });

    expect(posts[0].url).toMatch(/stockmanagement\/stockoperation$/);
    expect(posts[0].body).toEqual({
      operationDate: '2026-11-03T11:59:00.000Z',
      responsiblePersonUuid: 'user-1',
      remarks: '',
      approvalRequired: false,
      operationTypeUuid: 'op-receipt',
      sourceUuid: 'party-proveedor',
      destinationUuid: 'party-sm',
      stockOperationItems: [{ stockItemUuid: 'papel', stockItemPackagingUOMUuid: 'pu-caja', quantity: 3, batchNo: 'SIN-LOTE' }],
    });
    expect(posts[1]).toEqual({
      url: expect.stringMatching(/stockoperationaction$/),
      body: { uuid: 'operation-1', name: 'COMPLETE', reason: '' },
    });
  });

  it('ingreso de un artículo que vence: manda lote y vencimiento', async () => {
    const posts = mockPosts();
    await registerMovement(
      stockItem({ hasExpiration: true }),
      values({ batchNo: ' AB123 ', expiration: '2027-05-31' }),
      config,
      { sitePartyUuid: 'party-sm', responsibleUserUuid: 'user-1', batches: [] },
    );
    expect(posts[0].body.stockOperationItems[0]).toMatchObject({ batchNo: 'AB123', expiration: expect.stringMatching(/^2027-05-3/) });
  });

  it('egreso: crea un Adjustment negativo repartido por lotes, en unidades base', async () => {
    const posts = mockPosts();
    await registerMovement(stockItem(), values({ kind: 'out', quantity: '1', unitUuid: 'pu-caja' }), config, {
      sitePartyUuid: 'party-sm',
      responsibleUserUuid: 'user-1',
      batches: [
        { stockBatchUuid: 'b1', batchNumber: 'SIN-LOTE', expiration: null, baseQuantity: 4 },
        { stockBatchUuid: 'b0', batchNumber: 'L0', expiration: '2026-12-01T00:00:00.000Z', baseQuantity: 7 },
      ],
    });
    expect(posts[0].body).toMatchObject({
      operationTypeUuid: 'op-adjustment',
      sourceUuid: 'party-sm',
      reasonUuid: 'r-consumo',
      stockOperationItems: [
        { stockItemUuid: 'papel', stockBatchUuid: 'b0', stockItemPackagingUOMUuid: 'pu-unidad', quantity: -7 },
        { stockItemUuid: 'papel', stockBatchUuid: 'b1', stockItemPackagingUOMUuid: 'pu-unidad', quantity: -3 },
      ],
    });
    expect(posts[0].body.destinationUuid).toBeUndefined();
  });
});

describe('Registrar movimiento desde la tabla', () => {
  it('registra un ingreso de 30 unidades de papel higiénico en Santa María', async () => {
    const user = userEvent.setup();
    const cfg = getDefaultsFromConfigSchema(configSchema) as Config;
    vi.mocked(useConfig<Config>).mockReturnValue(cfg);
    vi.mocked(UserHasAccess).mockImplementation((props: any) => props.children);
    vi.mocked(useSession).mockReturnValue({
      authenticated: true,
      sessionId: 's',
      user: { uuid: 'user-1' },
      sessionLocation: { uuid: SM },
    } as any);

    const posts: Array<{ url: string; body: any }> = [];
    mockFetch.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'POST') {
        posts.push({ url, body: JSON.parse(init.body) });
        return { data: { uuid: 'operation-1' } } as any;
      }
      if (url.includes('/stockmanagement/party')) {
        return {
          data: {
            results: [
              { uuid: 'party-sm', name: 'Residencia Santa Maria', locationUuid: SM },
              { uuid: 'party-proveedor', name: 'Proveedor general', stockSourceUuid: 'src-1' },
            ],
          },
        } as any;
      }
      if (url.includes('/stockmanagement/stockitem?')) return { data: { results: [stockItem()] } } as any;
      return { data: { results: [] } } as any;
    });

    render(<InventoryTable />);

    await screen.findByText('Papel higiénico');
    const row = screen.getByRole('row', { name: /papel higiénico/i });
    await user.click(within(row).getByRole('button', { name: /registrar ingreso o consumo/i }));

    const dialog = await screen.findByRole('dialog', { name: 'Papel higiénico' });
    // La sede de la sesión viene preseleccionada y la unidad base también
    expect(within(dialog).getByRole('combobox', { name: 'Sede' })).toHaveValue('Residencia Santa María');
    expect(within(dialog).getByRole('combobox', { name: 'Unidad' })).toHaveValue('Unidad');

    await user.type(within(dialog).getByLabelText('Cantidad'), '30');
    await user.click(within(dialog).getByRole('combobox', { name: 'Origen' }));
    await user.click(await within(dialog).findByRole('option', { name: 'Proveedor general' }));
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(showSnackbar).toHaveBeenCalledWith(expect.objectContaining({ kind: 'success' })));
    expect(posts[0].body).toMatchObject({
      operationTypeUuid: cfg.receiptOperationTypeUuid,
      sourceUuid: 'party-proveedor',
      destinationUuid: 'party-sm',
      responsiblePersonUuid: 'user-1',
      stockOperationItems: [{ stockItemUuid: 'papel', stockItemPackagingUOMUuid: 'pu-unidad', quantity: 30, batchNo: 'SIN-LOTE' }],
    });
    expect(posts[1].body).toMatchObject({ uuid: 'operation-1', name: 'COMPLETE' });
  });
});
