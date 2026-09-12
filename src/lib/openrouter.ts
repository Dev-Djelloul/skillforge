const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Identifiant exact du modèle configuré côté compte OpenRouter de l'utilisateur
// (vérifié dans les logs OpenRouter — un preset nommé "Luna" pointant vers ce
// modèle OpenAI), à ne pas confondre avec un nom d'affichage ou un preset slug.
const MODEL = 'openai/gpt-5.6-luna';

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
