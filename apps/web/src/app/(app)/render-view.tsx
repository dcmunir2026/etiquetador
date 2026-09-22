import { forbidden } from '@/components/views/Forbidden';
import { getSessionContext } from '@/lib/session';
import { getDb } from '@/db/client';
import { projects } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { canRead, canWrite } from '@/lib/permissions';
import { REQUIRES_PROJECT } from '@/lib/views';
import {
  getDashboard, getDimensionCatalog, getFragmentSample, getKappaData, getMirrorComparison,
  getPackages, getProjectDimensions, getProjectMembers, getQualValidationTeams, getReportData,
  getScales, getSegmentationConfigs, getTaggingData, getTaxonomyCatalog, getTeamValidations,
  getTeams, getUploads,
} from '@/lib/queries';

import { DashboardView } from '@/components/views/DashboardView';
import { UploadView } from '@/components/views/UploadView';
import { DimensionsView } from '@/components/views/DimensionsView';
import { TaxonomyGroupsView } from '@/components/views/TaxonomyGroupsView';
import { ProjectTaxonomiesView } from '@/components/views/ProjectTaxonomiesView';
import { RolesView } from '@/components/views/RolesView';
import { PackagesView } from '@/components/views/PackagesView';
import { SegmentationView } from '@/components/views/SegmentationView';
import { TaggingView } from '@/components/views/TaggingView';
import { DiscrepanciasView } from '@/components/views/DiscrepanciasView';
import { TeamDiscrepanciesView } from '@/components/views/TeamDiscrepanciesView';
import { GraphDepsView } from '@/components/views/GraphDepsView';
import { QuantValidationView } from '@/components/views/QuantValidationView';
import { ValidacionView } from '@/components/views/ValidacionView';
import { ReporteView } from '@/components/views/ReporteView';
import { KappaView } from '@/components/views/KappaView';
import { ProjectGate } from '@/components/views/ProjectGate';

export type ViewSearchParams = {
  view?: string; team?: string; fragment?: string; pkg?: string; tab?: string;
};

/**
 * Load a view's data and render it.
 *
 * Both the root route and the named routes (`/dimensiones`, `/etiquetar`, …)
 * funnel through here, so a screen behaves identically whichever URL the
 * user arrived by.
 */
export async function renderView(view: string, searchParams: ViewSearchParams = {}) {
  const db = getDb();
  const { user, role, activeProject, projects: allProjects } = await getSessionContext();

  // Pick a project before anything project-scoped can be judged: the role
  // itself only exists relative to a project.
  if (REQUIRES_PROJECT.has(view) && !activeProject) {
    return <ProjectGate projects={allProjects} view={view} />;
  }

  if (!canRead(view, role)) return forbidden(view, role);

  const projectId = activeProject?.id ?? '';
  const readOnly = !canWrite(view, role);

  switch (view) {
    case 'dashboard': {
      const data = await getDashboard();
      return <DashboardView data={data} />;
    }

    case 'upload': {
      const [uploads, configs] = await Promise.all([
        getUploads(projectId),
        getSegmentationConfigs(projectId),
      ]);
      return <UploadView projectId={projectId} uploads={uploads} configs={configs} />;
    }

    case 'taxonomies': {
      const [dimensions, scales] = await Promise.all([getDimensionCatalog(), getScales()]);
      return <DimensionsView dimensions={dimensions} scales={scales} readOnly={readOnly} />;
    }

    case 'taxonomy-groups': {
      const [taxonomies, dimensions] = await Promise.all([getTaxonomyCatalog(), getDimensionCatalog()]);
      return <TaxonomyGroupsView taxonomies={taxonomies} dimensions={dimensions} projects={allProjects} readOnly={readOnly} />;
    }

    case 'dimensions': {
      const [taxonomies, dimensions] = await Promise.all([getTaxonomyCatalog(), getDimensionCatalog()]);
      return (
        <ProjectTaxonomiesView
          projectId={projectId}
          projectName={activeProject!.name}
          taxonomies={taxonomies}
          dimensions={dimensions}
          readOnly={readOnly}
        />
      );
    }

    case 'roles': {
      const [members, teams] = await Promise.all([getProjectMembers(projectId), getTeams(projectId)]);
      return <RolesView projectId={projectId} members={members} teams={teams} />;
    }

    case 'paquetes': {
      const [pkgs, teams, fragments, dash] = await Promise.all([
        getPackages(projectId), getTeams(projectId), getFragmentSample(projectId, 1), getDashboard(),
      ]);
      const project = dash.projects.find((p) => p.id === projectId);
      return (
        <PackagesView
          projectId={projectId}
          packages={pkgs}
          teams={teams}
          fragmentTotal={project?.fragmentCount ?? fragments.length}
        />
      );
    }

    case 'segmentation': {
      const [configs, sample] = await Promise.all([
        getSegmentationConfigs(projectId), getFragmentSample(projectId, 1),
      ]);
      return (
        <SegmentationView
          projectId={projectId}
          configs={configs}
          sampleText={sample[0]?.sourceText ?? sample[0]?.text ?? ''}
        />
      );
    }

    case 'tagging': {
      const idx = searchParams.fragment ? Number(searchParams.fragment) - 1 : undefined;
      const data = await getTaggingData(projectId, user?.id ?? '', Number.isFinite(idx) ? idx : undefined);
      return <TaggingView projectId={projectId} data={data} userName={user?.name ?? user?.email ?? ''} />;
    }

    case 'discrepancias': {
      const [comparison, pkgs] = await Promise.all([
        getMirrorComparison(projectId, searchParams.pkg), getPackages(projectId),
      ]);
      return <DiscrepanciasView comparison={comparison} packages={pkgs} selected={searchParams.pkg ?? null} />;
    }

    case 'discrepancias-equipos': {
      const validations = await getTeamValidations(projectId);
      return <TeamDiscrepanciesView teams={validations} />;
    }

    case 'graph-deps': {
      const [sample, tagging] = await Promise.all([
        getFragmentSample(projectId, 1),
        getTaggingData(projectId, user?.id ?? ''),
      ]);
      const dimensions = await getProjectDimensions(projectId);
      return (
        <GraphDepsView
          dimensions={dimensions}
          sampleFragment={tagging.fragment ?? sample[0] ?? null}
          sampleAnswers={tagging.answers}
        />
      );
    }

    case 'quant-validation': {
      const validations = await getTeamValidations(projectId);
      return <QuantValidationView teams={validations} readOnly={readOnly} />;
    }

    case 'validacion': {
      const teams = await getQualValidationTeams(projectId);
      return <ValidacionView projectId={projectId} teams={teams} readOnly={readOnly} />;
    }

    case 'reporte': {
      const [report, project] = await Promise.all([
        getReportData(projectId),
        db.select().from(projects).where(eq(projects.id, projectId)).limit(1),
      ]);
      return <ReporteView report={report} projectName={project[0]?.name ?? ''} />;
    }

    case 'kappa': {
      const kappa = await getKappaData(projectId);
      return <KappaView data={kappa} />;
    }

    default: {
      const data = await getDashboard();
      return <DashboardView data={data} />;
    }
  }
}
