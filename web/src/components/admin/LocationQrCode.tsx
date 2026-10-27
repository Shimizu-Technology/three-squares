import { useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import toast from 'react-hot-toast';
import { authPost } from '../../services/authApi';

type QrCode = { menu_url: string; svg: string };

export default function LocationQrCode({ id, name, slug }: { id: number; name: string; slug: string }) {
  const { getToken } = useAuth();
  const [qr, setQr] = useState<QrCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const imageUrl = qr ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr.svg)}` : '';

  const generate = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await authPost<{ data: QrCode }>(`/admin/locations/${id}/generate_qr`, {}, getToken);
      setQr(response.data.data);
    } catch {
      setError('Could not generate this QR code. Check the saved slug and public storefront origin, then try again.');
    } finally { setBusy(false); }
  };

  const download = () => {
    if (!qr) return;
    const url = URL.createObjectURL(new Blob([qr.svg], { type: 'image/svg+xml' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `location-${slug}-qr.svg`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const print = () => {
    if (!qr) return;
    const popup = window.open('', '_blank', 'width=650,height=800');
    if (!popup) { toast.error('Allow pop-ups to open the printable QR code.'); return; }
    popup.opener = null;
    popup.document.title = `${name} menu QR code`;
    const heading = popup.document.createElement('h1'); heading.textContent = name;
    const caption = popup.document.createElement('p'); caption.textContent = 'Scan to view this location’s menu';
    const image = popup.document.createElement('img');
    image.alt = `${name} menu QR code`; image.style.width = 'min(100%, 420px)';
    const url = popup.document.createElement('p'); url.textContent = qr.menu_url;
    popup.document.body.style.cssText = 'font-family: sans-serif; text-align: center; padding: 24px;';
    popup.document.body.append(heading, caption, image, url);
    image.onload = () => { popup.focus(); popup.print(); };
    image.src = imageUrl;
  };

  return <div className="border-t border-gray-100 pt-4 space-y-3">
    <p className="text-sm font-semibold text-gray-800">Location menu QR code</p>
    <p className="text-sm text-gray-500">Uses saved location details and the configured public storefront.</p>
    <button type="button" disabled={busy} onClick={() => void generate()} className="border border-gray-300 rounded-lg px-4 py-2 text-sm disabled:opacity-50">{busy ? 'Generating…' : qr ? 'Regenerate QR code' : 'Generate QR code'}</button>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {qr && <div className="space-y-3">
      <img src={imageUrl} alt={`${name} menu QR code`} className="w-48 h-48 bg-white border border-gray-200" />
      <a href={qr.menu_url} target="_blank" rel="noopener noreferrer" className="block text-sm text-tsPrimary underline break-all">{qr.menu_url}</a>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={download} className="border border-gray-300 rounded-lg px-4 py-2 text-sm">Download SVG</button>
        <button type="button" onClick={print} className="border border-gray-300 rounded-lg px-4 py-2 text-sm">Print QR code</button>
      </div>
    </div>}
  </div>;
}
