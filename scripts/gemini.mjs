import { withRetry } from './retry.mjs';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_TIMEOUT_MS = 90000;
const DEFAULT_MAX_RETRIES = 4;
const DEFAULT_RETRY_AFTER_MS = 20000;

/**
 * Chama a API oficial do Gemini (generateContent) pedindo saida estruturada em JSON
 * (responseMimeType + responseSchema), com retry/backoff e tratamento de 429 (rate limit).
 * Retorna o objeto ja parseado (JSON.parse do texto retornado pelo modelo).
 */
export async function generateStructuredReport({
  apiKey,
  model = DEFAULT_MODEL,
  prompt,
  schema,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxRetries = DEFAULT_MAX_RETRIES
}) {
  const url = `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: schema,
      temperature: 0.4
    }
  };

  const rawText = await withRetry(
    async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let response;

      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });
      } catch (networkError) {
        const error = new Error(`Falha de rede ao chamar o Gemini: ${networkError.message}`);
        error.cause = networkError;
        error.retryable = true;
        throw error;
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        const message = errorPayload?.error?.message || response.statusText;
        const error = new Error(`Gemini API falhou (${response.status}): ${message}`);
        error.status = response.status;

        if (response.status === 429) {
          const retryInfo = errorPayload?.error?.details?.find((detail) =>
            String(detail['@type'] || '').includes('RetryInfo')
          );
          const retrySeconds = retryInfo ? parseRetryDelaySeconds(retryInfo.retryDelay) : null;
          const headerRetryAfter = response.headers.get('retry-after');
          error.retryAfterMs = retrySeconds
            ? retrySeconds * 1000
            : headerRetryAfter
              ? Number(headerRetryAfter) * 1000
              : DEFAULT_RETRY_AFTER_MS;
        }

        throw error;
      }

      const payload = await response.json();
      const text =
        payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';

      if (!text.trim()) {
        throw new Error('Gemini retornou uma resposta vazia.');
      }

      return text;
    },
    {
      retries: maxRetries,
      baseDelayMs: 2000,
      maxDelayMs: 30000,
      shouldRetry: (error) => isRetryable(error),
      onRetry: ({ error, attempt, delay }) => {
        console.warn(
          `[Gemini] Tentativa ${attempt + 1} falhou (${error.message}). Nova tentativa em ${Math.round(delay / 1000)}s.`
        );
      }
    }
  );

  try {
    return JSON.parse(rawText);
  } catch (error) {
    throw new Error(
      `Nao foi possivel interpretar o JSON retornado pelo Gemini: ${error.message}. Resposta bruta: ${rawText.slice(0, 500)}`
    );
  }
}

function isRetryable(error) {
  if (error.retryable) return true;
  if (error.name === 'AbortError') return true;
  return [429, 500, 502, 503, 504].includes(error.status);
}

function parseRetryDelaySeconds(value) {
  const match = String(value || '').match(/([\d.]+)s/);
  return match ? Number(match[1]) : null;
}
