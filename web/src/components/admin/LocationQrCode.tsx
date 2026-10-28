import { NavigationLink } from '../ui/NavigationLink';
import { Disclosure } from '../ui/Disclosure';
import { Button } from '../ui/Button';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import toast from 'react-hot-toast';
import { authPost } from '../../services/authApi';

type QrCode = { menu_url: string; svg: string };
type Action = 'View menu' | 'Copy URL' | 'Print QR' | 'Download SVG';

export default function LocationQrCode({ id, name, slug }: { id: number; name: string; slug: string }) {
  const { getToken } = useAuth();
  const [qr, setQr] = useState<QrCode | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pending = useRef<AbortController | null>(null);
  const focusAfterBusy = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (busy !== null || !focusAfterBusy.current) return;
    const trigger = focusAfterBusy.current;
    focusAfterBusy.current = null;
    if (trigger.isConnected) { window.focus(); trigger.focus(); }
  }, [busy]);
  const closeEmptyPopup = useRef<(() => void) | null>(null);

  useEffect(() => () => {
    const controller = pending.current;
    pending.current = null;
    controller?.abort();
    closeEmptyPopup.current?.();
  }, []);

  const run = async (action: Action, trigger: HTMLButtonElement) => {
    if (pending.current) return;
    setError('');
    setNotice('');
    // Reserve the window in the click event, before authentication or network work.
    let popup: Window | null = null;
    const restoreFocus = () => {
      if (trigger.disabled) focusAfterBusy.current = trigger;
      else if (trigger.isConnected) { window.focus(); trigger.focus(); }
    };
    const closeEmpty = () => {
      try {
        if (popup && !popup.closed && popup.location.href === 'about:blank' && !popup.document.body.childNodes.length) popup.close();
      } catch { /* A navigated window is no longer ours to close. */ }
    };
    if (action === 'Print QR' || action === 'View menu') {
      try {
        popup = window.open('', '_blank', 'width=650,height=800');
        if (popup) popup.opener = null;
      } catch { closeEmpty(); popup = null; }
      if (!popup) {
        setError(`Allow pop-ups, then try ${action} again for ${name}.`);
        restoreFocus();
        return;
      }
    }
    const controller = new AbortController();
    pending.current = controller;
    closeEmptyPopup.current = closeEmpty;
    setBusy(action);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let image: HTMLImageElement | undefined;
    const checkActive = () => {
      if (controller.signal.aborted) throw new Error('Cancelled');
      if (popup && (popup.closed || popup.location.href !== 'about:blank' || popup.document.body.childNodes.length)) throw new Error('Menu window changed');
    };
    try {
      const resolveQr = async () => {
        const data = qr || (await authPost<{ data: QrCode }>(`/admin/locations/${id}/generate_qr`, {}, getToken, { timeout: 20000, signal: controller.signal })).data.data;
        checkActive();
        // Use only the configured URL returned by the server; never infer an origin.
        if (!data || typeof data.menu_url !== 'string' || !/^https?:\/\//i.test(data.menu_url) || typeof data.svg !== 'string' || !data.svg.trim()) throw new Error('Invalid menu response');
        new URL(data.menu_url);
        setQr(data);
        return data;
      };
      const work = async () => {
        if (action === 'Copy URL') {
          if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
            // Safari requires clipboard.write inside the original user gesture.
            const content = resolveQr().then(data => new Blob([data.menu_url], { type: 'text/plain' }));
            // Some browsers reject permission before consuming the promised content.
            void content.catch(() => {});
            await navigator.clipboard.write([new ClipboardItem({ 'text/plain': content })]);
          } else {
            const data = await resolveQr();
            if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
            await navigator.clipboard.writeText(data.menu_url);
          }
          checkActive();
          setNotice(`Menu URL copied for ${name}.`);
          toast.success('Menu URL copied');
          return;
        }
        const data = await resolveQr();
        if (action === 'View menu') {
          popup!.location.replace(data.menu_url);
        } else if (action === 'Download SVG') {
          const url = URL.createObjectURL(new Blob([data.svg], { type: 'image/svg+xml' }));
          const link = document.createElement('a');
          link.href = url;
          link.download = `location-${slug}-qr.svg`;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } else {
          const sheet = popup!.document;
          sheet.title = `${name} menu QR code`;
          const heading = sheet.createElement('h1'); heading.textContent = name;
          heading.style.overflowWrap = 'anywhere';
          const caption = sheet.createElement('p'); caption.textContent = 'Scan to view this location’s menu';
          const url = sheet.createElement('p'); url.textContent = data.menu_url; url.style.overflowWrap = 'anywhere';
          image = sheet.createElement('img');
          image.alt = `${name} menu QR code`; image.style.width = 'min(100%, 420px)';
          sheet.body.style.cssText = 'font-family: sans-serif; text-align: center; padding: 24px;';
          // Load before filling: a failed or timed-out request leaves only an owned empty window.
          await new Promise<void>((resolve, reject) => {
            image!.onload = () => resolve();
            image!.onerror = () => reject(new Error('QR image failed'));
            image!.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(data.svg)}`;
          });
          checkActive();
          sheet.body.append(heading, caption, image, url);
          popup!.addEventListener('afterprint', restoreFocus, { once: true });
          popup!.focus();
          popup!.print();
        }
      };
      await Promise.race([
        work(),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () => reject(new Error('Cancelled or timed out')), { once: true });
          timer = setTimeout(() => controller.abort(), 20000);
        }),
      ]);
    } catch {
      closeEmpty();
      if (pending.current === controller) {
        setError(action === 'Copy URL'
          ? 'Could not copy the menu URL. Try Copy URL again, or copy the saved link below. Check the saved slug and storefront configuration if no link appears.'
          : `Could not ${action.toLowerCase()} for ${name}. Check the saved slug and storefront configuration, then try again.`);
        restoreFocus();
      }
    } finally {
      if (timer) clearTimeout(timer);
      if (image) { image.onload = null; image.onerror = null; }
      controller.abort();
      if (pending.current === controller) {
        pending.current = null;
        closeEmptyPopup.current = null;
        setBusy(null);
      }
    }
  };

  return <div className="space-y-3" aria-busy={busy !== null}>
    <div className="flex flex-wrap gap-2">
      {(['View menu', 'Copy URL', 'Print QR'] as const).map(action => <Button variant="secondary" key={action} type="button"
        aria-label={`${action} for ${name}`} disabled={busy !== null}
        onClick={event => void run(action, event.currentTarget)}>{action}</Button>)}
    </div>
    <p role="status" className="text-sm text-gray-600 break-words">{busy ? `${busy}: preparing saved menu…` : notice || 'Menu actions use saved location details.'}</p>
    {error && <p role="alert" className="text-sm text-red-700 break-words">{error}</p>}
    {qr && <Disclosure open={error ? true : undefined} title={<>Saved menu URL and QR</>}>

      <div className="space-y-3 pt-2">
        <NavigationLink context="admin" href={qr.menu_url} target="_blank" rel="noopener noreferrer" >{qr.menu_url}</NavigationLink>
        <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr.svg)}`} alt={`${name} menu QR code`} className="w-48 max-w-full bg-white border border-gray-200" />
        <Button variant="secondary" type="button" aria-label={`Download SVG for ${name}`} disabled={busy !== null}
          onClick={event => void run('Download SVG', event.currentTarget)}>Download SVG</Button>
      </div>
    </Disclosure>}
  </div>;
}
