import { getTessera, tesseraUnavailable } from '@/lib/tessera/client';
export async function GET() {
  try { return Response.json(await getTessera(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { const error = 'Tessera API is temporarily unavailable. Future Markets cannot be traded. Please refresh shortly.'; return Response.json({ ...tesseraUnavailable(error), error }, { status: 502, headers: { 'Cache-Control': 'no-store' } }); }
}
