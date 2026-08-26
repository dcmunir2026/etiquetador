import { z } from 'zod';

export const AddProjectTaxonomyInput = z.object({
  projectId: z.string().min(1),
  taxonomyId: z.string().min(1),
});

export const RemoveProjectTaxonomyInput = z.object({
  projectId: z.string().min(1),
  taxonomyId: z.string().min(1),
});

export const SetProjectTaxonomiesInput = z.object({
  projectId: z.string().min(1),
  taxonomyIds: z.array(z.string().min(1)).max(50),
});
