import { test, expect } from '@playwright/test';
import { InventoryPage } from '../pages';

test('La página de inventario carga y muestra la tabla o un estado de error controlado', async ({ page }) => {
  const inventoryPage = new InventoryPage(page);
  await inventoryPage.goto();

  await expect(page).toHaveURL(/\/openmrs\/spa\/inventario-residencia/);
  await expect(inventoryPage.heading).toBeVisible();

  // Con el módulo de stock instalado se ve la tabla; si el backend de pruebas no lo tiene,
  // la página muestra el aviso de error en lugar de romperse.
  const table = page.getByRole('table');
  const error = page.getByText(/no se pudo cargar el inventario|could not load the inventory/i);
  await expect(table.or(error)).toBeVisible();
});
