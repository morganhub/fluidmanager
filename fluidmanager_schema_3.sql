-- =============================================================================
-- FluidManager Schema Migration v3: Blueprint System
-- =============================================================================

-- Portrait Library (uploaded images for employee portraits)
CREATE TABLE IF NOT EXISTS public.portrait_library (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    filename text NOT NULL,
    uri text NOT NULL,
    uploaded_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.portrait_library OWNER TO fluidmanager;

-- Blueprint Level Enum
DO $$ BEGIN
    CREATE TYPE public.blueprint_level AS ENUM ('N', 'N-1', 'N-2');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Blueprints (employee templates managed by superadmin)
CREATE TABLE IF NOT EXISTS public.blueprints (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    code text NOT NULL UNIQUE,
    role text NOT NULL,
    level public.blueprint_level NOT NULL DEFAULT 'N-2',
    default_first_name text NOT NULL DEFAULT '',
    default_last_name text NOT NULL DEFAULT '',
    default_bio text DEFAULT '',
    default_portrait_id uuid REFERENCES public.portrait_library(id) ON DELETE SET NULL,
    skills text[] DEFAULT '{}' NOT NULL,
    system_prompt text DEFAULT '' NOT NULL,
    webhooks jsonb DEFAULT '{"review": null, "meeting": null, "task": null}' NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.blueprints OWNER TO fluidmanager;

-- Blueprint hierarchical relations (which N-1 manages which N-2 blueprints)
CREATE TABLE IF NOT EXISTS public.blueprint_relations (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    parent_blueprint_id uuid NOT NULL REFERENCES public.blueprints(id) ON DELETE CASCADE,
    child_blueprint_id uuid NOT NULL REFERENCES public.blueprints(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT blueprint_relations_unique UNIQUE (parent_blueprint_id, child_blueprint_id),
    CONSTRAINT blueprint_relations_no_self CHECK (parent_blueprint_id <> child_blueprint_id)
);

ALTER TABLE public.blueprint_relations OWNER TO fluidmanager;

-- Add blueprint reference to agents table
ALTER TABLE public.agents 
    ADD COLUMN IF NOT EXISTS blueprint_id uuid REFERENCES public.blueprints(id) ON DELETE SET NULL;

ALTER TABLE public.agents 
    ADD COLUMN IF NOT EXISTS portrait_id uuid REFERENCES public.portrait_library(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_blueprints_code ON public.blueprints(code);
CREATE INDEX IF NOT EXISTS idx_blueprints_level ON public.blueprints(level);
CREATE INDEX IF NOT EXISTS idx_blueprints_is_active ON public.blueprints(is_active);
CREATE INDEX IF NOT EXISTS idx_agents_blueprint_id ON public.agents(blueprint_id);
CREATE INDEX IF NOT EXISTS idx_portrait_library_uploaded_by ON public.portrait_library(uploaded_by);

-- Updated_at trigger for blueprints
CREATE OR REPLACE FUNCTION update_blueprints_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_blueprints_updated_at ON public.blueprints;
CREATE TRIGGER trg_blueprints_updated_at
    BEFORE UPDATE ON public.blueprints
    FOR EACH ROW
    EXECUTE FUNCTION update_blueprints_updated_at();

-- Grant permissions
GRANT ALL ON public.blueprints TO fluidmanager;
GRANT ALL ON public.blueprint_relations TO fluidmanager;
GRANT ALL ON public.portrait_library TO fluidmanager;
