import AdminPageHeader from '../../components/admin/AdminPageHeader';
import { FileButton } from '../../components/ui/FileButton';
import { Button } from '../../components/ui/Button';
import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useStaffAccess } from '../../components/admin/StaffAccess.tsx';
import { readProductListReturn, safeProductReturnTo } from '../../components/admin/products/productQueryState';
import {
  CSV_TEMPLATE, createMenuImportReceipt, isMenuImportReceiptPersisted,
  isMenuImportResult, readMenuImportReceipt, saveMenuImportReceipt,
  type MenuImportReceipt,
} from '../../components/admin/import/menuImportReceipt';
import { authPost, type GetTokenFn } from '../../services/authApi';
import AdminShopifyMigration from './AdminShopifyMigration';

const templateUrl = `data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}`;

export default function AdminImportPage() {
  const { userId, getToken } = useAuth();
  const access = useStaffAccess();
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const returnTo = safeProductReturnTo(params.get('returnTo'));
  const listReturn = readProductListReturn(location.state?.productListReturn, returnTo);
  const returnToProducts = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (listReturn && window.history.state?.idx === listReturn.index + 1) navigate(-1);
    else navigate(returnTo, { replace: true, state: listReturn ? { productScrollEntry: listReturn.entryKey } : null });
  };
  const canImport = access.can('catalog.import');
  const canMigrate = canImport && access.can('stock.manage');

  if (access.loading) return <p role="status" className="p-6">Checking import access…</p>;
  if (params.get('format') === 'shopify') {
    if (!canMigrate) return <section role="alert" className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <h1 className="text-2xl font-bold text-gray-900">Shopify migration requires shared-stock permission</h1>
      <p className="text-gray-700">Shopify migration can change shared inventory. Ask an owner or a manager with shared-stock permission to run it.</p>
      <Button to="/admin/import" variant="link">Go to Menu CSV</Button>
    </section>;
    return <AdminShopifyMigration key={userId} />;
  }
  if (!canImport || !userId) return <section role="alert" className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
    <h1 className="text-2xl font-bold text-gray-900">Menu import isn’t available for your access</h1>
    <p>Ask an owner or manager if you need to import menu items.</p>
  </section>;

  // Remount on identity change so files, errors and receipts never cross accounts.
  return <MenuCsvImport key={userId} userId={userId} getToken={getToken} returnTo={returnTo} onReturn={returnToProducts} canMigrate={canMigrate} />;
}

