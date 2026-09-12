export const EXTENSION_NOISE_PATTERNS: RegExp[] = [
  /enable copy/i,
  /\be\.c\.p\b/i,
  /ecp_regular/i,
  /reportallchanges/i,
  /cannot read properties of undefined \(reading ['\"]starttime['\"]\)/i,
  /enable_product/i,
  /aggressive_mode/i,
  /slow network is detected/i,
  /fallback font will be used while loading/i,
  /a listener indicated an asynchronous response by returning true/i,
  /message channel closed before a response was received/i,
  /could not establish connection\. receiving end does not exist/i,
  /runtime\.lasterror/i,
  /extension context invalidated/i,
  /chrome-extension:\/\//i,
  /fdprocessedid/i,
  /hydration mismatch/i,
];

export function isExtensionNoise(value: unknown): boolean {
  const message =
    value instanceof Error
      ? `${value.message} ${value.stack ?? ''}`
      : typeof value === 'string'
        ? value
        : value && typeof value === 'object'
          ? (() => {
              const record = value as Record<string, unknown>;
              const directMessage = typeof record.message === 'string' ? record.message : '';
              const reasonMessage =
                record.reason instanceof Error
                  ? `${record.reason.message} ${record.reason.stack ?? ''}`
                  : typeof record.reason === 'string'
                    ? record.reason
                    : typeof record.reason === 'object' && record.reason !== null && typeof (record.reason as { message?: unknown }).message === 'string'
                      ? String((record.reason as { message: string }).message)
                      : '';
              const detailMessage =
                record.detail instanceof Error
                  ? `${record.detail.message} ${record.detail.stack ?? ''}`
                  : typeof record.detail === 'string'
                    ? record.detail
                    : '';

              return [directMessage, reasonMessage, detailMessage].filter(Boolean).join(' ').trim() || String(value ?? '');
            })()
          : String(value ?? '');

  const normalized = message.toLowerCase();
  return EXTENSION_NOISE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function argsLookLikeExtensionNoise(args: unknown[]): boolean {
  const text = args
    .map((arg) => {
      if (arg instanceof Error) return `${arg.message} ${arg.stack ?? ''}`;
      if (typeof arg === 'object' && arg !== null && 'reason' in (arg as Record<string, unknown>)) {
        const reason = (arg as Record<string, unknown>).reason;
        if (reason instanceof Error) return `${reason.message} ${reason.stack ?? ''}`;
        if (typeof reason === 'string') return reason;
      }
      if (typeof arg === 'object' && arg !== null) {
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      }
      return String(arg ?? '');
    })
    .join(' ');

  return EXTENSION_NOISE_PATTERNS.some((pattern) => pattern.test(text));
}
