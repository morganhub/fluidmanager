-- =============================================================================
-- FluidManager Schema Update 1
-- Ajouts pour l'interface React (project_react_interface.md)
-- Date: 2026-01-29
-- =============================================================================

-- Ce fichier contient les modifications de schéma nécessaires pour supporter
-- l'interface React décrite dans project_react_interface.md.

-- -----------------------------------------------------------------------------
-- 0) Fonction update_timestamp (si elle n'existe pas déjà)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- 1) Ajout de colonnes locale pour le multilingue (section 11)
-- -----------------------------------------------------------------------------

-- Langue par défaut de l'entreprise (déjà présente dans companies.locale)

-- Langue principale d'un agent
ALTER TABLE agents 
ADD COLUMN IF NOT EXISTS locale TEXT DEFAULT 'fr-FR';

-- Langue de travail d'un projet
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS locale TEXT DEFAULT 'fr-FR';

-- Langue d'une réunion
ALTER TABLE meetings 
ADD COLUMN IF NOT EXISTS locale TEXT DEFAULT 'fr-FR';

-- -----------------------------------------------------------------------------
-- 2) Ajout du job_type sur les tâches (section 6)
-- -----------------------------------------------------------------------------

-- Le job_type est déjà stocké dans runtime_json, mais pour le board on l'expose
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS job_type TEXT;

-- Index pour filtrer par job_type
CREATE INDEX IF NOT EXISTS idx_tasks_job_type ON tasks(job_type);

-- -----------------------------------------------------------------------------
-- 3) Statut 'draft' pour les tâches (section 6.3)
-- -----------------------------------------------------------------------------

-- Ajouter 'draft' au type enum task_status
-- Note: PostgreSQL ne permet pas d'ajouter facilement une valeur à un ENUM existant
-- On utilise ALTER TYPE ... ADD VALUE
DO $$ 
BEGIN
    ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'draft' BEFORE 'queued';
EXCEPTION WHEN duplicate_object THEN
    NULL;  -- La valeur existe déjà
END $$;

-- -----------------------------------------------------------------------------
-- 4) Champ needs_review pour les tâches (section 6.1)
-- -----------------------------------------------------------------------------

ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT FALSE;

-- -----------------------------------------------------------------------------
-- 5) Configuration auto-hiring (section 4.3)
-- -----------------------------------------------------------------------------

-- Ajouter les paramètres d'auto-hiring dans company_settings
-- Ces valeurs seront stockées via l'API existante company_settings
-- Clés attendues:
--   - hiring.auto_enabled (boolean)
--   - hiring.allowed_roles (array)  
--   - hiring.max_agents (integer)

-- Historique des embauches
CREATE TABLE IF NOT EXISTS hiring_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    hired_by_user_id UUID REFERENCES users(id),
    hired_by_agent_id UUID REFERENCES agents(id),
    reason TEXT,
    source TEXT DEFAULT 'manual',  -- manual, auto_hire, meeting_suggestion
    meeting_id UUID REFERENCES meetings(id),
    metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hiring_history_company ON hiring_history(company_id);
CREATE INDEX IF NOT EXISTS idx_hiring_history_agent ON hiring_history(agent_id);

-- -----------------------------------------------------------------------------
-- 6) Fichiers d'entrée pour les tâches (section 6.2)
-- -----------------------------------------------------------------------------

-- Lien entre tâches et artifacts en entrée
CREATE TABLE IF NOT EXISTS task_input_files (
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    artifact_id UUID NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    PRIMARY KEY (company_id, task_id, artifact_id)
);

-- -----------------------------------------------------------------------------
-- 7) Templates de payload par job_type (section 13)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS job_type_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,  -- NULL = global
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    job_type TEXT NOT NULL,
    payload_schema JSONB DEFAULT '{}'::jsonb NOT NULL,  -- JSON Schema
    default_payload JSONB DEFAULT '{}'::jsonb NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_job_type_templates_code 
ON job_type_templates(COALESCE(company_id, '00000000-0000-0000-0000-000000000000'), code);

-- -----------------------------------------------------------------------------
-- 8) Conversations 1:1 avec un agent (section 9.1)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    title TEXT,
    status TEXT DEFAULT 'active',  -- active, archived
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS conversation_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_type TEXT NOT NULL,  -- user, agent
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversations_company_user ON conversations(company_id, user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_conv ON conversation_messages(conversation_id);

-- -----------------------------------------------------------------------------
-- 9) TTL pour partage externe de preview (section 8.3)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS share_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    artifact_id UUID REFERENCES artifacts(id) ON DELETE SET NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    access_count INTEGER DEFAULT 0,
    max_access INTEGER,  -- NULL = illimité
    created_by_user_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_share_links_token ON share_links(token);
CREATE INDEX IF NOT EXISTS idx_share_links_expires ON share_links(expires_at);

-- -----------------------------------------------------------------------------
-- 10) Trigger pour updated_at sur les nouvelles tables
-- -----------------------------------------------------------------------------

CREATE TRIGGER trg_update_conversations_timestamp
    BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- =============================================================================
-- FIN DU FICHIER fluidmanager_schema_1.sql
-- =============================================================================
