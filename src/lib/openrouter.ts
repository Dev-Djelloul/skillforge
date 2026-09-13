const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Modèle gratuit choisi sur OpenRouter (identifiant exact copié depuis la
// fiche du modèle, pas deviné) — plan gratuit plutôt qu'un modèle payant,
// au prix d'une latence et de limites de débit potentiellement plus
// contraignantes sur le plan free d'OpenRouter.
const MODEL = 'google/gemma-4-26b-a4b-it:free';

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

interface OpenRouterResponse {
  choices?: { message?: { content?: string } }[];
}

/**
 * Appelle OpenRouter (API compatible OpenAI) — remplace Workers AI pour la
 * génération de texte (évaluation, relance, plan de révision). Les
 * embeddings pour Vectorize restent sur Workers AI, OpenRouter ne proposant
 * pas ce type de modèle.
 */
export async function callOpenRouter(
  apiKey: string,
  messages: ChatMessage[],
  maxTokens: number
): Promise<string> {
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

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`OpenRouter a renvoyé une erreur ${res.status} : ${errText.slice(0, 300)}`);
  }

  const data = (await res.json()) as OpenRouterResponse;
  return data.choices?.[0]?.message?.content ?? '';
}
