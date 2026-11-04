import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DataTable,
  DataTableSkeleton,
  InlineNotification,
  Layer,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Tile,
  Toggle,
  Dropdown,
  Button,
} from '@carbon/react';
import { Add, ArrowsVertical, Edit, Renew } from '@carbon/react/icons';
import { UserHasAccess, useConfig } from '@openmrs/esm-framework';
import { type Config } from '../config-schema';
import AddItemModal from '../add-item/add-item-modal.component';
import EditThresholdModal from '../edit-threshold/edit-threshold-modal.component';
import MovementModal from '../movement/movement-modal.component';
import { type StockItem } from '../types';
import { useInventory } from './inventory.resource';
import { isAlertStatus } from './inventory.utils';
import StockStatusTag from './stock-status-tag.component';
import styles from './inventory-table.scss';

type TypeFilter = 'all' | 'drug' | 'nonDrug';

const PAGE_SIZES = [10, 20, 50];

const InventoryTable: React.FC = () => {
  const { t } = useTranslation();
  const { items, sites, isLoading, isValidating, error, mutate } = useInventory();
  const { createItemPrivileges, editItemPrivileges, movementPrivileges } = useConfig<Config>();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<StockItem | null>(null);
  const [moving, setMoving] = useState<StockItem | null>(null);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  // ?soloStockBajo=1 (lo usa la tarjeta de inicio) arranca con el filtro activado
  const [onlyAlerts, setOnlyAlerts] = useState(
    () => new URLSearchParams(window.location.search).get('soloStockBajo') === '1',
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[1]);

  const typeOptions: Array<{ id: TypeFilter; text: string }> = [
    { id: 'all', text: t('allTypes', 'Todos los tipos') },
    { id: 'drug', text: t('drugs', 'Medicamentos') },
    { id: 'nonDrug', text: t('nonDrugs', 'Descartables y otros') },
  ];

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es');
    return items.filter((item) => {
      if (typeFilter !== 'all' && item.type !== typeFilter) {
        return false;
      }
      if (onlyAlerts && !isAlertStatus(item.overallStatus)) {
        return false;
      }
      if (term) {
        const haystack = `${item.name} ${item.category ?? ''}`.toLocaleLowerCase('es');
        return haystack.includes(term);
      }
      return true;
    });
  }, [items, search, typeFilter, onlyAlerts]);

  const alertCount = useMemo(() => items.filter((i) => isAlertStatus(i.overallStatus)).length, [items]);

  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const headers = [
    { key: 'name', header: t('item', 'Artículo') },
    { key: 'type', header: t('type', 'Tipo') },
    { key: 'category', header: t('category', 'Categoría') },
    ...sites.map((site) => ({ key: `site-${site.locationUuid}`, header: site.name })),
    { key: 'threshold', header: t('reorderLevel', 'Nivel de reposición') },
    { key: 'status', header: t('status', 'Estado') },
    { key: 'actions', header: '' },
  ];

  const rows = pageRows.map((item) => {
    const row: Record<string, React.ReactNode> & { id: string } = {
      id: item.uuid,
      name: item.name,
      type: item.type === 'drug' ? t('drug', 'Medicamento') : t('nonDrug', 'Descartable / otro'),
      category: item.category ?? '—',
      threshold: item.thresholdDisplay ?? '—',
      status: <StockStatusTag status={item.overallStatus} />,
      actions: (
        <div className={styles.actions}>
          <UserHasAccess privilege={movementPrivileges}>
            <Button
              kind="ghost"
              size="sm"
              hasIconOnly
              renderIcon={ArrowsVertical}
              iconDescription={t('registerMovementFor', 'Registrar ingreso o consumo de {{name}}', { name: item.name })}
              tooltipPosition="left"
              onClick={() => setMoving(item.stockItem)}
            />
          </UserHasAccess>
          <UserHasAccess privilege={editItemPrivileges}>
            <Button
              kind="ghost"
              size="sm"
              hasIconOnly
              renderIcon={Edit}
              iconDescription={t('editThresholdFor', 'Editar nivel de reposición de {{name}}', { name: item.name })}
              tooltipPosition="left"
              onClick={() => setEditing(item.stockItem)}
            />
          </UserHasAccess>
        </div>
      ),
    };
    for (const site of sites) {
      const stock = item.sites[site.locationUuid];
      row[`site-${site.locationUuid}`] = (
        <span className={stock.tracked && isAlertStatus(stock.status) ? styles.alertQuantity : undefined}>
          {stock.display}
        </span>
      );
    }
    return row;
  });

  if (isLoading) {
    return <DataTableSkeleton role="progressbar" columnCount={headers.length} rowCount={5} />;
  }

  if (error) {
    return (
      <InlineNotification
        kind="error"
        lowContrast
        hideCloseButton
        title={t('errorLoadingInventory', 'No se pudo cargar el inventario')}
        subtitle={error.message}
      />
    );
  }

  return (
    <div className={styles.container}>
      {alertCount > 0 && (
        <InlineNotification
          className={styles.alertBanner}
          kind="warning"
          lowContrast
          hideCloseButton
          title={t('lowStockAlertTitle', 'Reposición necesaria')}
          subtitle={t(
            'lowStockAlertSubtitle',
            '{{count}} artículo(s) sin stock o por debajo del nivel de reposición.',
            {
              count: alertCount,
            },
          )}
        />
      )}
      <DataTable rows={rows} headers={headers} size="md" useZebraStyles>
        {({ rows: tableRows, headers: tableHeaders, getTableProps, getHeaderProps, getRowProps }) => (
          <TableContainer>
            <TableToolbar>
              <TableToolbarContent className={styles.toolbar}>
                <TableToolbarSearch
                  persistent
                  placeholder={t('searchItems', 'Buscar artículo o categoría')}
                  onChange={(e) => {
                    setSearch(typeof e === 'string' ? e : e.target.value);
                    setPage(1);
                  }}
                />
                <Dropdown
                  id="type-filter"
                  className={styles.typeFilter}
                  titleText=""
                  hideLabel
                  label={t('type', 'Tipo')}
                  type="inline"
                  items={typeOptions}
                  itemToString={(item) => item?.text ?? ''}
                  selectedItem={typeOptions.find((o) => o.id === typeFilter)}
                  onChange={({ selectedItem }) => {
                    setTypeFilter(selectedItem?.id ?? 'all');
                    setPage(1);
                  }}
                />
                <Toggle
                  id="only-alerts"
                  size="sm"
                  className={styles.toggle}
                  labelText=""
                  labelA={t('onlyLowStock', 'Solo stock bajo')}
                  labelB={t('onlyLowStock', 'Solo stock bajo')}
                  toggled={onlyAlerts}
                  onToggle={(checked) => {
                    setOnlyAlerts(checked);
                    setPage(1);
                  }}
                />
                <Button
                  kind="ghost"
                  size="md"
                  hasIconOnly
                  renderIcon={Renew}
                  iconDescription={t('refresh', 'Actualizar')}
                  disabled={isValidating}
                  onClick={() => mutate()}
                />
                <UserHasAccess privilege={createItemPrivileges}>
                  <Button kind="primary" size="md" renderIcon={Add} onClick={() => setAddOpen(true)}>
                    {t('newItem', 'Nuevo artículo')}
                  </Button>
                </UserHasAccess>
              </TableToolbarContent>
            </TableToolbar>
            <Table {...getTableProps()}>
              <TableHead>
                <TableRow>
                  {tableHeaders.map((header) => (
                    <TableHeader {...getHeaderProps({ header })} key={header.key}>
                      {header.header}
                    </TableHeader>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {tableRows.map((row) => (
                  <TableRow {...getRowProps({ row })} key={row.id}>
                    {row.cells.map((cell) => (
                      <TableCell key={cell.id}>{cell.value}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filtered.length === 0 && (
              <Layer>
                <Tile className={styles.emptyState}>
                  <p>{t('noItemsToShow', 'No hay artículos para mostrar con los filtros actuales.')}</p>
                </Tile>
              </Layer>
            )}
            {filtered.length > 0 && (
              <Pagination
                page={page}
                pageSize={pageSize}
                pageSizes={PAGE_SIZES}
                totalItems={filtered.length}
                itemsPerPageText={t('itemsPerPage', 'Artículos por página:')}
                onChange={({ page: newPage, pageSize: newSize }) => {
                  setPage(newPage);
                  setPageSize(newSize);
                }}
              />
            )}
          </TableContainer>
        )}
      </DataTable>
      <AddItemModal
        open={addOpen}
        existingNames={items.map((i) => i.name)}
        onClose={() => setAddOpen(false)}
        onCreated={() => mutate()}
      />
      <EditThresholdModal item={editing} onClose={() => setEditing(null)} onSaved={() => mutate()} />
      <MovementModal item={moving} onClose={() => setMoving(null)} onSaved={() => mutate()} />
    </div>
  );
};

export default InventoryTable;
