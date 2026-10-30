import type { Prisma } from "../generated/prisma/client";
import { FacultyActionError } from "./services/faculty-errors";

/** Pointer equality and a real publication are required, never a legacy timestamp
 * alone. The composite FKs guarantee that list and observation ownership agree. */
export const currentReleasedCandidates = {
  recommendationList: { publishedAt: { not: null }, releasedFor: { isNot: null } },
} satisfies Prisma.ObservationCandidateWhereInput;

// Shared by existing pg readers/writers, with their established candidate/o aliases.
export const currentReleasedCandidateSql = `candidate.recommendation_list_id = o.current_released_list_id
  AND EXISTS (SELECT 1 FROM public.recommendation_list released
    WHERE released.list_id = o.current_released_list_id AND released.observation_id = o.observation_id
      AND released.published_at IS NOT NULL)`;

export function requireCurrentReleasedCandidate(
  record: { currentReleasedListId: string | null; currentReleasedList: { publishedAt: Date | null } | null },
  candidate: { recommendationListId: string },
) {
  if (!record.currentReleasedListId || !record.currentReleasedList?.publishedAt
    || candidate.recommendationListId !== record.currentReleasedListId) {
    throw new FacultyActionError("This candidate is not in the current released recommendation list.");
  }
}
