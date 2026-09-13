import { ApiCallError } from '../sillytavern/api-router';

export function assertTurnActive(signal: AbortSignal, isCurrent: () => boolean): void {
  if (signal.aborted || !isCurrent()) throw new ApiCallError('请求已中止', 'abort');
}

/** Cancellation must settle promptly even if an injected runner ignores signals. */
export function awaitWithAbort<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new ApiCallError('请求已中止', 'abort'));
    if (signal.aborted) {
      pending.catch(() => {});
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

/** Only a live turn may degrade a State failure into a fixed-cost settlement. */
export async function runStateWithFallback<T>(
  run: () => Promise<T>,
  fallback: (error: unknown) => T,
  assertCurrent: () => void,
): Promise<T> {
  assertCurrent();
  try {
    const value = await run();
    assertCurrent();
    return value;
  } catch (error) {
    assertCurrent();
    if (error instanceof ApiCallError && error.kind === 'abort') throw error;
    if (error instanceof Error && error.name === 'AbortError') throw error;
    return fallback(error);
  }
}
