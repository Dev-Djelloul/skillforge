-- SkillForge — jeu de questions de départ (V1)
-- 4 familles, difficulté 1 (junior) à 3 (senior)

INSERT INTO categories (slug, label) VALUES
  ('ia-ml', 'IA & Machine Learning'),
  ('gestion-projet', 'Gestion de projet digital'),
  ('dev-web', 'Développement web'),
  ('culture-num', 'Culture métiers du numérique')
;

-- IA & ML
INSERT INTO questions (category_id, difficulty, prompt, rubric) VALUES
  ((SELECT id FROM categories WHERE slug='ia-ml'), 1,
   'Qu''est-ce qu''un prompt, et pourquoi sa formulation influence-t-elle la qualité de la réponse d''un LLM ?',
   '["définit le prompt comme l''instruction/contexte donné au modèle", "mentionne l''ambiguïté ou le manque de contexte comme cause d''erreur", "cite un exemple concret (rôle, format attendu, contraintes)"]'),
  ((SELECT id FROM categories WHERE slug='ia-ml'), 1,
   'Quelle est la différence entre apprentissage supervisé et non supervisé ?',
   '["supervisé = données labellisées, objectif de prédiction", "non supervisé = pas de labels, recherche de structure/clusters", "donne un exemple pour chacun"]'),
  ((SELECT id FROM categories WHERE slug='ia-ml'), 2,
   'Expliquez le principe du RAG (Retrieval-Augmented Generation) et un cas où il est préférable au fine-tuning.',
   '["explique la récupération de documents pertinents avant génération", "mentionne l''ancrage factuel / réduction des hallucinations", "cas d''usage : connaissances fréquemment mises à jour vs fine-tuning coûteux et figé"]'),
  ((SELECT id FROM categories WHERE slug='ia-ml'), 2,
   'Qu''est-ce que le prompt caching et dans quel contexte l''utiliseriez-vous ?',
   '["réutilisation d''un préfixe de contexte déjà traité par le modèle", "gain de coût/latence sur des appels répétés avec contexte stable", "exemple : système de prompt fixe + instructions utilisateur variables"]'),
  ((SELECT id FROM categories WHERE slug='ia-ml'), 3,
   'Vous concevez un agent qui doit appeler plusieurs outils en plusieurs étapes. Quels risques spécifiques à l''orchestration multi-étapes devez-vous anticiper ?',
   '["boucles infinies ou appels redondants", "propagation d''erreur d''une étape à l''autre", "coût cumulé et latence", "besoin d''un état persistant / traçabilité des décisions"]'),
  ((SELECT id FROM categories WHERE slug='ia-ml'), 3,
   'Comment évalueriez-vous la qualité des réponses d''un système LLM-as-judge, sachant que le juge est lui-même un LLM ?',
   '["biais potentiel du juge (longueur, ton, préférences stylistiques)", "rubriques explicites et critères mesurables plutôt qu''un jugement global", "validation croisée avec des évaluateurs humains sur un échantillon"]')
;

-- Gestion de projet digital
INSERT INTO questions (category_id, difficulty, prompt, rubric) VALUES
  ((SELECT id FROM categories WHERE slug='gestion-projet'), 1,
   'Quelle est la différence entre une méthodologie agile et un cycle en cascade (waterfall) ?',
   '["agile = itératif, livraisons incrémentales, adaptation au changement", "cascade = séquentiel, phases figées avant la suivante", "mentionne un contexte où l''un est préférable à l''autre"]'),
  ((SELECT id FROM categories WHERE slug='gestion-projet'), 1,
   'Qu''est-ce qu''un backlog et à quoi sert la priorisation ?',
   '["liste des tâches/besoins à traiter", "priorisation = maximiser la valeur livrée avec des ressources limitées", "cite une méthode de priorisation (MoSCoW, valeur/effort...)"]'),
  ((SELECT id FROM categories WHERE slug='gestion-projet'), 2,
   'Le client demande une fonctionnalité supplémentaire à mi-projet sans décaler la deadline. Comment arbitrez-vous ?',
   '["explicite le triangle délai/coût/qualité (ou périmètre)", "propose des options concrètes (retirer une autre fonctionnalité, décaler, réduire le scope)", "insiste sur la communication transparente des impacts au client"]'),
  ((SELECT id FROM categories WHERE slug='gestion-projet'), 2,
   'Comment identifiez-vous et suivez-vous les risques d''un projet digital ?',
   '["identification en amont (brainstorm, retours d''expérience)", "évaluation probabilité x impact", "plan de mitigation et suivi régulier (registre des risques)"]'),
  ((SELECT id FROM categories WHERE slug='gestion-projet'), 3,
   'Vous héritez d''un projet avec une dette technique importante et une pression business pour livrer vite. Comment structurez-vous votre plan d''action ?',
   '["distingue dette technique consciente vs subie", "propose un arbitrage progressif (quick wins vs refonte)", "implique les équipes techniques dans l''estimation de l''impact", "communique le compromis au sponsor/métier"]'),
  ((SELECT id FROM categories WHERE slug='gestion-projet'), 3,
   'Quels indicateurs (KPIs) utiliseriez-vous pour piloter la santé d''un projet digital au-delà du simple respect du planning ?',
   '["qualité (taux de bugs, dette technique)", "satisfaction utilisateur/client", "vélocité/prévisibilité de l''équipe", "valeur métier livrée vs prévue"]')
