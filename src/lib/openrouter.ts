const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Modèle principal (payant, identifiant vérifié dans les logs OpenRouter de
// l'utilisateur) : privilégié pour sa qualité et sa fiabilité. En cas
// d'échec (surcharge, indisponibilité), repli sur un modèle gratuit ; en
// tout dernier recours, la banque de questions existante prend le relais
// (voir generateAndStoreQuestion) — trois niveaux de filet de sécurité.
const PRIMARY_MODEL = 'openai/gpt-5.6-luna';
const FALLBACK_MODEL = 'google/gemma-4-26b-a4b-it:free';

// Chaque modèle a droit à une tentative + un réessai rapide avant de passer
// au suivant — mieux vaut basculer tôt sur le repli que de cumuler de longs
// délais sur un modèle déjà en difficulté (surtout que plusieurs appels
// tournent en parallèle au démarrage d'une session).
const MAX_ATTEMPTS_PER_MODEL = 2;
const RETRY_DELAY_MS = 1200;

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

interface OpenRouterResponse {
  choices?: { message?: { content?: string } }[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function friendlyErrorMessage(status: number): string {
  if (status === 429) {
    return 'Le service IA est momentanément surchargé — réessaie dans quelques instants.';
  }
  if (status >= 500) {
    return 'Le service IA est temporairement indisponible — réessaie dans quelques instants.';
  }
  return "Le service IA n'a pas pu traiter la demande — réessaie dans quelques instants.";
}

async function callModel(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  maxTokens: number
): Promise<string> {
  let lastStatus = 0;

  for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_MODEL; attempt++) {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://skillforge.digitalblueskye.com',
        'X-Title': 'SkillForge',
      },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
    });

    if (res.ok) {
      const data = (await res.json()) as OpenRouterResponse;
      return data.choices?.[0]?.message?.content ?? '';
    }

    lastStatus = res.status;
    const retryable = res.status === 429 || res.status >= 500;
    const hasMoreAttempts = attempt < MAX_ATTEMPTS_PER_MODEL - 1;

    if (retryable && hasMoreAttempts) {
      await sleep(RETRY_DELAY_MS);
      continue;
    }

    throw new Error(friendlyErrorMessage(res.status));
  }

  throw new Error(friendlyErrorMessage(lastStatus));
}

/**
 * Appelle OpenRouter (API compatible OpenAI) — remplace Workers AI pour la
 * génération de texte (évaluation, relance, plan de révision, questions,
 * lexique). Les embeddings pour Vectorize restent sur Workers AI, OpenRouter
 * ne proposant pas ce type de modèle.
 *
 * Essaie d'abord le modèle principal (avec réessai rapide), puis bascule
 * silencieusement sur le modèle gratuit de repli si celui-ci échoue —
 * jamais le corps d'erreur brut du fournisseur renvoyé à l'appelant.
 */
export async function callOpenRouter(
  apiKey: string,
  messages: ChatMessage[],
  maxTokens: number
): Promise<string> {
  try {
    return await callModel(apiKey, PRIMARY_MODEL, messages, maxTokens);
  } catch {
    return await callModel(apiKey, FALLBACK_MODEL, messages, maxTokens);
  }
}
