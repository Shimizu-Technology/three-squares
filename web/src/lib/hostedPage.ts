interface HostedState {
  flow: string | null;
  payment_state: string;
  environment: string;
  collection_config: { hosted_url?: string };
}

// The backend validates this URL. Check the legacy host again before navigation.
export function hostedPageUrl(state: HostedState): string | null {
  if (state.flow !== 'worldpay_hosted_page' || state.payment_state !== 'collecting') return null;
  try {
    const url = new URL(state.collection_config.hosted_url || '');
    const host = state.environment === 'production' ? 'transaction.hostedpayments.com' : state.environment === 'sandbox' ? 'certtransaction.hostedpayments.com' : null;
    const keys = [...url.searchParams.keys()];
    if (!host || url.protocol !== 'https:' || url.host !== host || url.username || url.password || url.hash || url.pathname !== '/' ||
        keys.length !== 1 || keys[0] !== 'TransactionSetupID' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(url.searchParams.get(keys[0]) || '')) return null;
    return url.href;
  } catch { return null; }
}
