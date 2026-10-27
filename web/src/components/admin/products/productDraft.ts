export interface ProductFormData {
  name: string;
  description: string;
  product_type: string;
  vendor: string;
  base_price_cents: number;
  weight_oz: number;
  published: boolean;
  featured: boolean;
  meta_title: string;
  meta_description: string;
  inventory_level: 'none' | 'product' | 'variant';
  product_stock_quantity?: number;
  product_low_stock_threshold?: number;
  allow_pickup: boolean;
  allow_shipping: boolean;
  location_ids: number[];
  collection_ids: number[];
  needs_attention?: boolean;
  import_notes?: string;
}


export interface ProductDraft {
  version: 1;
  userId: string;
  productId: string;
  data: ProductFormData;
}

// Fallback keeps SPA navigation recoverable even when browser storage is denied.
const memoryDrafts = new Map<string, ProductDraft | null>();
const strings = ['name', 'description', 'product_type', 'vendor', 'meta_title', 'meta_description'] as const;
const numbers = ['base_price_cents', 'weight_oz'] as const;
const booleans = ['published', 'featured', 'allow_pickup', 'allow_shipping'] as const;

export const productDraftKey = (userId: string, productId: string) =>
  `three-squares:product-draft:v1:${encodeURIComponent(userId)}:${encodeURIComponent(productId)}`;

export function parseProductDraft(raw: string, userId: string, productId: string): ProductDraft | null {
  try {
    const draft = JSON.parse(raw);
    if (!userId || draft?.version !== 1 || draft.userId !== userId || draft.productId !== productId) return null;
    const data = draft.data;
    if (!data || typeof data !== 'object') return null;
    for (const key of strings) if (typeof data[key] !== 'string') return null;
    for (const key of numbers) if (typeof data[key] !== 'number' || !Number.isFinite(data[key])) return null;
    for (const key of booleans) if (typeof data[key] !== 'boolean') return null;
    if (!['none', 'product', 'variant'].includes(data.inventory_level)) return null;
    for (const key of ['location_ids', 'collection_ids']) {
      if (!Array.isArray(data[key]) || !data[key].every((id: unknown) => typeof id === 'number' && Number.isSafeInteger(id) && id > 0)) return null;
    }
    for (const key of ['product_stock_quantity', 'product_low_stock_threshold']) {
      if (data[key] !== undefined && (typeof data[key] !== 'number' || !Number.isFinite(data[key]))) return null;
    }
    if (data.needs_attention !== undefined && typeof data.needs_attention !== 'boolean') return null;
    if (data.import_notes !== undefined && typeof data.import_notes !== 'string') return null;
    // Copy only main-form fields. Images/variants and arbitrary payload keys never enter recovery.
    const clean: Record<string, unknown> = {};
    for (const key of [...strings, ...numbers, ...booleans, 'inventory_level', 'location_ids', 'collection_ids',
      'product_stock_quantity', 'product_low_stock_threshold', 'needs_attention', 'import_notes']) {
      if (data[key] !== undefined) clean[key] = data[key];
    }
    return { version: 1, userId, productId, data: clean as unknown as ProductFormData };
  } catch { return null; }
}

export function readProductDraft(userId: string, productId: string): ProductDraft | null {
  if (!userId) return null;
  const key = productDraftKey(userId, productId);
  if (memoryDrafts.has(key)) return memoryDrafts.get(key) ?? null;
  try { return parseProductDraft(sessionStorage.getItem(key) || '', userId, productId); } catch { return null; }
}

export function writeProductDraft(userId: string, productId: string, data: ProductFormData): boolean {
  if (!userId) return false;
  const key = productDraftKey(userId, productId);
  const raw = JSON.stringify({ version: 1, userId, productId, data });
  const draft = parseProductDraft(raw, userId, productId);
  if (!draft) return false;
  memoryDrafts.set(key, draft);
  try { sessionStorage.setItem(key, JSON.stringify(draft)); return true; } catch { return false; }
}

export function discardProductDraft(userId: string, productId: string): void {
  const key = productDraftKey(userId, productId);
  memoryDrafts.set(key, null);
  try { sessionStorage.removeItem(key); } catch {
    try { sessionStorage.setItem(key, 'null'); } catch { /* In-memory tombstone still prevents SPA duplication. */ }
  }
}
