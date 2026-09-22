'use server';

/**
 * Read-only server actions for drill-downs that load on demand, so the
 * list views stay cheap and only fetch detail when a modal opens.
 */

import {
  getFragmentBreakdown, getQualSample, getTeamDiscrepantFragments,
  type DiscrepantFragment, type QualSampleFragment,
} from '@/lib/queries';

export async function loadTeamDiscrepancies(teamId: string): Promise<DiscrepantFragment[]> {
  return getTeamDiscrepantFragments(teamId);
}

export async function loadFragmentBreakdown(teamId: string, fragmentId: string) {
  return getFragmentBreakdown(teamId, fragmentId);
}

export async function loadQualSample(teamId: string): Promise<QualSampleFragment[]> {
  return getQualSample(teamId);
}
