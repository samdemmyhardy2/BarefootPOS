export const PAGE_SIZE = 10;

export interface PageResult<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function pageQuery(page: number, filters: Record<string, string | undefined> = {}) {
  const query = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  Object.entries(filters).forEach(([key, value]) => { if (value) query.set(key, value); });
  return query.toString();
}
