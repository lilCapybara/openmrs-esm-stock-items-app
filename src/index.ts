import { defineConfigSchema, getAsyncLifecycle, getSyncLifecycle } from '@openmrs/esm-framework';
import { configSchema } from './config-schema';
import AppMenuItem from './app-menu-item/app-menu-item.component';

const moduleName = '@residencia/esm-stock-items-app';

const options = {
  featureName: 'stock-items',
  moduleName,
};

export const importTranslation = require.context('../translations', false, /.json$/, 'lazy');

export function startupApp() {
  defineConfigSchema(moduleName, configSchema);
}

/** Página principal: /openmrs/spa/inventario-residencia */
export const stockItemsPage = getAsyncLifecycle(() => import('./stock-items.component'), options);

/** Ícono en el menú de aplicaciones (grilla de la barra superior). */
export const inventoryAppMenuItem = getSyncLifecycle(AppMenuItem, options);
