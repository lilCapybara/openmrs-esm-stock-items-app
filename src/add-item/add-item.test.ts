import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openmrsFetch } from '@openmrs/esm-framework';
import { createStockItemWithSetup } from './add-item.resource';
import { AddItemError, type AddItemFormValues, emptyAddItemForm } from './add-item.types';
import { buildItemName, defaultAcronym, normalizeName, validateAddItem } from './add-item.utils';

const mockFetch = vi.mocked(openmrsFetch);

const config = {
  drugConceptClassUuid: 'class-drug',
  miscConceptClassUuid: 'class-misc',
  naDatatypeUuid: 'datatype-na',
  conceptLocale: 'es',
};

const UNIDAD = 'a8c18590-unidad';
const CAJA = '8f6c33c6-caja';
const COMPRIMIDO = '32c3c803-comprimido';

function form(overrides: Partial<AddItemFormValues>): AddItemFormValues {
  return { ...emptyAddItemForm, categoryUuid: 'cat-1', baseUnitUuid: UNIDAD, ...overrides };
}

type Call = { url: string; method: string; body: any };

/** Simula el backend: guarda cada llamada y responde según la URL. */
function mockBackend(options: { existingConcept?: boolean; failPackaging?: boolean } = {}) {
  const calls: Array<Call> = [];
  let packagingCount = 0;
  mockFetch.mockImplementation(async (url: string, init?: any) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body });

    if (method === 'GET' && url.includes('/concept?q=')) {
      return {
        data: { results: options.existingConcept ? [{ uuid: 'concept-existing', display: 'Pasta Dental' }] : [] },
      } as any;
    }
    if (method === 'GET' && url.includes('/drug?q=')) {
      return { data: { results: [] } } as any;
    }
    if (method === 'POST' && url.endsWith('/concept')) {
      return { data: { uuid: 'concept-new' } } as any;
    }
    if (method === 'POST' && url.endsWith('/drug')) {
      return { data: { uuid: 'drug-new' } } as any;
    }
    if (method === 'POST' && url.endsWith('/stockmanagement/stockitem')) {
      return { data: { uuid: 'item-new' } } as any;
    }
    if (method === 'POST' && url.endsWith('/stockitempackaginguom')) {
      if (options.failPackaging) {
        throw Object.assign(new Error('500'), { responseBody: { error: { message: 'Factor inválido' } } });
      }
      packagingCount++;
      return { data: { uuid: `pu-${packagingCount}` } } as any;
    }
    return { data: {} } as any;
  });
  return calls;
}

const posts = (calls: Array<Call>) => calls.filter((c) => c.method === 'POST');

describe('add-item.utils', () => {
  it('normaliza nombres sin tildes ni mayúsculas', () => {
    expect(normalizeName('  Papel   Higiénico ')).toBe('papel higienico');
  });

  it('arma el nombre del medicamento con la concentración', () => {
    expect(buildItemName({ kind: 'drug', name: 'Ibuprofeno', strength: '400 mg' })).toBe('Ibuprofeno 400 mg');
    expect(buildItemName({ kind: 'nonDrug', name: 'Guantes', strength: '400 mg' })).toBe('Guantes');
  });

  it('genera la abreviatura por defecto', () => {
    expect(defaultAcronym('Pasta dental')).toBe('PD');
  });

  it('exige los campos obligatorios', () => {
    const errors = validateAddItem({ ...emptyAddItemForm, kind: 'drug' }, { existingNames: [] });
    expect(Object.keys(errors).sort()).toEqual(['baseUnitUuid', 'categoryUuid', 'name', 'strength']);
  });

  it('detecta artículos duplicados aunque cambien las tildes', () => {
    const errors = validateAddItem(form({ name: 'papel higienico' }), { existingNames: ['Papel higiénico'] });
    expect(errors.name).toMatch(/ya existe/i);
  });

  it('valida la unidad mayor y su factor', () => {
    expect(
      validateAddItem(form({ name: 'Guantes', packUnitUuid: CAJA, packFactor: '1' }), { existingNames: [] }).packFactor,
    ).toBeDefined();
    expect(
      validateAddItem(form({ name: 'Guantes', packUnitUuid: UNIDAD, packFactor: '10' }), { existingNames: [] })
        .packUnitUuid,
    ).toBeDefined();
    expect(
      validateAddItem(form({ name: 'Guantes', packUnitUuid: CAJA, packFactor: '100' }), { existingNames: [] }),
    ).toEqual({});
  });

  it('no permite expresar el umbral en unidad mayor si no hay unidad mayor', () => {
    const errors = validateAddItem(form({ name: 'Guantes', reorderLevel: '2', reorderLevelUnit: 'pack' }), {
      existingNames: [],
    });
    expect(errors.reorderLevelUnit).toBeDefined();
  });
});

