import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Column,
  ComboBox,
  ContentSwitcher,
  Grid,
  InlineLoading,
  InlineNotification,
  Modal,
  NumberInput,
  Stack,
  Switch,
  TextInput,
} from '@carbon/react';
import { showSnackbar, useConfig, useSession } from '@openmrs/esm-framework';
import { type Config } from '../config-schema';
import { type ConceptOption, useConceptAnswers } from '../add-item/add-item.resource';
import { formatQuantity, getItemName, toNumber } from '../inventory/inventory.utils';
import { type StockItem } from '../types';
import { registerMovement, useBatches, useParties } from './movement.resource';
import {
  baseUnit,
  type MovementErrors,
  type MovementFormValues,
  type MovementKind,
  totalBase,
  validateMovement,
} from './movement.utils';
import styles from './movement-modal.scss';

interface MovementModalProps {
  /** Artículo; null = modal cerrado. */
  item: StockItem | null;
  onClose: () => void;
  onSaved: () => void;
}

const emptyValues = (
  kind: MovementKind,
  siteLocationUuid: string,
  unitUuid: string,
  reasonUuid: string,
): MovementFormValues => ({
  kind,
  siteLocationUuid,
  quantity: '',
  unitUuid,
  sourcePartyUuid: '',
  batchNo: '',
  expiration: '',
  reasonUuid,
  remarks: '',
});

