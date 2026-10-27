import { useEffect } from 'react';

let lockCount = 0;
let restoreScroll: (() => void) | undefined;

export default function useLockBodyScroll(locked: boolean) {
  useEffect(() => {
    if (!locked) return;

    lockCount += 1;
    if (lockCount === 1) {
      const html = document.documentElement;
      const originalOverflow = document.body.style.overflow;
      const originalHtmlOverflow = html.style.overflow;
      const originalPaddingRight = document.body.style.paddingRight;
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

      html.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }

      restoreScroll = () => {
        html.style.overflow = originalHtmlOverflow;
        document.body.style.overflow = originalOverflow;
        document.body.style.paddingRight = originalPaddingRight;
      };
    }

    return () => {
      lockCount -= 1;
      if (lockCount === 0) {
        restoreScroll?.();
        restoreScroll = undefined;
      }
    };
  }, [locked]);
}
