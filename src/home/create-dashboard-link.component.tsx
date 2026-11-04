import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { DashboardExtension, type DashboardExtensionProps, type IconId } from '@openmrs/esm-framework';

// Mismo patrón que el módulo de protocolos (y el de turnos) para los links del menú de inicio
export const createDashboardLink = (config: Omit<DashboardExtensionProps, 'icon'> & { icon?: IconId }) => () => (
  <BrowserRouter>
    <DashboardExtension path={config.path} title={config.title} basePath={config.basePath} icon={config.icon} />
  </BrowserRouter>
);
