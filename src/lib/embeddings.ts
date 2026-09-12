import type { Bindings } from '../types';

// Modèle multilingue (le contenu est en français) — 1024 dimensions.
const EMBEDDING_MODEL = '@cf/baai/bge-m3';

/**
 * Calcule l'embedding d'un texte. Utilisé à la fois pour indexer les
 * questions dans Vectorize et pour retrouver des questions sémantiquement
 * proches d'une question déjà répondue (sélection adaptative).
 */
export async function embedText(ai: Bindings['AI'], text: string): Promise<number[]> {
  const result = await ai.run(EMBEDDING_MODEL, { text: [text] });
  const vectors = (result as { data?: number[][] }).data;
  if (!vectors || !vectors[0]) {
    throw new Error('Échec du calcul d\'embedding : réponse inattendue du modèle.');
  }
  return vectors[0];
}

export function questionEmbeddingText(prompt: string, rubric: string): string {
  const rubricPoints: string[] = JSON.parse(rubric);
  return `${prompt}\n${rubricPoints.join('. ')}`;
}
