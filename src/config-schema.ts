import { Type, validators } from '@openmrs/esm-framework';

export const configSchema = {
  sites: {
    _type: Type.Array,
    _description:
      'Sedes que se muestran como columnas de existencia. Cada una debe ser una ubicación habilitada para stock (con party en el módulo de stock).',
    _elements: {
      _type: Type.Object,
      name: {
        _type: Type.String,
        _description: 'Nombre que se muestra en el encabezado de la columna.',
      },
      locationUuid: {
        _type: Type.UUID,
        _description: 'UUID de la ubicación (location) de OpenMRS.',
      },
    },
    _default: [
      { name: 'Residencia Santa María', locationUuid: '93918ee3-4cb9-49b3-8897-c480b1d895e3' },
      { name: 'Hogar San José', locationUuid: '875bdd70-9e33-4fb7-87d0-840c53c925e6' },
    ],
  },
  lowStockMarginPercent: {
    _type: Type.Number,
    _description:
      'Margen sobre el umbral para marcar un artículo como "Cerca del umbral" (por ejemplo 20 = hasta un 20% por encima del nivel de reposición).',
    _default: 20,
    _validators: [validators.inRange(0, 100)],
  },
  packagingUnitsConceptUuid: {
    _type: Type.ConceptUuid,
    _description:
      'Concepto (Coded) cuyas respuestas son las unidades: Unidad, Comprimido, Caja, Frasco, etc. Es el mismo que packingUnitsUUID del módulo de stock.',
    _default: '3cbf7124-acf9-4ebd-985c-1c45ccdf2210',
  },
  categoriesConceptUuid: {
    _type: Type.ConceptUuid,
    _description: 'Concepto (Coded) cuyas respuestas son las categorías de artículos (stockItemCategoryUUID).',
    _default: '360a38c9-2819-4093-862b-50e4bf9a2d66',
  },
  drugConceptClassUuid: {
    _type: Type.UUID,
    _description: 'Clase de concepto para medicamentos (Drug, del core de OpenMRS).',
    _default: '8d490dfc-c2cc-11de-8d13-0010c6dffd0f',
  },
  miscConceptClassUuid: {
    _type: Type.UUID,
    _description: 'Clase de concepto para descartables y otros artículos (Misc, del core de OpenMRS).',
    _default: '8d491e50-c2cc-11de-8d13-0010c6dffd0f',
  },
  naDatatypeUuid: {
    _type: Type.UUID,
    _description: 'Tipo de dato N/A del core de OpenMRS, usado al crear los conceptos de los artículos.',
    _default: '8d4a4c94-c2cc-11de-8d13-0010c6dffd0f',
  },
  conceptLocale: {
    _type: Type.String,
    _description: 'Idioma en el que se crean los nombres de los conceptos nuevos.',
    _default: 'es',
  },
  createItemPrivileges: {
    _type: Type.Array,
    _elements: { _type: Type.String },
    _description:
      'Privilegios necesarios para ver el botón "Nuevo artículo" (deben cumplirse todos). Por defecto solo los tiene la administración.',
    _default: ['Task: stockmanagement.stockItems.mutate', 'Manage Concepts'],
  },
};

export interface SiteConfig {
  name: string;
  locationUuid: string;
}

export interface Config {
  sites: Array<SiteConfig>;
  lowStockMarginPercent: number;
  packagingUnitsConceptUuid: string;
  categoriesConceptUuid: string;
  drugConceptClassUuid: string;
  miscConceptClassUuid: string;
  naDatatypeUuid: string;
  conceptLocale: string;
  createItemPrivileges: Array<string>;
}
