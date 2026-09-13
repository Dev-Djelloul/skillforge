const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Modèle gratuit choisi sur OpenRouter (identifiant exact copié depuis la
// fiche du modèle, pas deviné) — plan gratuit plutôt qu'un modèle payant,
// au prix d'une latence et de limites de débit potentiellement plus
// contraignantes sur le plan free d'OpenRouter.
const MODEL = 'google/gemma-4-26b-a4b-it:free';

// Le plan gratuit est occasionnellement limité en débit par le fournisseur
// upstream (429) — quelques secondes suffisent généralement à ce que la
// limite se libère, d'où ce petit nombre de réessais avec pause croissante,
// plutôt que de faire échouer la requête au premier coup.
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1500, 3000];

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
    return "Le service IA (plan gratuit) est momentanément surchargé — réessaie dans quelques instants.";
  }
  if (status >= 500) {
    return 'Le service IA est temporairement indisponible — réessaie dans quelques instants.';
  }
  return "Le service IA n'a pas pu traiter la demande — réessaie dans quelques instants.";
}

/**
 * Appelle OpenRouter (API compatible OpenAI) — remplace Workers AI pour la
 * génération de texte (évaluation, relance, plan de révision, questions,
 * lexique). Les embeddings pour Vectorize restent sur Workers AI, OpenRouter
 * ne proposant pas ce type de modèle.
 *
 * Réessaie automatiquement sur 429/5xx (le plan gratuit d'OpenRouter est
 * parfois limité en débit côté fournisseur), et ne renvoie jamais le corps
 * d'erreur brut à l'appelant — un message générique et compréhensible à la
 * place, jamais un blob JSON technique affiché tel quel côté utilisateur.
 */
export async function callOpenRouter(
  apiKey: string,
  messages: ChatMessage[],
  maxTokens: number
): Promise<string> {
  let lastStatus = 0;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://skillforge.digitalblueskye.com',
        'X-Title': 'SkillForge',
      },
      body: JSON.stringify({ model: MODEL, messages, max_tokens: maxTokens }),
    });

    if (res.ok) {
      const data = (await res.json()) as OpenRouterResponse;
      return data.choices?.[0]?.message?.content ?? '';
    }

    lastStatus = res.status;
    const retryable = res.status === 429 || res.status >= 500;
    const hasMoreAttempts = attempt < MAX_ATTEMPTS - 1;

    if (retryable && hasMoreAttempts) {
      await sleep(RETRY_DELAYS_MS[attempt] ?? 3000);
      continue;
    }

    throw new Error(friendlyErrorMessage(res.status));
  }

  throw new Error(friendlyErrorMessage(lastStatus));
}
