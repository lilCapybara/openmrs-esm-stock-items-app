import { openmrsFetch, restBaseUrl } from '@openmrs/esm-framework';
import { type PackagingUnit, type StockItem } from '../types';
import { toNumberOrNull } from '../add-item/add-item.utils';

/** Valor especial del selector de unidad: la unidad que se está agregando en este mismo formulario. */
export const NEW_UNIT = '__new__';

export interface EditThresholdValues {
  /** Vacío = quitar el nivel de reposición. */
  reorderLevel: string;
  /** uuid de una unidad de empaque del artículo, o NEW_UNIT. */
  reorderLevelUnit: string;
  /** Unidad nueva opcional (concepto + cuántas unidades base trae). */
  newUnitConceptUuid: string;
  newUnitFactor: string;
}

export type EditThresholdErrors = Partial<Record<keyof EditThresholdValues, string>>;

export function initialEditValues(item: StockItem): EditThresholdValues {
  const units = item.packagingUnits ?? [];
  const current = units.find((u) => u.uuid === item.reorderLevelUoMUuid);
  const level = item.reorderLevel === null || item.reorderLevel === undefined ? '' : String(Number(item.reorderLevel));
  return {
    reorderLevel: level,
    reorderLevelUnit: current?.uuid ?? units[0]?.uuid ?? (units.length === 0 ? NEW_UNIT : ''),
    newUnitConceptUuid: '',
    // Si el artículo no tiene ninguna unidad, la que se agrega es la base (factor 1).
    newUnitFactor: units.length === 0 ? '1' : '',
  };
}

export function validateEditThreshold(values: EditThresholdValues, units: Array<PackagingUnit>): EditThresholdErrors {
  const errors: EditThresholdErrors = {};
  const hasUnits = units.length > 0;
  const addingUnit = !!values.newUnitConceptUuid;

  if (addingUnit) {
    if (units.some((u) => u.packagingUomUuid === values.newUnitConceptUuid)) {
      errors.newUnitConceptUuid = 'El artículo ya tiene esa unidad.';
    }
    const factor = toNumberOrNull(values.newUnitFactor);
    if (hasUnits && (factor === null || factor <= 1 || !Number.isInteger(factor))) {
      errors.newUnitFactor = 'Indicá cuántas unidades base trae (número entero mayor a 1).';
    }
  }

  const level = values.reorderLevel.trim();
  if (level !== '') {
    const n = toNumberOrNull(level);
    if (n === null || n < 0) {
      errors.reorderLevel = 'El nivel de reposición debe ser un número mayor o igual a 0.';
    }
    if (!hasUnits && !addingUnit) {
      errors.newUnitConceptUuid = 'El artículo no tiene unidades: elegí su unidad base para poder cargar el nivel.';
    } else if (values.reorderLevelUnit === NEW_UNIT && !addingUnit) {
      errors.reorderLevelUnit = 'Elegí la unidad nueva o una de las existentes.';
    } else if (!values.reorderLevelUnit) {
      errors.reorderLevelUnit = 'Elegí en qué unidad está expresado.';
    }
  }

  return errors;
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const response = await openmrsFetch<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response.data;
}

/**
 * Agrega la unidad nueva (si hay) y guarda o quita el nivel de reposición.
 * Si el artículo no tenía unidades, la nueva queda además como unidad de dispensación y de operaciones.
 */
export async function saveThreshold(item: StockItem, values: EditThresholdValues): Promise<void> {
  const units = item.packagingUnits ?? [];
  let newUnitUuid: string | null = null;

  if (values.newUnitConceptUuid) {
    const created = await post<{ uuid: string }>(`${restBaseUrl}/stockmanagement/stockitempackaginguom`, {
      stockItemUuid: item.uuid,
      packagingUomUuid: values.newUnitConceptUuid,
      factor: units.length === 0 ? 1 : toNumberOrNull(values.newUnitFactor),
    });
    newUnitUuid = created.uuid;
  }

  const level = toNumberOrNull(values.reorderLevel.trim());
  const unitUuid = values.reorderLevelUnit === NEW_UNIT ? newUnitUuid : values.reorderLevelUnit;

  const body: Record<string, unknown> =
    level !== null && unitUuid
      ? { reorderLevel: level, reorderLevelUoMUuid: unitUuid }
      : // Sin unidad el backend borra el nivel de reposición.
        { reorderLevelUoMUuid: '' };

  if (units.length === 0 && newUnitUuid) {
    body.dispensingUnitPackagingUoMUuid = newUnitUuid;
    body.defaultStockOperationsUoMUuid = newUnitUuid;
  }

  await post(`${restBaseUrl}/stockmanagement/stockitem/${item.uuid}`, body);
}