function MenuCsvImport({ userId, getToken, returnTo, onReturn, canMigrate }: {
  userId: string; getToken: GetTokenFn; returnTo: string; onReturn: (event: MouseEvent<HTMLAnchorElement>) => void; canMigrate: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [completed, setCompleted] = useState(() => {
    const receipt = readMenuImportReceipt(userId);
    return { receipt, persisted: receipt ? isMenuImportReceiptPersisted(userId, receipt.id) : true };
  });
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultFocus, setResultFocus] = useState(0);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => { if (resultFocus) resultHeading.current?.focus(); }, [resultFocus]);

  function showError(message: string) {
    setError(message);
    // Repeated validation errors still need focus when the text is unchanged.
    errorRef.current?.focus();
  }

  async function importFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    if (!file) { showError('Choose a Menu CSV file to import.'); return; }
    if (!file.name.toLowerCase().endsWith('.csv')) { showError('Choose a file with a .csv extension.'); return; }
    if (!file.size || file.size > 2 * 1024 * 1024) { showError('Choose a nonempty CSV file that is 2 MB or smaller.'); return; }
    inFlight.current = true;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await authPost<{ data: unknown }>(
        '/admin/products/import_csv', formData,
        async () => {
          const token = await getToken();
          // The token wait may finish after a navigation, sign-out or account change.
          if (!mounted.current) throw new Error('Import page changed before upload.');
          return token;
        },
        { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 },
      );
      if (!isMenuImportResult(response.data?.data)) throw new Error('Unconfirmed import response');
      const receipt = createMenuImportReceipt(file.name, response.data.data);
      // Completed old-account work can be kept for that account after unmount.
      const persisted = saveMenuImportReceipt(userId, receipt);
      if (!mounted.current) return;
      setCompleted({ receipt, persisted });
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      setResultFocus(value => value + 1);
    } catch (failure: unknown) {
      if (!mounted.current) return;
      const response = (failure as { response?: { status?: number; data?: { error?: unknown } } })?.response;
      const rejected = response?.status !== undefined && [400, 401, 403, 413, 422].includes(response.status);
      const detail = typeof response?.data?.error === 'string' ? response.data.error : '';
      showError(rejected
        ? `Import was rejected.${detail ? ` ${detail}` : ' Check the file and your import permission before trying again.'}`
        : 'Import result not confirmed. Check Products before retrying: some rows may already have been created. Your selected file and previous completed results are still here.');
    } finally {
      inFlight.current = false;
      if (mounted.current) setUploading(false);
    }
  }

  return <div className="space-y-6 [overflow-wrap:anywhere]">
    <Button variant="ghost" to={returnTo} onClick={onReturn}>Back to Products</Button>
    <AdminPageHeader title="Import menu items" subtitle="Add menu items from a Menu CSV, then review the created items and finish any drafts." />

    <section aria-labelledby="csv-format-heading" className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
      <h2 id="csv-format-heading" className="text-xl font-semibold text-gray-900">Prepare your Menu CSV</h2>
      <p className="text-gray-700">Use a UTF-8 CSV with a header row. Maximum 2 MB and 2,000 menu item rows.</p>
      <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="font-semibold text-gray-900">Required columns</dt><dd><code>name</code>, <code>price</code> (for example, 11.50)</dd>
        <dt className="font-semibold text-gray-900">Optional columns</dt><dd><code>description</code>, <code>category_name</code>, <code>active</code>, <code>locations</code></dd>
        <dt className="font-semibold text-gray-900">Pickup locations</dt><dd>Use existing location names or slugs. Separate multiple locations with <code>;</code> or <code>|</code>.</dd>
        <dt className="font-semibold text-gray-900">Availability</dt><dd>With pickup locations, <code>true</code> or blank <code>active</code> publishes the item; <code>false</code> keeps a draft. Items without pickup locations stay unpublished, including rows with <code>active=false</code>. Add locations in the editor before publishing.</dd>
      </dl>
      <Button href={templateUrl} download="products-import-template.csv" variant="link">Download Menu CSV template</Button>
      <p className="text-sm text-gray-700">The template leaves locations blank. Fill them in to make items available for pickup, or leave them blank to create drafts.</p>
    </section>

    <form onSubmit={importFile} aria-busy={uploading} className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
      <div className="space-y-2">
        <FileButton ref={inputRef} id="menu-csv-file" name="file" accept=".csv,text/csv" disabled={uploading}
          aria-describedby="menu-csv-help" onChange={event => { setFile(event.target.files?.[0] ?? null); setError(null); }}>Choose Menu CSV file</FileButton>
        <p id="menu-csv-help" className="text-sm text-gray-700">Choose one CSV file, up to 2 MB. Correct and re-upload only skipped rows after a partial import.</p>
        {file && <p className="text-sm text-gray-700">Selected: {file.name}</p>}
      </div>
      {error && <div ref={errorRef} tabIndex={-1} role="alert" className="space-y-2 rounded-lg border border-red-300 bg-red-50 p-4 text-red-900">
        <p>{error}</p><Button to="/admin/products" variant="link">Check Products</Button>
      </div>}
      <Button variant="primary" type="submit" disabled={uploading || !file}>
        {uploading ? 'Importing menu items…' : 'Import Menu CSV'}
      </Button>
      {uploading && <p role="status" className="text-sm text-gray-700">Waiting for the import result. Keep this page open until it is confirmed.</p>}
    </form>

    {completed.receipt && <MenuImportResults receipt={completed.receipt} persisted={completed.persisted} headingRef={resultHeading} previous={uploading || !!error} />}

    <aside className="space-y-2 border-t border-gray-200 pt-4 text-sm text-gray-700">
      <p>Completed results: This tab only, for your account. The five most recent imports are kept when tab storage is available. Closing this tab or switching devices does not preserve them. An interrupted upload cannot be recovered from a receipt unless its result was confirmed.</p>
      {canMigrate && <Button to="/admin/import?format=shopify" variant="link">Shopify migration</Button>}
    </aside>
  </div>;
}

