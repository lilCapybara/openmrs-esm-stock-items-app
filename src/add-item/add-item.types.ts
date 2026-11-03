export type ItemKind = 'drug' | 'nonDrug';

/** Valores del formulario de alta (todo como string, como lo entregan los inputs). */
export interface AddItemFormValues {
  kind: ItemKind;
  /** Nombre común; para medicamentos es el nombre genérico (ej. "Ibuprofeno"). */
  name: string;
  /** Solo medicamentos, ej. "400 mg". */
  strength: string;
  acronym: string;
  categoryUuid: string;
  /** Unidad base (Unidad, Comprimido, ml...). Para medicamentos también es la forma y la unidad de dispensación. */
  baseUnitUuid: string;
  /** Unidad mayor opcional (Caja, Frasco...) y cuántas unidades base trae. */
  packUnitUuid: string;
  packFactor: string;
  hasExpiration: boolean;
  expiryNoticeDays: string;
  reorderLevel: string;
  /** 'base' o 'pack': en qué unidad está expresado el nivel de reposición. */
  reorderLevelUnit: 'base' | 'pack';
}

export type AddItemErrors = Partial<Record<keyof AddItemFormValues, string>>;

export type AddItemStep = 'concept' | 'drug' | 'stockItem' | 'packaging' | 'reorderLevel';

export interface AddItemResult {
  stockItemUuid: string;
  conceptUuid: string;
  /** true si el concepto ya existía y se reutilizó. */
  reusedConcept: boolean;
  drugUuid: string | null;
}

export class AddItemError extends Error {
  constructor(
    readonly step: AddItemStep,
    message: string,
  ) {
    super(message);
    this.name = 'AddItemError';
  }
}

export const emptyAddItemForm: AddItemFormValues = {
  kind: 'nonDrug',
  name: '',
  strength: '',
  acronym: '',
  categoryUuid: '',
  baseUnitUuid: '',
  packUnitUuid: '',
  packFactor: '',
  hasExpiration: false,
  expiryNoticeDays: '30',
  reorderLevel: '',
  reorderLevelUnit: 'base',
};
