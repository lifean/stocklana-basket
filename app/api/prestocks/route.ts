import { getPreStocks, preStocksUnavailable } from '@/lib/prestocks/client';
export async function GET() {
  try { return Response.json(await getPreStocks(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { const error = 'PreStocks API is temporarily unavailable. Pre-IPO AI Leaders cannot be traded. Please refresh shortly.'; return Response.json({ ...preStocksUnavailable(error), error }, { status: 502, headers: { 'Cache-Control': 'no-store' } }); }
}
