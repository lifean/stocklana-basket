import { JupiterError } from '@/lib/jupiter/client';
import { swapRequest } from '@/lib/jupiter/swap';
import { normalizeExecutionResult, validateExecutePayload } from '@/lib/jupiter/swap-validation';
export const maxDuration = 90;
export async function POST(request: Request) {
  let payload: ReturnType<typeof validateExecutePayload>;
  try {
    if (!request.headers.get('content-type')?.includes('application/json')) throw new Error('Content-Type must be application/json.');
    const reader = request.body?.getReader();
    if (!reader) throw new Error('Request body is required.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 4096) { await reader.cancel(); throw new Error('Request body is too large.'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    payload = validateExecutePayload(JSON.parse(new TextDecoder().decode(bytes)));
  } catch { return Response.json({ error: 'Provide a valid signed transaction and requestId in a JSON body of at most 4096 bytes.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } }); }
  try {
    const result = normalizeExecutionResult(await swapRequest('execute', payload));
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof JupiterError ? error.message : 'Execution outcome is unknown. Check this submission before starting another purchase.', outcomeUnknown: true }, { status: error instanceof JupiterError ? error.status : 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
