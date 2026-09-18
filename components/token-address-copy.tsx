'use client';
import { useEffect, useState } from 'react';

export function TokenAddressCopy({ mint, symbol }: { mint: string; symbol: string }) {
  const [status, setStatus] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle');
  useEffect(() => {
    if (status !== 'copied' && status !== 'error') return;
    const timer = setTimeout(() => setStatus('idle'), status === 'copied' ? 2000 : 4000);
    return () => clearTimeout(timer);
  }, [status]);

  async function copy() {
    setStatus('copying');
    try {
      await navigator.clipboard.writeText(mint);
      setStatus('copied');
    } catch {
      setStatus('error');
    }
  }

  return <span className="token-address-control">
    <button type="button" className="token-address-copy" title={mint} aria-label={`Copy ${symbol} token address`} disabled={status === 'copying'} data-copied={status === 'copied'} onClick={copy}>
      <span>{mint.slice(0, 4)}....{mint.slice(-4)}</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {status === 'copied' ? <path d="m5 12 4 4L19 6" /> : <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>}
      </svg>
    </button>
    <span className="token-copy-feedback" role="status">{status === 'copied' ? 'Copied' : status === 'error' ? 'Copy failed. Try again.' : ''}</span>
  </span>;
}
