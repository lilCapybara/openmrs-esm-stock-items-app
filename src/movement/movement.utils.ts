import { toNumberOrNull } from '../add-item/add-item.utils';
import { toNumber } from '../inventory/inventory.utils';
import { type PackagingUnit } from '../types';

export type MovementKind = 'in' | 'out';

export interface MovementFormValues {
  kind: MovementKind;
  /** locationUuid de la sede. */
  siteLocationUuid: string;
  quantity: string;
  /** uuid de la unidad de empaque del artículo en la que se expresa la cantidad. */
  unitUuid: string;
  /** Solo ingresos: party del origen (proveedor, donación...). */
  sourcePartyUuid: string;
  /** Solo ingresos de artículos que vencen. */
  batchNo: string;
  /** yyyy-mm-dd */
  expiration: string;
  /** Solo egresos: motivo (Consumo, Vencido, Dañado...). */
  reasonUuid: string;
  remarks: string;
}

export type MovementErrors = Partial<Record<keyof MovementFormValues, string>>;

/** Lote con existencia en una sede (fila de stockiteminventory agrupado por lote). */
export interface BatchStock {
  stockBatchUuid: string;
  batchNumber: string | null;
  expiration: string | null;
  /** En unidades base. */
  baseQuantity: number;
}

export interface Allocation {
  stockBatchUuid: string;
  batchNumber: string | null;
  /** En unidades base. */
  baseQuantity: number;
}

export function unitFactor(units: Array<PackagingUnit>, unitUuid: string): number {
  return toNumber(units.find((u) => u.uuid === unitUuid)?.factor) || 1;
}

/** La unidad base del artículo (factor 1), o la de menor factor si no hay una con factor 1. */
export function baseUnit(units: Array<PackagingUnit>): PackagingUnit | undefined {
  return [...units].sort((a, b) => toNumber(a.factor) - toNumber(b.factor))[0];
}

/**
 * Reparte un egreso entre los lotes disponibles, empezando por el que vence primero
 * (los que no vencen van al final). Devuelve null si no alcanza la existencia.
 */
export function allocateFefo(batches: Array<BatchStock>, baseQuantity: number): Array<Allocation> | null {
  const sorted = [...batches]
    .filter((b) => b.baseQuantity > 0)
    .sort((a, b) => {
      const ea = a.expiration ? Date.parse(a.expiration) : Number.POSITIVE_INFINITY;
      const eb = b.expiration ? Date.parse(b.expiration) : Number.POSITIVE_INFINITY;
      return ea - eb;
    });

  const allocations: Array<Allocation> = [];
  let remaining = baseQuantity;
  for (const batch of sorted) {
    if (remaining <= 0) {
      break;
    }
    const take = Math.min(batch.baseQuantity, remaining);
    allocations.push({ stockBatchUuid: batch.stockBatchUuid, batchNumber: batch.batchNumber, baseQuantity: take });
    remaining -= take;
  }
  return remaining > 1e-9 ? null : allocations;
}

export function totalBase(batches: Array<BatchStock>): number {
  return batches.reduce((sum, b) => sum + Math.max(b.baseQuantity, 0), 0);
}

interface ValidationContext {
  units: Array<PackagingUnit>;
  hasExpiration: boolean;
  /** Existencia disponible en la sede elegida, en unidades base (solo egresos). */
  availableBase: number | null;
  today?: Date;
}

export function validateMovement(values: MovementFormValues, context: ValidationContext): MovementErrors {
  const errors: MovementErrors = {};

  if (context.units.length === 0) {
    errors.unitUuid =
      'El artículo no tiene unidades: cargá su unidad base con el lápiz antes de registrar movimientos.';
  }
  if (!values.siteLocationUuid) {
    errors.siteLocationUuid = 'Elegí la sede.';
  }

  const quantity = toNumberOrNull(values.quantity);
  if (quantity === null || quantity <= 0) {
    errors.quantity = 'Ingresá una cantidad mayor a 0.';
  }
  if (!values.unitUuid && !errors.unitUuid) {
    errors.unitUuid = 'Elegí la unidad.';
  }

  if (values.kind === 'in') {
    if (!values.sourcePartyUuid) {
      errors.sourcePartyUuid = 'Elegí de dónde viene (proveedor, donación...).';
    }
    if (context.hasExpiration) {
      if (!values.batchNo.trim()) {
        errors.batchNo = 'Ingresá el número de lote.';
      }
      if (!values.expiration) {
        errors.expiration = 'Ingresá la fecha de vencimiento.';
      } else {
        const today = context.today ?? new Date();
        const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
        if (Date.parse(`${values.expiration}T00:00:00`) <= startOfToday) {
          errors.expiration = 'La fecha de vencimiento tiene que ser posterior a hoy.';
        }
      }
    }
  } else {
    if (!values.reasonUuid) {
      errors.reasonUuid = 'Elegí el motivo.';
    }
    if (quantity !== null && quantity > 0 && values.unitUuid && context.availableBase !== null) {
      const requested = quantity * unitFactor(context.units, values.unitUuid);
      if (requested > context.availableBase + 1e-9) {
        errors.quantity = 'No hay suficiente existencia en esta sede.';
      }
    }
  }

  return errors;
}
