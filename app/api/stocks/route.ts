import { apiError, getStocks } from '@/lib/jupiter/client';
export async function GET() {
  try { return Response.json(await getStocks(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return apiError(error); }
}
