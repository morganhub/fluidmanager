-- =============================================================================
-- FluidManager Schema Migration v5: Organization Chart & Employee System
-- =============================================================================

-- Position Level Enum
DO $$ BEGIN
    CREATE TYPE public.position_level AS ENUM ('MANAGER', 'N', 'N-1', 'N-2');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- =============================================================================
-- Organization Positions (slots in the org chart)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.org_positions (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    level public.position_level NOT NULL,
    position_index int NOT NULL DEFAULT 0,  -- Order within level (0-7 for N-1, 0-3 for N-2 per parent)
    parent_position_id uuid REFERENCES public.org_positions(id) ON DELETE CASCADE,  -- N-2 → N-1 link
    created_at timestamptz DEFAULT now() NOT NULL,
    
    -- Manager and N have no parent, N-1/N-2 constraints handled in app
    CONSTRAINT org_positions_unique UNIQUE (company_id, level, position_index, parent_position_id),
    CONSTRAINT org_positions_index_check CHECK (
        (level = 'MANAGER' AND position_index = 0) OR
        (level = 'N' AND position_index = 0) OR
        (level = 'N-1' AND position_index >= 0 AND position_index < 8) OR
        (level = 'N-2' AND position_index >= 0 AND position_index < 4)
    )
);

ALTER TABLE public.org_positions OWNER TO fluidmanager;

-- Partial unique index: only one MANAGER per company
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_positions_manager_unique 
    ON public.org_positions(company_id) WHERE level = 'MANAGER';

-- Partial unique index: only one N per company
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_positions_n_unique 
    ON public.org_positions(company_id) WHERE level = 'N';

CREATE INDEX IF NOT EXISTS idx_org_positions_company ON public.org_positions(company_id);
CREATE INDEX IF NOT EXISTS idx_org_positions_parent ON public.org_positions(parent_position_id);

-- =============================================================================
-- Company Employees (blueprint instances with customizations)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.company_employees (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    blueprint_id uuid REFERENCES public.blueprints(id) ON DELETE SET NULL,  -- NULL for Manager (human)
    position_id uuid NOT NULL REFERENCES public.org_positions(id) ON DELETE CASCADE,
    
    -- Customizable fields (copied from blueprint defaults, then editable)
    first_name text NOT NULL,
    last_name text NOT NULL,
    bio jsonb DEFAULT '{"fr": "", "en": ""}' NOT NULL,  -- LocalizedText
    portrait_id uuid REFERENCES public.portrait_library(id) ON DELETE SET NULL,
    skills text[] DEFAULT '{}' NOT NULL,
    
    -- Manager-specific fields (for human manager profile)
    email text,
    phone text,
    
    is_active boolean DEFAULT true NOT NULL,
    is_removable boolean DEFAULT true NOT NULL,  -- False for Manager position
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    
    CONSTRAINT company_employees_position_unique UNIQUE (position_id)
);

ALTER TABLE public.company_employees OWNER TO fluidmanager;

CREATE INDEX IF NOT EXISTS idx_company_employees_company ON public.company_employees(company_id);
CREATE INDEX IF NOT EXISTS idx_company_employees_blueprint ON public.company_employees(blueprint_id);
CREATE INDEX IF NOT EXISTS idx_company_employees_position ON public.company_employees(position_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_company_employees_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_company_employees_updated_at ON public.company_employees;
CREATE TRIGGER trg_company_employees_updated_at
    BEFORE UPDATE ON public.company_employees
    FOR EACH ROW
    EXECUTE FUNCTION update_company_employees_updated_at();

-- =============================================================================
-- Function: Initialize default org positions for a new company
-- Creates: 1 Manager, 1 N, 3 N-1, 9 N-2 (3 per N-1)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.init_company_org_chart(p_company_id uuid)
RETURNS void AS $$
DECLARE
    manager_pos_id uuid;
    n_pos_id uuid;
    n1_pos_ids uuid[];
    n1_id uuid;
    i int;
    j int;
BEGIN
    -- Create Manager position
    INSERT INTO public.org_positions (company_id, level, position_index)
    VALUES (p_company_id, 'MANAGER', 0)
    RETURNING id INTO manager_pos_id;
    
    -- Create N (Co-President) position
    INSERT INTO public.org_positions (company_id, level, position_index)
    VALUES (p_company_id, 'N', 0)
    RETURNING id INTO n_pos_id;
    
    -- Create 3 N-1 positions
    FOR i IN 0..2 LOOP
        INSERT INTO public.org_positions (company_id, level, position_index, parent_position_id)
        VALUES (p_company_id, 'N-1', i, n_pos_id)
        RETURNING id INTO n1_id;
        
        n1_pos_ids := array_append(n1_pos_ids, n1_id);
    END LOOP;
    
    -- Create 3 N-2 positions per N-1 (9 total)
    FOR i IN 0..2 LOOP
        FOR j IN 0..2 LOOP
            INSERT INTO public.org_positions (company_id, level, position_index, parent_position_id)
            VALUES (p_company_id, 'N-2', j, n1_pos_ids[i + 1]);
        END LOOP;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Function: Create manager employee for company
-- Called after company creation with admin user info
-- =============================================================================
CREATE OR REPLACE FUNCTION public.create_company_manager(
    p_company_id uuid,
    p_first_name text,
    p_last_name text,
    p_email text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
    manager_pos_id uuid;
    employee_id uuid;
BEGIN
    -- Get manager position
    SELECT id INTO manager_pos_id
    FROM public.org_positions
    WHERE company_id = p_company_id AND level = 'MANAGER';
    
    IF manager_pos_id IS NULL THEN
        RAISE EXCEPTION 'Manager position not found for company %', p_company_id;
    END IF;
    
    -- Create manager employee (non-removable)
    INSERT INTO public.company_employees (
        company_id, blueprint_id, position_id,
        first_name, last_name, email,
        is_removable
    ) VALUES (
        p_company_id, NULL, manager_pos_id,
        p_first_name, p_last_name, p_email,
        false
    )
    RETURNING id INTO employee_id;
    
    RETURN employee_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Grants
-- =============================================================================
GRANT ALL ON public.org_positions TO fluidmanager;
GRANT ALL ON public.company_employees TO fluidmanager;
GRANT EXECUTE ON FUNCTION public.init_company_org_chart(uuid) TO fluidmanager;
GRANT EXECUTE ON FUNCTION public.create_company_manager(uuid, text, text, text) TO fluidmanager;
