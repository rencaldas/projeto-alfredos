const DEFAULT_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 15000;

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executa `fn` com novas tentativas em caso de falha.
 *
 * `fn` recebe o número da tentativa atual (iniciando em 0) e deve retornar uma Promise.
 * Se `error.retryAfterMs` estiver definido (ex.: respeitando um header Retry-After),
 * esse valor é usado no lugar do backoff exponencial padrão.
 */
export async function withRetry(fn, options = {}) {
  const {
    retries = DEFAULT_RETRIES,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
    shouldRetry = () => true,
    onRetry
  } = options;

  let attempt = 0;
  let lastError;

  while (attempt <= retries) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt === retries;

      if (isLastAttempt || !shouldRetry(error, attempt)) {
        throw error;
      }

      const explicitDelay =
        typeof error.retryAfterMs === 'number' && error.retryAfterMs >= 0 ? error.retryAfterMs : null;
      const backoff = explicitDelay ?? Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      const jitter = Math.floor(Math.random() * 250);
      const delay = backoff + jitter;

      if (onRetry) {
        onRetry({ error, attempt, delay, nextAttempt: attempt + 1 });
      }

      await sleep(delay);
      attempt += 1;
    }
  }

  throw lastError;
}
