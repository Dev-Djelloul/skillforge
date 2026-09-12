import type { Bindings, Resource } from '../types';
import { callOpenRouter } from './openrouter';
import { embedText, questionEmbeddingText } from './embeddings';

const DIFFICULTY_LABEL: Record<number, string> = {
  1: 'débutant / junior',
  2: 'intermédiaire',
  3: 'avancé / senior',
};

interface GeneratedQuestion {
  prompt: string;
  rubric: string[];
  hint: string;
  topic: string;
}

/**
 * Ressources « pour aller plus loin » sous forme de liens de recherche
 * (Wikipédia, YouTube) plutôt que de pages précises — l'IA ne peut pas
 * garantir qu'une URL d'article qu'elle invente existe réellement, alors
 * qu'un lien de recherche fonctionne toujours.
 *
 * Le champ "topic" regroupe parfois plusieurs thèmes distincts séparés par
 * des virgules (ex: "recette projet, critères acceptation, périmètre") —
 * on les sépare pour donner une carte de recherche par thème plutôt qu'une
 * seule requête fourre-tout illisible.
 */
function buildSearchResources(topic: string): Resource[] {
  const themes = topic
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 3);

  if (themes.length === 0) return [];

  return themes.flatMap((theme) => {
    const query = encodeURIComponent(theme);
    return [
      {
        type: 'article' as const,
        title: `Rechercher : ${theme}`,
        url: `https://fr.wikipedia.org/w/index.php?search=${query}`,
      },
      {
        type: 'video' as const,
        title: `Vidéos sur : ${theme}`,
        url: `https://www.youtube.com/results?search_query=${query}`,
      },
    ];
  });
}

async function generateQuestion(
  env: Bindings,
  categoryLabel: string,
  difficulty: number,
  avoidPrompts: string[]
): Promise<GeneratedQuestion> {
  const systemPrompt = `Tu conçois des questions d'entretien technique pour un simulateur d'entraînement, dans le domaine : ${categoryLabel}.
Génère UNE question originale et réaliste, de niveau ${DIFFICULTY_LABEL[difficulty] ?? 'intermédiaire'}, telle qu'un recruteur pourrait la poser.
Réponds STRICTEMENT en JSON valide, sans texte autour :
{"prompt": "<la question, en français>", "rubric": ["<point clé attendu 1>", "<point clé 2>", "<point clé 3>"], "hint": "<indice court qui oriente sans révéler la réponse>", "topic": "<UN SEUL thème précis (2-4 mots) pour chercher plus d'infos sur cette question, en français — pas une liste de plusieurs sujets>"}`;

  const avoidBlock = avoidPrompts.length
    ? `\n\nÉvite de reformuler ou de trop ressembler à ces questions déjà posées récemment :\n${avoidPrompts.map((p) => `- ${p}`).join('\n')}`
    : '';

  const raw = await callOpenRouter(
    env.OPENROUTER_API_KEY,
    [
      { role: 'system', content: systemPrompt + avoidBlock },
      { role: 'user', content: 'Génère la question.' },
    ],
    512
  );

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Génération de question : réponse IA invalide');

  const parsed = JSON.parse(match[0]);
  if (typeof parsed.prompt !== 'string' || !Array.isArray(parsed.rubric) || parsed.rubric.length === 0) {
    throw new Error('Génération de question : format inattendu');
  }

  return {
    prompt: parsed.prompt,
    rubric: parsed.rubric,
    hint: typeof parsed.hint === 'string' ? parsed.hint : '',
    topic: typeof parsed.topic === 'string' && parsed.topic ? parsed.topic : parsed.prompt.slice(0, 60),
  };
}

/**
 * Génère une nouvelle question via l'IA, l'insère dans la banque (elle
 * devient une question comme une autre pour toutes les sessions futures —
 * la banque grossit donc organiquement au lieu de rester figée à 48
 * questions) et l'indexe dans Vectorize pour la sélection adaptative.
 * Repli silencieux vers `null` en cas d'échec : ne doit jamais bloquer le
 * démarrage d'une session, l'appelant retombe alors sur la banque existante.
 */
export async function generateAndStoreQuestion(
  env: Bindings,
  categoryId: number,
  categoryLabel: string,
  difficulty: number
): Promise<number | null> {
  try {
    const recent = await env.DB.prepare(
      `SELECT prompt FROM questions WHERE category_id = ? ORDER BY RANDOM() LIMIT 5`
    )
      .bind(categoryId)
      .all<{ prompt: string }>();

    const generated = await generateQuestion(
      env,
      categoryLabel,
      difficulty,
      recent.results.map((r) => r.prompt)
    );
    const rubricJson = JSON.stringify(generated.rubric);
    const resourcesJson = JSON.stringify(buildSearchResources(generated.topic));

    const insert = await env.DB.prepare(
      `INSERT INTO questions (category_id, difficulty, prompt, rubric, hint, resources) VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(categoryId, difficulty, generated.prompt, rubricJson, generated.hint || null, resourcesJson)
      .run();

    const newId = insert.meta.last_row_id;
    if (!newId) return null;

    try {
      const embedding = await embedText(env.AI, questionEmbeddingText(generated.prompt, rubricJson));
      await env.QUESTIONS_INDEX.upsert([
        { id: String(newId), values: embedding, metadata: { category_id: categoryId, difficulty } },
      ]);
    } catch {
      // L'indexation Vectorize peut échouer sans empêcher la question
      // d'être utilisable — elle sera simplement absente de la recherche
      // par similarité jusqu'à la prochaine réindexation manuelle.
    }

    return newId;
  } catch {
    return null;
  }
}
