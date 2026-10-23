import { fetchUsers, UsersApiError, type ListedUser, type ListPage, type PageInfo, type UserFilters } from "./users-api";

export type UsersListState = {
  key: string;
  status: "loading" | "ready" | "error";
  items: ListedUser[];
  pageInfo: PageInfo;
  error: UsersApiError | null;
  loadingMore: boolean;
};
export const initialUsersState: UsersListState = {
  key: "", status: "loading", items: [], pageInfo: { nextCursor: null, hasMore: false }, error: null, loadingMore: false,
};
export function userFiltersKey(filters: UserFilters) {
  return JSON.stringify([filters.q.trim(), filters.roleId, filters.accountStatus.trim()]);
}

/** Own request ordering independently of React so cancellation and pagination are testable. */
export function createUsersListLoader(
  publish: (state: UsersListState) => void,
  request: (filters: UserFilters, cursor: string | null, signal: AbortSignal) => Promise<ListPage<ListedUser>> = fetchUsers,
) {
  let state = initialUsersState;
  let filters: UserFilters;
  let sequence = 0;
  let controller: AbortController | undefined;
  const cursors = new Set<string>();
  const update = (next: UsersListState) => { state = next; publish(next); };
  const cancel = () => { sequence++; controller?.abort(); };

  async function load(nextFilters: UserFilters, more = false) {
    if (more && (state.status !== "ready" || state.loadingMore || !state.pageInfo.hasMore || state.key !== userFiltersKey(nextFilters))) return;
    cancel();
    const current = sequence;
    controller = new AbortController();
    filters = { ...nextFilters };
    const cursor = more ? state.pageInfo.nextCursor : null;
    if (!more) cursors.clear();
    update(more ? { ...state, loadingMore: true, error: null }
      : { ...initialUsersState, key: userFiltersKey(filters) });
    try {
      const page = await request(filters, cursor, controller.signal);
      if (current !== sequence) return;
      if (page.pageInfo.hasMore && (page.pageInfo.nextCursor === cursor || cursors.has(page.pageInfo.nextCursor!))) {
        throw new UsersApiError("malformed", "The service returned a repeated page cursor. Please try again.");
      }
      if (cursor) cursors.add(cursor);
      const items = new Map((more ? state.items : []).map(item => [item.id, item]));
      for (const item of page.items) items.set(item.id, item);
      update({ ...state, status: "ready", items: [...items.values()], pageInfo: page.pageInfo, error: null, loadingMore: false });
    } catch (error) {
      if (current !== sequence) return;
      const failure = error instanceof UsersApiError ? error : new UsersApiError("network", "Unable to load users. Please try again.");
      const retainRows = more && failure.kind !== "unauthorized" && failure.kind !== "forbidden";
      update({ ...state, status: retainRows ? "ready" : "error", items: retainRows ? state.items : [], error: failure, loadingMore: false });
    }
  }

  return { load: (filters: UserFilters) => load(filters), loadMore: (filters: UserFilters) => load(filters, true), cancel };
}
