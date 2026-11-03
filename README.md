# esm-stock-items-app (Residencia Santa María)

Módulo O3 propio para la gestión de stock de la residencia (RF16 / RF17).

Funcionalidades:
- **Inventario** (`/openmrs/spa/inventario-residencia`): existencia de cada artículo por sede, nivel de reposición y estado (Sin stock / Stock bajo / Cerca del umbral / OK / Sin umbral), con buscador, filtro por tipo y filtro "Solo stock bajo".
- Ícono "Inventario" en el menú de aplicaciones (requiere el privilegio `App: stockmanagement.stockItems`).

Depende del módulo backend `stockmanagement` (usar el omod parcheado de `lilCapybara/openmrs-module-stockmanagement`, rama `residencia-fix-atlocation`).

## Desarrollo

```
yarn install
yarn start --backend http://localhost
yarn test
yarn build
```

## Configuración (`frontend/residencia-config.json`)

```json
"@residencia/esm-stock-items-app": {
  "sites": [
    { "name": "Residencia Santa María", "locationUuid": "93918ee3-4cb9-49b3-8897-c480b1d895e3" },
    { "name": "Hogar San José", "locationUuid": "875bdd70-9e33-4fb7-87d0-840c53c925e6" }
  ],
  "lowStockMarginPercent": 20
}
```