;

-- Développement web
INSERT INTO questions (category_id, difficulty, prompt, rubric) VALUES
  ((SELECT id FROM categories WHERE slug='dev-web'), 1,
   'Quelle est la différence entre le rendu côté serveur (SSR) et côté client (CSR) ?',
   '["SSR = HTML généré côté serveur avant envoi au navigateur", "CSR = HTML généré dans le navigateur via JS", "compromis SEO/performance initiale vs interactivité"]'),
  ((SELECT id FROM categories WHERE slug='dev-web'), 1,
   'Qu''est-ce qu''une API REST et quels sont ses principes de base ?',
   '["interface basée sur HTTP, ressources identifiées par URL", "verbes HTTP (GET/POST/PUT/DELETE) avec sémantique claire", "sans état (stateless)"]'),
  ((SELECT id FROM categories WHERE slug='dev-web'), 2,
   'Comment protégeriez-vous une API publique contre les abus (spam, surcharge) ?',
   '["rate limiting / throttling", "authentification et clés API", "validation stricte des entrées côté serveur"]'),
  ((SELECT id FROM categories WHERE slug='dev-web'), 2,
   'Qu''est-ce que le edge computing et quel avantage apporte-t-il par rapport à une architecture serveur centralisée ?',
   '["exécution du code au plus près de l''utilisateur (CDN/edge)", "réduction de la latence", "exemple : Cloudflare Workers, Vercel Edge Functions"]'),
  ((SELECT id FROM categories WHERE slug='dev-web'), 3,
   'Comment concevriez-vous l''architecture d''une application serverless nécessitant une base de données relationnelle et une recherche sémantique ?',
   '["sépare les responsabilités (DB relationnelle vs index vectoriel)", "aborde la cohérence des données entre les deux systèmes", "mentionne les contraintes serverless (cold start, limites de temps d''exécution)"]'),
  ((SELECT id FROM categories WHERE slug='dev-web'), 3,
   'Quelles vulnérabilités OWASP considérez-vous prioritaires pour une application web grand public, et comment les mitiger ?',
   '["cite au moins 2 vulnérabilités concrètes (injection, XSS, auth cassée...)", "propose une mitigation technique précise pour chacune", "mentionne l''importance de la validation côté serveur, pas seulement côté client"]')
;

-- Culture métiers du numérique
INSERT INTO questions (category_id, difficulty, prompt, rubric) VALUES
  ((SELECT id FROM categories WHERE slug='culture-num'), 1,
   'Quelle est la différence entre UX et UI ?',
   '["UX = expérience globale, parcours, utilité, facilité d''usage", "UI = interface visuelle, composants, esthétique", "les deux sont complémentaires"]'),
  ((SELECT id FROM categories WHERE slug='culture-num'), 1,
   'Qu''est-ce que la transformation digitale pour une entreprise ?',
   '["intégration du numérique dans les processus/métiers", "impact sur l''organisation, pas seulement la technologie", "exemple concret"]'),
  ((SELECT id FROM categories WHERE slug='culture-num'), 2,
   'Quel est le rôle d''un product owner par rapport à un chef de projet ?',
   '["product owner = vision produit, priorisation valeur métier", "chef de projet = pilotage delivery, ressources, délais", "peuvent se recouvrir selon les organisations"]'),
  ((SELECT id FROM categories WHERE slug='culture-num'), 2,
   'Pourquoi la donnée est-elle considérée comme un actif stratégique pour une entreprise numérique ?',
   '["aide à la décision (data-driven)", "personnalisation de l''expérience utilisateur", "risques associés (RGPD, sécurité, qualité de la donnée)"]'),
  ((SELECT id FROM categories WHERE slug='culture-num'), 3,
   'Comment un DSI ou un CTO doit-il arbitrer entre innovation technologique et stabilité du système d''information ?',
   '["évalue le risque business d''une dette technique non maîtrisée", "propose une approche progressive (POC, feature flags, déploiement graduel)", "aligne la décision sur la stratégie de l''entreprise, pas seulement la technique"]'),
  ((SELECT id FROM categories WHERE slug='culture-num'), 3,
   'Quels enjeux éthiques faut-il considérer lors du déploiement d''un système d''IA générative auprès du grand public ?',
   '["biais et équité", "transparence sur les limites du système (hallucinations)", "protection des données personnelles", "responsabilité en cas d''erreur du système"]')
;
