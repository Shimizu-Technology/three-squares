import AdminPageHeader from '../../components/admin/AdminPageHeader';
import { Field } from '../../components/ui/Field';
import { Disclosure } from '../../components/ui/Disclosure';
import { CheckField } from '../../components/ui/CheckField';
import { Select } from '../../components/ui/Select';
import { Textarea } from '../../components/ui/Textarea';
import { Input } from '../../components/ui/Input';
import { Eye, Trash2 } from 'lucide-react';
import { IconButton } from '../../components/ui/IconButton';
import { ChoiceGroup } from '../../components/ui/ChoiceGroup';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Button } from '../../components/ui/Button';
import axios from 'axios';
import { useRef, useState, useEffect, useCallback, type FormEvent } from 'react';
import { useAuth } from '@clerk/clerk-react';
import toast from 'react-hot-toast';
import { formatGuamDate, fromGuamDateInput, toGuamDateInput } from '../../utils/collectionSchedule';
import type { CollectionSchedule, CollectionType } from '../../utils/collectionSchedule';
import Dialog from '../../components/ui/Dialog';
import AdminRequestState from '../../components/admin/AdminRequestState';
import MenuItemsEditor from '../../components/admin/menus/MenuItemsEditor';
import { menuProductPrice, type MenuProduct } from '../../components/admin/menus/menuItems';
import { authDelete, authGet, authPatch, authPost } from '../../services/authApi';

interface Collection extends CollectionSchedule {
  id: number; name: string; slug: string; description: string | null; published: boolean;
  featured: boolean; sort_order: number; product_count: number; products?: MenuProduct[];
}
const newForm = () => ({ name: '', description: '', published: true, featured: false, sort_order: 0,
  collection_type: 'standard' as CollectionType, starts_at: '', ends_at: '', auto_hide: true, banner_text: '' });
const errorMessage = (error: unknown, fallback: string) => {
  const data = axios.isAxiosError(error) ? error.response?.data : null;
  return Array.isArray(data?.errors) ? data.errors.join('. ') : data?.error || data?.message || (error instanceof Error && !axios.isAxiosError(error) ? error.message : fallback);
};
function previewDate(value: string) {
  if (!value) return '';
  try { return formatGuamDate(fromGuamDateInput(value) || ''); }
  catch { return 'Enter a valid Guam date and time in Menu & schedule.'; }
}
type EditorSection = 'schedule' | 'items' | 'preview';

