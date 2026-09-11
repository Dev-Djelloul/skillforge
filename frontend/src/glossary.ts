export interface GlossaryTerm {
  term: string;
  definition: string;
  categories: string[]; // slugs de categories.slug (côté D1)
}

// Lexique statique V1 — pas de dépendance à une table D1 pour l'instant.
// Chaque terme est rattaché à une ou plusieurs familles pour servir de
// repli quand aucun terme n'est détecté littéralement dans la question.
export const GLOSSARY: GlossaryTerm[] = [
  // IA & Machine Learning
  { term: 'Prompt', definition: 'Instruction ou contexte donné à un modèle de langage pour orienter sa réponse.', categories: ['ia-ml'] },
  { term: 'LLM', definition: 'Large Language Model — modèle de langage entraîné sur de grands volumes de texte pour générer ou comprendre du langage naturel.', categories: ['ia-ml'] },
  { term: 'RAG', definition: 'Retrieval-Augmented Generation — technique qui va chercher des documents pertinents avant de générer une réponse, pour l\'ancrer sur des faits.', categories: ['ia-ml'] },
  { term: 'Fine-tuning', definition: 'Ré-entraînement d\'un modèle déjà pré-entraîné sur un jeu de données spécifique, pour le spécialiser.', categories: ['ia-ml'] },
  { term: 'Prompt caching', definition: 'Réutilisation d\'un préfixe de contexte déjà traité par le modèle, pour réduire coût et latence sur des appels répétés.', categories: ['ia-ml'] },
  { term: 'Agent', definition: 'Système qui utilise un LLM pour décider d\'actions à enchaîner (appels d\'outils, étapes) afin d\'atteindre un objectif.', categories: ['ia-ml'] },
  { term: 'Apprentissage supervisé', definition: 'Entraînement d\'un modèle sur des données étiquetées (entrée + réponse attendue) pour apprendre à prédire.', categories: ['ia-ml'] },
  { term: 'Apprentissage non supervisé', definition: 'Entraînement sans étiquettes, visant à découvrir des structures ou regroupements dans les données.', categories: ['ia-ml'] },
  { term: 'LLM-as-judge', definition: 'Utilisation d\'un LLM pour évaluer la qualité de la réponse d\'un autre système, selon des critères explicites.', categories: ['ia-ml'] },
  { term: 'Hallucination', definition: 'Réponse générée par un modèle qui semble plausible mais qui est factuellement incorrecte ou inventée.', categories: ['ia-ml'] },

  // Gestion de projet digital
  { term: 'Agile', definition: 'Approche de gestion de projet itérative, avec des livraisons incrémentales et une adaptation continue au changement.', categories: ['gestion-projet'] },
  { term: 'Waterfall', definition: 'Cycle en cascade : méthode séquentielle où chaque phase du projet doit être achevée avant de passer à la suivante.', categories: ['gestion-projet'] },
  { term: 'Backlog', definition: 'Liste priorisée des tâches, fonctionnalités ou besoins à traiter dans un projet.', categories: ['gestion-projet'] },
  { term: 'Sprint', definition: 'Période de travail fixe (souvent 1 à 4 semaines) au cours de laquelle une équipe agile livre un incrément de produit.', categories: ['gestion-projet'] },
  { term: 'MoSCoW', definition: 'Méthode de priorisation classant les besoins en Must have, Should have, Could have, Won\'t have.', categories: ['gestion-projet'] },
  { term: 'Dette technique', definition: 'Coût futur généré par des choix techniques rapides ou imparfaits pris pour aller plus vite à court terme.', categories: ['gestion-projet', 'dev-web'] },
  { term: 'KPI', definition: 'Key Performance Indicator — indicateur chiffré utilisé pour mesurer la performance ou la santé d\'un projet.', categories: ['gestion-projet'] },
  { term: 'Registre des risques', definition: 'Document qui recense les risques identifiés d\'un projet, leur probabilité, leur impact et leur plan de mitigation.', categories: ['gestion-projet'] },

  // Développement web
  { term: 'SSR', definition: 'Server-Side Rendering — le HTML de la page est généré côté serveur avant d\'être envoyé au navigateur.', categories: ['dev-web'] },
  { term: 'CSR', definition: 'Client-Side Rendering — le HTML de la page est généré dans le navigateur, via JavaScript.', categories: ['dev-web'] },
  { term: 'API REST', definition: 'Interface web basée sur HTTP, où chaque ressource est identifiée par une URL et manipulée via des verbes (GET, POST, PUT, DELETE).', categories: ['dev-web'] },
  { term: 'Rate limiting', definition: 'Limitation du nombre de requêtes qu\'un client peut effectuer sur une période donnée, pour protéger un service des abus.', categories: ['dev-web'] },
  { term: 'Edge computing', definition: 'Exécution du code au plus près de l\'utilisateur (sur un réseau de points de présence), plutôt que dans un data center central.', categories: ['dev-web'] },
  { term: 'Serverless', definition: 'Modèle d\'exécution où l\'infrastructure serveur est entièrement gérée par le fournisseur cloud, le code s\'exécutant à la demande.', categories: ['dev-web'] },
  { term: 'OWASP', definition: 'Open Web Application Security Project — organisation qui publie notamment le Top 10 des vulnérabilités web les plus critiques.', categories: ['dev-web'] },
  { term: 'XSS', definition: 'Cross-Site Scripting — vulnérabilité permettant d\'injecter du code malveillant exécuté dans le navigateur d\'un autre utilisateur.', categories: ['dev-web'] },

  // Culture métiers du numérique
  { term: 'UX', definition: 'User Experience — expérience globale vécue par un utilisateur : parcours, utilité, facilité d\'usage.', categories: ['culture-num'] },
  { term: 'UI', definition: 'User Interface — interface visuelle d\'un produit : composants, esthétique, mise en page.', categories: ['culture-num'] },
  { term: 'Transformation digitale', definition: 'Intégration du numérique dans les processus et l\'organisation d\'une entreprise, au-delà du simple outillage.', categories: ['culture-num'] },
  { term: 'Product owner', definition: 'Rôle responsable de la vision produit et de la priorisation de la valeur métier dans une équipe agile.', categories: ['culture-num'] },
  { term: 'Data-driven', definition: 'Approche de décision qui s\'appuie sur l\'analyse de données plutôt que sur l\'intuition seule.', categories: ['culture-num'] },
  { term: 'RGPD', definition: 'Règlement Général sur la Protection des Données — cadre légal européen encadrant la collecte et le traitement des données personnelles.', categories: ['culture-num'] },
  { term: 'DSI', definition: 'Direction des Systèmes d\'Information — fonction responsable de la stratégie et du pilotage du système d\'information d\'une entreprise.', categories: ['culture-num'] },
];

const CATEGORY_FALLBACK_COUNT = 4;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Termes à afficher pour une question donnée : d'abord ceux détectés
 * littéralement dans l'énoncé (correspondance sur mot entier, insensible
 * à la casse), puis en repli les premiers termes de la même famille.
 */
export function findRelevantTerms(prompt: string, categorySlug: string | undefined): GlossaryTerm[] {
  const matched = GLOSSARY.filter((entry) => {
    const pattern = new RegExp(`\\b${escapeRegExp(entry.term)}\\b`, 'i');
    return pattern.test(prompt);
  });

  if (matched.length > 0) {
    return matched;
  }

  if (!categorySlug) return [];

  return GLOSSARY.filter((entry) => entry.categories.includes(categorySlug)).slice(0, CATEGORY_FALLBACK_COUNT);
}
