import type { Bindings, GlossaryTerm } from '../types';
import { callOpenRouter } from './openrouter';

/**
 * Génère le lexique d'une question précise via IA plutôt que par
 * correspondance de mots-clés sur une liste statique — la banque de
 * questions étant en grande partie générée par IA elle-même (formulations
 * variées), un lexique figé ratait souvent les vrais termes techniques de
 * la question posée, ou en proposait de hors-sujet par repli catégorie.
 */
export async function generateGlossary(env: Bindings, questionPrompt: string): Promise<GlossaryTerm[]> {
  const systemPrompt = `Tu identifies les termes techniques d'une question d'entretien, pour aider un candidat qui la découvre.
Repère 3 à 5 termes ou sigles précis et pertinents PRÉSENTS OU DIRECTEMENT IMPLIQUÉS DANS CETTE QUESTION (pas des notions génériques du domaine sans lien direct). Si la question n'a presque aucun terme technique spécifique, renvoie une liste plus courte plutôt que d'en inventer d'inutiles.
Réponds STRICTEMENT en JSON valide, sans texte autour :
{"terms": [{"term": "<terme ou sigle>", "definition": "<définition claire en 1-2 phrases, en français>"}]}`;

  const raw = await callOpenRouter(
    env.OPENROUTER_API_KEY,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Question : ${questionPrompt}` },
    ],
    512
  );

  return parseGlossary(raw);
}

export function parseGlossary(raw: string): GlossaryTerm[] {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed.terms)) return [];
    return parsed.terms
      .filter((t: unknown): t is GlossaryTerm => {
        const candidate = t as Partial<GlossaryTerm>;
        return typeof candidate?.term === 'string' && typeof candidate?.definition === 'string';
      })
      .slice(0, 5);
  } catch {
    return [];
  }
}