const MovementModal: React.FC<MovementModalProps> = ({ item, onClose, onSaved }) => {
  const { t } = useTranslation();
  const config = useConfig<Config>();
  const session = useSession();
  const parties = useParties();
  const reasons = useConceptAnswers(config.adjustmentReasonsConceptUuid);

  const units = useMemo(
    () => [...(item?.packagingUnits ?? [])].sort((a, b) => toNumber(a.factor) - toNumber(b.factor)),
    [item],
  );
  const defaultSite =
    config.sites.find((s) => s.locationUuid === session?.sessionLocation?.uuid)?.locationUuid ??
    config.sites[0]?.locationUuid ??
    '';

  const [values, setValues] = useState<MovementFormValues>(() =>
    emptyValues('in', defaultSite, '', config.defaultConsumptionReasonUuid),
  );
  const [errors, setErrors] = useState<MovementErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (item) {
      setValues(emptyValues('in', defaultSite, baseUnit(units)?.uuid ?? '', config.defaultConsumptionReasonUuid));
      setErrors({});
      setSaveError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  const siteParty = values.siteLocationUuid ? parties.partyForLocation(values.siteLocationUuid) : null;
  const batches = useBatches(item && values.kind === 'out' ? item.uuid : null, siteParty?.uuid ?? null);
  const availableBase = values.kind === 'out' && !batches.isLoading ? totalBase(batches.batches) : null;
  const base = baseUnit(units);

  const siteOptions = config.sites.map((s) => ({ id: s.locationUuid, text: s.name }));
  const unitOptions = units.map((u) => ({ id: u.uuid, text: u.packagingUomName }));
  const sourceOptions = parties.sources.map((p) => ({ id: p.uuid, text: p.name }));

  if (!item) {
    return null;
  }

  const set = <K extends keyof MovementFormValues>(key: K, value: MovementFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const close = () => {
    if (!saving) {
      onClose();
    }
  };

  const submit = async () => {
    const validation = validateMovement(values, { units, hasExpiration: item.hasExpiration, availableBase });
    if (!siteParty && values.siteLocationUuid) {
      validation.siteLocationUuid = t('siteNotStockLocation', 'Esta sede no está habilitada en el módulo de stock.');
    }
    setErrors(validation);
    if (Object.keys(validation).length > 0) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await registerMovement(item, values, config, {
        sitePartyUuid: siteParty!.uuid,
        responsibleUserUuid: session.user.uuid,
        batches: batches.batches,
      });
      const unitName = units.find((u) => u.uuid === values.unitUuid)?.packagingUomName ?? '';
      const siteName = config.sites.find((s) => s.locationUuid === values.siteLocationUuid)?.name ?? '';
      showSnackbar({
        kind: 'success',
        isLowContrast: true,
        title:
          values.kind === 'in'
            ? t('movementInSaved', 'Ingreso registrado')
            : t('movementOutSaved', 'Egreso registrado'),
        subtitle: `${getItemName(item)}: ${values.kind === 'in' ? '+' : '−'}${values.quantity} ${unitName} (${siteName})`,
      });
      onSaved();
      onClose();
    } catch (error) {
      const e = error as { responseBody?: { error?: { message?: string } }; message?: string };
      setSaveError(e?.responseBody?.error?.message ?? e?.message ?? String(error));
    } finally {
      setSaving(false);
    }
  };

  const comboProps = {
    autoAlign: true,
    itemToString: (option: { id: string; text: string } | null) => option?.text ?? '',
    disabled: saving,
  };

  return (
    <Modal
      open
      size="sm"
      modalHeading={t('registerMovement', 'Registrar movimiento')}
      modalLabel={getItemName(item)}
      primaryButtonText={saving ? t('saving', 'Guardando...') : t('save', 'Guardar')}
      secondaryButtonText={t('cancel', 'Cancelar')}
      primaryButtonDisabled={saving || units.length === 0}
      onRequestClose={close}
      onRequestSubmit={submit}
      preventCloseOnClickOutside
    >
      <Stack gap={6}>
        {units.length === 0 && (
          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title={t('noUnitsTitle', 'El artículo no tiene unidades')}
            subtitle={t('noUnitsMovement', 'Cargá su unidad base con el lápiz antes de registrar movimientos.')}
          />
        )}

        <ContentSwitcher
          size="md"
          selectedIndex={values.kind === 'in' ? 0 : 1}
          onChange={({ name }) => set('kind', name as MovementKind)}
        >
          <Switch name="in" text={t('movementIn', 'Ingreso')} disabled={saving} />
          <Switch name="out" text={t('movementOut', 'Consumo / egreso')} disabled={saving} />
        </ContentSwitcher>

        <ComboBox
          id="movement-site"
          titleText={t('site', 'Sede')}
          items={siteOptions}
          selectedItem={siteOptions.find((o) => o.id === values.siteLocationUuid) ?? null}
          onChange={({ selectedItem }) => set('siteLocationUuid', selectedItem?.id ?? '')}
          invalid={!!errors.siteLocationUuid}
          invalidText={errors.siteLocationUuid}
          {...comboProps}
        />

        {values.kind === 'out' && (
          <p className={styles.available}>
            {batches.isLoading ? (
              <InlineLoading description={t('loadingStock', 'Consultando existencia...')} />
            ) : (
              t('availableAtSite', 'Disponible en esta sede: {{qty}} {{unit}}', {
                qty: formatQuantity(availableBase ?? 0),
                unit: base?.packagingUomName ?? '',
              })
            )}
          </p>
        )}

        <Grid condensed className={styles.grid}>
          <Column sm={2} md={4} lg={8}>
            <NumberInput
              id="movement-quantity"
              label={t('quantity', 'Cantidad')}
              min={0}
              hideSteppers
              allowEmpty
              value={values.quantity}
              onChange={(_e, { value }) => set('quantity', String(value ?? ''))}
              invalid={!!errors.quantity}
              invalidText={errors.quantity}
              disabled={saving}
            />
          </Column>
          <Column sm={2} md={4} lg={8}>
            <ComboBox
              id="movement-unit"
              titleText={t('unit', 'Unidad')}
              items={unitOptions}
              selectedItem={unitOptions.find((o) => o.id === values.unitUuid) ?? null}
              onChange={({ selectedItem }) => set('unitUuid', selectedItem?.id ?? '')}
              invalid={!!errors.unitUuid}
              invalidText={errors.unitUuid}
              {...comboProps}
            />
          </Column>
        </Grid>

        {values.kind === 'in' ? (
          <>
            <ComboBox
              id="movement-source"
              titleText={t('source', 'Origen')}
              placeholder={t('chooseSource', 'Proveedor, donación...')}
              helperText={
                sourceOptions.length === 0
                  ? t('noSourcesHelper', 'No hay orígenes cargados: crealos en Gestión de Inventario → Sources.')
                  : undefined
              }
              items={sourceOptions}
              selectedItem={sourceOptions.find((o) => o.id === values.sourcePartyUuid) ?? null}
              onChange={({ selectedItem }) => set('sourcePartyUuid', selectedItem?.id ?? '')}
              invalid={!!errors.sourcePartyUuid}
              invalidText={errors.sourcePartyUuid}
              {...comboProps}
              disabled={saving || parties.isLoading}
            />
            {item.hasExpiration && (
              <Grid condensed className={styles.grid}>
                <Column sm={2} md={4} lg={8}>
                  <TextInput
                    id="movement-batch"
                    labelText={t('batchNo', 'Número de lote')}
                    value={values.batchNo}
                    onChange={(e) => set('batchNo', e.target.value)}
                    invalid={!!errors.batchNo}
                    invalidText={errors.batchNo}
                    disabled={saving}
                  />
                </Column>
                <Column sm={2} md={4} lg={8}>
                  <TextInput
                    id="movement-expiration"
                    type="date"
                    labelText={t('expirationDate', 'Vencimiento')}
                    value={values.expiration}
                    onChange={(e) => set('expiration', e.target.value)}
                    invalid={!!errors.expiration}
                    invalidText={errors.expiration}
                    disabled={saving}
                  />
                </Column>
              </Grid>
            )}
          </>
        ) : (
          <ComboBox
            id="movement-reason"
            titleText={t('reason', 'Motivo')}
            items={reasons.options}
            itemToString={(option: ConceptOption | null) => option?.display ?? ''}
            selectedItem={reasons.options.find((o) => o.uuid === values.reasonUuid) ?? null}
            onChange={({ selectedItem }) => set('reasonUuid', selectedItem?.uuid ?? '')}
            invalid={!!errors.reasonUuid}
            invalidText={errors.reasonUuid}
            autoAlign
            disabled={saving || reasons.isLoading}
          />
        )}

        <TextInput
          id="movement-remarks"
          labelText={t('remarksOptional', 'Observaciones (opcional)')}
          maxLength={250}
          value={values.remarks}
          onChange={(e) => set('remarks', e.target.value)}
          disabled={saving}
        />

        {saveError && (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title={t('errorSavingMovement', 'No se pudo registrar el movimiento')}
            subtitle={saveError}
          />
        )}
      </Stack>
    </Modal>
  );
};

export default MovementModal;
