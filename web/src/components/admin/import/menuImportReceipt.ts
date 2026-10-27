export interface CreatedMenuProduct {
  row: number;
  product_id: number;
  name: string;
  published: boolean;
  needs_pickup_locations: boolean;
}

export interface MenuImportResult {
  imported: number;
  skipped: number;
  total: number;
  created: CreatedMenuProduct[];
  errors: { row: number; name?: string | null; error: string }[];
  notices: { row: number; product_id: number; name?: string | null; message: string }[];
}

export interface MenuImportReceipt {
  version: 1;
  id: string;
  filename: string;
  createdAt: string;
  result: MenuImportResult;
}

export const CSV_TEMPLATE = 'name,price,description,category_name,active,locations\nChicken Adobo,11.50,Chicken with steamed rice,Lunch,true,\n';

const MAX_RECENT = 5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const memory = new Map<string, { receipts: MenuImportReceipt[]; unsaved: boolean }>();
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 2000;
const positiveId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const rowNumber = (value: unknown): value is number => positiveId(value) && value >= 2 && value <= 2001;
const content = (value: unknown): value is string => typeof value === 'string' && value.length <= 100_000;
const optionalName = (value: unknown) => value === undefined || value === null || content(value);
const validUser = (userId: string) => typeof userId === 'string' && userId.length > 0 && userId.length <= 1000;
const storageKey = (userId: string) => `three-squares:menu-import:v1:${encodeURIComponent(userId)}`;
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

// Validate both server responses and tab storage. Never infer successful rows or IDs.
export function isMenuImportResult(value: unknown): value is MenuImportResult {
  if (!isRecord(value) || !count(value.imported) || !count(value.skipped) || !count(value.total)
    || value.total < 1 || value.imported + value.skipped !== value.total
    || !Array.isArray(value.created) || value.created.length !== value.imported
    || !Array.isArray(value.errors) || value.errors.length !== value.skipped
    || !Array.isArray(value.notices) || value.notices.length > 2000) return false;
  const rows = new Set<number>();
  const products = new Map<number, CreatedMenuProduct>();
  for (const item of value.created) {
    if (!isRecord(item) || !rowNumber(item.row) || item.row > value.total + 1 || rows.has(item.row)
      || !positiveId(item.product_id) || products.has(item.product_id) || !content(item.name)
      || typeof item.published !== 'boolean' || typeof item.needs_pickup_locations !== 'boolean'
      || (item.needs_pickup_locations && item.published)) return false;
    rows.add(item.row);
    products.set(item.product_id, item as unknown as CreatedMenuProduct);
  }
  for (const item of value.errors) {
    if (!isRecord(item) || !rowNumber(item.row) || item.row > value.total + 1 || rows.has(item.row)
      || !optionalName(item.name) || !content(item.error) || !item.error.trim() || 'product_id' in item) return false;
    rows.add(item.row);
  }
  for (const item of value.notices) {
    if (!isRecord(item) || !positiveId(item.product_id) || !optionalName(item.name)
      || !content(item.message) || !item.message.trim() || products.get(item.product_id)?.row !== item.row) return false;
  }
  return true;
}

function isReceipt(value: unknown): value is MenuImportReceipt {
  return isRecord(value) && value.version === 1 && typeof value.id === 'string' && UUID.test(value.id)
    && typeof value.filename === 'string' && value.filename.length > 0 && value.filename.length <= 1000
    && typeof value.createdAt === 'string' && Number.isFinite(Date.parse(value.createdAt))
    && isMenuImportResult(value.result);
}

function decodeReceipts(raw: string, userId: string): MenuImportReceipt[] {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return []; }
  if (!isRecord(value) || value.version !== 1 || value.userId !== userId || !Array.isArray(value.receipts)
    || value.receipts.length > MAX_RECENT || !value.receipts.every(isReceipt)
    || new Set(value.receipts.map(receipt => receipt.id)).size !== value.receipts.length) return [];
  return value.receipts;
}

function recentReceipts(userId: string): MenuImportReceipt[] {
  if (!validUser(userId)) return [];
  const cached = memory.get(userId);
  // A failed write must not hide the newer completed result behind older storage.
  if (cached?.unsaved) return cached.receipts;
  try {
    const raw = sessionStorage.getItem(storageKey(userId));
    const receipts = raw === null ? [] : decodeReceipts(raw, userId);
    memory.set(userId, { receipts, unsaved: false });
    return receipts;
  } catch {
    return cached?.receipts ?? [];
  }
}

export function createMenuImportReceipt(filename: string, result: MenuImportResult): MenuImportReceipt {
  const receipt: MenuImportReceipt = { version: 1, id: crypto.randomUUID(), filename, createdAt: new Date().toISOString(), result };
  if (!isReceipt(receipt)) throw new Error('Import result could not be confirmed.');
  return copy(receipt);
}

export function saveMenuImportReceipt(userId: string, receipt: MenuImportReceipt): boolean {
  if (!validUser(userId) || !isReceipt(receipt)) return false;
  const receipts = copy([receipt, ...recentReceipts(userId).filter(item => item.id !== receipt.id)].slice(0, MAX_RECENT));
  memory.set(userId, { receipts, unsaved: true });
  try {
    sessionStorage.setItem(storageKey(userId), JSON.stringify({ version: 1, userId, receipts }));
    memory.set(userId, { receipts, unsaved: false });
    return true;
  } catch { return false; }
}

export function readMenuImportReceipt(userId: string, id?: string): MenuImportReceipt | null {
  if (id !== undefined && !UUID.test(id)) return null;
  const receipts = recentReceipts(userId);
  const receipt = id === undefined ? receipts[0] : receipts.find(item => item.id === id);
  return receipt ? copy(receipt) : null;
}

// Reading a memory fallback does not mean the receipt will survive a reload.
export function isMenuImportReceiptPersisted(userId: string, id: string): boolean {
  if (!validUser(userId) || !UUID.test(id)) return false;
  try {
    const raw = sessionStorage.getItem(storageKey(userId));
    return raw !== null && decodeReceipts(raw, userId).some(receipt => receipt.id === id);
  } catch { return false; }
}
