-- =============================================================================
-- FluidManager Schema Migration v4: Multilingual Blueprint Fields
-- =============================================================================
-- This migration converts text fields to JSONB for multilingual support
-- Format: {"fr": "Texte en français", "en": "Text in English"}
-- =============================================================================

-- Step 1: Add new JSONB columns with temporary names
ALTER TABLE public.blueprints 
    ADD COLUMN IF NOT EXISTS role_i18n jsonb DEFAULT '{}' NOT NULL,
    ADD COLUMN IF NOT EXISTS default_bio_i18n jsonb DEFAULT '{}' NOT NULL,
    ADD COLUMN IF NOT EXISTS system_prompt_i18n jsonb DEFAULT '{}' NOT NULL;

-- Step 2: Migrate existing data (use French as default language)
UPDATE public.blueprints 
SET 
    role_i18n = jsonb_build_object('fr', role),
    default_bio_i18n = jsonb_build_object('fr', COALESCE(default_bio, '')),
    system_prompt_i18n = jsonb_build_object('fr', COALESCE(system_prompt, ''))
WHERE role_i18n = '{}';

-- Step 3: Drop old columns and rename new ones
ALTER TABLE public.blueprints DROP COLUMN IF EXISTS role;
ALTER TABLE public.blueprints DROP COLUMN IF EXISTS default_bio;
ALTER TABLE public.blueprints DROP COLUMN IF EXISTS system_prompt;

ALTER TABLE public.blueprints RENAME COLUMN role_i18n TO role;
ALTER TABLE public.blueprints RENAME COLUMN default_bio_i18n TO default_bio;
ALTER TABLE public.blueprints RENAME COLUMN system_prompt_i18n TO system_prompt;

-- Step 4: Add helper functions for accessing translations

-- Function to get a translated value with fallback
CREATE OR REPLACE FUNCTION get_translation(
    data jsonb,
    locale text,
    fallback_locale text DEFAULT 'fr'
) RETURNS text AS $$
BEGIN
    -- Try requested locale first
    IF data ? locale AND data->>locale IS NOT NULL AND data->>locale <> '' THEN
        RETURN data->>locale;
    END IF;
    
    -- Fallback to default locale
    IF data ? fallback_locale THEN
        RETURN data->>fallback_locale;
    END IF;
    
    -- Return first available value or empty string
    RETURN COALESCE((SELECT value FROM jsonb_each_text(data) LIMIT 1), '');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Grant permissions
GRANT ALL ON public.blueprints TO fluidmanager;
