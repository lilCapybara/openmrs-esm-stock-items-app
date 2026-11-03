import React from 'react';
import { useTranslation } from 'react-i18next';
import InventoryTable from './inventory/inventory-table.component';
import styles from './stock-items.scss';

const StockItems: React.FC = () => {
  const { t } = useTranslation();

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('inventoryTitle', 'Inventario de la residencia')}</h1>
        <p className={styles.subtitle}>
          {t(
            'inventorySubtitle',
            'Existencia de medicamentos y descartables por sede, comparada con el nivel de reposición de cada artículo.',
          )}
        </p>
      </header>
      <InventoryTable />
    </main>
  );
};

export default StockItems;
