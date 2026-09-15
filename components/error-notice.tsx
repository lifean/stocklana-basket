import { friendlyError, safeErrorDetail } from '@/lib/errors';
export function ErrorNotice({ error }: { error: string }) {
  return <div className="error" role="alert"><p>{friendlyError(error)}</p><details><summary>Technical details</summary><pre>{safeErrorDetail(error)}</pre></details></div>;
}
