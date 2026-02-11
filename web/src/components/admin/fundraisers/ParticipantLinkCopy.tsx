import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface ParticipantLinkCopyProps {
  fundraiserSlug: string;
  participantNumber?: string | null;
  className?: string;
  buttonSize?: 'sm' | 'md';
}

export default function ParticipantLinkCopy({
  fundraiserSlug,
  participantNumber,
  className = '',
  buttonSize = 'sm',
}: ParticipantLinkCopyProps) {
  const [copied, setCopied] = useState(false);

  const getShareableUrl = () => {
    const baseUrl = window.location.origin;
    const url = `${baseUrl}/fundraisers/${fundraiserSlug}`;
    return participantNumber ? `${url}?p=${participantNumber}` : url;
  };

  const handleCopy = async () => {
    const url = getShareableUrl();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = url;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const sizeClasses = buttonSize === 'sm' 
    ? 'p-1.5 text-xs' 
    : 'p-2 text-sm';

  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1 rounded transition ${
        copied 
          ? 'text-green-600 bg-green-50' 
          : 'text-gray-500 hover:text-tsPrimary hover:bg-gray-100'
      } ${sizeClasses} ${className}`}
      title={copied ? 'Copied!' : 'Copy shareable link'}
    >
      {copied ? (
        <>
          <Check className="w-4 h-4" />
          <span>Copied!</span>
        </>
      ) : (
        <>
          <Copy className="w-4 h-4" />
          <span>Copy Link</span>
        </>
      )}
    </button>
  );
}
