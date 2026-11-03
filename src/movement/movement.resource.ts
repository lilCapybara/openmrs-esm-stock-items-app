import useSWR from 'swr';
import { openmrsFetch, restBaseUrl } from '@openmrs/esm-framework';
import { type Config } from '../config-schema';
import { toNumberOrNull } from '../add-item/add-item.utils';
import { toNumber } from '../inventory/inventory.utils';
import { type StockItem } from '../types';
import { allocateFefo, baseUnit, type BatchStock, type MovementFormValues, unitFactor } from './movement.utils';

export interface Party {
  uuid: string;
  name: string;
  locationUuid?: string | null;
  stockSourceUuid?: string | null;
}

/** Parties del módulo de stock: las sedes (con locationUuid) y los orígenes (con stockSourceUuid). */
export function useParties() {
  const { data, error, isLoading } = useSWR<{ data: { results: Array<Party> } }, Error>(
    `${restBaseUrl}/stockmanagement/party?v=default`,
    openmrsFetch,
  );
  const parties = data?.data?.results ?? [];
  return {
    sources: parties.filter((p) => !!p.stockSourceUuid).sort((a, b) => a.name.localeCompare(b.name, 'es')),
    partyForLocation: (locationUuid: string) => parties.find((p) => p.locationUuid === locationUuid) ?? null,
    error,
    isLoading,
  };
}

interface BatchRow {
  stockBatchUuid: string | null;
  batchNumber: string | null;
  expiration: string | null;
  quantity: number | string;
  quantityFactor: number | string | null;
}

export function batchesUrl(stockItemUuid: string, partyUuid: string) {
  return `${restBaseUrl}/stockmanagement/stockiteminventory?v=default&groupBy=LocationStockItemBatchNo&includeBatchNo=true&stockItemUuid=${stockItemUuid}&partyUuid=${partyUuid}`;
}

/** Lotes con existencia de un artículo en una sede (cantidades en unidades base). */
export function useBatches(stockItemUuid: string | null, partyUuid: string | null) {
  const url = stockItemUuid && partyUuid ? batchesUrl(stockItemUuid, partyUuid) : null;
  const { data, error, isLoading } = useSWR<{ data: { results: Array<BatchRow> } }, Error>(url, openmrsFetch);
  const batches: Array<BatchStock> = (data?.data?.results ?? [])
    .filter((r) => !!r.stockBatchUuid)
    .map((r) => ({
      stockBatchUuid: r.stockBatchUuid as string,
      batchNumber: r.batchNumber,
      expiration: r.expiration,
      baseQuantity: toNumber(r.quantity) * (toNumber(r.quantityFactor) || 1),
    }));
  return { batches, error, isLoading: !!url && isLoading };
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const response = await openmrsFetch<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response.data;
}

type MovementConfig = Pick<Config, 'receiptOperationTypeUuid' | 'adjustmentOperationTypeUuid' | 'noBatchNumber'>;

interface MovementContext {
  sitePartyUuid: string;
  responsibleUserUuid: string;
  /** Lotes disponibles en la sede (solo egresos). */
  batches: Array<BatchStock>;
  now?: Date;
}

/**
 * Registra un ingreso (Receipt) o un egreso (Adjustment negativo, repartido por lotes) y lo completa.
 * Devuelve el uuid de la operación.
 */
export async function registerMovement(
  item: StockItem,
  values: MovementFormValues,
  config: MovementConfig,
  context: MovementContext,
): Promise<string> {
  const units = item.packagingUnits ?? [];
  const quantity = toNumberOrNull(values.quantity) ?? 0;
  // El backend rechaza fechas futuras: usamos un minuto antes de ahora.
  const operationDate = new Date((context.now ?? new Date()).getTime() - 60_000).toISOString();
  const common = {
    operationDate,
    responsiblePersonUuid: context.responsibleUserUuid,
    remarks: values.remarks.trim(),
    approvalRequired: false,
  };

  let body: Record<string, unknown>;
  if (values.kind === 'in') {
    body = {
      ...common,
      operationTypeUuid: config.receiptOperationTypeUuid,
      sourceUuid: values.sourcePartyUuid,
      destinationUuid: context.sitePartyUuid,
      stockOperationItems: [
        {
          stockItemUuid: item.uuid,
          stockItemPackagingUOMUuid: values.unitUuid,
          quantity,
          batchNo: item.hasExpiration ? values.batchNo.trim() : config.noBatchNumber,
          ...(item.hasExpiration && values.expiration
            ? { expiration: new Date(`${values.expiration}T00:00:00`).toISOString() }
            : {}),
        },
      ],
    };
  } else {
    const requestedBase = quantity * unitFactor(units, values.unitUuid);
    const allocations = allocateFefo(context.batches, requestedBase);
    if (!allocations) {
      throw new Error('No hay suficiente existencia en esta sede.');
    }
    const base = baseUnit(units);
    body = {
      ...common,
      operationTypeUuid: config.adjustmentOperationTypeUuid,
      sourceUuid: context.sitePartyUuid,
      reasonUuid: values.reasonUuid,
      stockOperationItems: allocations.map((a) => ({
        stockItemUuid: item.uuid,
        stockBatchUuid: a.stockBatchUuid,
        stockItemPackagingUOMUuid: base?.uuid,
        quantity: -a.baseQuantity,
      })),
    };
  }

  const operation = await post<{ uuid: string }>(`${restBaseUrl}/stockmanagement/stockoperation`, body);
  await post(`${restBaseUrl}/stockmanagement/stockoperationaction`, {
    uuid: operation.uuid,
    name: 'COMPLETE',
    reason: '',
  });
  return operation.uuid;
}
