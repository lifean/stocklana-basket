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
    const registry = await getStocks();
    const stockMint = params.inputMint === USDC_MINT ? params.outputMint : params.outputMint === USDC_MINT ? params.inputMint : null;
    if (!stockMint || !registry.stocks.some(stock => stock.mint === stockMint && stock.isVerified)) throw new JupiterError('The stock is unavailable or ambiguous. Refresh the token registry.', 422);
    const order = normalizeOrder(await swapRequest('order', new URLSearchParams(params)));
    return Response.json(order, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return apiError(error); }
}
