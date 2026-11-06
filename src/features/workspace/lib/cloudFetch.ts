// Feature: bound cloud JSON requests through the final response byte, including runtimes without streaming fetch.
const REQUEST_TIMEOUT_MS = 15_000;
const AUTH_RESPONSE_BYTES = 1024 * 1024;
const WORKSPACE_RESPONSE_BYTES = 24 * 1024 * 1024;

type CloudFetchOptions = { fetch?: typeof fetch; timeoutMs?: number };

// Feature: keep credentials on the configured provider and release stalled account/sync operations predictably.
export function createCloudFetch(projectUrl: string, options: CloudFetchOptions = {}): typeof fetch {
  const origin = new URL(projectUrl).origin;
  const send = options.fetch ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  return async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.origin !== origin || url.username || url.password) throw new Error('Cloud request destination rejected.');
    const limit = url.pathname.startsWith('/auth/v1/') ? AUTH_RESPONSE_BYTES : WORKSPACE_RESPONSE_BYTES;
    const callerSignal = init?.signal ?? (typeof input === 'object' && 'signal' in input ? input.signal : undefined);
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let rejectAbort: (error: Error) => void = () => undefined;
    const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
    // Feature: rejection also works when a native transport cannot promptly interrupt its response body.
    const cancel = (timeout = false) => {
      rejectAbort(Object.assign(new Error(timeout ? 'Cloud request timed out. Check your connection and try again.' : 'Cloud request cancelled.'), { name: timeout ? 'TimeoutError' : 'AbortError' }));
      controller.abort();
      void reader?.cancel().catch(() => undefined);
    };
    const onAbort = () => cancel();
    const timer = setTimeout(() => cancel(true), timeoutMs);
    callerSignal?.addEventListener('abort', onAbort, { once: true });
    if (callerSignal?.aborted) cancel();

    // Feature: cap declared and streamed body sizes before the SDK parses untrusted cloud JSON.
    const receive = async (): Promise<Response> => {
      if (controller.signal.aborted) throw new Error('Cloud request cancelled.');
      const response = await send(input, { ...init, signal: controller.signal, redirect: 'error', credentials: 'omit', cache: 'no-store' });
      if (controller.signal.aborted) { void response.body?.cancel().catch(() => undefined); throw new Error('Cloud request cancelled.'); }
      // Some native fetch implementations follow redirects despite the redirect option.
      if (response.url && new URL(response.url).origin !== origin) throw new Error('Cloud response destination rejected.');
      const declared = Number(response.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > limit) throw new Error('Cloud response exceeds the download limit.');
      let body: string | Uint8Array<ArrayBuffer>;
      if (response.body?.getReader) {
        reader = response.body.getReader();
        if (controller.signal.aborted) { void reader.cancel().catch(() => undefined); throw new Error('Cloud request cancelled.'); }
        const chunks: Uint8Array[] = [];
        let length = 0;
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          length += chunk.value.byteLength;
          if (length > limit) throw new Error('Cloud response exceeds the download limit.');
          chunks.push(chunk.value);
        }
        body = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
      } else {
        // React Native may buffer internally; enforce the same limit before exposing data to the SDK.
        body = await response.text();
        if (new TextEncoder().encode(body).byteLength > limit) throw new Error('Cloud response exceeds the download limit.');
      }
      const headers = new Headers(response.headers);
      // Fetch already decoded the body; the rebuilt response must not advertise compressed bytes.
      headers.delete('content-encoding'); headers.delete('content-length');
      return new Response([204, 205, 304].includes(response.status) ? null : body, {
        status: response.status, statusText: response.statusText, headers,
      });
    };
    try { return await Promise.race([aborted, receive()]); }
    catch (error) { controller.abort(); void reader?.cancel().catch(() => undefined); throw error; }
    finally { clearTimeout(timer); callerSignal?.removeEventListener('abort', onAbort); }
  };
}
