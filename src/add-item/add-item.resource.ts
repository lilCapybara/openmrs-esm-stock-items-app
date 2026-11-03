import useSWR from 'swr';
import { openmrsFetch, restBaseUrl } from '@openmrs/esm-framework';
import { type Config } from '../config-schema';
import { AddItemError, type AddItemFormValues, type AddItemResult, type AddItemStep } from './add-item.types';
import { buildItemName, defaultAcronym, normalizeName, toNumberOrNull } from './add-item.utils';

export interface ConceptOption {
  uuid: string;
  display: string;
}

/** Respuestas de un concepto Coded (unidades, categorías), para los desplegables. */
export function useConceptAnswers(conceptUuid: string) {
  const url = conceptUuid ? `${restBaseUrl}/concept/${conceptUuid}?v=custom:(uuid,answers:(uuid,display))` : null;
  const { data, error, isLoading } = useSWR<{ data: { answers?: Array<ConceptOption> } }, Error>(url, openmrsFetch);
  const options = [...(data?.data?.answers ?? [])].sort((a, b) => a.display.localeCompare(b.display, 'es'));
  return { options, error, isLoading };
}

interface ConceptSearchResult {
  uuid: string;
  display: string;
  retired?: boolean;
  names?: Array<{ name: string; locale: string }>;
}

function errorMessage(error: unknown): string {
  const e = error as { responseBody?: { error?: { message?: string } }; message?: string };
  return e?.responseBody?.error?.message ?? e?.message ?? String(error);
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await openmrsFetch<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response.data;
}

async function runStep<T>(step: AddItemStep, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    throw new AddItemError(step, errorMessage(error));
  }
}

/** Busca un concepto no retirado con exactamente ese nombre (sin tildes ni mayúsculas). */
export async function findConceptByName(name: string): Promise<ConceptSearchResult | null> {
  const url = `${restBaseUrl}/concept?q=${encodeURIComponent(name)}&v=custom:(uuid,display,retired,names:(name,locale))&limit=50`;
  const response = await openmrsFetch<{ results: Array<ConceptSearchResult> }>(url);
  const target = normalizeName(name);
  return (
    response.data?.results?.find(
      (c) =>
        !c.retired &&
        (normalizeName(c.display) === target || (c.names ?? []).some((n) => normalizeName(n.name) === target)),
    ) ?? null
  );
}

async function findDrugByName(name: string): Promise<{ uuid: string } | null> {
  const url = `${restBaseUrl}/drug?q=${encodeURIComponent(name)}&v=custom:(uuid,display,retired)&limit=50`;
  const response = await openmrsFetch<{ results: Array<{ uuid: string; display: string; retired?: boolean }> }>(url);
  const target = normalizeName(name);
  return response.data?.results?.find((d) => !d.retired && normalizeName(d.display) === target) ?? null;
}

/**
 * Da de alta un artículo completo, en orden:
 * 1. Concepto en español (reutiliza uno existente con el mismo nombre).
 * 2. Drug, si es medicamento.
 * 3. Artículo de stock.
 * 4. Unidad base (factor 1) y unidad mayor opcional.
 * 5. Nivel de reposición y unidades por defecto.
 * Si falla algo después de crear el artículo de stock, lo anula para no dejarlo a medias.
 */
export async function createStockItemWithSetup(
  values: AddItemFormValues,
  config: Pick<Config, 'drugConceptClassUuid' | 'miscConceptClassUuid' | 'naDatatypeUuid' | 'conceptLocale'>,
  onStep?: (step: AddItemStep) => void,
): Promise<AddItemResult> {
  const isDrug = values.kind === 'drug';
  const conceptName = values.name.replace(/\s+/g, ' ').trim();
  const itemName = buildItemName(values);

  // 1. Concepto
  onStep?.('concept');
  const concept = await runStep('concept', async () => {
    const existing = await findConceptByName(conceptName);
    if (existing) {
      return { uuid: existing.uuid, reused: true };
    }
    const created = await postJson<{ uuid: string }>(`${restBaseUrl}/concept`, {
      names: [
        { name: conceptName, locale: config.conceptLocale, conceptNameType: 'FULLY_SPECIFIED', localePreferred: true },
      ],
      datatype: config.naDatatypeUuid,
      conceptClass: isDrug ? config.drugConceptClassUuid : config.miscConceptClassUuid,
    });
    return { uuid: created.uuid, reused: false };
  });

  // 2. Drug (solo medicamentos)
  let drugUuid: string | null = null;
  if (isDrug) {
    onStep?.('drug');
    drugUuid = await runStep('drug', async () => {
      const existing = await findDrugByName(itemName);
      if (existing) {
        return existing.uuid;
      }
      const created = await postJson<{ uuid: string }>(`${restBaseUrl}/drug`, {
        name: itemName,
        concept: concept.uuid,
        dosageForm: values.baseUnitUuid,
        strength: values.strength.trim(),
        combination: false,
      });
      return created.uuid;
    });
  }

  // 3. Artículo de stock
  onStep?.('stockItem');
  const stockItem = await runStep('stockItem', () =>
    postJson<{ uuid: string }>(`${restBaseUrl}/stockmanagement/stockitem`, {
      ...(isDrug ? { drugUuid } : { conceptUuid: concept.uuid }),
      commonName: itemName,
      acronym: values.acronym.trim() || defaultAcronym(itemName),
      hasExpiration: values.hasExpiration,
      ...(values.hasExpiration ? { expiryNotice: toNumberOrNull(values.expiryNoticeDays) ?? 0 } : {}),
      categoryUuid: values.categoryUuid,
      dispensingUnitUuid: values.baseUnitUuid,
    }),
  );

  try {
    // 4. Unidades de empaque
    onStep?.('packaging');
    const basePackaging = await runStep('packaging', () =>
      postJson<{ uuid: string }>(`${restBaseUrl}/stockmanagement/stockitempackaginguom`, {
        stockItemUuid: stockItem.uuid,
        packagingUomUuid: values.baseUnitUuid,
        factor: 1,
      }),
    );

    let packPackaging: { uuid: string } | null = null;
    if (values.packUnitUuid) {
      packPackaging = await runStep('packaging', () =>
        postJson<{ uuid: string }>(`${restBaseUrl}/stockmanagement/stockitempackaginguom`, {
          stockItemUuid: stockItem.uuid,
          packagingUomUuid: values.packUnitUuid,
          factor: toNumberOrNull(values.packFactor),
        }),
      );
    }

    // 5. Nivel de reposición y unidades por defecto
    onStep?.('reorderLevel');
    const reorderLevel = toNumberOrNull(values.reorderLevel);
    const reorderUnit = values.reorderLevelUnit === 'pack' && packPackaging ? packPackaging : basePackaging;
    await runStep('reorderLevel', () =>
      postJson(`${restBaseUrl}/stockmanagement/stockitem/${stockItem.uuid}`, {
        dispensingUnitPackagingUoMUuid: basePackaging.uuid,
        defaultStockOperationsUoMUuid: (packPackaging ?? basePackaging).uuid,
        ...(reorderLevel !== null ? { reorderLevel, reorderLevelUoMUuid: reorderUnit.uuid } : {}),
      }),
    );
  } catch (error) {
    // Anulamos el artículo incompleto para que no quede a medias en el inventario.
    await openmrsFetch(`${restBaseUrl}/stockmanagement/stockitem/${stockItem.uuid}`, { method: 'DELETE' }).catch(
      () => undefined,
    );
    throw error;
  }

  return {
    stockItemUuid: stockItem.uuid,
    conceptUuid: concept.uuid,
    reusedConcept: concept.reused,
    drugUuid,
  };
}
