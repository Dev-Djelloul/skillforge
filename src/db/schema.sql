-- SkillForge — schéma D1 (V1)

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  difficulty INTEGER NOT NULL CHECK (difficulty BETWEEN 1 AND 3),
  prompt TEXT NOT NULL,
  rubric TEXT NOT NULL, -- JSON: points clés attendus dans une bonne réponse
  hint TEXT, -- indice affiché à la demande pendant la question, sans révéler la réponse
  resources TEXT, -- JSON: [{ "type": "article" | "video", "title": string, "url": string }]
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, -- uuid
  user_id TEXT, -- nullable : session anonyme possible en V1
  status TEXT NOT NULL DEFAULT 'in_progress', -- in_progress | completed
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS session_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  question_id INTEGER NOT NULL REFERENCES questions(id),
  position INTEGER NOT NULL,
  user_answer TEXT,
  score INTEGER, -- 0-100
  feedback TEXT,
  answered_at TEXT
);

-- Score moyen par catégorie et par client_id — alimente la sélection
-- adaptative des questions (V2).
CREATE TABLE IF NOT EXISTS skill_scores (
  user_id TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  avg_score REAL NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_questions_category ON questions(category_id);
CREATE INDEX IF NOT EXISTS idx_session_items_session ON session_items(session_id);
