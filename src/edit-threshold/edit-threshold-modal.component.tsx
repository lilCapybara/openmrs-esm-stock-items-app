import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Column, ComboBox, Grid, InlineNotification, Modal, NumberInput, Stack, Tag } from '@carbon/react';
import { showSnackbar, useConfig } from '@openmrs/esm-framework';
import { type Config } from '../config-schema';
import { type ConceptOption, useConceptAnswers } from '../add-item/add-item.resource';
import { formatQuantity, getItemName, toNumber } from '../inventory/inventory.utils';
import { type StockItem } from '../types';
import {
  type EditThresholdErrors,
  type EditThresholdValues,
  initialEditValues,
  NEW_UNIT,
  saveThreshold,
  validateEditThreshold,
} from './edit-threshold.resource';
import styles from './edit-threshold-modal.scss';

interface EditThresholdModalProps {
  /** Artículo a editar; null = modal cerrado. */
  item: StockItem | null;
  onClose: () => void;
  onSaved: () => void;
}

const EditThresholdModal: React.FC<EditThresholdModalProps> = ({ item, onClose, onSaved }) => {
  const { t } = useTranslation();
  const { packagingUnitsConceptUuid } = useConfig<Config>();
  const unitConcepts = useConceptAnswers(packagingUnitsConceptUuid);

  const [values, setValues] = useState<EditThresholdValues | null>(null);
  const [errors, setErrors] = useState<EditThresholdErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setValues(item ? initialEditValues(item) : null);
    setErrors({});
    setSaveError(null);
  }, [item]);

  const units = useMemo(
    () => [...(item?.packagingUnits ?? [])].sort((a, b) => toNumber(a.factor) - toNumber(b.factor)),
    [item],
  );
  const hasUnits = units.length > 0;
  const baseName = units.find((u) => toNumber(u.factor) === 1)?.packagingUomName ?? units[0]?.packagingUomName;

  // Unidades que todavía no tiene el artículo
  const addableUnits = unitConcepts.options.filter((o) => !units.some((u) => u.packagingUomUuid === o.uuid));
  const newUnit = unitConcepts.options.find((o) => o.uuid === values?.newUnitConceptUuid);

  const unitOptions = useMemo(() => {
    const options = units.map((u) => ({ id: u.uuid, text: u.packagingUomName }));
    if (newUnit) {
      options.push({ id: NEW_UNIT, text: `${newUnit.display} (${t('newLabel', 'nueva')})` });
    }
    return options;
  }, [units, newUnit, t]);

  if (!item || !values) {
    return null;
  }

  const set = <K extends keyof EditThresholdValues>(key: K, value: EditThresholdValues[K]) => {
    setValues((prev) => (prev ? { ...prev, [key]: value } : prev));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const close = () => {
    if (!saving) {
      onClose();
    }
  };

  const submit = async () => {
    const validation = validateEditThreshold(values, units);
    setErrors(validation);
    if (Object.keys(validation).length > 0) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await saveThreshold(item, values);
      const cleared = values.reorderLevel.trim() === '';
      showSnackbar({
        kind: 'success',
        isLowContrast: true,
        title: cleared
          ? t('thresholdCleared', 'Nivel de reposición quitado')
          : t('thresholdSaved', 'Nivel de reposición guardado'),
        subtitle: getItemName(item),
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

  return (
    <Modal
      open
      size="sm"
      modalHeading={t('editThreshold', 'Nivel de reposición')}
      modalLabel={getItemName(item)}
      primaryButtonText={saving ? t('saving', 'Guardando...') : t('save', 'Guardar')}
      secondaryButtonText={t('cancel', 'Cancelar')}
      primaryButtonDisabled={saving}
      onRequestClose={close}
      onRequestSubmit={submit}
      preventCloseOnClickOutside
    >
      <Stack gap={6}>
        <div>
          <p className={styles.label}>{t('currentUnits', 'Unidades del artículo')}</p>
          {hasUnits ? (
            <div className={styles.units}>
              {units.map((u) => (
                <Tag key={u.uuid} type="cool-gray" size="sm">
                  {toNumber(u.factor) === 1
                    ? `${u.packagingUomName} (${t('base', 'base')})`
                    : `${u.packagingUomName} = ${formatQuantity(toNumber(u.factor))} ${baseName ?? ''}`.trim()}
                </Tag>
              ))}
            </div>
          ) : (
            <p className={styles.hint}>
              {t(
                'noUnitsHint',
                'Este artículo todavía no tiene unidades. Elegí su unidad base para poder cargar el nivel de reposición.',
              )}
            </p>
          )}
        </div>

        <Grid condensed className={styles.grid}>
          <Column sm={4} md={hasUnits ? 5 : 8} lg={hasUnits ? 10 : 16}>
            <ComboBox
              autoAlign
              id="new-unit"
              titleText={
                hasUnits ? t('addUnitOptional', 'Agregar unidad mayor (opcional)') : t('baseUnitLabel', 'Unidad base')
              }
              placeholder={hasUnits ? t('noNewUnit', 'No agregar') : t('chooseUnit', 'Elegí una unidad')}
              items={addableUnits}
              itemToString={(option: ConceptOption | null) => option?.display ?? ''}
              selectedItem={newUnit ?? null}
              onChange={({ selectedItem }) => {
                set('newUnitConceptUuid', selectedItem?.uuid ?? '');
                if (!selectedItem && values.reorderLevelUnit === NEW_UNIT) {
                  set('reorderLevelUnit', units[0]?.uuid ?? NEW_UNIT);
                }
              }}
              invalid={!!errors.newUnitConceptUuid}
              invalidText={errors.newUnitConceptUuid}
              disabled={unitConcepts.isLoading || saving}
            />
          </Column>
          {hasUnits && (
            <Column sm={4} md={3} lg={6}>
              <NumberInput
                id="new-unit-factor"
                label={
                  newUnit && baseName
                    ? t('packFactorLabel', 'Cantidad por {{pack}} (en {{base}})', {
                        pack: newUnit.display,
                        base: baseName,
                      })
                    : t('packFactorGeneric', 'Cantidad por unidad mayor')
                }
                min={2}
                step={1}
                hideSteppers
                allowEmpty
                value={values.newUnitFactor}
                onChange={(_e, { value }) => set('newUnitFactor', String(value ?? ''))}
                invalid={!!errors.newUnitFactor}
                invalidText={errors.newUnitFactor}
                disabled={!values.newUnitConceptUuid || saving}
              />
            </Column>
          )}
        </Grid>

        <Grid condensed className={styles.grid}>
          <Column sm={4} md={4} lg={8}>
            <NumberInput
              id="threshold-level"
              label={t('reorderLevel', 'Nivel de reposición')}
              helperText={t('reorderLevelClearHelper', 'Dejalo vacío para quitar el nivel de reposición.')}
              min={0}
              hideSteppers
              allowEmpty
              value={values.reorderLevel}
              onChange={(_e, { value }) => set('reorderLevel', String(value ?? ''))}
              invalid={!!errors.reorderLevel}
              invalidText={errors.reorderLevel}
              disabled={saving}
            />
          </Column>
          <Column sm={4} md={4} lg={8}>
            <ComboBox
              autoAlign
              id="threshold-unit"
              titleText={t('reorderLevelUnit', 'Expresado en')}
              items={unitOptions}
              itemToString={(option: { id: string; text: string } | null) => option?.text ?? ''}
              selectedItem={unitOptions.find((o) => o.id === values.reorderLevelUnit) ?? null}
              onChange={({ selectedItem }) => set('reorderLevelUnit', selectedItem?.id ?? '')}
              invalid={!!errors.reorderLevelUnit}
              invalidText={errors.reorderLevelUnit}
              disabled={saving || unitOptions.length === 0}
            />
          </Column>
        </Grid>

        {saveError && (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title={t('errorSavingThreshold', 'No se pudo guardar el nivel de reposición')}
            subtitle={saveError}
          />
        )}
      </Stack>
    </Modal>
  );
};

export default EditThresholdModal;
