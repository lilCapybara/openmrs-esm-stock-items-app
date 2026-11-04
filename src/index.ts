import { defineConfigSchema, getAsyncLifecycle, getSyncLifecycle } from '@openmrs/esm-framework';
import { configSchema } from './config-schema';
import AppMenuItem from './app-menu-item/app-menu-item.component';
import { createDashboardLink } from './home/create-dashboard-link.component';
import { inventoryDashboardMeta } from './home/dashboard.meta';

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

// t('inventario', 'Inventario')
/** Pestaña "Inventario" en el menú lateral de inicio. */
export const inventoryDashboardLink = getSyncLifecycle(createDashboardLink(inventoryDashboardMeta), options);

/** Contenido de /home/inventario: la misma pantalla de inventario. */
export const inventoryDashboard = getAsyncLifecycle(() => import('./stock-items.component'), options);

/** Tarjeta "Stock a reponer" en la fila de métricas de inicio (RF17). */
export const lowStockTile = getAsyncLifecycle(() => import('./home/low-stock-tile.component'), options);
