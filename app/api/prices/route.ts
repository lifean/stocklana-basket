import { isAddress } from '@solana/kit';
import { apiError, getPrices } from '@/lib/jupiter/client';
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const raw = params.get('ids');
  if (!raw || raw.length > 900 || params.getAll('ids').length !== 1 || [...params.keys()].some(key => key !== 'ids')) return Response.json({ error: 'Provide a single ids parameter containing 1–20 Solana mint addresses.' }, { status: 400 });
  const ids = raw.split(',');
  if (ids.length > 20 || ids.some(id => !isAddress(id))) return Response.json({ error: 'Provide 1–20 valid Solana mint addresses.' }, { status: 400 });
  try { return Response.json(await getPrices([...new Set(ids)]), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return apiError(error); }
}
