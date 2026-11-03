import React from 'react';
import { Tag } from '@carbon/react';
import { useTranslation } from 'react-i18next';
import { type StockStatus } from '../types';
import styles from './stock-status-tag.scss';

const tagType: Record<StockStatus, 'red' | 'magenta' | 'warm-gray' | 'green' | 'gray'> = {
  outOfStock: 'red',
  low: 'magenta',
  nearThreshold: 'warm-gray',
  ok: 'green',
  noThreshold: 'gray',
};

interface StockStatusTagProps {
  status: StockStatus;
}

const StockStatusTag: React.FC<StockStatusTagProps> = ({ status }) => {
  const { t } = useTranslation();

  const labels: Record<StockStatus, string> = {
    outOfStock: t('statusOutOfStock', 'Sin stock'),
    low: t('statusLow', 'Stock bajo'),
    nearThreshold: t('statusNearThreshold', 'Cerca del umbral'),
    ok: t('statusOk', 'OK'),
    noThreshold: t('statusNoThreshold', 'Sin umbral'),
  };

  return (
    <Tag type={tagType[status]} size="sm" className={status === 'low' ? styles.lowStock : undefined}>
      {labels[status]}
    </Tag>
  );
};

export default StockStatusTag;
