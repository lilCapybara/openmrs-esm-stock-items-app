// Pestaña "Inventario" en el menú lateral de la página de inicio (/home/inventario)
export const inventoryDashboardMeta = {
  path: 'inventario',
  slot: 'inventario-dashboard-slot',
  title: 'Inventario',
  basePath: `${window.spaBase}/home`,
} as const;

/** URL del inventario dentro de la home, con el filtro "Solo stock bajo" activado. */
export const lowStockInventoryUrl = () => `${window.spaBase}/home/inventario?soloStockBajo=1`;
