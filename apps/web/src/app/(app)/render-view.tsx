import { forbidden } from '@/components/views/Forbidden';
import { getSessionContext } from '@/lib/session';
import { getDb } from '@/db/client';
import { projects } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { canReadForRoles, canWriteForRoles } from '@/lib/permissions';
import { previewBaseUrl } from '@/lib/preview';
import { REQUIRES_PROJECT } from '@/lib/views';
import {
  getDashboard, getDimensionCatalog, getFragmentSample, getKappaData, getMirrorComparison,
  getPackages, getPreviewTargets, getProjectDimensions, getProjectMembers, getProjectSettings,
  getQualValidationTeams, getReportData,
  getScales, getSegmentationConfigs, getTaggingData, getTaggingDataForPackage,
  getTaxonomyCatalog, getTeamValidations, getTeams, getUploads,
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
import { TaggingPreviewView } from '@/components/views/TaggingPreviewView';
import { DiscrepanciasView } from '@/components/views/DiscrepanciasView';
import { ProjectSettingsView } from '@/components/views/ProjectSettingsView';
import { TeamDiscrepanciesView } from '@/components/views/TeamDiscrepanciesView';
import { GraphDepsView } from '@/components/views/GraphDepsView';
import { QuantValidationView } from '@/components/views/QuantValidationView';
import { ValidacionView } from '@/components/views/ValidacionView';
import { ReporteView } from '@/components/views/ReporteView';
import { KappaView } from '@/components/views/KappaView';
import { ProjectGate } from '@/components/views/ProjectGate';

export type ViewSearchParams = {
  view?: string; team?: string; fragment?: string; pkg?: string; tab?: string;
  /** Who is being watched on the preview of the tagging screen. */
  user?: string;
  /** '1' when the preview navigates only through discrepant fragments. */
  discrep?: string;
};

/**
 * `?fragment=` may carry a 1-based position ("5") or a mentionable ID
 * ("ABC-456#2"). Numbers keep the old behaviour exactly; anything else is
 * resolved inside the query against the package on screen.
 */
function parseFragmentParam(raw: string | undefined): {
  fragmentIndex?: number;
  fragmentLookup?: string;
} {
  if (typeof raw !== 'string' || !raw.length) return {};
  if (/^\d+$/.test(raw)) {
    const n = Number(raw) - 1;
    return Number.isFinite(n) ? { fragmentIndex: n } : {};
  }
  return { fragmentLookup: raw };
}

/**
 * Load a view's data and render it.
 *
 * Both the root route and the named routes (`/dimensiones`, `/etiquetar`, …)
 * funnel through here, so a screen behaves identically whichever URL the
 * user arrived by.
 */
export async function renderView(view: string, searchParams: ViewSearchParams = {}) {
  const db = getDb();
  const { user, role, roles, activeProject, projects: allProjects } = await getSessionContext();

  // Pick a project before anything project-scoped can be judged: the role
  // itself only exists relative to a project.
  if (REQUIRES_PROJECT.has(view) && !activeProject) {
    return <ProjectGate projects={allProjects} view={view} />;
  }

  if (!canReadForRoles(view, roles)) return forbidden(view, role);

  const projectId = activeProject?.id ?? '';
  const readOnly = !canWriteForRoles(view, roles);

  switch (view) {
    case 'dashboard': {
      const data = await getDashboard();
      return (
        <DashboardView
          data={data}
          currentUserIsSuperAdmin={user?.isSuperAdmin ?? false}
        />
      );
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
      return (
        <RolesView
          projectId={projectId}
          members={members}
          teams={teams}
          currentUserIsSuperAdmin={user?.isSuperAdmin ?? false}
        />
      );
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
      const { fragmentIndex, fragmentLookup } = parseFragmentParam(searchParams.fragment);
      const data = await getTaggingData(projectId, user?.id ?? '', fragmentIndex, fragmentLookup);
      // Keyed by fragment: moving to another fragment only changes a search
      // param, so without this React keeps the same component instance and
      // its answers state — one fragment's labels would show up, and save,
      // on the next one.
      return (
        <TaggingView key={data.fragment?.id ?? 'sin-fragmento'}
                     projectId={projectId} data={data} userName={user?.name ?? user?.email ?? ''} />
      );
    }

    case 'tagging-preview': {
      // The annotator's screen seen by an admin: the same fragments, the
      // same answers, the same navigation rules — computed for the person
      // being watched, and without a single write.
      const targets = await getPreviewTargets(projectId);
      const target = targets.find((t) => t.userId === searchParams.user) ?? null;
      // The package comes from the URL when that person has it; otherwise
      // their first one.
      const packageId = target
        ? (target.packages.find((p) => p.id === searchParams.pkg)?.id
            ?? target.packages[0]?.id
            ?? null)
        : null;
      const discrepOnly = searchParams.discrep === '1';

      if (!target || !packageId) {
        return (
          <TaggingPreviewView
            projectId={projectId}
            targets={targets}
            userId={null}
            packageId={null}
            data={null}
            navBase={previewBaseUrl({ userId: null, discrepOnly })}
            discrepOnly={discrepOnly}
          />
        );
      }

      const { fragmentIndex, fragmentLookup } = parseFragmentParam(searchParams.fragment);
      const data = await getTaggingDataForPackage(projectId, packageId, target.userId, {
        fragmentIndex, fragmentLookup,
      });

      return (
        <TaggingPreviewView
          key={`${target.userId}|${packageId}|${discrepOnly ? 'd' : 'n'}`}
          projectId={projectId}
          targets={targets}
          userId={target.userId}
          packageId={packageId}
          data={data}
          navBase={previewBaseUrl({
            userId: target.userId, packageId, discrepOnly,
          })}
          discrepOnly={discrepOnly}
        />
      );
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
          projectId={projectId}
          dimensions={dimensions}
          sampleFragment={tagging.fragment ?? sample[0] ?? null}
          sampleAnswers={tagging.answers}
          // Ordering drives the annotation form too, so it follows the
          // project-configuration permission, not this screen's.
          canReorder={canWriteForRoles('dimensions', roles)}
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

    case 'project-settings': {
      const settings = await getProjectSettings(projectId);
      if (!settings) {
        return (
          <div className="page">
            <h1>Ajustes del proyecto</h1>
            <p className="lead">El proyecto activo no existe o no tienes acceso a él.</p>
          </div>
        );
      }
      // The matrix gates superadmin+projectadmin as write; everyone else
      // gets read-only access (readOnly from canWriteForRoles above).
      return <ProjectSettingsView settings={settings} canEdit={!readOnly} />;
    }

    default: {
      const data = await getDashboard();
      return (
        <DashboardView
          data={data}
          currentUserIsSuperAdmin={user?.isSuperAdmin ?? false}
        />
      );
    }
  }
}
