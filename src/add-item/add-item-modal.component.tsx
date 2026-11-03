import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Checkbox,
  Column,
  ComboBox,
  Grid,
  InlineLoading,
  InlineNotification,
  Modal,
  NumberInput,
  RadioButton,
  RadioButtonGroup,
  Stack,
  TextInput,
} from '@carbon/react';
import { showSnackbar, useConfig } from '@openmrs/esm-framework';
import { type Config } from '../config-schema';
import { createStockItemWithSetup, type ConceptOption, useConceptAnswers } from './add-item.resource';
import {
  AddItemError,
  type AddItemErrors,
  type AddItemFormValues,
  type AddItemStep,
  emptyAddItemForm,
} from './add-item.types';
import { buildItemName, defaultAcronym, validateAddItem } from './add-item.utils';
import styles from './add-item-modal.scss';

interface AddItemModalProps {
  open: boolean;
  existingNames: Array<string>;
  onClose: () => void;
  onCreated: () => void;
}

const AddItemModal: React.FC<AddItemModalProps> = ({ open, existingNames, onClose, onCreated }) => {
  const { t } = useTranslation();
  const config = useConfig<Config>();
  const units = useConceptAnswers(config.packagingUnitsConceptUuid);
  const categories = useConceptAnswers(config.categoriesConceptUuid);

  const [values, setValues] = useState<AddItemFormValues>(emptyAddItemForm);
  const [errors, setErrors] = useState<AddItemErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState<AddItemStep | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const stepLabels: Record<AddItemStep, string> = {
    concept: t('stepConcept', 'Creando el concepto'),
    drug: t('stepDrug', 'Creando el medicamento'),
    stockItem: t('stepStockItem', 'Creando el artículo de stock'),
    packaging: t('stepPackaging', 'Cargando las unidades'),
    reorderLevel: t('stepReorderLevel', 'Cargando el nivel de reposición'),
  };

  const set = <K extends keyof AddItemFormValues>(key: K, value: AddItemFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const itemName = buildItemName(values);
  const baseUnit = units.options.find((u) => u.uuid === values.baseUnitUuid);
  const packUnit = units.options.find((u) => u.uuid === values.packUnitUuid);

  const reorderUnitOptions = useMemo(() => {
    const options = [{ id: 'base', text: baseUnit?.display ?? t('baseUnit', 'Unidad base') }];
    if (packUnit) {
      options.push({ id: 'pack', text: packUnit.display });
    }
    return options;
  }, [baseUnit, packUnit, t]);

  const close = () => {
    if (submitting) {
      return;
    }
    setValues(emptyAddItemForm);
    setErrors({});
    setSubmitError(null);
    onClose();
  };

  const submit = async () => {
    const validation = validateAddItem(values, { existingNames });
    setErrors(validation);
    if (Object.keys(validation).length > 0) {
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await createStockItemWithSetup(values, config, setCurrentStep);
      showSnackbar({
        kind: 'success',
        isLowContrast: true,
        title: t('itemCreated', 'Artículo creado'),
        subtitle: result.reusedConcept
          ? t('itemCreatedReused', '{{name}} se agregó al inventario (se reutilizó un concepto existente con ese nombre).', {
              name: itemName,
            })
          : t('itemCreatedSubtitle', '{{name}} se agregó al inventario.', { name: itemName }),
      });
      setValues(emptyAddItemForm);
      setErrors({});
      onCreated();
      onClose();
    } catch (error) {
      const step = error instanceof AddItemError ? stepLabels[error.step] : null;
      setSubmitError(step ? `${step}: ${(error as Error).message}` : String((error as Error)?.message ?? error));
    } finally {
      setSubmitting(false);
      setCurrentStep(null);
    }
  };

  const unitComboProps = {
    items: units.options,
    itemToString: (item: ConceptOption | null) => item?.display ?? '',
    disabled: units.isLoading || submitting,
  };

  return (
    <Modal
      open={open}
      size="md"
      modalHeading={t('newItem', 'Nuevo artículo')}
      primaryButtonText={submitting ? t('saving', 'Guardando...') : t('save', 'Guardar')}
      secondaryButtonText={t('cancel', 'Cancelar')}
      primaryButtonDisabled={submitting}
      onRequestClose={close}
      onRequestSubmit={submit}
      preventCloseOnClickOutside
      selectorPrimaryFocus="#item-name"
    >
      <Stack gap={6} className={styles.form}>
        {(units.error || categories.error) && (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title={t('errorLoadingOptions', 'No se pudieron cargar las unidades o categorías')}
            subtitle={t('checkConfig', 'Revisá los UUID de packagingUnitsConceptUuid y categoriesConceptUuid en la configuración.')}
          />
        )}

        <RadioButtonGroup
          legendText={t('itemKind', 'Tipo de artículo')}
          name="item-kind"
          valueSelected={values.kind}
          onChange={(value) => set('kind', value as AddItemFormValues['kind'])}
          disabled={submitting}
        >
          <RadioButton id="kind-non-drug" labelText={t('nonDrugKind', 'Descartable u otro')} value="nonDrug" />
          <RadioButton id="kind-drug" labelText={t('drug', 'Medicamento')} value="drug" />
        </RadioButtonGroup>

        <Grid condensed className={styles.grid}>
          <Column sm={4} md={values.kind === 'drug' ? 5 : 8} lg={values.kind === 'drug' ? 10 : 16}>
            <TextInput
              id="item-name"
              labelText={values.kind === 'drug' ? t('genericName', 'Nombre genérico') : t('itemName', 'Nombre')}
              placeholder={values.kind === 'drug' ? t('genericNamePlaceholder', 'Ej. Ibuprofeno') : t('itemNamePlaceholder', 'Ej. Pasta dental')}
              value={values.name}
              onChange={(e) => set('name', e.target.value)}
              invalid={!!errors.name}
              invalidText={errors.name}
              disabled={submitting}
            />
          </Column>
          {values.kind === 'drug' && (
            <Column sm={4} md={3} lg={6}>
              <TextInput
                id="item-strength"
                labelText={t('strength', 'Concentración')}
                placeholder={t('strengthPlaceholder', 'Ej. 400 mg')}
                value={values.strength}
                onChange={(e) => set('strength', e.target.value)}
                invalid={!!errors.strength}
                invalidText={errors.strength}
                disabled={submitting}
              />
            </Column>
          )}
        </Grid>

        <Grid condensed className={styles.grid}>
          <Column sm={4} md={5} lg={10}>
            <ComboBox
              id="item-category"
              titleText={t('category', 'Categoría')}
              placeholder={t('chooseCategory', 'Elegí una categoría')}
              items={categories.options}
              itemToString={(item: ConceptOption | null) => item?.display ?? ''}
              selectedItem={categories.options.find((c) => c.uuid === values.categoryUuid) ?? null}
              onChange={({ selectedItem }) => set('categoryUuid', selectedItem?.uuid ?? '')}
              invalid={!!errors.categoryUuid}
              invalidText={errors.categoryUuid}
              disabled={categories.isLoading || submitting}
            />
          </Column>
          <Column sm={4} md={3} lg={6}>
            <TextInput
              id="item-acronym"
              labelText={t('acronymOptional', 'Abreviatura (opcional)')}
              placeholder={itemName ? defaultAcronym(itemName) : ''}
              value={values.acronym}
              onChange={(e) => set('acronym', e.target.value)}
              disabled={submitting}
            />
          </Column>
        </Grid>

        <Grid condensed className={styles.grid}>
          <Column sm={4} md={8} lg={16}>
            <ComboBox
              id="item-base-unit"
              titleText={
                values.kind === 'drug'
                  ? t('baseUnitDrug', 'Unidad base / forma farmacéutica')
                  : t('baseUnitLabel', 'Unidad base')
              }
              helperText={t('baseUnitHelper', 'La unidad más chica en la que se cuenta y se entrega (ej. Unidad, Comprimido, Mililitro).')}
              placeholder={t('chooseUnit', 'Elegí una unidad')}
              selectedItem={baseUnit ?? null}
              onChange={({ selectedItem }) => set('baseUnitUuid', selectedItem?.uuid ?? '')}
              invalid={!!errors.baseUnitUuid}
              invalidText={errors.baseUnitUuid}
              {...unitComboProps}
            />
          </Column>
        </Grid>

        <Grid condensed className={styles.grid}>
          <Column sm={4} md={5} lg={10}>
            <ComboBox
              id="item-pack-unit"
              titleText={t('packUnitOptional', 'Unidad mayor (opcional)')}
              helperText={t('packUnitHelper', 'Si se compra o guarda en cajas, frascos, paquetes, etc.')}
              placeholder={t('noPackUnit', 'Sin unidad mayor')}
              selectedItem={packUnit ?? null}
              onChange={({ selectedItem }) => {
                set('packUnitUuid', selectedItem?.uuid ?? '');
                if (!selectedItem) {
                  set('packFactor', '');
                  set('reorderLevelUnit', 'base');
                }
              }}
              invalid={!!errors.packUnitUuid}
              invalidText={errors.packUnitUuid}
              {...unitComboProps}
            />
          </Column>
          <Column sm={4} md={3} lg={6}>
            <NumberInput
              id="item-pack-factor"
              label={
                packUnit && baseUnit
                  ? t('packFactorLabel', 'Cantidad por {{pack}} (en {{base}})', { base: baseUnit.display, pack: packUnit.display })
                  : t('packFactorGeneric', 'Cantidad por unidad mayor')
              }
              min={2}
              step={1}
              hideSteppers
              allowEmpty
              value={values.packFactor}
              onChange={(_e, { value }) => set('packFactor', String(value ?? ''))}
              invalid={!!errors.packFactor}
              invalidText={errors.packFactor}
              disabled={!values.packUnitUuid || submitting}
            />
          </Column>
        </Grid>

        <div>
          <Checkbox
            id="item-has-expiration"
            labelText={t('hasExpiration', 'El artículo vence (se cargan lotes con fecha de vencimiento)')}
            checked={values.hasExpiration}
            onChange={(_e, { checked }) => set('hasExpiration', checked)}
            disabled={submitting}
          />
          {values.hasExpiration && (
            <NumberInput
              id="item-expiry-notice"
              className={styles.indented}
              label={t('expiryNoticeDays', 'Avisar con cuántos días de anticipación')}
              min={0}
              step={1}
              hideSteppers
              allowEmpty
              value={values.expiryNoticeDays}
              onChange={(_e, { value }) => set('expiryNoticeDays', String(value ?? ''))}
              invalid={!!errors.expiryNoticeDays}
              invalidText={errors.expiryNoticeDays}
              disabled={submitting}
            />
          )}
        </div>

        <Grid condensed className={styles.grid}>
          <Column sm={4} md={4} lg={8}>
            <NumberInput
              id="item-reorder-level"
              label={t('reorderLevelOptional', 'Nivel de reposición (opcional)')}
              helperText={t('reorderLevelHelper', 'Con esta cantidad o menos, el artículo figura como "Stock bajo".')}
              min={0}
              hideSteppers
              allowEmpty
              value={values.reorderLevel}
              onChange={(_e, { value }) => set('reorderLevel', String(value ?? ''))}
              invalid={!!errors.reorderLevel}
              invalidText={errors.reorderLevel}
              disabled={submitting}
            />
          </Column>
          <Column sm={4} md={4} lg={8}>
            <ComboBox
              id="item-reorder-unit"
              titleText={t('reorderLevelUnit', 'Expresado en')}
              items={reorderUnitOptions}
              itemToString={(item: { id: string; text: string } | null) => item?.text ?? ''}
              selectedItem={reorderUnitOptions.find((o) => o.id === values.reorderLevelUnit) ?? reorderUnitOptions[0]}
              onChange={({ selectedItem }) =>
                set('reorderLevelUnit', (selectedItem?.id as AddItemFormValues['reorderLevelUnit']) ?? 'base')
              }
              invalid={!!errors.reorderLevelUnit}
              invalidText={errors.reorderLevelUnit}
              disabled={submitting}
            />
          </Column>
        </Grid>

        {submitting && currentStep && <InlineLoading description={`${stepLabels[currentStep]}...`} />}
        {submitError && (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title={t('errorCreatingItem', 'No se pudo crear el artículo')}
            subtitle={submitError}
          />
        )}
      </Stack>
    </Modal>
  );
};

export default AddItemModal;
