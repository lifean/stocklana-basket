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
    if (params.inputMint !== USDC_MINT) throw new JupiterError('This MVP supports purchases using mainnet USDC.', 400);
    const registry = await getStocks();
    if (!registry.stocks.some(stock => stock.mint === params.outputMint && stock.isVerified)) throw new JupiterError('The stock is unavailable or ambiguous. Refresh the token registry.', 422);
    const order = normalizeOrder(await swapRequest('order', new URLSearchParams(params)));
    return Response.json(order, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return apiError(error); }
}