describe('createStockItemWithSetup', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('descartable: crea concepto Misc, artículo, unidad base y umbral', async () => {
    const calls = mockBackend();

    const result = await createStockItemWithSetup(form({ name: 'Guantes descartables', reorderLevel: '50' }), config);

    expect(result).toEqual({
      stockItemUuid: 'item-new',
      conceptUuid: 'concept-new',
      reusedConcept: false,
      drugUuid: null,
    });
    const [concept, item, packaging, update] = posts(calls);
    expect(concept.body).toMatchObject({
      names: [{ name: 'Guantes descartables', locale: 'es', conceptNameType: 'FULLY_SPECIFIED' }],
      conceptClass: 'class-misc',
      datatype: 'datatype-na',
    });
    expect(item.body).toMatchObject({
      conceptUuid: 'concept-new',
      commonName: 'Guantes descartables',
      acronym: 'GD',
      hasExpiration: false,
    });
    expect(item.body.drugUuid).toBeUndefined();
    expect(packaging.body).toEqual({ stockItemUuid: 'item-new', packagingUomUuid: UNIDAD, factor: 1 });
    expect(update.url).toMatch(/stockitem\/item-new$/);
    expect(update.body).toEqual({
      dispensingUnitPackagingUoMUuid: 'pu-1',
      defaultStockOperationsUoMUuid: 'pu-1',
      reorderLevel: 50,
      reorderLevelUoMUuid: 'pu-1',
    });
  });

  it('medicamento: crea drug, unidad mayor y umbral expresado en cajas', async () => {
    const calls = mockBackend();

    const result = await createStockItemWithSetup(
      form({
        kind: 'drug',
        name: 'Ibuprofeno',
        strength: '400 mg',
        baseUnitUuid: COMPRIMIDO,
        packUnitUuid: CAJA,
        packFactor: '20',
        hasExpiration: true,
        expiryNoticeDays: '60',
        reorderLevel: '3',
        reorderLevelUnit: 'pack',
      }),
      config,
    );

    expect(result.drugUuid).toBe('drug-new');
    const [concept, drug, item, base, pack, update] = posts(calls);
    expect(concept.body.conceptClass).toBe('class-drug');
    expect(drug.body).toEqual({
      name: 'Ibuprofeno 400 mg',
      concept: 'concept-new',
      dosageForm: COMPRIMIDO,
      strength: '400 mg',
      combination: false,
    });
    expect(item.body).toMatchObject({
      drugUuid: 'drug-new',
      commonName: 'Ibuprofeno 400 mg',
      hasExpiration: true,
      expiryNotice: 60,
      dispensingUnitUuid: COMPRIMIDO,
    });
    expect(item.body.conceptUuid).toBeUndefined();
    expect(base.body.factor).toBe(1);
    expect(pack.body).toEqual({ stockItemUuid: 'item-new', packagingUomUuid: CAJA, factor: 20 });
    expect(update.body).toEqual({
      dispensingUnitPackagingUoMUuid: 'pu-1',
      defaultStockOperationsUoMUuid: 'pu-2',
      reorderLevel: 3,
      reorderLevelUoMUuid: 'pu-2',
    });
  });

  it('reutiliza un concepto existente con el mismo nombre en lugar de duplicarlo', async () => {
    const calls = mockBackend({ existingConcept: true });

    const result = await createStockItemWithSetup(form({ name: 'pasta dental' }), config);

    expect(result.reusedConcept).toBe(true);
    expect(posts(calls).some((c) => c.url.endsWith('/concept'))).toBe(false);
    expect(posts(calls)[0].body.conceptUuid).toBe('concept-existing');
  });

  it('si falla una unidad, anula el artículo creado e informa el paso', async () => {
    const calls = mockBackend({ failPackaging: true });

    const promise = createStockItemWithSetup(form({ name: 'Barbijos' }), config);

    await expect(promise).rejects.toBeInstanceOf(AddItemError);
    await expect(promise).rejects.toMatchObject({ step: 'packaging', message: 'Factor inválido' });
    expect(calls.some((c) => c.method === 'DELETE' && c.url.endsWith('/stockitem/item-new'))).toBe(true);
  });
});
