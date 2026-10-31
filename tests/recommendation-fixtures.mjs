// Post-migration fixtures must explicitly establish publication and pointer
// facts. Production paths never infer them from invitation/candidate state.
export async function recommendationFixture(db, observationId, { released = false, generationId = null, publishedAt = new Date() } = {}) {
  const list = await db.recommendationList.create({ data: { observationId, generationId, publishedAt: released ? publishedAt : null } });
  await db.observation.update({ where: { observationId }, data: released
    ? { currentReleasedListId: list.listId, recommendationsReleasedAt: publishedAt }
    : { currentDraftListId: list.listId } });
  return list;
}
