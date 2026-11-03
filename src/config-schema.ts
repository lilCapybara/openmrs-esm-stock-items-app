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
};

export interface SiteConfig {
  name: string;
  locationUuid: string;
}

export interface Config {
  sites: Array<SiteConfig>;
  lowStockMarginPercent: number;
}
