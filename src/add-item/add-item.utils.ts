import { type AddItemErrors, type AddItemFormValues } from './add-item.types';

/** Compara nombres sin importar mayúsculas, tildes ni espacios repetidos. */
export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('es');
}

/** "Ibuprofeno" + "400 mg" -> "Ibuprofeno 400 mg". Es el nombre común y el nombre del drug. */
export function buildItemName(values: Pick<AddItemFormValues, 'kind' | 'name' | 'strength'>): string {
  const name = values.name.replace(/\s+/g, ' ').trim();
  const strength = values.strength.replace(/\s+/g, ' ').trim();
  return values.kind === 'drug' && strength ? `${name} ${strength}` : name;
}

/** Abreviatura por defecto: iniciales en mayúscula ("Pasta dental" -> "PD"). */
export function defaultAcronym(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .toLocaleUpperCase('es')
    .slice(0, 10);
}

function parsePositive(value: string): number | null {
  if (value.trim() === '') {
    return null;
  }
  const n = Number(value.replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

export interface ValidationContext {
  /** Nombres comunes ya cargados, para avisar duplicados. */
  existingNames: Array<string>;
}

/** Devuelve los errores de cada campo (objeto vacío si el formulario es válido). */
export function validateAddItem(values: AddItemFormValues, context: ValidationContext): AddItemErrors {
  const errors: AddItemErrors = {};

  if (!values.name.trim()) {
    errors.name = 'Ingresá el nombre del artículo.';
  } else {
    const fullName = normalizeName(buildItemName(values));
    if (context.existingNames.some((existing) => normalizeName(existing) === fullName)) {
      errors.name = 'Ya existe un artículo con ese nombre.';
    }
  }

  if (values.kind === 'drug' && !values.strength.trim()) {
    errors.strength = 'Ingresá la concentración (ej. 400 mg).';
  }

  if (!values.categoryUuid) {
    errors.categoryUuid = 'Elegí una categoría.';
  }

  if (!values.baseUnitUuid) {
    errors.baseUnitUuid = 'Elegí la unidad base.';
  }

  const packFactor = parsePositive(values.packFactor);
  if (values.packUnitUuid) {
    if (values.packUnitUuid === values.baseUnitUuid) {
      errors.packUnitUuid = 'La unidad mayor debe ser distinta de la unidad base.';
    }
    if (packFactor === null || Number.isNaN(packFactor) || packFactor <= 1 || !Number.isInteger(packFactor)) {
      errors.packFactor = 'Indicá cuántas unidades base trae (número entero mayor a 1).';
    }
  }

  if (values.hasExpiration) {
    const days = parsePositive(values.expiryNoticeDays);
    if (days === null || Number.isNaN(days) || days < 0 || !Number.isInteger(days)) {
      errors.expiryNoticeDays = 'Indicá con cuántos días de anticipación avisar (entero, 0 o más).';
    }
  }

  const reorder = parsePositive(values.reorderLevel);
  if (reorder !== null && (Number.isNaN(reorder) || reorder < 0)) {
    errors.reorderLevel = 'El nivel de reposición debe ser un número mayor o igual a 0.';
  }
  if (values.reorderLevelUnit === 'pack' && !values.packUnitUuid) {
    errors.reorderLevelUnit = 'Para expresarlo en la unidad mayor, primero elegí una unidad mayor.';
  }

  return errors;
}

export function toNumberOrNull(value: string): number | null {
  const n = parsePositive(value);
  return n === null || Number.isNaN(n) ? null : n;
}
