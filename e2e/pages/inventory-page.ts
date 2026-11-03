import type { Page, Locator } from '@playwright/test';

export class InventoryPage {
  readonly page: Page;
  readonly heading: Locator;

  constructor(page: Page) {
    this.page = page;
    // El test puede correr con la sesión en español o en inglés
    this.heading = page.getByRole('heading', { name: /inventario de la residencia|residence inventory/i });
  }

  async goto() {
    await this.page.goto('/openmrs/spa/inventario-residencia');
    await this.heading.waitFor();
  }
}
