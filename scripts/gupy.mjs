import { withRetry } from './retry.mjs';

const GUPY_JOBS_URL = 'https://portal.api.gupy.io/api/v1/jobs';
const DEFAULT_TIMEOUT_MS = 30000;

const TYPE_LABELS = {
  vacancy_type_internship: 'Estágio',
  vacancy_type_effective: 'Efetivo (CLT)',
  vacancy_type_trainee: 'Trainee',
  vacancy_type_apprentice: 'Jovem Aprendiz',
  vacancy_type_talent_pool: 'Banco de talentos',
  vacancy_type_temporary: 'Temporário',
  vacancy_type_associate: 'Associado',
  vacancy_type_freelancer: 'Freelancer',
  vacancy_type_autonomous: 'Autônomo',
  vacancy_type_legal_entity: 'PJ',
  vacancy_type_outsource: 'Terceirizado',
  vacancy_type_summer: 'Summer job',
  vacancy_type_volunteer: 'Voluntário',
  vacancy_type_lecturer: 'Professor'
};

const WORKPLACE_MAP = {
  remote: 'remoto',
  hybrid: 'hibrido',
  'on-site': 'presencial',
  onsite: 'presencial',
  presential: 'presencial'
};

/**
 * Busca vagas no portal público da Gupy (portal.gupy.io) para um termo.
 *
 * A API não é oficial nem documentada: se o formato da resposta mudar,
 * o erro abaixo mostra as chaves recebidas para facilitar o ajuste do parser.
 */
export async function searchGupyJobs({ term, limit, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const url = new URL(GUPY_JOBS_URL);
  url.searchParams.set('jobName', term);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', '0');

  const payload = await withRetry(
    async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let response;

      try {
        response = await fetch(url, {
          headers: { accept: 'application/json' },
          signal: controller.signal
        });
      } catch (networkError) {
        const error = new Error(`Falha de rede ao consultar a Gupy: ${networkError.message}`);
        error.retryable = true;
        throw error;
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        const error = new Error(`Gupy respondeu ${response.status} para o termo "${term}".`);
        error.retryable = response.status === 429 || response.status >= 500;
        throw error;
      }

      return response.json();
    },
    {
      retries: 3,
      baseDelayMs: 2000,
      maxDelayMs: 15000,
      shouldRetry: (error) => error.retryable === true || error.name === 'AbortError',
      onRetry: ({ error, attempt, delay }) => {
        console.warn(`[Gupy] Tentativa ${attempt + 1} falhou (${error.message}). Nova tentativa em ${Math.round(delay / 1000)}s.`);
      }
    }
  );

  if (!Array.isArray(payload?.data)) {
    const keys = payload && typeof payload === 'object' ? Object.keys(payload).join(', ') : typeof payload;
    throw new Error(`Formato inesperado da API da Gupy (esperava "data" como lista). Chaves recebidas: ${keys}`);
  }

  return payload.data.map(normalizeGupyJob).filter(Boolean);
}

export function normalizeGupyJob(raw) {
  if (!raw || raw.id === undefined || raw.id === null || !raw.name) {
    return null;
  }

  const workplace = WORKPLACE_MAP[String(raw.workplaceType || '').toLowerCase()] ?? (raw.isRemoteWork ? 'remoto' : 'desconhecido');

  return {
    id: `gupy:${raw.id}`,
    source: 'Gupy',
    title: String(raw.name).trim(),
    company: String(raw.careerPageName || 'Empresa não informada').trim(),
    description: htmlToText(raw.description || ''),
    city: String(raw.city || '').trim(),
    state: String(raw.state || '').trim(),
    workplace,
    type: String(raw.type || ''),
    typeLabel: TYPE_LABELS[raw.type] || 'Não informado',
    publishedAt: raw.publishedDate || null,
    url: raw.jobUrl || ''
  };
}

export function htmlToText(value) {
  return String(value)
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|li|div|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
