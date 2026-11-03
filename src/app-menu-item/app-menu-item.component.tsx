import React from 'react';
import { ClickableTile } from '@carbon/react';
import { Box } from '@carbon/react/icons';
import { useTranslation } from 'react-i18next';
import styles from './app-menu-item.scss';

const AppMenuItem: React.FC = () => {
  const { t } = useTranslation();

  return (
    <ClickableTile className={styles.tile} href={`${window.getOpenmrsSpaBase()}inventario-residencia`}>
      <Box size={24} />
      <span>{t('inventoryMenu', 'Inventario')}</span>
    </ClickableTile>
  );
};

export default AppMenuItem;
