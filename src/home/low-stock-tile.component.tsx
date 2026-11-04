import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link, SkeletonText, Tile } from '@carbon/react';
import { ArrowRight } from '@carbon/react/icons';
import { useInventory } from '../inventory/inventory.resource';
import { isAlertStatus } from '../inventory/inventory.utils';
import { lowStockInventoryUrl } from './dashboard.meta';
import styles from './low-stock-tile.scss';

/** Tarjeta de la fila de métricas de inicio: cuántos artículos hay que reponer (RF17). */
const LowStockTile: React.FC = () => {
  const { t } = useTranslation();
  const { items, isLoading, error } = useInventory();

  const outOfStock = items.filter((i) => i.overallStatus === 'outOfStock').length;
  const low = items.filter((i) => i.overallStatus === 'low').length;
  const total = items.filter((i) => isAlertStatus(i.overallStatus)).length;

  return (
    <Tile className={styles.tileContainer}>
      <h2 className={styles.tileHeader}>{t('lowStockTileTitle', 'Stock a reponer')}</h2>
      <div className={styles.displayDetails}>
        <div className={styles.countLabel}>{t('items', 'Artículos')}</div>
        {isLoading ? (
          <SkeletonText className={styles.skeleton} />
        ) : error ? (
          <div className={styles.errorText}>{t('errorLoadingInventory', 'No se pudo cargar el inventario')}</div>
        ) : (
          <div className={styles.dataRow}>
            <span className={total > 0 ? styles.displayDataAlert : styles.displayData}>{total}</span>
            {total > 0 && (
              <span className={styles.breakdown}>
                {t('lowStockBreakdown', '{{outOfStock}} sin stock · {{low}} stock bajo', { outOfStock, low })}
              </span>
            )}
          </div>
        )}
      </div>
      {total > 0 && (
        <Link className={styles.link} href={lowStockInventoryUrl()} renderIcon={() => <ArrowRight size={16} />}>
          {t('seeItems', 'Ver artículos')}
        </Link>
      )}
    </Tile>
  );
};

export default LowStockTile;