function MenuImportResults({ receipt, persisted, headingRef, previous }: {
  receipt: MenuImportReceipt; persisted: boolean; headingRef: React.RefObject<HTMLHeadingElement | null>; previous: boolean;
}) {
  const { result } = receipt;
  const batchPath = `/admin/products?batch=${receipt.id}`;
  const needsLocations = result.created.filter(item => item.needs_pickup_locations).length;
  return <section aria-labelledby="menu-import-result-heading" className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
    <h2 ref={headingRef} tabIndex={-1} id="menu-import-result-heading" className="text-xl font-semibold text-gray-900">{previous ? 'Previous completed import' : 'Completed import results'}</h2>
    <p className="text-sm text-gray-700">{receipt.filename} · {new Date(receipt.createdAt).toLocaleString()} · This tab</p>
    {!persisted && <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950">Tab storage is unavailable for this receipt. Results are kept only while this app remains open; a reload may lose them. Review the created items now.</p>}
    <p className="font-medium text-gray-900">{result.imported} created · {result.skipped} skipped · {result.total} total rows</p>
    {result.imported > 0 && <div className="flex flex-wrap gap-2">
      <Button to={batchPath} variant="link">Review this batch ({result.imported})</Button>
      {needsLocations > 0 && <Button to={`${batchPath}&published=pickup_locations`} variant="link">Needs pickup locations ({needsLocations})</Button>}
    </div>}
    {result.created.length > 0 && <div className="space-y-2">
      <h3 className="font-semibold text-gray-900">Created items</h3>
      <ul className="divide-y divide-gray-200">
        {result.created.map(item => <li key={item.product_id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="font-medium text-gray-900">Row {item.row}: {item.name}</p>
            <p className="text-sm text-gray-700">{item.needs_pickup_locations ? 'Unpublished draft — add pickup locations before publishing.' : item.published ? 'Published' : 'Unpublished draft'}</p>
          </div>
          <Button to={`/admin/products/${item.product_id}/edit?returnTo=${encodeURIComponent(batchPath)}`} variant="link" aria-label={`Edit ${item.name}, row ${item.row}`}>Edit item</Button>
        </li>)}
      </ul>
    </div>}
    {result.errors.length > 0 && <div className="space-y-2">
      <h3 className="font-semibold text-red-900">Skipped rows — correct and re-upload</h3>
      <p className="text-sm text-gray-700">No item was created for these rows. Copy only these rows into a new CSV with the header, correct the errors, and upload it. Keep successful rows out of the retry file.</p>
      <ul className="space-y-2">{result.errors.map(item => <li key={item.row} className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
        <p className="font-semibold">Row {item.row}{item.name ? `: ${item.name}` : ''}</p><p>{item.error}</p>
      </li>)}</ul>
    </div>}
    {result.notices.length > 0 && <div className="space-y-2">
      <h3 className="font-semibold text-gray-900">Import notes</h3>
      <ul className="space-y-2 text-sm text-gray-700">{result.notices.map((notice, index) => <li key={`${notice.row}-${index}`}>Row {notice.row}{notice.name ? `: ${notice.name}` : ''} — {notice.message}</li>)}</ul>
    </div>}
  </section>;
}
