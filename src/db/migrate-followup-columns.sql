-- SkillForge — migration V2 : colonnes de relance sur session_items
-- schema.sql utilise CREATE TABLE IF NOT EXISTS, donc ne modifie pas une
-- table déjà créée — ce fichier applique le changement sur la base réelle
-- existante. À exécuter une seule fois.

ALTER TABLE session_items ADD COLUMN follow_up_question TEXT;
ALTER TABLE session_items ADD COLUMN follow_up_answer TEXT;
ALTER TABLE session_items ADD COLUMN follow_up_feedback TEXT;
