-- FluidManager Schema Migration 2
-- Admin Users & Password Reset System
-- Date: 2026-01-30

-- =============================================================================
-- 1. Create admin_role enum type
-- =============================================================================
DO $$ BEGIN
    CREATE TYPE public.admin_role AS ENUM ('superadmin', 'manager');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =============================================================================
-- 2. Create admin_users table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.admin_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email public.citext UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    role admin_role NOT NULL DEFAULT 'manager',
    organization TEXT,  -- Société de l'utilisateur
    valid_until TIMESTAMPTZ,  -- Date limite de validité (null = illimité)
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.admin_users IS 'Utilisateurs admin du système (superadmin / manager)';
COMMENT ON COLUMN public.admin_users.valid_until IS 'Date limite de validité du compte (null = illimité)';
COMMENT ON COLUMN public.admin_users.organization IS 'Société/organisation de l''utilisateur';

-- =============================================================================
-- 3. Create admin_user_companies junction table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.admin_user_companies (
    admin_user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    PRIMARY KEY (admin_user_id, company_id)
);

COMMENT ON TABLE public.admin_user_companies IS 'Association des utilisateurs admin aux entreprises qu''ils peuvent gérer';

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_admin_user_companies_user ON admin_user_companies(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_user_companies_company ON admin_user_companies(company_id);

-- =============================================================================
-- 4. Create password_reset_tokens table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    admin_user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.password_reset_tokens IS 'Tokens de réinitialisation de mot de passe';

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(admin_user_id);

-- =============================================================================
-- 5. Insert initial superadmin user
-- Email: morgan@fluidifia.com
-- Password: changeme
-- Hash bcrypt (12 rounds) of 'changeme'
-- =============================================================================
INSERT INTO admin_users (email, password_hash, first_name, last_name, role)
VALUES (
    'morgan@fluidifia.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.qbO0fR4GH6n5Nm',
    'Morgan',
    'Admin',
    'superadmin'
)
ON CONFLICT (email) DO NOTHING;

-- =============================================================================
-- 6. Grant permissions (if needed)
-- =============================================================================
ALTER TABLE public.admin_users OWNER TO fluidmanager;
ALTER TABLE public.admin_user_companies OWNER TO fluidmanager;
ALTER TABLE public.password_reset_tokens OWNER TO fluidmanager;
