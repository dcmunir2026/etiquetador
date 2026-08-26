'use client';

import { LoginView } from './LoginView';
import { DashboardView } from './DashboardView';
import { UploadView } from './UploadView';
import { DimensionsView } from './DimensionsView';
import { TaxonomyGroupsView } from './TaxonomyGroupsView';
import { ProjectTaxonomiesView } from './ProjectTaxonomiesView';
import { RolesView } from './RolesView';
import { PackagesView } from './PackagesView';
import { SegmentationView } from './SegmentationView';
import { TaggingView } from './TaggingView';
import { DiscrepanciasView } from './DiscrepanciasView';
import { ValidacionView } from './ValidacionView';
import { ReporteView } from './ReporteView';
import { KappaView } from './KappaView';
import { PlaceholderView } from './PlaceholderView';

export type ViewData = {
  projects: any[];
  dimensions: any[];
  taxonomies: any[];
  dimsByTx: Record<string, any[]>;
  txCountByDim: Record<string, number>;
  totalActiveTaxonomies: number;
  totalTaxonomyDimensions: number;
};

export function ViewRouter({ view, data }: { view: string; data: ViewData }) {
  switch (view) {
    case 'login': return <LoginView />;
    case 'dashboard': return <DashboardView data={data} />;
    case 'upload': return <UploadView />;
    case 'taxonomies': return <DimensionsView data={data} />;
    case 'taxonomy-groups': return <TaxonomyGroupsView data={data} />;
    case 'dimensions': return <ProjectTaxonomiesView data={data} />;
    case 'roles': return <RolesView />;
    case 'paquetes': return <PackagesView />;
    case 'segmentation': return <SegmentationView />;
    case 'tagging': return <TaggingView />;
    case 'discrepancias': return <DiscrepanciasView />;
    case 'validacion': return <ValidacionView />;
    case 'reporte': return <ReporteView />;
    case 'kappa': return <KappaView />;
    default: return <PlaceholderView name={view} />;
  }
}
