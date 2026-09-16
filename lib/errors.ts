export function friendlyError(detail: string): string {
  if (/Tessera.*(API|product|unavailable)/i.test(detail)) return 'Tessera product data is temporarily unavailable. Future Markets trading is disabled. Please refresh shortly.';
  if (/unknown|incomplete success/i.test(detail)) return 'Execution outcome is uncertain. Check execution before placing another trade.';
  if (/reject|declin|denied|cancelled by user/i.test(detail)) return 'Wallet rejected transaction. You can retry when ready.';
  if (/insufficient.*SOL|not enough.*SOL/i.test(detail)) return 'Not enough SOL to pay network fees or create token accounts.';
  if (/insufficient.*USDC|not enough.*USDC/i.test(detail)) return 'Not enough USDC for this trade.';
  if (/expir/i.test(detail)) return 'Quote expired — request a new quote.';
  if (/no.*route|executable route|no output/i.test(detail)) return 'No Jupiter route is currently available. Try again shortly.';
  if (/disconnect|wallet.*changed|original wallet/i.test(detail)) return 'Reconnect the original wallet to continue.';
  if (/fetch|network|timeout|temporarily|API|market data/i.test(detail)) return 'Market or network service temporarily unavailable. Please try again.';
  if (/execution failed|transaction failed/i.test(detail)) return 'Transaction failed on Solana. Review your balances before retrying.';
  return 'This request could not be completed. Review the details and try again.';
}
export function safeErrorDetail(detail: string): string {
  return detail.replace(/https?:\/\/\S+/g, '[service URL]').replace(/[A-Za-z0-9+/=]{160,}/g, '[transaction data]').slice(0, 1000);
}
