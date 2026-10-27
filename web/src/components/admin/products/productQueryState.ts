export interface ProductQueryState {
  q: string;
  published: 'all' | 'true' | 'false' | 'archived' | 'attention' | 'pickup_locations';
  batch?: string;
  type: string;
  sort: 'name' | 'price' | 'stock' | 'created';
  dir: 'asc' | 'desc';
  page: number;
}

const keys = ['q', 'published', 'type', 'sort', 'dir', 'page', 'batch'];
const hasControl = (value: string) => [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
const text = (value: string | null, max: number) => value && value.length <= max && !hasControl(value) ? value : '';

export function parseProductQuery(search: string): ProductQueryState {
  const params = new URLSearchParams(search);
  const page = params.get('page') || '';
  const batch = params.get('batch') || '';
  const batchValid = params.getAll('batch').length === 1 && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(batch);
  return {
    q: text(params.get('q'), 500),
    ...(params.has('batch') ? { batch: batchValid ? batch : 'invalid' } : {}),
    published: ['true', 'false', 'archived', 'attention', 'pickup_locations'].includes(params.get('published') || '')
      ? params.get('published') as ProductQueryState['published'] : 'all',
    type: text(params.get('type'), 200) || 'all',
    sort: ['price', 'stock', 'created'].includes(params.get('sort') || '')
      ? params.get('sort') as ProductQueryState['sort'] : 'name',
    dir: params.get('dir') === 'desc' ? 'desc' : 'asc',
    page: /^[1-9]\d*$/.test(page) && Number.isSafeInteger(Number(page)) ? Number(page) : 1,
  };
}

export function productListPath(state: ProductQueryState): string {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.published !== 'all') params.set('published', state.published);
  if (state.type !== 'all') params.set('type', state.type);
  if (state.sort !== 'name') params.set('sort', state.sort);
  if (state.dir !== 'asc') params.set('dir', state.dir);
  if (state.batch) params.set('batch', state.batch);
  if (state.page !== 1) params.set('page', String(state.page));
  return '/admin/products' + (params.size ? `?${params}` : '');
}

// Never resolve returnTo against a base URL: only this exact local route is allowed.
export function safeProductReturnTo(value: unknown): string {
  if (typeof value !== 'string' || !/^\/admin\/products(?:\?[^#]*)?$/.test(value) || (value.includes('\\') || hasControl(value))) return '/admin/products';
  const search = value.slice('/admin/products'.length);
  const params = new URLSearchParams(search);
  if ([...params.keys()].some(key => !keys.includes(key) || (key !== 'batch' && params.getAll(key).length !== 1))) return '/admin/products';
  const canonical = productListPath(parseProductQuery(search));
  // Invalid values are not trusted, even when accompanied by valid filters.
  const normalized = new URLSearchParams(canonical.split('?')[1]);
  for (const [key, val] of params) {
    if (key === 'batch' && normalized.get('batch') === 'invalid') continue;
    const defaults: Record<string, string> = { q: '', published: 'all', type: 'all', sort: 'name', dir: 'asc', page: '1', batch: '' };
    if ((normalized.get(key) ?? defaults[key]) !== val) return '/admin/products';
  }
  return canonical;
}

export function clampProductPage(page: number, count: number, perPage = 25): number {
  return Math.min(page, Math.max(1, Math.ceil(count / perPage)));
}

export function productScrollKey(userId: string, entryKey: string, path: string): string {
  return `three-squares:product-scroll:${encodeURIComponent(userId)}:${encodeURIComponent(entryKey)}:${path}`;
}

export function readProductScroll(key: string): number | null {
  try {
    const raw = sessionStorage.getItem(key);
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : null;
  } catch { return null; }
}

export function writeProductScroll(key: string, y: number): void {
  try { sessionStorage.setItem(key, String(Math.max(0, y))); } catch { /* Browsing still works without storage. */ }
}

export interface ProductListReturn {
  path: string;
  entryKey: string;
  index: number;
}

export function readProductListReturn(value: unknown, path: string): ProductListReturn | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<ProductListReturn>;
  return record.path === path && typeof record.entryKey === 'string' && record.entryKey.length <= 100
    && typeof record.index === 'number' && Number.isSafeInteger(record.index) && record.index >= 0 ? record as ProductListReturn : null;
}
