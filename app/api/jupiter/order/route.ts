import { getTessera } from '@/lib/tessera/client';
import { isSupportedAsset } from '@/lib/assets';
import { apiError, getStocks, JupiterError } from '@/lib/jupiter/client';
import { swapRequest } from '@/lib/jupiter/swap';
import { normalizeOrder, validateOrderParams } from '@/lib/jupiter/swap-validation';
import { USDC_MINT } from '@/lib/amounts';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  let params: ReturnType<typeof validateOrderParams>;
  try { params = validateOrderParams(new URL(request.url).searchParams); }
  catch (error) { return Response.json({ error: (error as Error).message }, { status: 400, headers: { 'Cache-Control': 'no-store' } }); }
  try {
    const stockMint = params.inputMint === USDC_MINT ? params.outputMint : params.outputMint === USDC_MINT ? params.inputMint : null;
    let allowed = false;
    if (stockMint) {
      try { allowed = (await getStocks()).stocks.some(stock => stock.mint === stockMint && isSupportedAsset(stock)); } catch { /* Try the independent Tessera source. */ }
      if (!allowed) {
        try { const registry = await getTessera(); allowed = !registry.unavailable.length && registry.stocks.some(stock => stock.mint === stockMint && isSupportedAsset(stock)); } catch { /* Unresolved assets remain blocked. */ }
      }
    }
    if (!allowed) throw new JupiterError('The stock is unavailable or ambiguous. Refresh the token registry.', 422);
    const order = normalizeOrder(await swapRequest('order', new URLSearchParams(params)));
    return Response.json(order, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return apiError(error); }
}