export default function AdminCollectionsPage() {
  const { getToken } = useAuth();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true), [hasLoaded, setHasLoaded] = useState(false), [loadError, setLoadError] = useState(false);
  const requestId = useRef(0), openRequest = useRef(0), active = useRef(false), openingRef = useRef(false);
  const [selected, setSelected] = useState<Collection | null>(null);
  const [editorOpen, setEditorOpen] = useState(false), [deleteTarget, setDeleteTarget] = useState<Collection | null>(null);
  const [saving, setSaving] = useState(false), [deleting, setDeleting] = useState(false), [opening, setOpening] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [openError, setOpenError] = useState<{ collection: Collection | null; section: EditorSection; message: string } | null>(null);
  const [form, setForm] = useState(newForm), [section, setSection] = useState<EditorSection>('schedule');
  const [products, setProducts] = useState<MenuProduct[]>([]), [ids, setIds] = useState<number[]>([]);
  const editorOpener = useRef<HTMLElement | null>(null), nameRef = useRef<HTMLInputElement>(null), errorRef = useRef<HTMLParagraphElement>(null);
  const saveRef = useRef(false), deleteRef = useRef(false);
  const editorBodyRef = useRef<HTMLDivElement>(null);

  const fetchCollections = useCallback(async () => {
    if (!active.current) return;
    const id = ++requestId.current; setLoading(true);
    try {
      const response = await authGet<{ data: Collection[] }>('/admin/collections', getToken, { timeout: 20000 });
      if (id !== requestId.current) return;
      setCollections(response.data.data); setHasLoaded(true); setLoadError(false);
    } catch { if (id === requestId.current) setLoadError(true); }
    finally { if (id === requestId.current) setLoading(false); }
  }, [getToken]);
  useEffect(() => {
    active.current = true; void fetchCollections();
    return () => { active.current = false; requestId.current++; openRequest.current++; };
  }, [fetchCollections]);
  useEffect(() => { if (formError) errorRef.current?.focus(); }, [formError, saving]);
  useEffect(() => { editorBodyRef.current?.scrollTo({ top: 0 }); }, [section, editorOpen]);

  const openEditor = async (collection: Collection | null, target: EditorSection, opener?: HTMLElement) => {
    if (openingRef.current || saveRef.current || deleteRef.current) return;
    openingRef.current = true; setOpening(true); setOpenError(null);
    if (opener) editorOpener.current = opener;
    const id = ++openRequest.current;
    try {
      const [catalog, detail] = await Promise.all([
        authGet<{ data: MenuProduct[] }>('/admin/products', getToken, { params: { show_archived: true }, timeout: 20000 }),
        collection ? authGet<{ data: Collection }>(`/admin/collections/${collection.id}`, getToken, { timeout: 20000 }) : Promise.resolve(null),
      ]);
      if (!active.current || id !== openRequest.current) return;
      const current = detail?.data.data || null;
      // Include existing archived members even if a future catalog endpoint filters them.
      const all = new Map([...catalog.data.data, ...(current?.products || [])].map(product => [product.id, product]));
      setProducts([...all.values()]); setSelected(current);
      setIds(current?.products?.map(product => product.id) || []);
      setForm(current ? { name: current.name, description: current.description || '', published: current.published,
        featured: current.featured, sort_order: current.sort_order ?? 0, collection_type: current.collection_type || 'standard',
        starts_at: toGuamDateInput(current.starts_at), ends_at: toGuamDateInput(current.ends_at), auto_hide: current.auto_hide ?? true, banner_text: current.banner_text || '' } : newForm());
      setFormError(null); setSection(target); setEditorOpen(true);
    } catch (error) { if (active.current && id === openRequest.current) setOpenError({ collection, section: target, message: errorMessage(error, 'Could not open this menu. Your saved menu has not changed.') }); }
    finally { if (id === openRequest.current) { openingRef.current = false; setOpening(false); } }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saveRef.current) return;
    if (!form.name.trim()) { setSection('schedule'); setFormError('Menu name is required.'); return; }
    saveRef.current = true; setSaving(true); setFormError(null);
    try {
      const payload = { collection: { ...form, product_ids: ids,
        starts_at: fromGuamDateInput(form.starts_at, selected?.starts_at), ends_at: fromGuamDateInput(form.ends_at, selected?.ends_at) } };
      if (selected) await authPatch(`/admin/collections/${selected.id}`, payload, getToken, { timeout: 20000 });
      else await authPost('/admin/collections', payload, getToken, { timeout: 20000 });
      if (!active.current) return;
      setEditorOpen(false); toast.success('Menu and items saved'); void fetchCollections();
    } catch (error) { if (active.current) setFormError(errorMessage(error, 'Save not confirmed. Your changes are still here. Check menus before retrying.')); }
    finally { saveRef.current = false; if (active.current) setSaving(false); }
  };
  const deleteMenu = async () => {
    if (!deleteTarget || deleteRef.current) return;
    deleteRef.current = true; setDeleting(true);
    try {
      await authDelete(`/admin/collections/${deleteTarget.id}`, getToken, { timeout: 20000 });
      if (active.current) { setDeleteTarget(null); toast.success('Menu deleted; items kept in Products'); void fetchCollections(); }
    } catch (error) { toast.error(errorMessage(error, 'Could not delete this menu. Try again.')); }
    finally { deleteRef.current = false; if (active.current) setDeleting(false); }
  };
  const busy = opening || saving || deleting;
  const byId = new Map(products.map(product => [product.id, product]));

  return <div className="space-y-6">
    <AdminPageHeader title="Menus & specials" subtitle="Manage menu items and their Guam schedules together." actions={<>
      <Button type="button" onClick={() => void fetchCollections()} disabled={loading || busy} variant="secondary">Refresh menus</Button>
      <Button type="button" disabled={busy} onClick={event => void openEditor(null, 'schedule', event.currentTarget)} variant="primary">Add menu</Button>
    </>} />
    <AdminRequestState resource="Menus" loading={loading} error={loadError} hasData={hasLoaded} onRetry={fetchCollections} />
    {opening && <p role="status" className="text-gray-700">Loading saved menu and item choices…</p>}
    {openError && <div role="alert" className="space-y-2 rounded-lg border border-red-300 bg-red-50 p-4 text-red-900"><p>{openError.message}</p><Button type="button" onClick={() => void openEditor(openError.collection, openError.section)} variant="secondary">Retry opening menu</Button></div>}
    {hasLoaded && collections.length === 0 && !loading && !loadError && <p className="rounded-xl border border-gray-200 bg-white p-6 text-gray-700">No menus yet. Add a menu, choose its items and set a schedule.</p>}
    <div className="grid gap-4 xl:grid-cols-2">{collections.map(menu => <article key={menu.id} aria-label={menu.name} className="flex min-w-0 flex-col gap-4 rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="min-w-0 break-words text-xl font-semibold text-gray-900">{menu.name}</h2>
        <StatusBadge tone={menu.published ? 'neutral' : 'inactive'}>{!menu.published ? 'Draft' : menu.availability_status === 'upcoming' ? 'Scheduled' : menu.availability_status === 'ended' ? 'Ended' : 'Published'}{menu.featured && ' · Featured'}</StatusBadge></div>
      <p className="line-clamp-2 h-10 break-words text-sm leading-5 text-gray-700">{menu.description}</p>
      <p className="text-sm text-gray-700">{menu.product_count} items<br />{menu.starts_at ? `Starts ${formatGuamDate(menu.starts_at)}` : 'No start limit'}<br />{menu.ends_at ? `Ends ${formatGuamDate(menu.ends_at)}` : 'No end limit'}</p>
      <div className="mt-auto flex items-center gap-2" data-menu-actions>
        <Button type="button" disabled={busy} onClick={event => void openEditor(menu, 'items', event.currentTarget)} variant="primary" aria-label={`Manage items for ${menu.name}`}>Manage</Button>
        <Button type="button" disabled={busy} onClick={event => void openEditor(menu, 'schedule', event.currentTarget)} variant="secondary" aria-label={`Edit schedule for ${menu.name}`}>Schedule</Button>
        <IconButton disabled={busy} onClick={event => void openEditor(menu, 'preview', event.currentTarget)} aria-label={`Staff preview for ${menu.name}`} title="Staff preview"><Eye /></IconButton>
        <IconButton disabled={busy} onClick={() => setDeleteTarget(menu)} aria-label={`Delete ${menu.name}`} title="Delete menu"><Trash2 /></IconButton>
      </div>
    </article>)}</div>

    <Dialog open={editorOpen} onOpenChange={setEditorOpen} dismissible={!saving} labelledBy="menu-editor-title" returnFocusRef={editorOpener} initialFocusRef={nameRef} className="w-full rounded-xl sm:w-3xl">
      <form onSubmit={save} className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <header className="shrink-0 space-y-3 border-b border-gray-200 p-4 sm:p-6"><h2 id="menu-editor-title" className="break-words text-2xl font-bold text-gray-900">{selected ? `Edit ${selected.name}` : 'Create menu'}</h2>
          <ChoiceGroup label="Menu editor sections" value={section} disabled={saving} onChange={setSection}
            choices={[{value:'schedule',label:'Menu & schedule'},{value:'items',label:'Menu items'},{value:'preview',label:'Staff preview'}]} />
        </header>
        <div ref={editorBodyRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-6">
          {formError && <p ref={errorRef} tabIndex={-1} role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-900">{formError}</p>}
          <fieldset disabled={saving} className="min-w-0 space-y-4">
            <div hidden={section !== 'schedule'} className="space-y-4">
              <Field label="Menu name"><Input ref={nameRef} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></Field>
              <Field label="Description"><Textarea rows={2} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></Field>
              <Field label="Menu type"><Select aria-label="Menu type" value={form.collection_type} onChange={event => setForm({ ...form, collection_type: event.target.value as CollectionType })}><option value="standard">Standard</option><option value="seasonal">Seasonal</option><option value="event">Special occasion</option><option value="limited_time">Limited time</option></Select></Field>
              <p className="text-sm text-gray-700">All dates use Guam time (UTC+10). Leave a date blank for no limit. Unchanged saved timestamps retain their precision.</p>
              <div className="grid gap-4 sm:grid-cols-2"><Field label="Starts at (Guam)"><Input type="datetime-local" value={form.starts_at} onChange={event => setForm({ ...form, starts_at: event.target.value })} /></Field>
                <Field label="Ends at (Guam)"><Input type="datetime-local" value={form.ends_at} onChange={event => setForm({ ...form, ends_at: event.target.value })} /></Field></div>
              <CheckField type="checkbox" checked={form.published} onChange={event => setForm({ ...form, published: event.target.checked })}>Published during its schedule</CheckField>
              <CheckField type="checkbox" checked={form.auto_hide} onChange={event => setForm({ ...form, auto_hide: event.target.checked })}>Hide menu after it ends</CheckField>
              <p className="text-sm text-gray-700">Upcoming menus stay hidden. Turning off auto-hide keeps an ended page visible; ordering still closes. Items shared with another available menu can remain orderable.</p>
              <Field label="Customer notice (optional)"><Textarea rows={2} maxLength={200} value={form.banner_text} onChange={event => setForm({ ...form, banner_text: event.target.value })} /></Field>
              <Disclosure title={<>Menu placement</>}><Field label="Sort order — lower appears first"><Input type="number" value={form.sort_order} onChange={event => setForm({ ...form, sort_order: Number(event.target.value) || 0 })} /></Field><CheckField type="checkbox" checked={form.featured} onChange={event => setForm({ ...form, featured: event.target.checked })}>Featured menu</CheckField></Disclosure>
            </div>
            <div hidden={section !== 'items'}><MenuItemsEditor products={products} selectedIds={ids} onChange={setIds} disabled={saving} /></div>
            <section hidden={section !== 'preview'} aria-labelledby="menu-preview-title" className="space-y-4">
              <h3 id="menu-preview-title" className="text-xl font-semibold text-gray-900">Staff preview — unsaved editor content</h3>
              <p className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-gray-800">This preview does not open ordering or publish the menu. Customers still follow the saved schedule, item publication and location availability.</p>
              <h4 className="break-words text-xl font-semibold text-gray-900">{form.name || 'Untitled menu'}</h4><p className="whitespace-pre-wrap break-words text-gray-700">{form.description}</p>
              <p className="text-sm text-gray-700">{form.starts_at ? `Starts ${previewDate(form.starts_at)}` : 'No start limit'}<br />{form.ends_at ? `Ends ${previewDate(form.ends_at)}` : 'No end limit'}</p>
              {form.banner_text && <p className="break-words rounded-lg border border-gray-200 p-3 text-gray-800">{form.banner_text}</p>}
              <ol className="space-y-3">{ids.map(id => { const product = byId.get(id); return <li key={id} className="break-words rounded-lg border border-gray-200 p-3 text-gray-900">{product?.name || `Unavailable item ${id}`}<span className="block text-sm text-gray-700">{product ? menuProductPrice(product) : ''}{product?.archived ? ' · Archived — unavailable' : !product?.published ? ' · Unpublished — unavailable' : ''}</span></li>; })}</ol>
              {ids.length === 0 && <p className="text-gray-700">No menu items selected.</p>}
            </section>
          </fieldset>
        </div>
        <footer className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-gray-200 p-4 sm:p-6"><Button type="button" disabled={saving} onClick={() => setEditorOpen(false)} variant="secondary">Cancel</Button><Button type="submit" loading={saving} variant="primary">Save menu & items</Button></footer>
      </form>
    </Dialog>
    <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }} dismissible={!deleting} labelledBy="delete-menu-title" className="w-full rounded-xl p-6 sm:w-lg">
      <h2 id="delete-menu-title" className="text-xl font-semibold text-gray-900">Delete {deleteTarget?.name}?</h2><p className="my-4 text-gray-700">Items stay in Products and other menus. This menu and its schedule will be removed.</p><div className="flex flex-wrap justify-end gap-3"><Button type="button" disabled={deleting} onClick={() => setDeleteTarget(null)} variant="secondary">Cancel</Button><Button type="button" loading={deleting} onClick={() => void deleteMenu()} variant="destructive">Delete menu</Button></div>
    </Dialog>
  </div>;
}
