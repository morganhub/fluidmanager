--
-- PostgreSQL database dump
--

\restrict BkhQX9kgw7Fle60UkMZPHbEzfPimEzWl5I7TF4k2iHlA75m4RGnifTRLHav9irb

-- Dumped from database version 16.11 (Debian 16.11-1.pgdg12+1)
-- Dumped by pg_dump version 16.11 (Debian 16.11-1.pgdg12+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: citext; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;


--
-- Name: EXTENSION citext; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION citext IS 'data type for case-insensitive character strings';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- Name: EXTENSION vector; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION vector IS 'vector data type and ivfflat and hnsw access methods';


--
-- Name: agent_level; Type: TYPE; Schema: public; Owner: fluidmanager
--

CREATE TYPE public.agent_level AS ENUM (
    'N',
    'N-1',
    'N-2',
    'N-3',
    'N-4',
    'N-5',
    'OTHER'
);


ALTER TYPE public.agent_level OWNER TO fluidmanager;

--
-- Name: approval_status; Type: TYPE; Schema: public; Owner: fluidmanager
--

CREATE TYPE public.approval_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'canceled'
);


ALTER TYPE public.approval_status OWNER TO fluidmanager;

--
-- Name: task_priority; Type: TYPE; Schema: public; Owner: fluidmanager
--

CREATE TYPE public.task_priority AS ENUM (
    'low',
    'normal',
    'high',
    'urgent'
);


ALTER TYPE public.task_priority OWNER TO fluidmanager;

--
-- Name: task_status; Type: TYPE; Schema: public; Owner: fluidmanager
--

CREATE TYPE public.task_status AS ENUM (
    'queued',
    'running',
    'paused',
    'blocked',
    'needs_approval',
    'failed',
    'canceled',
    'done'
);


ALTER TYPE public.task_status OWNER TO fluidmanager;

--
-- Name: tool_type; Type: TYPE; Schema: public; Owner: fluidmanager
--

CREATE TYPE public.tool_type AS ENUM (
    'rag',
    'sql',
    'web',
    'file',
    'email',
    'calendar',
    'http',
    'code'
);


ALTER TYPE public.tool_type OWNER TO fluidmanager;

--
-- Name: trg_tasks_status_unblock(); Type: FUNCTION; Schema: public; Owner: fluidmanager
--

CREATE FUNCTION public.trg_tasks_status_unblock() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- On ne réagit que si le status change vers un status terminal
  IF TG_OP = 'UPDATE'
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('done','failed','canceled')
  THEN
    PERFORM try_unblock_waiters(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION public.trg_tasks_status_unblock() OWNER TO fluidmanager;

--
-- Name: try_unblock_waiters(uuid); Type: FUNCTION; Schema: public; Owner: fluidmanager
--

CREATE FUNCTION public.try_unblock_waiters(dependee uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  w uuid;
  remaining int;
BEGIN
  FOR w IN
    SELECT waiter_task_id
    FROM task_dependencies
    WHERE dependee_task_id = dependee
  LOOP
    SELECT count(*)
      INTO remaining
    FROM task_dependencies d
    JOIN tasks t ON t.id = d.dependee_task_id
    WHERE d.waiter_task_id = w
      AND t.status NOT IN ('done','failed','canceled');

    IF remaining = 0 THEN
      UPDATE tasks
      SET status = 'queued'
      WHERE id = w
        AND status = 'blocked';
    END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION public.try_unblock_waiters(dependee uuid) OWNER TO fluidmanager;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: agent_capabilities; Type: TABLE; Schema: public; Owner: fluidmanager
--

CREATE TABLE public.agent_capabilities (
    company_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    capability_id uuid NOT NULL,
    level integer DEFAULT 1 NOT NULL,
    notes text
);


ALTER TABLE public.agent_capabilities OWNER TO fluidmanager;

--
-- Name: agent_integration_access; Type: TABLE; Schema: public; Owner: fluidmanager
--

CREATE TABLE public.agent_integration_access (
    company_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    integration_id uuid NOT NULL,
    permission text NOT NULL,
    scopes_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    quotas_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.agent_integration_access OWNER TO fluidmanager;

--
-- Name: agents; Type: TABLE; Schema: public; Owner: fluidmanager
--

CREATE TABLE public.agents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    slug text NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    title text,
    department text,
    level public.agent_level DEFAULT 'OTHER'::public.agent_level NOT NULL,
    seniority_years integer,
    avatar_url text,
    profile_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    system_prompt text DEFAULT ''::text NOT NULL,
    guardrails jsonb DEFAULT '{}'::jsonb NOT NULL,
    llm_prefs jsonb DEFAULT '{}'::jsonb NOT NULL,
    budget_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.agents OWNER TO fluidmanager;

--
-- Name: approvals; Type: TABLE; Schema: public; Owner: fluidmanager
--

CREATE TABLE public.approvals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    task_id uuid,
    requested_by_agent_id uuid,
    requested_by_user_id uuid,
    status public.approval_status DEFAULT 'pending'::public.approval_status NOT NULL,
    reason text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    decided_by_user_id uuid,
    decided_at timestamp with time zone,
    decision_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.approvals OWNER TO fluidmanager;

--
-- Name: artifacts; Type: TABLE; Schema: public; Owner: fluidmanager
--

CREATE TABLE public.artifacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    task_id uuid,
    project_id uuid,
    created_by_agent_id uuid,
    created_by_user_id uuid,
    type text NOT NULL,
    title text,
    uri text,
    mime_type text,
    size_bytes bigint,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.artifacts OWNER TO fluidmanager;

--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: fluidmanager
--

CREATE TABLE public.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    event_type text NOT NULL,
    actor_type text NOT NULL,
    actor_user_id uuid,
    actor_agent_id uuid,
    entity_type text,
    entity_id uuid,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.audit_log OWNER TO fluidmanager;

--
-- Name: capabilities; Type: TABLE; Schema: public; Owner: fluidmanager
--

CREATE TABLE public.capabilities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL
);


ALTER TABLE public.capabilities OWNER TO fluidmanager;

--
-- Name: chunks; Type: TABLE; Schema: public; Owner: fluidmanager
--

CREATE TABLE public.chunks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    document_id uuid NOT NULL,
    chunk_index integer NOT NULL,
    content text NOT NULL,
    embedding public.vector(1536),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.chunks OWNER TO fluidmanager;

--
-- Name: companies; Type: TABLE; Schema: public; Owner: fluidmanager
--

CREATE TABLE public.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    legal_name text,
    tagline text,
    description_short text,
    description_long text,
    website_url text,
    logo_uri text,
    brand_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    country_code text DEFAULT 'FR'::text NOT NULL,
    siret text,
    siren text,
    vat_number text,
    legal_address_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    locale text DEFAULT 'fr-FR'::text NOT NULL,
    timezone text DEFAULT 'Europe/Paris'::text NOT NULL,
    currency text DEFAULT 'EUR'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.companies OWNER TO fluidmanager;

--
-- Name: company_settings; Type: TABLE; Schema: public; Owner: fluidmanager
--

CREATE TABLE public.company_settings (
    company_id uuid NOT NULL,
    key text NOT NULL,
    value_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by_user_id uuid
);


ALTER TABLE public.company_settings OWNER TO fluidmanager;

--
-- Name: documents; Type: TABLE; Schema: public; Owner: fluidmanager
--

CREATE TABLE public.documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    space_id uuid NOT NULL,
    title text NOT NULL,
    source_type text NOT NULL,
    source_uri text,
    mime_type text,
    hash_sha256 text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.documents OWNER TO fluidmanager;

--
-- Name: feature_flags; Type: TABLE; Schema: public; Owner: fluidmanager
--

CREATE TABLE public.feature_flags (
    company_id uuid NOT NULL,
    key text NOT NULL,
    is_enabled boolean DEFAULT false NOT NULL,
    rules_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by_user_id uuid
);


ALTER TABLE public.feature_flags OWNER TO fluidmanager;

--
-- Name: integration_providers; Type: TABLE; Schema: public; Owner: fluidmanager
--

CREATE TABLE public.integration_providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    capabilities jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.integration_providers OWNER TO fluidmanager;

--
-- Name: integration_secrets; Type: TABLE; Schema: public; Owner: fluidmanager
--

CREATE TABLE public.integration_secrets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    integration_id uuid NOT NULL,
    secret_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.integration_secrets OWNER TO fluidmanager;

--
-- Name: integrations; Type: TABLE; Schema: public; Owner: fluidmanager
--

CREATE TABLE public.integrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    provider_id uuid NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    config_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    secrets_ref text,
    scopes_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    quotas_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.integrations OWNER TO fluidmanager;

--
-- Name: knowledge_space_acl; Type: TABLE; Schema: public; Owner: fluidmanager
--

CREATE TABLE public.knowledge_space_acl (
    company_id uuid NOT NULL,
    space_id uuid NOT NULL,
    principal_type text NOT NULL,
    principal_id uuid NOT NULL,
    permission text NOT NULL
);


ALTER TABLE public.knowledge_space_acl OWNER TO fluidmanager;

--
-- Name: knowledge_spaces; Type: TABLE; Schema: public; Owner: fluidmanager
--

CREATE TABLE public.knowledge_spaces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    scope text NOT NULL,
    owner_agent_id uuid,
    project_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.knowledge_spaces OWNER TO fluidmanager;

--
-- Name: meeting_media; Type: TABLE; Schema: public; Owner: fluidmanager
--

CREATE TABLE public.meeting_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    meeting_id uuid NOT NULL,
    type text NOT NULL,
    uri text NOT NULL,
    mime_type text,
    size_bytes bigint,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.meeting_media OWNER TO fluidmanager;

--
-- Name: meeting_messages; Type: TABLE; Schema: public; Owner: fluidmanager
--

CREATE TABLE public.meeting_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    meeting_id uuid NOT NULL,
    agent_id uuid,
    user_id uuid,
    sender_type text NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);


ALTER TABLE public.meeting_messages OWNER TO fluidmanager;

--
-- Name: meeting_participants; Type: TABLE; Schema: public; Owner: fluidmanager
--

CREATE TABLE public.meeting_participants (
    company_id uuid NOT NULL,
    meeting_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    role_in_meeting text DEFAULT 'participant'::text NOT NULL
);


ALTER TABLE public.meeting_participants OWNER TO fluidmanager;

--
-- Name: meetings; Type: TABLE; Schema: public; Owner: fluidmanager
--

CREATE TABLE public.meetings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    project_id uuid,
    title text NOT NULL,
    agenda text,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    summary text,
    decisions_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    cta_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);


ALTER TABLE public.meetings OWNER TO fluidmanager;

--
-- Name: objectives; Type: TABLE; Schema: public; Owner: fluidmanager
--

CREATE TABLE public.objectives (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    project_id uuid,
    title text NOT NULL,
    description text,
    status text DEFAULT 'open'::text NOT NULL,
    owner_agent_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.objectives OWNER TO fluidmanager;

--
-- Name: org_edges; Type: TABLE; Schema: public; Owner: fluidmanager
--

CREATE TABLE public.org_edges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    manager_agent_id uuid NOT NULL,
    subordinate_agent_id uuid NOT NULL,
    constraints_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    effective_from timestamp with time zone DEFAULT now() NOT NULL,
    effective_to timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_edges_no_self CHECK ((manager_agent_id <> subordinate_agent_id))
);


ALTER TABLE public.org_edges OWNER TO fluidmanager;

--
-- Name: projects; Type: TABLE; Schema: public; Owner: fluidmanager
--

CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    status text DEFAULT 'active'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.projects OWNER TO fluidmanager;

--
-- Name: rag_citations; Type: TABLE; Schema: public; Owner: fluidmanager
--

CREATE TABLE public.rag_citations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    task_id uuid,
    meeting_id uuid,
    agent_id uuid,
    chunk_id uuid NOT NULL,
    score double precision,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);


ALTER TABLE public.rag_citations OWNER TO fluidmanager;

--
-- Name: roles; Type: TABLE; Schema: public; Owner: fluidmanager
--

CREATE TABLE public.roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.roles OWNER TO fluidmanager;

--
-- Name: sql_access_policies; Type: TABLE; Schema: public; Owner: fluidmanager
--

CREATE TABLE public.sql_access_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    data_source_id uuid NOT NULL,
    principal_type text NOT NULL,
    principal_id uuid NOT NULL,
    mode text DEFAULT 'read_only'::text NOT NULL,
    allowlist_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.sql_access_policies OWNER TO fluidmanager;

--
-- Name: sql_data_sources; Type: TABLE; Schema: public; Owner: fluidmanager
--

CREATE TABLE public.sql_data_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    db_type text NOT NULL,
    connection_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    secrets_ref text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.sql_data_sources OWNER TO fluidmanager;

--
-- Name: task_dependencies; Type: TABLE; Schema: public; Owner: fluidmanager
--

CREATE TABLE public.task_dependencies (
    company_id uuid NOT NULL,
    task_id uuid NOT NULL,
    depends_on_task_id uuid NOT NULL,
    waiter_task_id uuid,
    dependee_task_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT task_dep_no_self CHECK ((task_id <> depends_on_task_id))
);


ALTER TABLE public.task_dependencies OWNER TO fluidmanager;

--
-- Name: task_events; Type: TABLE; Schema: public; Owner: fluidmanager
--

CREATE TABLE public.task_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    task_id uuid NOT NULL,
    event_type text NOT NULL,
    actor_type text NOT NULL,
    actor_user_id uuid,
    actor_agent_id uuid,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.task_events OWNER TO fluidmanager;

--
-- Name: tasks; Type: TABLE; Schema: public; Owner: fluidmanager
--

CREATE TABLE public.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    project_id uuid,
    objective_id uuid,
    title text NOT NULL,
    description text,
    status public.task_status DEFAULT 'queued'::public.task_status NOT NULL,
    priority public.task_priority DEFAULT 'normal'::public.task_priority NOT NULL,
    created_by_user_id uuid,
    created_by_agent_id uuid,
    assigned_to_agent_id uuid,
    parent_task_id uuid,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    scheduled_at timestamp with time zone,
    deadline_at timestamp with time zone,
    attempt_count integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    should_stop boolean DEFAULT false NOT NULL,
    last_heartbeat_at timestamp with time zone,
    token_usage_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    cost_estimate_usd numeric(12,4),
    duration_ms bigint,
    last_error text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    runtime_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    control_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    root_task_id uuid,
    integration_id uuid
);


ALTER TABLE public.tasks OWNER TO fluidmanager;

--
-- Name: tool_calls; Type: TABLE; Schema: public; Owner: fluidmanager
--

CREATE TABLE public.tool_calls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    task_id uuid,
    agent_id uuid,
    tool public.tool_type NOT NULL,
    request jsonb DEFAULT '{}'::jsonb NOT NULL,
    response_meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    success boolean DEFAULT true NOT NULL,
    error_text text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.tool_calls OWNER TO fluidmanager;

--
-- Name: transcriptions; Type: TABLE; Schema: public; Owner: fluidmanager
--

CREATE TABLE public.transcriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    meeting_id uuid NOT NULL,
    provider text NOT NULL,
    language text DEFAULT 'fr'::text NOT NULL,
    content text NOT NULL,
    segments_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);


ALTER TABLE public.transcriptions OWNER TO fluidmanager;

--
-- Name: usage_ledger; Type: TABLE; Schema: public; Owner: fluidmanager
--

CREATE TABLE public.usage_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    task_id uuid,
    meeting_id uuid,
    agent_id uuid,
    provider text,
    model text,
    prompt_tokens integer,
    completion_tokens integer,
    total_tokens integer,
    cost_usd numeric(12,4),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);


ALTER TABLE public.usage_ledger OWNER TO fluidmanager;

--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: fluidmanager
--

CREATE TABLE public.user_roles (
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role_id uuid NOT NULL
);


ALTER TABLE public.user_roles OWNER TO fluidmanager;

--
-- Name: users; Type: TABLE; Schema: public; Owner: fluidmanager
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    email public.citext NOT NULL,
    display_name text NOT NULL,
    password_hash text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.users OWNER TO fluidmanager;

--
-- Name: worklogs; Type: TABLE; Schema: public; Owner: fluidmanager
--

CREATE TABLE public.worklogs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    agent_id uuid,
    task_id uuid,
    project_id uuid,
    visibility text DEFAULT 'team'::text NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);


ALTER TABLE public.worklogs OWNER TO fluidmanager;

--
-- Data for Name: agent_capabilities; Type: TABLE DATA; Schema: public; Owner: fluidmanager
--

COPY public.agent_capabilities (company_id, agent_id, capability_id, level, notes) FROM stdin;
\.


--
-- Data for Name: agent_integration_access; Type: TABLE DATA; Schema: public; Owner: fluidmanager
--

COPY public.agent_integration_access (company_id, agent_id, integration_id, permission, scopes_json, quotas_json, created_at) FROM stdin;
\.


--
-- Data for Name: agents; Type: TABLE DATA; Schema: public; Owner: fluidmanager
--

COPY public.agents (id, company_id, slug, first_name, last_name, title, department, level, seniority_years, avatar_url, profile_json, system_prompt, guardrails, llm_prefs, budget_json, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: approvals; Type: TABLE DATA; Schema: public; Owner: fluidmanager
--

COPY public.approvals (id, company_id, task_id, requested_by_agent_id, requested_by_user_id, status, reason, payload, decided_by_user_id, decided_at, decision_note, created_at) FROM stdin;
\.


--
-- Data for Name: artifacts; Type: TABLE DATA; Schema: public; Owner: fluidmanager
--

COPY public.artifacts (id, company_id, task_id, project_id, created_by_agent_id, created_by_user_id, type, title, uri, mime_type, size_bytes, metadata, created_at) FROM stdin;
e8edfd89-6559-41f0-973d-7277dbbf6644	406d617d-1963-4c0e-8eeb-765b52710d01	\N	\N	\N	\N	link	Preview demo	https://preview.manager.fluidifia.com/fluidmanager-previews/company_demo/PRJ-DEMO/TASK-DEMO/	\N	\N	{"kind": "preview", "bucket": "fluidmanager-previews"}	2026-01-27 17:54:26.10839+00
e7389329-8cd2-445f-8e5c-68077c42d542	406d617d-1963-4c0e-8eeb-765b52710d01	\N	\N	\N	\N	link	Preview ZIP test 2	https://preview.manager.fluidifia.com/fluidmanager-previews/fluidmanager_main/PRJ-DEMO/TASK-DEMO/	\N	\N	{"kind": "preview", "state": "PENDING", "bucket": "fluidmanager-previews", "prefix": "fluidmanager_main/PRJ-DEMO/TASK-DEMO", "celery_task_id": "455de444-6179-4dcd-b6aa-56733ccb6a31"}	2026-01-27 21:31:03.372484+00
dcbda623-2219-47de-b267-05a8316cd67c	406d617d-1963-4c0e-8eeb-765b52710d01	\N	\N	\N	\N	link	Preview ZIP robust v2	https://preview.manager.fluidifia.com/fluidmanager-previews/fluidmanager_main/PRJ-DEMO/TASK-DEMO-4/	\N	\N	{"kind": "preview", "state": "SUCCESS", "bucket": "fluidmanager-previews", "prefix": "fluidmanager_main/PRJ-DEMO/TASK-DEMO-4", "uploaded": 2, "started_at": "2026-01-27T21:51:04.092579+00:00", "finished_at": "2026-01-27T21:51:04.128655+00:00", "celery_task_id": "39a0263f-7eb5-48c8-90bf-e396e87023b3"}	2026-01-27 21:51:03.927108+00
3fff28b2-8c0a-4149-976b-3e2f720b889a	406d617d-1963-4c0e-8eeb-765b52710d01	\N	\N	\N	\N	link	Preview MIME test	https://preview.manager.fluidifia.com/fluidmanager-previews/fluidmanager_main/PRJ-DEMO/TASK-DEMO-MIME/	\N	\N	{"kind": "preview", "state": "SUCCESS", "bucket": "fluidmanager-previews", "prefix": "fluidmanager_main/PRJ-DEMO/TASK-DEMO-MIME", "uploaded": 2, "started_at": "2026-01-27T22:02:51.633151+00:00", "finished_at": "2026-01-27T22:02:51.659087+00:00", "celery_task_id": "f8db3dbb-fe02-4b2c-b967-f79a7d1bcbff"}	2026-01-27 22:02:51.504955+00
\.


--
-- Data for Name: audit_log; Type: TABLE DATA; Schema: public; Owner: fluidmanager
--

COPY public.audit_log (id, company_id, event_type, actor_type, actor_user_id, actor_agent_id, entity_type, entity_id, payload, created_at) FROM stdin;
\.


--
-- Data for Name: capabilities; Type: TABLE DATA; Schema: public; Owner: fluidmanager
--

COPY public.capabilities (id, company_id, code, name) FROM stdin;
\.


--
-- Data for Name: chunks; Type: TABLE DATA; Schema: public; Owner: fluidmanager
--

COPY public.chunks (id, company_id, document_id, chunk_index, content, embedding, metadata, created_at) FROM stdin;
\.


--
-- Data for Name: companies; Type: TABLE DATA; Schema: public; Owner: fluidmanager
--

COPY public.companies (id, code, name, legal_name, tagline, description_short, description_long, website_url, logo_uri, brand_json, country_code, siret, siren, vat_number, legal_address_json, locale, timezone, currency, is_active, created_at, updated_at) FROM stdin;
406d617d-1963-4c0e-8eeb-765b52710d01	fluidmanager_main	fluidmanager	fluidmanager (Virtual Company)	Manage your virtual company	Virtual company cockpit for AI employees.	fluidmanager lets a CEO manage a hierarchical, multi-agent virtual company with meetings, tasks, knowledge, tools and full traceability.	https://manager.fluidifia.com	minio://fluidmanager-assets/logo.png	{"tone": "professional", "colors": ["#0B1220", "#FFFFFF"]}	FR	\N	\N	\N	{"city": "", "country": "FR", "postal_code": "", "address_line1": ""}	fr-FR	Europe/Paris	EUR	t	2026-01-27 16:53:06.438079+00	2026-01-27 17:53:58.71817+00
\.


--
-- Data for Name: company_settings; Type: TABLE DATA; Schema: public; Owner: fluidmanager
--

COPY public.company_settings (company_id, key, value_json, updated_at, updated_by_user_id) FROM stdin;
406d617d-1963-4c0e-8eeb-765b52710d01	llm.default_provider	{"value": "openai"}	2026-01-27 17:53:58.71817+00	ae640c2b-d52c-4e5f-842d-79a2ac8b2f3c
406d617d-1963-4c0e-8eeb-765b52710d01	llm.default_model	{"value": "(set-later)"}	2026-01-27 17:53:58.71817+00	ae640c2b-d52c-4e5f-842d-79a2ac8b2f3c
406d617d-1963-4c0e-8eeb-765b52710d01	security.web_browsing_default	{"value": false}	2026-01-27 17:53:58.71817+00	ae640c2b-d52c-4e5f-842d-79a2ac8b2f3c
406d617d-1963-4c0e-8eeb-765b52710d01	rag.embedding_dimension	{"value": 1536}	2026-01-27 17:53:58.71817+00	ae640c2b-d52c-4e5f-842d-79a2ac8b2f3c
406d617d-1963-4c0e-8eeb-765b52710d01	meetings.max_participants	{"value": 12}	2026-01-27 17:53:58.71817+00	ae640c2b-d52c-4e5f-842d-79a2ac8b2f3c
\.


--
-- Data for Name: documents; Type: TABLE DATA; Schema: public; Owner: fluidmanager
--

COPY public.documents (id, company_id, space_id, title, source_type, source_uri, mime_type, hash_sha256, metadata, created_at) FROM stdin;
\.


--
-- Data for Name: feature_flags; Type: TABLE DATA; Schema: public; Owner: fluidmanager
--

COPY public.feature_flags (company_id, key, is_enabled, rules_json, updated_at, updated_by_user_id) FROM stdin;
406d617d-1963-4c0e-8eeb-765b52710d01	features.tts	f	{"allowed_agents": []}	2026-01-27 17:53:58.71817+00	ae640c2b-d52c-4e5f-842d-79a2ac8b2f3c
406d617d-1963-4c0e-8eeb-765b52710d01	features.stt	f	{"allowed_agents": []}	2026-01-27 17:53:58.71817+00	ae640c2b-d52c-4e5f-842d-79a2ac8b2f3c
406d617d-1963-4c0e-8eeb-765b52710d01	features.web_browsing	f	{"allowlist_domains": []}	2026-01-27 17:53:58.71817+00	ae640c2b-d52c-4e5f-842d-79a2ac8b2f3c
\.


--
-- Data for Name: integration_providers; Type: TABLE DATA; Schema: public; Owner: fluidmanager
--

COPY public.integration_providers (id, code, name, category, capabilities, created_at) FROM stdin;
1fbc81a1-489f-4a71-a907-b2b460518678	openai	OpenAI	llm	{"llm": true, "embeddings": true}	2026-01-27 16:53:06.46447+00
5a3d9cc4-65ab-4a80-8c62-23bcc04fa71a	elevenlabs	ElevenLabs	tts	{"stt": true, "tts": true}	2026-01-27 16:53:06.46447+00
717b990c-a517-4b94-97ec-f886c3a4f748	smtp	SMTP	email	{"email_send": true}	2026-01-27 16:53:06.46447+00
00dcdeea-55f3-4b91-bc69-e30f35876be6	n8n	n8n	automation	{"callback": true, "trigger_webhook": true}	2026-01-28 14:52:38.892751+00
ca469ccf-7730-410d-9bd0-e6a412da4bc2	langflow	Langflow	automation	{"callback": true, "trigger_api": true}	2026-01-28 14:52:38.892751+00
0b72aab6-e39e-4d45-a8a1-3a04bd30e0eb	webhook	Webhook	automation	{"callback": true, "trigger_webhook": true}	2026-01-28 14:52:38.892751+00
\.


--
-- Data for Name: integration_secrets; Type: TABLE DATA; Schema: public; Owner: fluidmanager
--

COPY public.integration_secrets (id, integration_id, secret_json, created_at, updated_at) FROM stdin;
60be0c5e-1156-4100-a610-81bb3d7622ea	dc9eb13f-308a-4821-a1e4-14107aa6666d	{"callback_secret": "supersecret"}	2026-01-28 14:58:33.379892+00	2026-01-28 14:58:33.379892+00
\.


--
-- Data for Name: integrations; Type: TABLE DATA; Schema: public; Owner: fluidmanager
--

COPY public.integrations (id, company_id, provider_id, name, is_active, config_json, secrets_ref, scopes_json, quotas_json, created_at, updated_at) FROM stdin;
192c45bf-32fb-4804-9a39-6d11c8968fa3	406d617d-1963-4c0e-8eeb-765b52710d01	1fbc81a1-489f-4a71-a907-b2b460518678	OpenAI Main	t	{"base_url": null, "default_model": "(set-later)"}	env:OPENAI_API_KEY	{}	{"enabled": true}	2026-01-27 16:53:06.466063+00	2026-01-27 16:53:06.466063+00
19814590-3b79-4697-9fca-97f86ebb03b5	406d617d-1963-4c0e-8eeb-765b52710d01	5a3d9cc4-65ab-4a80-8c62-23bcc04fa71a	ElevenLabs Main	t	{"default_voice": "(set-later)"}	env:ELEVENLABS_API_KEY	{}	{"enabled": true}	2026-01-27 16:53:06.466063+00	2026-01-27 16:53:06.466063+00
d69546f2-37dc-4f8e-911c-15e5904c857f	406d617d-1963-4c0e-8eeb-765b52710d01	717b990c-a517-4b94-97ec-f886c3a4f748	SMTP Main	t	{"host": "(set-later)", "port": 587, "from_email": "(set-later)"}	env:SMTP_PASSWORD	{}	{"enabled": true}	2026-01-27 16:53:06.466063+00	2026-01-27 16:53:06.466063+00
05df0d5d-0521-4b8f-82ae-ec2b4027771f	406d617d-1963-4c0e-8eeb-765b52710d01	1fbc81a1-489f-4a71-a907-b2b460518678	OpenAI Main	t	{"base_url": null, "default_model": "(set-later)"}	env:OPENAI_API_KEY	{}	{"enabled": true}	2026-01-27 16:53:17.079916+00	2026-01-27 16:53:17.079916+00
8fa378c7-f7a1-442c-816e-7dd160146a77	406d617d-1963-4c0e-8eeb-765b52710d01	5a3d9cc4-65ab-4a80-8c62-23bcc04fa71a	ElevenLabs Main	t	{"default_voice": "(set-later)"}	env:ELEVENLABS_API_KEY	{}	{"enabled": true}	2026-01-27 16:53:17.079916+00	2026-01-27 16:53:17.079916+00
7f69b8c5-b92b-4bba-9570-0215463ce7fb	406d617d-1963-4c0e-8eeb-765b52710d01	717b990c-a517-4b94-97ec-f886c3a4f748	SMTP Main	t	{"host": "(set-later)", "port": 587, "from_email": "(set-later)"}	env:SMTP_PASSWORD	{}	{"enabled": true}	2026-01-27 16:53:17.079916+00	2026-01-27 16:53:17.079916+00
b136316a-84c9-45c4-b954-abcb27854160	406d617d-1963-4c0e-8eeb-765b52710d01	1fbc81a1-489f-4a71-a907-b2b460518678	OpenAI Main	t	{"base_url": null, "default_model": "(set-later)"}	env:OPENAI_API_KEY	{}	{"enabled": true}	2026-01-27 16:53:22.182576+00	2026-01-27 16:53:22.182576+00
be9ad8e7-0626-403e-b6cc-426e47447df4	406d617d-1963-4c0e-8eeb-765b52710d01	5a3d9cc4-65ab-4a80-8c62-23bcc04fa71a	ElevenLabs Main	t	{"default_voice": "(set-later)"}	env:ELEVENLABS_API_KEY	{}	{"enabled": true}	2026-01-27 16:53:22.182576+00	2026-01-27 16:53:22.182576+00
aa4f58ed-44c6-414a-abe2-82d4b88990d9	406d617d-1963-4c0e-8eeb-765b52710d01	717b990c-a517-4b94-97ec-f886c3a4f748	SMTP Main	t	{"host": "(set-later)", "port": 587, "from_email": "(set-later)"}	env:SMTP_PASSWORD	{}	{"enabled": true}	2026-01-27 16:53:22.182576+00	2026-01-27 16:53:22.182576+00
eb060072-bf19-449f-8c4f-4495d1145900	406d617d-1963-4c0e-8eeb-765b52710d01	1fbc81a1-489f-4a71-a907-b2b460518678	OpenAI Main	t	{"base_url": null, "default_model": "(set-later)"}	env:OPENAI_API_KEY	{}	{"enabled": true}	2026-01-27 16:53:34.885566+00	2026-01-27 16:53:34.885566+00
b08556d4-27bc-4a88-bcb3-a1d39e8b8828	406d617d-1963-4c0e-8eeb-765b52710d01	5a3d9cc4-65ab-4a80-8c62-23bcc04fa71a	ElevenLabs Main	t	{"default_voice": "(set-later)"}	env:ELEVENLABS_API_KEY	{}	{"enabled": true}	2026-01-27 16:53:34.885566+00	2026-01-27 16:53:34.885566+00
9a9131f9-47e1-4231-a763-a1b759b0672d	406d617d-1963-4c0e-8eeb-765b52710d01	717b990c-a517-4b94-97ec-f886c3a4f748	SMTP Main	t	{"host": "(set-later)", "port": 587, "from_email": "(set-later)"}	env:SMTP_PASSWORD	{}	{"enabled": true}	2026-01-27 16:53:34.885566+00	2026-01-27 16:53:34.885566+00
a8f5a3e2-c670-4698-976a-5bbabb6fca1c	406d617d-1963-4c0e-8eeb-765b52710d01	1fbc81a1-489f-4a71-a907-b2b460518678	OpenAI Main	t	{"base_url": null, "default_model": "(set-later)"}	env:OPENAI_API_KEY	{}	{"enabled": true}	2026-01-27 17:53:58.71817+00	2026-01-27 17:53:58.71817+00
70466c97-84eb-4d59-972b-9eba3427cb2a	406d617d-1963-4c0e-8eeb-765b52710d01	5a3d9cc4-65ab-4a80-8c62-23bcc04fa71a	ElevenLabs Main	t	{"default_voice": "(set-later)"}	env:ELEVENLABS_API_KEY	{}	{"enabled": true}	2026-01-27 17:53:58.71817+00	2026-01-27 17:53:58.71817+00
3f2f3228-f178-4b67-b0d4-8dd2fbcd6351	406d617d-1963-4c0e-8eeb-765b52710d01	717b990c-a517-4b94-97ec-f886c3a4f748	SMTP Main	t	{"host": "(set-later)", "port": 587, "from_email": "(set-later)"}	env:SMTP_PASSWORD	{}	{"enabled": true}	2026-01-27 17:53:58.71817+00	2026-01-27 17:53:58.71817+00
dc9eb13f-308a-4821-a1e4-14107aa6666d	406d617d-1963-4c0e-8eeb-765b52710d01	00dcdeea-55f3-4b91-bc69-e30f35876be6	n8n prod	t	{"base_url": "https://n8n.fluidifia.com/"}	60be0c5e-1156-4100-a610-81bb3d7622ea	{}	{}	2026-01-28 14:53:01.458474+00	2026-01-28 14:58:33.379892+00
\.


--
-- Data for Name: knowledge_space_acl; Type: TABLE DATA; Schema: public; Owner: fluidmanager
--

COPY public.knowledge_space_acl (company_id, space_id, principal_type, principal_id, permission) FROM stdin;
\.


--
-- Data for Name: knowledge_spaces; Type: TABLE DATA; Schema: public; Owner: fluidmanager
--

COPY public.knowledge_spaces (id, company_id, code, name, scope, owner_agent_id, project_id, metadata, created_at) FROM stdin;
\.


--
-- Data for Name: meeting_media; Type: TABLE DATA; Schema: public; Owner: fluidmanager
--

COPY public.meeting_media (id, company_id, meeting_id, type, uri, mime_type, size_bytes, metadata, created_at) FROM stdin;
\.


--
-- Data for Name: meeting_messages; Type: TABLE DATA; Schema: public; Owner: fluidmanager
--

COPY public.meeting_messages (id, company_id, meeting_id, agent_id, user_id, sender_type, content, created_at, metadata) FROM stdin;
\.


--
-- Data for Name: meeting_participants; Type: TABLE DATA; Schema: public; Owner: fluidmanager
--

COPY public.meeting_participants (company_id, meeting_id, agent_id, role_in_meeting) FROM stdin;
\.


--
-- Data for Name: meetings; Type: TABLE DATA; Schema: public; Owner: fluidmanager
--

COPY public.meetings (id, company_id, project_id, title, agenda, created_by_user_id, created_at, started_at, ended_at, summary, decisions_json, cta_json, metadata) FROM stdin;
\.


--
-- Data for Name: objectives; Type: TABLE DATA; Schema: public; Owner: fluidmanager
--

COPY public.objectives (id, company_id, project_id, title, description, status, owner_agent_id, metadata, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: org_edges; Type: TABLE DATA; Schema: public; Owner: fluidmanager
--

COPY public.org_edges (id, company_id, manager_agent_id, subordinate_agent_id, constraints_json, effective_from, effective_to, created_at) FROM stdin;
\.


--
-- Data for Name: projects; Type: TABLE DATA; Schema: public; Owner: fluidmanager
--

COPY public.projects (id, company_id, code, name, description, status, metadata, created_at, updated_at) FROM stdin;
7ef0eeba-3a94-4ffe-b981-93c727b4a2ae	406d617d-1963-4c0e-8eeb-765b52710d01	DEMO	Demo	\N	active	{}	2026-01-28 19:27:42.987344+00	2026-01-28 19:27:42.987344+00
\.


--
-- Data for Name: rag_citations; Type: TABLE DATA; Schema: public; Owner: fluidmanager
--

COPY public.rag_citations (id, company_id, task_id, meeting_id, agent_id, chunk_id, score, created_at, metadata) FROM stdin;
\.


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: fluidmanager
--

COPY public.roles (id, company_id, code, name, created_at) FROM stdin;
86d7bc44-4b4f-4680-9428-fa05d97aae1c	406d617d-1963-4c0e-8eeb-765b52710d01	CEO	Chief Executive Officer	2026-01-27 16:53:06.456676+00
be5a85c5-56de-4c67-95a2-2ab98e66ee90	406d617d-1963-4c0e-8eeb-765b52710d01	ADMIN	Administrator	2026-01-27 16:53:06.456676+00
b0a25c8f-9c30-425d-8740-06c02329d2b3	406d617d-1963-4c0e-8eeb-765b52710d01	OPERATOR	Operator	2026-01-27 16:53:06.456676+00
\.


--
-- Data for Name: sql_access_policies; Type: TABLE DATA; Schema: public; Owner: fluidmanager
--

COPY public.sql_access_policies (id, company_id, data_source_id, principal_type, principal_id, mode, allowlist_json, created_at) FROM stdin;
\.


--
-- Data for Name: sql_data_sources; Type: TABLE DATA; Schema: public; Owner: fluidmanager
--

COPY public.sql_data_sources (id, company_id, code, name, db_type, connection_json, secrets_ref, is_active, created_at) FROM stdin;
\.


--
-- Data for Name: task_dependencies; Type: TABLE DATA; Schema: public; Owner: fluidmanager
--

COPY public.task_dependencies (company_id, task_id, depends_on_task_id, waiter_task_id, dependee_task_id, created_at) FROM stdin;
\.


--
-- Data for Name: task_events; Type: TABLE DATA; Schema: public; Owner: fluidmanager
--

COPY public.task_events (id, company_id, task_id, event_type, actor_type, actor_user_id, actor_agent_id, payload, created_at) FROM stdin;
490249e7-a8b3-4dd4-9696-da434825fa39	406d617d-1963-4c0e-8eeb-765b52710d01	30894983-767a-4d0e-af9a-699545e3d626	retry	system	\N	\N	{"ts": "2026-01-28T09:37:25.725444+00:00", "celery_args": ["fluidmanager_main", "30894983-767a-4d0e-af9a-699545e3d626", 30], "max_attempts": 5, "attempt_count": 1, "celery_kwargs": {}, "celery_task_id": "c0c774ad-fce6-4796-a9cd-44366f45359e", "celery_task_name": "fm.long_demo", "previous_celery_task_id": "f26b54fb-4980-453a-9ee2-1e1943ddd1da"}	2026-01-28 09:37:25.682413+00
0c34203e-5591-4afd-8986-d46e9750715f	406d617d-1963-4c0e-8eeb-765b52710d01	30894983-767a-4d0e-af9a-699545e3d626	retry	system	\N	\N	{"ts": "2026-01-28T09:37:30.229870+00:00", "celery_args": ["fluidmanager_main", "30894983-767a-4d0e-af9a-699545e3d626", 30], "max_attempts": 5, "attempt_count": 2, "celery_kwargs": {}, "celery_task_id": "b7f6cc7e-d0ad-4a03-b05a-9847b376eb3d", "celery_task_name": "fm.long_demo", "previous_celery_task_id": "c0c774ad-fce6-4796-a9cd-44366f45359e"}	2026-01-28 09:37:30.228755+00
d29ce1cb-1f0c-4609-b415-efe312b49771	406d617d-1963-4c0e-8eeb-765b52710d01	30894983-767a-4d0e-af9a-699545e3d626	retry	system	\N	\N	{"ts": "2026-01-28T09:41:34.868423+00:00", "celery_args": ["fluidmanager_main", "30894983-767a-4d0e-af9a-699545e3d626", 30], "max_attempts": 5, "attempt_count": 3, "celery_kwargs": {}, "celery_task_id": "cf96df7c-2119-4ce6-9e17-7dcb524df240", "celery_task_name": "fm.long_demo", "previous_celery_task_id": "b7f6cc7e-d0ad-4a03-b05a-9847b376eb3d"}	2026-01-28 09:41:34.889488+00
0e998739-29c1-4cd7-b9b0-d568175654b6	406d617d-1963-4c0e-8eeb-765b52710d01	30894983-767a-4d0e-af9a-699545e3d626	reset	system	\N	\N	{"ts": "2026-01-28T09:57:32.707010+00:00", "pause": false, "cancel": false}	2026-01-28 09:57:32.705986+00
cc063b2c-c45f-4817-8045-e258286addc9	406d617d-1963-4c0e-8eeb-765b52710d01	30894983-767a-4d0e-af9a-699545e3d626	pause	system	\N	\N	{"ts": "2026-01-28T09:57:37.784163+00:00", "pause": true}	2026-01-28 09:57:37.783633+00
9157f0e6-f181-4fcc-9902-c33b12dbdb12	406d617d-1963-4c0e-8eeb-765b52710d01	30894983-767a-4d0e-af9a-699545e3d626	run_requested	system	\N	\N	{"ts": "2026-01-28T10:05:10.922756+00:00", "celery_args": ["fluidmanager_main", "30894983-767a-4d0e-af9a-699545e3d626", 10], "celery_task_name": "fm.long_demo"}	2026-01-28 10:05:10.943585+00
d29b0456-f33c-4102-a5e0-b8ebe0e9b018	406d617d-1963-4c0e-8eeb-765b52710d01	30894983-767a-4d0e-af9a-699545e3d626	run_enqueued	system	\N	\N	{"ts": "2026-01-28T10:05:11.023057+00:00", "celery_task_id": "78c911eb-393c-4e73-a059-11e883968a4e", "celery_task_name": "fm.long_demo"}	2026-01-28 10:05:11.021906+00
4b282f6a-5bef-4f62-a354-87766f737f02	406d617d-1963-4c0e-8eeb-765b52710d01	30894983-767a-4d0e-af9a-699545e3d626	pause	system	\N	\N	{"ts": "2026-01-28T10:05:20.991938+00:00", "pause": true}	2026-01-28 10:05:20.991416+00
5d8adbd5-75ed-417b-9a01-f786a1ed672a	406d617d-1963-4c0e-8eeb-765b52710d01	30894983-767a-4d0e-af9a-699545e3d626	resume	system	\N	\N	{"ts": "2026-01-28T10:05:24.951649+00:00", "pause": false, "cancel": false}	2026-01-28 10:05:24.951132+00
d6a06194-cb75-40a8-9ccc-02ef30fad1d1	406d617d-1963-4c0e-8eeb-765b52710d01	30894983-767a-4d0e-af9a-699545e3d626	cancel	system	\N	\N	{"ts": "2026-01-28T10:05:28.815912+00:00", "pause": false, "cancel": true}	2026-01-28 10:05:28.815395+00
877f8aa8-6d2d-47b0-a0bd-3dbc96566999	406d617d-1963-4c0e-8eeb-765b52710d01	30894983-767a-4d0e-af9a-699545e3d626	run_requested	system	\N	\N	{"ts": "2026-01-28T10:14:42.676954+00:00", "celery_args": ["fluidmanager_main", "30894983-767a-4d0e-af9a-699545e3d626", 10], "celery_task_name": "fm.long_demo"}	2026-01-28 10:14:42.677627+00
5f2a2cae-b9fd-4559-aec6-5503f14032f3	406d617d-1963-4c0e-8eeb-765b52710d01	30894983-767a-4d0e-af9a-699545e3d626	run_enqueued	system	\N	\N	{"ts": "2026-01-28T10:14:42.705777+00:00", "celery_task_id": "3bc26336-8a81-416e-b3ba-1011729ba9bd", "celery_task_name": "fm.long_demo"}	2026-01-28 10:14:42.704159+00
24c75775-266a-4fef-9134-e508b3a20a0a	406d617d-1963-4c0e-8eeb-765b52710d01	30894983-767a-4d0e-af9a-699545e3d626	cancel	system	\N	\N	{"ts": "2026-01-28T10:14:47.109610+00:00", "pause": false, "cancel": true}	2026-01-28 10:14:47.109239+00
5b9c5a5e-4330-4602-8adf-dd500efba7e8	406d617d-1963-4c0e-8eeb-765b52710d01	30894983-767a-4d0e-af9a-699545e3d626	run_requested	system	\N	\N	{"ts": "2026-01-28T11:50:40.993900+00:00", "job_type": "long_demo", "job_payload": {"seconds": 10}}	2026-01-28 11:50:41.014788+00
7f07a586-b513-42d9-ab39-a7266234fcaf	406d617d-1963-4c0e-8eeb-765b52710d01	30894983-767a-4d0e-af9a-699545e3d626	run_enqueued	system	\N	\N	{"ts": "2026-01-28T11:50:41.091807+00:00", "celery_task_id": "b87b0d52-55e1-4e16-bad0-04c1be2b3811"}	2026-01-28 11:50:41.090616+00
c8a44026-4793-4972-befc-a8bd9ef4e7d0	406d617d-1963-4c0e-8eeb-765b52710d01	30894983-767a-4d0e-af9a-699545e3d626	pause	system	\N	\N	{"ts": "2026-01-28T11:50:52.549817+00:00", "pause": true}	2026-01-28 11:50:52.549183+00
2efdf961-e5ee-4fc2-8d75-00eb24740842	406d617d-1963-4c0e-8eeb-765b52710d01	30894983-767a-4d0e-af9a-699545e3d626	resume	system	\N	\N	{"ts": "2026-01-28T11:50:52.601965+00:00", "pause": false, "cancel": false}	2026-01-28 11:50:52.601403+00
6effc57b-ebf9-400f-ab7f-dee0ee337fd5	406d617d-1963-4c0e-8eeb-765b52710d01	30894983-767a-4d0e-af9a-699545e3d626	cancel	system	\N	\N	{"ts": "2026-01-28T11:50:52.628003+00:00", "pause": false, "cancel": true}	2026-01-28 11:50:52.627508+00
bfbdf2c6-5544-4ce8-905b-9a8da9e744eb	406d617d-1963-4c0e-8eeb-765b52710d01	ffc7c22d-c46c-4b3e-b359-d47867ab9ab1	run_requested	system	\N	\N	{"ts": "2026-01-28T12:48:17.027555+00:00", "job_type": "long_demo", "job_payload": {"seconds": 15}}	2026-01-28 12:48:17.028132+00
9f094834-6899-4eb9-90a8-62a27542873b	406d617d-1963-4c0e-8eeb-765b52710d01	ffc7c22d-c46c-4b3e-b359-d47867ab9ab1	run_enqueued	system	\N	\N	{"ts": "2026-01-28T12:48:17.060586+00:00", "celery_task_id": "d7ab9c00-a535-4bd8-ba46-7e1b0848c2db"}	2026-01-28 12:48:17.05906+00
bc960e76-074e-4b76-af26-8860fe636543	406d617d-1963-4c0e-8eeb-765b52710d01	594d0549-0060-4e73-9ee5-e6ddec4c811f	task_created	system	\N	\N	{"title": "My first real task", "project_code": null}	2026-01-28 13:31:59.711988+00
f4362f23-fe6b-44b2-804a-a3be768b884f	406d617d-1963-4c0e-8eeb-765b52710d01	6ca479f0-9f45-44a3-aad1-d08b97eaf55e	task_created	system	\N	\N	{"title": "My first real task", "project_code": null}	2026-01-28 13:32:08.31362+00
335d7a25-c9e3-4ad6-a1b5-0c2b659a6ba0	406d617d-1963-4c0e-8eeb-765b52710d01	3b0abfeb-ca5d-47f5-ab7f-9df6907de86c	task_created	system	\N	\N	{"title": "Auto scheduled long_demo", "project_code": null}	2026-01-28 16:06:54.390694+00
b292653c-ffdb-4be6-8355-74ffad63f22c	406d617d-1963-4c0e-8eeb-765b52710d01	f9ebb850-bf90-40dd-a6bc-bed617065155	task_created	system	\N	\N	{"title": "Auto scheduled demo", "project_code": null}	2026-01-28 18:14:23.681568+00
894e3c96-4877-40c0-92db-03d6535d57a1	406d617d-1963-4c0e-8eeb-765b52710d01	d691d6ba-aa0e-4fef-8867-488aebf95147	task_created	system	\N	\N	{"title": "Auto scheduled demo", "project_code": "DEMO"}	2026-01-28 19:28:01.385211+00
3a5acf52-85af-47ec-b28a-28a285ea560e	406d617d-1963-4c0e-8eeb-765b52710d01	3a0dc143-83a3-4a37-8641-d7130799138b	task_created	system	\N	\N	{"title": "Webhook demo", "project_code": "DEMO", "integration_id": "dc9eb13f-308a-4821-a1e4-14107aa6666d"}	2026-01-28 21:02:24.337838+00
6bff7385-134c-49a5-b655-5e246edb18be	406d617d-1963-4c0e-8eeb-765b52710d01	0298d57a-5a34-49e8-b598-738b3a87762f	task_created	system	\N	\N	{"title": "Webhook demo v2", "project_code": "DEMO", "integration_id": "dc9eb13f-308a-4821-a1e4-14107aa6666d"}	2026-01-28 21:34:00.835096+00
362bde31-ea0f-43b1-8619-efff6ababeab	406d617d-1963-4c0e-8eeb-765b52710d01	0298d57a-5a34-49e8-b598-738b3a87762f	task_started	system	\N	\N	{"ts": "2026-01-28T21:34:01.770288+00:00", "job_type": "n8n_webhook"}	2026-01-28 21:34:01.782075+00
8dd168b2-4cac-4375-af56-abbe6576e3a4	406d617d-1963-4c0e-8eeb-765b52710d01	0298d57a-5a34-49e8-b598-738b3a87762f	task_failed	system	\N	\N	{"ts": "2026-01-28T21:34:01.784687+00:00", "error": "No module named 'httpx'"}	2026-01-28 21:34:01.796414+00
4a4a5073-53f3-47c0-9cbc-db47d05d9760	406d617d-1963-4c0e-8eeb-765b52710d01	21fa0cfa-b8da-4b3c-9031-3ed339929473	task_created	system	\N	\N	{"title": "Webhook demo v2", "project_code": "DEMO", "integration_id": "dc9eb13f-308a-4821-a1e4-14107aa6666d"}	2026-01-28 21:42:02.058534+00
4eb2e9cd-acba-4ddf-a6e1-2c0e4a5abb56	406d617d-1963-4c0e-8eeb-765b52710d01	21fa0cfa-b8da-4b3c-9031-3ed339929473	task_started	system	\N	\N	{"ts": "2026-01-28T21:42:04.766829+00:00", "job_type": "n8n_webhook"}	2026-01-28 21:42:04.778799+00
b508d2c0-3f19-474f-8138-b7a87039f439	406d617d-1963-4c0e-8eeb-765b52710d01	21fa0cfa-b8da-4b3c-9031-3ed339929473	webhook_trigger_start	system	\N	\N	{"ts": "2026-01-28T21:42:04.825586+00:00", "url": "http://n8n:5678/webhook/test", "job_type": "n8n_webhook"}	2026-01-28 21:42:04.829771+00
4c49ed07-1c6f-4aed-8bbf-b01c4eb2a761	406d617d-1963-4c0e-8eeb-765b52710d01	21fa0cfa-b8da-4b3c-9031-3ed339929473	webhook_trigger_failed	system	\N	\N	{"ts": "2026-01-28T21:42:04.865688+00:00", "url": "http://n8n:5678/webhook/test", "error": "[Errno -3] Temporary failure in name resolution"}	2026-01-28 21:42:04.869917+00
b11575f0-4080-4f64-b20c-becbdb8ead55	406d617d-1963-4c0e-8eeb-765b52710d01	21fa0cfa-b8da-4b3c-9031-3ed339929473	task_failed	system	\N	\N	{"ts": "2026-01-28T21:42:04.872733+00:00", "error": "[Errno -3] Temporary failure in name resolution"}	2026-01-28 21:42:04.884616+00
e366e765-a4ac-45cd-bc2f-d2159b8e455c	406d617d-1963-4c0e-8eeb-765b52710d01	58a93647-39ae-4b88-b63b-e467977615ae	task_created	system	\N	\N	{"title": "Test Final Webhook", "project_code": "DEMO", "integration_id": "dc9eb13f-308a-4821-a1e4-14107aa6666d"}	2026-01-28 22:02:39.266167+00
31009002-5d33-4dfa-8cf1-a3639bc1c146	406d617d-1963-4c0e-8eeb-765b52710d01	58a93647-39ae-4b88-b63b-e467977615ae	task_started	system	\N	\N	{"ts": "2026-01-28T22:02:40.808965+00:00", "job_type": "n8n_webhook"}	2026-01-28 22:02:40.821508+00
f98091b6-560d-4664-a91b-4e2cf9f85da4	406d617d-1963-4c0e-8eeb-765b52710d01	58a93647-39ae-4b88-b63b-e467977615ae	webhook_trigger_start	system	\N	\N	{"ts": "2026-01-28T22:02:40.869173+00:00", "url": "https://n8n.fluidifia.com/webhook/test", "job_type": "n8n_webhook"}	2026-01-28 22:02:40.873524+00
c7986843-827b-4aaa-a15f-ebea00cd9432	406d617d-1963-4c0e-8eeb-765b52710d01	58a93647-39ae-4b88-b63b-e467977615ae	webhook_trigger_failed	system	\N	\N	{"ts": "2026-01-28T22:02:40.965460+00:00", "url": "https://n8n.fluidifia.com/webhook/test", "error": "Webhook HTTP 404: {\\"code\\":404,\\"message\\":\\"The requested webhook \\\\\\"POST test\\\\\\" is not registered.\\",\\"hint\\":\\"The workflow must be active for a production URL to run successfully. You can activate the workflow using the toggle in the top-right of the editor. Note that unlike test URL calls, production URL calls aren't sho"}	2026-01-28 22:02:40.971686+00
55d9d43a-f493-4a81-b383-d9409a67e830	406d617d-1963-4c0e-8eeb-765b52710d01	58a93647-39ae-4b88-b63b-e467977615ae	task_failed	system	\N	\N	{"ts": "2026-01-28T22:02:40.974312+00:00", "error": "Webhook HTTP 404: {\\"code\\":404,\\"message\\":\\"The requested webhook \\\\\\"POST test\\\\\\" is not registered.\\",\\"hint\\":\\"The workflow must be active for a production URL to run successfully. You can activate the workflow using the toggle in the top-right of the editor. Note that unlike test URL calls, production URL calls aren't sho"}	2026-01-28 22:02:40.997358+00
39ce4960-6574-4912-8756-bb61e18d6cfc	406d617d-1963-4c0e-8eeb-765b52710d01	d93d737c-0eb0-4466-ba99-adf7eb6a631a	task_created	system	\N	\N	{"title": "Test Webhook Flexible", "project_code": "DEMO", "integration_id": "dc9eb13f-308a-4821-a1e4-14107aa6666d"}	2026-01-28 22:09:48.427917+00
7877048e-c499-4893-a358-ffd4f02f7d4d	406d617d-1963-4c0e-8eeb-765b52710d01	d93d737c-0eb0-4466-ba99-adf7eb6a631a	task_started	system	\N	\N	{"ts": "2026-01-28T22:09:49.781913+00:00", "job_type": "webhook"}	2026-01-28 22:09:49.79527+00
6ce49070-bab3-49ba-a782-e04a299182de	406d617d-1963-4c0e-8eeb-765b52710d01	d93d737c-0eb0-4466-ba99-adf7eb6a631a	webhook_trigger_start	system	\N	\N	{"ts": "2026-01-28T22:09:49.804174+00:00", "url": "https://n8n.fluidifia.com/webhook-test/d2e5a205-4e4e-47a8-9f60-1c147bc7ff3b", "job_type": "webhook"}	2026-01-28 22:09:49.808596+00
85d6532b-a009-4d77-a47e-2b618da4694e	406d617d-1963-4c0e-8eeb-765b52710d01	d93d737c-0eb0-4466-ba99-adf7eb6a631a	webhook_trigger_failed	system	\N	\N	{"ts": "2026-01-28T22:09:49.822004+00:00", "url": "https://n8n.fluidifia.com/webhook-test/d2e5a205-4e4e-47a8-9f60-1c147bc7ff3b", "error": "Webhook HTTP 404: {\\"code\\":404,\\"message\\":\\"The requested webhook \\\\\\"d2e5a205-4e4e-47a8-9f60-1c147bc7ff3b\\\\\\" is not registered.\\",\\"hint\\":\\"Click the 'Execute workflow' button on the canvas, then try again. (In test mode, the webhook only works for one call after you click this button)\\"}"}	2026-01-28 22:09:49.826328+00
f0699125-6cf5-465a-922b-195cc371a706	406d617d-1963-4c0e-8eeb-765b52710d01	d93d737c-0eb0-4466-ba99-adf7eb6a631a	task_failed	system	\N	\N	{"ts": "2026-01-28T22:09:49.828959+00:00", "error": "Webhook HTTP 404: {\\"code\\":404,\\"message\\":\\"The requested webhook \\\\\\"d2e5a205-4e4e-47a8-9f60-1c147bc7ff3b\\\\\\" is not registered.\\",\\"hint\\":\\"Click the 'Execute workflow' button on the canvas, then try again. (In test mode, the webhook only works for one call after you click this button)\\"}"}	2026-01-28 22:09:49.84086+00
e4df9b32-fa15-4f7c-acdc-ae92202d8ef7	406d617d-1963-4c0e-8eeb-765b52710d01	1a852283-74d5-49b6-a5bd-8f613514a3b5	task_created	system	\N	\N	{"title": "Test Production N8N", "project_code": "DEMO", "integration_id": "dc9eb13f-308a-4821-a1e4-14107aa6666d"}	2026-01-28 22:16:35.041431+00
8d037ad8-66af-47c8-ae9b-c7d5773bd2df	406d617d-1963-4c0e-8eeb-765b52710d01	1a852283-74d5-49b6-a5bd-8f613514a3b5	task_started	system	\N	\N	{"ts": "2026-01-28T22:16:37.808437+00:00", "job_type": "webhook"}	2026-01-28 22:16:37.822158+00
d2055864-a371-4a1b-988f-db96d5e25464	406d617d-1963-4c0e-8eeb-765b52710d01	1a852283-74d5-49b6-a5bd-8f613514a3b5	webhook_trigger_start	system	\N	\N	{"ts": "2026-01-28T22:16:37.831293+00:00", "url": "https://n8n.fluidifia.com/webhook/d2e5a205-4e4e-47a8-9f60-1c147bc7ff3b", "job_type": "webhook"}	2026-01-28 22:16:37.835888+00
4bdaf8c7-bd26-49f2-9861-5f0d551137ae	406d617d-1963-4c0e-8eeb-765b52710d01	1a852283-74d5-49b6-a5bd-8f613514a3b5	webhook_triggered	system	\N	\N	{"ts": "2026-01-28T22:16:37.831293+00:00", "url": "https://n8n.fluidifia.com/webhook/d2e5a205-4e4e-47a8-9f60-1c147bc7ff3b", "status_code": 200}	2026-01-28 22:16:37.892268+00
a1128318-e326-4278-9292-c440a5e9c1cb	406d617d-1963-4c0e-8eeb-765b52710d01	1a852283-74d5-49b6-a5bd-8f613514a3b5	callback_received	integration	\N	\N	{"ts": "2026-01-28T22:34:21.735838+00:00", "status": "done"}	2026-01-28 22:34:21.730534+00
cfc1035f-2663-435b-ac6b-288618df72a5	406d617d-1963-4c0e-8eeb-765b52710d01	1a852283-74d5-49b6-a5bd-8f613514a3b5	task_done	system	\N	\N	{"ts": "2026-01-28T22:34:21.735838+00:00", "error": null}	2026-01-28 22:34:21.730534+00
\.


--
-- Data for Name: tasks; Type: TABLE DATA; Schema: public; Owner: fluidmanager
--

COPY public.tasks (id, company_id, project_id, objective_id, title, description, status, priority, created_by_user_id, created_by_agent_id, assigned_to_agent_id, parent_task_id, tags, scheduled_at, deadline_at, attempt_count, max_attempts, should_stop, last_heartbeat_at, token_usage_json, cost_estimate_usd, duration_ms, last_error, metadata, created_at, updated_at, runtime_json, control_json, root_task_id, integration_id) FROM stdin;
30894983-767a-4d0e-af9a-699545e3d626	406d617d-1963-4c0e-8eeb-765b52710d01	\N	\N	Long demo task	Test pause/cancel control	done	normal	\N	\N	\N	\N	{}	\N	\N	4	5	f	2026-01-28 11:50:51.387473+00	{}	\N	\N	\N	{}	2026-01-27 22:18:47.02569+00	2026-01-27 22:18:47.02569+00	{"job_type": "long_demo", "started_at": "2026-01-28T11:50:41.137332+00:00", "celery_args": ["fluidmanager_main", "30894983-767a-4d0e-af9a-699545e3d626"], "finished_at": "2026-01-28T11:50:51.367548+00:00", "job_payload": {"seconds": 10}, "celery_kwargs": {}, "celery_task_id": "b87b0d52-55e1-4e16-bad0-04c1be2b3811", "celery_task_name": "fm.run_task", "previous_celery_task_id": null}	{"pause": false, "cancel": true}	\N	\N
d691d6ba-aa0e-4fef-8867-488aebf95147	406d617d-1963-4c0e-8eeb-765b52710d01	7ef0eeba-3a94-4ffe-b981-93c727b4a2ae	\N	Auto scheduled demo	\N	done	normal	\N	\N	\N	\N	{}	\N	\N	1	5	f	2026-01-28 19:28:06.322326+00	{}	\N	\N	\N	{}	2026-01-28 19:28:01.385211+00	2026-01-28 19:28:01.385211+00	{"job_type": "long_demo", "started_at": "2026-01-28T19:28:04.245660+00:00", "finished_at": "2026-01-28T19:28:06.309092+00:00", "job_payload": {"seconds": 2}, "celery_task_id": "1971f1a3-00bd-4b6b-8ffb-614429a37282", "celery_task_name": "fm.run_task", "previous_celery_task_id": null}	{"pause": false, "cancel": false}	\N	\N
3b0abfeb-ca5d-47f5-ab7f-9df6907de86c	406d617d-1963-4c0e-8eeb-765b52710d01	\N	\N	Auto scheduled long_demo	\N	done	normal	\N	\N	\N	\N	{}	\N	\N	1	5	f	2026-01-28 16:07:05.867262+00	{}	\N	\N	\N	{}	2026-01-28 16:06:54.390694+00	2026-01-28 16:06:54.390694+00	{"job_type": "long_demo", "started_at": "2026-01-28T16:06:55.633496+00:00", "finished_at": "2026-01-28T16:07:05.848492+00:00", "job_payload": {"seconds": 10}, "celery_task_id": "41f7a161-8c55-48fc-986f-80ca4bc89815", "celery_task_name": "fm.run_task", "previous_celery_task_id": null}	{"pause": false, "cancel": false}	\N	\N
ffc7c22d-c46c-4b3e-b359-d47867ab9ab1	406d617d-1963-4c0e-8eeb-765b52710d01	\N	\N	Run long_demo	\N	done	normal	\N	\N	\N	\N	{}	\N	\N	1	5	f	2026-01-28 12:48:32.483909+00	{}	\N	\N	\N	{}	2026-01-28 12:47:52.886243+00	2026-01-28 12:47:52.886243+00	{"job_type": "long_demo", "started_at": "2026-01-28T12:48:17.061285+00:00", "celery_args": ["fluidmanager_main", "ffc7c22d-c46c-4b3e-b359-d47867ab9ab1"], "finished_at": "2026-01-28T12:48:32.464551+00:00", "job_payload": {"seconds": 15}, "celery_kwargs": {}, "celery_task_id": "d7ab9c00-a535-4bd8-ba46-7e1b0848c2db", "celery_task_name": "fm.run_task", "previous_celery_task_id": null}	{"pause": false, "cancel": false}	\N	\N
594d0549-0060-4e73-9ee5-e6ddec4c811f	406d617d-1963-4c0e-8eeb-765b52710d01	\N	\N	My first real task	\N	queued	normal	\N	\N	\N	\N	{}	\N	\N	0	5	f	\N	{}	\N	\N	\N	{}	2026-01-28 13:31:59.711988+00	2026-01-28 13:31:59.711988+00	{}	{"pause": false, "cancel": false}	\N	\N
6ca479f0-9f45-44a3-aad1-d08b97eaf55e	406d617d-1963-4c0e-8eeb-765b52710d01	\N	\N	My first real task	\N	queued	urgent	\N	\N	\N	\N	{}	\N	\N	0	5	f	\N	{}	\N	\N	\N	{}	2026-01-28 13:32:08.31362+00	2026-01-28 13:32:08.31362+00	{}	{"pause": false, "cancel": false}	\N	\N
21fa0cfa-b8da-4b3c-9031-3ed339929473	406d617d-1963-4c0e-8eeb-765b52710d01	7ef0eeba-3a94-4ffe-b981-93c727b4a2ae	\N	Webhook demo v2	\N	failed	normal	\N	\N	\N	\N	{}	\N	\N	1	5	f	2026-01-28 21:42:04.876866+00	{}	\N	\N	[Errno -3] Temporary failure in name resolution	{}	2026-01-28 21:42:02.058534+00	2026-01-28 21:42:02.058534+00	{"job_type": "n8n_webhook", "started_at": "2026-01-28T21:42:04.766829+00:00", "celery_args": ["fluidmanager_main", "21fa0cfa-b8da-4b3c-9031-3ed339929473"], "finished_at": "2026-01-28T21:42:04.872733+00:00", "job_payload": {"body": {"hello": "world v2"}, "path": "/webhook/test", "callback_base_url": "https://api.manager.fluidifia.com"}, "celery_kwargs": {}, "celery_task_id": "009cdbc7-a3b2-4014-a1f9-fffb921df3c3", "integration_id": "dc9eb13f-308a-4821-a1e4-14107aa6666d", "celery_task_name": "fm.run_task", "integration_provider": "n8n", "previous_celery_task_id": "__PENDING__"}	{"pause": false, "cancel": false}	\N	dc9eb13f-308a-4821-a1e4-14107aa6666d
3a0dc143-83a3-4a37-8641-d7130799138b	406d617d-1963-4c0e-8eeb-765b52710d01	7ef0eeba-3a94-4ffe-b981-93c727b4a2ae	\N	Webhook demo	\N	failed	normal	\N	\N	\N	\N	{}	\N	\N	1	5	f	2026-01-28 21:02:25.472214+00	{}	\N	\N	Unknown job_type='n8n_webhook'	{}	2026-01-28 21:02:24.337838+00	2026-01-28 21:02:24.337838+00	{"job_type": "n8n_webhook", "started_at": "2026-01-28T21:02:25.429275+00:00", "finished_at": "2026-01-28T21:02:25.460773+00:00", "job_payload": {"body": {"hello": "world"}, "path": "/webhook/test", "callback_base_url": "https://api.manager.fluidifia.com"}, "celery_task_id": "dc033a0f-0d79-4fb7-b6a7-a648bb3a8d71", "integration_id": "dc9eb13f-308a-4821-a1e4-14107aa6666d", "celery_task_name": "fm.run_task", "integration_provider": "n8n", "previous_celery_task_id": null}	{"pause": false, "cancel": false}	\N	dc9eb13f-308a-4821-a1e4-14107aa6666d
f9ebb850-bf90-40dd-a6bc-bed617065155	406d617d-1963-4c0e-8eeb-765b52710d01	\N	\N	Auto scheduled demo	\N	done	normal	\N	\N	\N	\N	{}	\N	\N	1	5	f	2026-01-28 18:14:30.257286+00	{}	\N	\N	\N	{}	2026-01-28 18:14:23.681568+00	2026-01-28 18:14:23.681568+00	{"job_type": "long_demo", "started_at": "2026-01-28T18:14:25.090868+00:00", "finished_at": "2026-01-28T18:14:30.237340+00:00", "job_payload": {"seconds": 5}, "celery_task_id": "f04ee597-7077-4fbe-8f0c-acbfb8f0cac9", "celery_task_name": "fm.run_task", "previous_celery_task_id": null}	{"pause": false, "cancel": false}	\N	\N
0298d57a-5a34-49e8-b598-738b3a87762f	406d617d-1963-4c0e-8eeb-765b52710d01	7ef0eeba-3a94-4ffe-b981-93c727b4a2ae	\N	Webhook demo v2	\N	failed	normal	\N	\N	\N	\N	{}	\N	\N	1	5	f	2026-01-28 21:34:01.788803+00	{}	\N	\N	No module named 'httpx'	{}	2026-01-28 21:34:00.835096+00	2026-01-28 21:34:00.835096+00	{"job_type": "n8n_webhook", "started_at": "2026-01-28T21:34:01.770288+00:00", "celery_args": ["fluidmanager_main", "0298d57a-5a34-49e8-b598-738b3a87762f"], "finished_at": "2026-01-28T21:34:01.784687+00:00", "job_payload": {"body": {"hello": "world v2"}, "path": "/webhook/test", "callback_base_url": "https://api.manager.fluidifia.com"}, "celery_kwargs": {}, "celery_task_id": "1561a5e0-0189-4203-859e-d93a81ec8064", "integration_id": "dc9eb13f-308a-4821-a1e4-14107aa6666d", "celery_task_name": "fm.run_task", "integration_provider": "n8n", "previous_celery_task_id": "__PENDING__"}	{"pause": false, "cancel": false}	\N	dc9eb13f-308a-4821-a1e4-14107aa6666d
58a93647-39ae-4b88-b63b-e467977615ae	406d617d-1963-4c0e-8eeb-765b52710d01	7ef0eeba-3a94-4ffe-b981-93c727b4a2ae	\N	Test Final Webhook	\N	failed	normal	\N	\N	\N	\N	{}	\N	\N	1	5	f	2026-01-28 22:02:40.979832+00	{}	\N	\N	Webhook HTTP 404: {"code":404,"message":"The requested webhook \\"POST test\\" is not registered.","hint":"The workflow must be active for a production URL to run successfully. You can activate the workflow using the toggle in the top-right of the editor. Note that unlike test URL calls, production URL calls aren't sho	{}	2026-01-28 22:02:39.266167+00	2026-01-28 22:02:39.266167+00	{"job_type": "n8n_webhook", "started_at": "2026-01-28T22:02:40.808965+00:00", "celery_args": ["fluidmanager_main", "58a93647-39ae-4b88-b63b-e467977615ae"], "finished_at": "2026-01-28T22:02:40.974312+00:00", "job_payload": {"body": {"message": "Ceci est un test final"}, "path": "/webhook/test", "callback_base_url": "https://api.manager.fluidifia.com"}, "celery_kwargs": {}, "celery_task_id": "09ee732a-fbc4-4c92-a763-2cfd0271bab9", "integration_id": "dc9eb13f-308a-4821-a1e4-14107aa6666d", "celery_task_name": "fm.run_task", "integration_provider": "n8n", "previous_celery_task_id": "__PENDING__"}	{"pause": false, "cancel": false}	\N	dc9eb13f-308a-4821-a1e4-14107aa6666d
1a852283-74d5-49b6-a5bd-8f613514a3b5	406d617d-1963-4c0e-8eeb-765b52710d01	7ef0eeba-3a94-4ffe-b981-93c727b4a2ae	\N	Test Production N8N	\N	done	normal	\N	\N	\N	\N	{}	\N	\N	1	5	f	2026-01-28 22:16:37.878955+00	{}	\N	\N	\N	{}	2026-01-28 22:16:35.041431+00	2026-01-28 22:16:35.041431+00	{"callback": {"ts": "2026-01-28T22:34:21.735838+00:00", "error": null, "result": {"analysis": "Mission accomplie via Webhook Flexible", "processed": true}, "status": "done"}, "job_type": "webhook", "started_at": "2026-01-28T22:16:37.808437+00:00", "celery_args": ["fluidmanager_main", "1a852283-74d5-49b6-a5bd-8f613514a3b5"], "finished_at": "2026-01-28T22:34:21.735838+00:00", "job_payload": {"url": "https://n8n.fluidifia.com/webhook/d2e5a205-4e4e-47a8-9f60-1c147bc7ff3b", "body": {"message": "Ceci est un test de production via le système flexible"}, "callback_base_url": "https://api.manager.fluidifia.com"}, "webhook_url": "https://n8n.fluidifia.com/webhook/d2e5a205-4e4e-47a8-9f60-1c147bc7ff3b", "triggered_at": "2026-01-28T22:16:37.831293+00:00", "celery_kwargs": {}, "blocked_reason": "waiting_callback", "celery_task_id": "4ed48e81-51fb-473a-85b5-64ea79119152", "integration_id": "dc9eb13f-308a-4821-a1e4-14107aa6666d", "celery_task_name": "fm.run_task", "integration_provider": "n8n", "previous_celery_task_id": "__PENDING__"}	{"pause": false, "cancel": false}	\N	dc9eb13f-308a-4821-a1e4-14107aa6666d
d93d737c-0eb0-4466-ba99-adf7eb6a631a	406d617d-1963-4c0e-8eeb-765b52710d01	7ef0eeba-3a94-4ffe-b981-93c727b4a2ae	\N	Test Webhook Flexible	\N	failed	normal	\N	\N	\N	\N	{}	\N	\N	1	5	f	2026-01-28 22:09:49.833074+00	{}	\N	\N	Webhook HTTP 404: {"code":404,"message":"The requested webhook \\"d2e5a205-4e4e-47a8-9f60-1c147bc7ff3b\\" is not registered.","hint":"Click the 'Execute workflow' button on the canvas, then try again. (In test mode, the webhook only works for one call after you click this button)"}	{}	2026-01-28 22:09:48.427917+00	2026-01-28 22:09:48.427917+00	{"job_type": "webhook", "started_at": "2026-01-28T22:09:49.781913+00:00", "celery_args": ["fluidmanager_main", "d93d737c-0eb0-4466-ba99-adf7eb6a631a"], "finished_at": "2026-01-28T22:09:49.828959+00:00", "job_payload": {"url": "https://n8n.fluidifia.com/webhook-test/d2e5a205-4e4e-47a8-9f60-1c147bc7ff3b", "body": {"message": "Ceci est un test totalement flexible"}, "callback_base_url": "https://api.manager.fluidifia.com"}, "celery_kwargs": {}, "celery_task_id": "3c502ee1-67bd-40c6-b713-5d130126804e", "integration_id": "dc9eb13f-308a-4821-a1e4-14107aa6666d", "celery_task_name": "fm.run_task", "integration_provider": "n8n", "previous_celery_task_id": "__PENDING__"}	{"pause": false, "cancel": false}	\N	dc9eb13f-308a-4821-a1e4-14107aa6666d
\.


--
-- Data for Name: tool_calls; Type: TABLE DATA; Schema: public; Owner: fluidmanager
--

COPY public.tool_calls (id, company_id, task_id, agent_id, tool, request, response_meta, success, error_text, created_at) FROM stdin;
\.


--
-- Data for Name: transcriptions; Type: TABLE DATA; Schema: public; Owner: fluidmanager
--

COPY public.transcriptions (id, company_id, meeting_id, provider, language, content, segments_json, created_at, metadata) FROM stdin;
\.


--
-- Data for Name: usage_ledger; Type: TABLE DATA; Schema: public; Owner: fluidmanager
--

COPY public.usage_ledger (id, company_id, task_id, meeting_id, agent_id, provider, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, created_at, metadata) FROM stdin;
\.


--
-- Data for Name: user_roles; Type: TABLE DATA; Schema: public; Owner: fluidmanager
--

COPY public.user_roles (company_id, user_id, role_id) FROM stdin;
406d617d-1963-4c0e-8eeb-765b52710d01	ae640c2b-d52c-4e5f-842d-79a2ac8b2f3c	86d7bc44-4b4f-4680-9428-fa05d97aae1c
406d617d-1963-4c0e-8eeb-765b52710d01	ae640c2b-d52c-4e5f-842d-79a2ac8b2f3c	be5a85c5-56de-4c67-95a2-2ab98e66ee90
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: fluidmanager
--

COPY public.users (id, company_id, email, display_name, password_hash, is_active, created_at, updated_at) FROM stdin;
ae640c2b-d52c-4e5f-842d-79a2ac8b2f3c	406d617d-1963-4c0e-8eeb-765b52710d01	ceo@fluidmanager.local	CEO (Human)	\N	t	2026-01-27 16:53:06.460388+00	2026-01-27 17:53:58.71817+00
\.


--
-- Data for Name: worklogs; Type: TABLE DATA; Schema: public; Owner: fluidmanager
--

COPY public.worklogs (id, company_id, agent_id, task_id, project_id, visibility, content, created_at, metadata) FROM stdin;
\.


--
-- Name: agent_capabilities agent_capabilities_pkey; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.agent_capabilities
    ADD CONSTRAINT agent_capabilities_pkey PRIMARY KEY (company_id, agent_id, capability_id);


--
-- Name: agent_integration_access agent_integration_access_pkey; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.agent_integration_access
    ADD CONSTRAINT agent_integration_access_pkey PRIMARY KEY (company_id, agent_id, integration_id, permission);


--
-- Name: agents agents_company_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_company_id_slug_key UNIQUE (company_id, slug);


--
-- Name: agents agents_pkey; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_pkey PRIMARY KEY (id);


--
-- Name: approvals approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.approvals
    ADD CONSTRAINT approvals_pkey PRIMARY KEY (id);


--
-- Name: artifacts artifacts_pkey; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.artifacts
    ADD CONSTRAINT artifacts_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: capabilities capabilities_company_id_code_key; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.capabilities
    ADD CONSTRAINT capabilities_company_id_code_key UNIQUE (company_id, code);


--
-- Name: capabilities capabilities_pkey; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.capabilities
    ADD CONSTRAINT capabilities_pkey PRIMARY KEY (id);


--
-- Name: chunks chunks_company_id_document_id_chunk_index_key; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.chunks
    ADD CONSTRAINT chunks_company_id_document_id_chunk_index_key UNIQUE (company_id, document_id, chunk_index);


--
-- Name: chunks chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.chunks
    ADD CONSTRAINT chunks_pkey PRIMARY KEY (id);


--
-- Name: companies companies_code_key; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_code_key UNIQUE (code);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: company_settings company_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.company_settings
    ADD CONSTRAINT company_settings_pkey PRIMARY KEY (company_id, key);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: feature_flags feature_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.feature_flags
    ADD CONSTRAINT feature_flags_pkey PRIMARY KEY (company_id, key);


--
-- Name: integration_providers integration_providers_code_key; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.integration_providers
    ADD CONSTRAINT integration_providers_code_key UNIQUE (code);


--
-- Name: integration_providers integration_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.integration_providers
    ADD CONSTRAINT integration_providers_pkey PRIMARY KEY (id);


--
-- Name: integration_secrets integration_secrets_pkey; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.integration_secrets
    ADD CONSTRAINT integration_secrets_pkey PRIMARY KEY (id);


--
-- Name: integrations integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_pkey PRIMARY KEY (id);


--
-- Name: knowledge_space_acl knowledge_space_acl_pkey; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.knowledge_space_acl
    ADD CONSTRAINT knowledge_space_acl_pkey PRIMARY KEY (company_id, space_id, principal_type, principal_id, permission);


--
-- Name: knowledge_spaces knowledge_spaces_company_id_code_key; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.knowledge_spaces
    ADD CONSTRAINT knowledge_spaces_company_id_code_key UNIQUE (company_id, code);


--
-- Name: knowledge_spaces knowledge_spaces_pkey; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.knowledge_spaces
    ADD CONSTRAINT knowledge_spaces_pkey PRIMARY KEY (id);


--
-- Name: meeting_media meeting_media_pkey; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.meeting_media
    ADD CONSTRAINT meeting_media_pkey PRIMARY KEY (id);


--
-- Name: meeting_messages meeting_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.meeting_messages
    ADD CONSTRAINT meeting_messages_pkey PRIMARY KEY (id);


--
-- Name: meeting_participants meeting_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.meeting_participants
    ADD CONSTRAINT meeting_participants_pkey PRIMARY KEY (company_id, meeting_id, agent_id);


--
-- Name: meetings meetings_pkey; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_pkey PRIMARY KEY (id);


--
-- Name: objectives objectives_pkey; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.objectives
    ADD CONSTRAINT objectives_pkey PRIMARY KEY (id);


--
-- Name: org_edges org_edges_pkey; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.org_edges
    ADD CONSTRAINT org_edges_pkey PRIMARY KEY (id);


--
-- Name: projects projects_company_id_code_key; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_company_id_code_key UNIQUE (company_id, code);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: rag_citations rag_citations_pkey; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.rag_citations
    ADD CONSTRAINT rag_citations_pkey PRIMARY KEY (id);


--
-- Name: roles roles_company_id_code_key; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_company_id_code_key UNIQUE (company_id, code);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: sql_access_policies sql_access_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.sql_access_policies
    ADD CONSTRAINT sql_access_policies_pkey PRIMARY KEY (id);


--
-- Name: sql_data_sources sql_data_sources_company_id_code_key; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.sql_data_sources
    ADD CONSTRAINT sql_data_sources_company_id_code_key UNIQUE (company_id, code);


--
-- Name: sql_data_sources sql_data_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.sql_data_sources
    ADD CONSTRAINT sql_data_sources_pkey PRIMARY KEY (id);


--
-- Name: task_dependencies task_dependencies_pkey; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_dependencies_pkey PRIMARY KEY (company_id, task_id, depends_on_task_id);


--
-- Name: task_dependencies task_dependencies_waiter_dependee_uq; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_dependencies_waiter_dependee_uq UNIQUE (waiter_task_id, dependee_task_id);


--
-- Name: task_events task_events_pkey; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.task_events
    ADD CONSTRAINT task_events_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: tool_calls tool_calls_pkey; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.tool_calls
    ADD CONSTRAINT tool_calls_pkey PRIMARY KEY (id);


--
-- Name: transcriptions transcriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.transcriptions
    ADD CONSTRAINT transcriptions_pkey PRIMARY KEY (id);


--
-- Name: usage_ledger usage_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.usage_ledger
    ADD CONSTRAINT usage_ledger_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (company_id, user_id, role_id);


--
-- Name: users users_company_id_email_key; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_company_id_email_key UNIQUE (company_id, email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: worklogs worklogs_pkey; Type: CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.worklogs
    ADD CONSTRAINT worklogs_pkey PRIMARY KEY (id);


--
-- Name: idx_agents_company; Type: INDEX; Schema: public; Owner: fluidmanager
--

CREATE INDEX idx_agents_company ON public.agents USING btree (company_id);


--
-- Name: idx_agents_department; Type: INDEX; Schema: public; Owner: fluidmanager
--

CREATE INDEX idx_agents_department ON public.agents USING btree (company_id, department);


--
-- Name: idx_agents_level; Type: INDEX; Schema: public; Owner: fluidmanager
--

CREATE INDEX idx_agents_level ON public.agents USING btree (company_id, level);


--
-- Name: idx_approvals_status; Type: INDEX; Schema: public; Owner: fluidmanager
--

CREATE INDEX idx_approvals_status ON public.approvals USING btree (company_id, status, created_at);


--
-- Name: idx_artifacts_task; Type: INDEX; Schema: public; Owner: fluidmanager
--

CREATE INDEX idx_artifacts_task ON public.artifacts USING btree (company_id, task_id, created_at);


--
-- Name: idx_audit_created_at; Type: INDEX; Schema: public; Owner: fluidmanager
--

CREATE INDEX idx_audit_created_at ON public.audit_log USING btree (company_id, created_at);


--
-- Name: idx_audit_entity; Type: INDEX; Schema: public; Owner: fluidmanager
--

CREATE INDEX idx_audit_entity ON public.audit_log USING btree (company_id, entity_type, entity_id);


--
-- Name: idx_chunks_document; Type: INDEX; Schema: public; Owner: fluidmanager
--

CREATE INDEX idx_chunks_document ON public.chunks USING btree (company_id, document_id);


--
-- Name: idx_companies_active; Type: INDEX; Schema: public; Owner: fluidmanager
--

CREATE INDEX idx_companies_active ON public.companies USING btree (is_active);


--
-- Name: idx_documents_space; Type: INDEX; Schema: public; Owner: fluidmanager
--

CREATE INDEX idx_documents_space ON public.documents USING btree (company_id, space_id, created_at);


--
-- Name: idx_integrations_company; Type: INDEX; Schema: public; Owner: fluidmanager
--

CREATE INDEX idx_integrations_company ON public.integrations USING btree (company_id, is_active);


--
-- Name: idx_meeting_messages_meeting; Type: INDEX; Schema: public; Owner: fluidmanager
--

CREATE INDEX idx_meeting_messages_meeting ON public.meeting_messages USING btree (company_id, meeting_id, created_at);


--
-- Name: idx_meetings_company; Type: INDEX; Schema: public; Owner: fluidmanager
--

CREATE INDEX idx_meetings_company ON public.meetings USING btree (company_id, created_at);


--
-- Name: idx_objectives_company; Type: INDEX; Schema: public; Owner: fluidmanager
--

CREATE INDEX idx_objectives_company ON public.objectives USING btree (company_id, status);


--
-- Name: idx_org_edges_manager; Type: INDEX; Schema: public; Owner: fluidmanager
--

CREATE INDEX idx_org_edges_manager ON public.org_edges USING btree (company_id, manager_agent_id);


--
-- Name: idx_org_edges_subordinate; Type: INDEX; Schema: public; Owner: fluidmanager
--

CREATE INDEX idx_org_edges_subordinate ON public.org_edges USING btree (company_id, subordinate_agent_id);


--
-- Name: idx_projects_company; Type: INDEX; Schema: public; Owner: fluidmanager
--

CREATE INDEX idx_projects_company ON public.projects USING btree (company_id, status);


--
-- Name: idx_rag_citations_task; Type: INDEX; Schema: public; Owner: fluidmanager
--

CREATE INDEX idx_rag_citations_task ON public.rag_citations USING btree (company_id, task_id, created_at);


--
-- Name: idx_roles_company; Type: INDEX; Schema: public; Owner: fluidmanager
--

CREATE INDEX idx_roles_company ON public.roles USING btree (company_id);


--
-- Name: idx_sql_access_company; Type: INDEX; Schema: public; Owner: fluidmanager
--

CREATE INDEX idx_sql_access_company ON public.sql_access_policies USING btree (company_id, data_source_id);


--
-- Name: idx_task_events_task; Type: INDEX; Schema: public; Owner: fluidmanager
--

CREATE INDEX idx_task_events_task ON public.task_events USING btree (company_id, task_id, created_at);


--
-- Name: idx_tasks_assigned; Type: INDEX; Schema: public; Owner: fluidmanager
--

CREATE INDEX idx_tasks_assigned ON public.tasks USING btree (company_id, assigned_to_agent_id, status);


--
-- Name: idx_tasks_control_json; Type: INDEX; Schema: public; Owner: fluidmanager
--

CREATE INDEX idx_tasks_control_json ON public.tasks USING gin (control_json);


--
-- Name: idx_tasks_deadline; Type: INDEX; Schema: public; Owner: fluidmanager
--

CREATE INDEX idx_tasks_deadline ON public.tasks USING btree (company_id, deadline_at);


--
-- Name: idx_tasks_project; Type: INDEX; Schema: public; Owner: fluidmanager
--

CREATE INDEX idx_tasks_project ON public.tasks USING btree (company_id, project_id, status);


--
-- Name: idx_tasks_status; Type: INDEX; Schema: public; Owner: fluidmanager
--

CREATE INDEX idx_tasks_status ON public.tasks USING btree (company_id, status);


--
-- Name: idx_tool_calls_agent; Type: INDEX; Schema: public; Owner: fluidmanager
--

CREATE INDEX idx_tool_calls_agent ON public.tool_calls USING btree (company_id, agent_id, created_at);


--
-- Name: idx_tool_calls_task; Type: INDEX; Schema: public; Owner: fluidmanager
--

CREATE INDEX idx_tool_calls_task ON public.tool_calls USING btree (company_id, task_id, created_at);


--
-- Name: idx_usage_agent; Type: INDEX; Schema: public; Owner: fluidmanager
--

CREATE INDEX idx_usage_agent ON public.usage_ledger USING btree (company_id, agent_id, created_at);


--
-- Name: idx_usage_task; Type: INDEX; Schema: public; Owner: fluidmanager
--

CREATE INDEX idx_usage_task ON public.usage_ledger USING btree (company_id, task_id, created_at);


--
-- Name: idx_users_company; Type: INDEX; Schema: public; Owner: fluidmanager
--

CREATE INDEX idx_users_company ON public.users USING btree (company_id);


--
-- Name: idx_worklogs_agent; Type: INDEX; Schema: public; Owner: fluidmanager
--

CREATE INDEX idx_worklogs_agent ON public.worklogs USING btree (company_id, agent_id, created_at);


--
-- Name: idx_worklogs_task; Type: INDEX; Schema: public; Owner: fluidmanager
--

CREATE INDEX idx_worklogs_task ON public.worklogs USING btree (company_id, task_id, created_at);


--
-- Name: integration_secrets_integration_id_uq; Type: INDEX; Schema: public; Owner: fluidmanager
--

CREATE UNIQUE INDEX integration_secrets_integration_id_uq ON public.integration_secrets USING btree (integration_id);


--
-- Name: task_dependencies_dependee_idx; Type: INDEX; Schema: public; Owner: fluidmanager
--

CREATE INDEX task_dependencies_dependee_idx ON public.task_dependencies USING btree (dependee_task_id);


--
-- Name: task_dependencies_waiter_idx; Type: INDEX; Schema: public; Owner: fluidmanager
--

CREATE INDEX task_dependencies_waiter_idx ON public.task_dependencies USING btree (waiter_task_id);


--
-- Name: tasks_integration_id_idx; Type: INDEX; Schema: public; Owner: fluidmanager
--

CREATE INDEX tasks_integration_id_idx ON public.tasks USING btree (integration_id);


--
-- Name: tasks_parent_task_id_idx; Type: INDEX; Schema: public; Owner: fluidmanager
--

CREATE INDEX tasks_parent_task_id_idx ON public.tasks USING btree (parent_task_id);


--
-- Name: tasks_root_task_id_idx; Type: INDEX; Schema: public; Owner: fluidmanager
--

CREATE INDEX tasks_root_task_id_idx ON public.tasks USING btree (root_task_id);


--
-- Name: uq_org_edge_active; Type: INDEX; Schema: public; Owner: fluidmanager
--

CREATE UNIQUE INDEX uq_org_edge_active ON public.org_edges USING btree (company_id, manager_agent_id, subordinate_agent_id) WHERE (effective_to IS NULL);


--
-- Name: tasks tasks_status_unblock; Type: TRIGGER; Schema: public; Owner: fluidmanager
--

CREATE TRIGGER tasks_status_unblock AFTER UPDATE OF status ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.trg_tasks_status_unblock();


--
-- Name: agent_capabilities agent_capabilities_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.agent_capabilities
    ADD CONSTRAINT agent_capabilities_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;


--
-- Name: agent_capabilities agent_capabilities_capability_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.agent_capabilities
    ADD CONSTRAINT agent_capabilities_capability_id_fkey FOREIGN KEY (capability_id) REFERENCES public.capabilities(id) ON DELETE CASCADE;


--
-- Name: agent_capabilities agent_capabilities_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.agent_capabilities
    ADD CONSTRAINT agent_capabilities_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: agent_integration_access agent_integration_access_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.agent_integration_access
    ADD CONSTRAINT agent_integration_access_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;


--
-- Name: agent_integration_access agent_integration_access_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.agent_integration_access
    ADD CONSTRAINT agent_integration_access_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: agent_integration_access agent_integration_access_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.agent_integration_access
    ADD CONSTRAINT agent_integration_access_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE CASCADE;


--
-- Name: agents agents_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: approvals approvals_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.approvals
    ADD CONSTRAINT approvals_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: approvals approvals_decided_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.approvals
    ADD CONSTRAINT approvals_decided_by_user_id_fkey FOREIGN KEY (decided_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: approvals approvals_requested_by_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.approvals
    ADD CONSTRAINT approvals_requested_by_agent_id_fkey FOREIGN KEY (requested_by_agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;


--
-- Name: approvals approvals_requested_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.approvals
    ADD CONSTRAINT approvals_requested_by_user_id_fkey FOREIGN KEY (requested_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: approvals approvals_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.approvals
    ADD CONSTRAINT approvals_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;


--
-- Name: artifacts artifacts_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.artifacts
    ADD CONSTRAINT artifacts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: artifacts artifacts_created_by_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.artifacts
    ADD CONSTRAINT artifacts_created_by_agent_id_fkey FOREIGN KEY (created_by_agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;


--
-- Name: artifacts artifacts_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.artifacts
    ADD CONSTRAINT artifacts_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: artifacts artifacts_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.artifacts
    ADD CONSTRAINT artifacts_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: artifacts artifacts_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.artifacts
    ADD CONSTRAINT artifacts_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;


--
-- Name: audit_log audit_log_actor_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_actor_agent_id_fkey FOREIGN KEY (actor_agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;


--
-- Name: audit_log audit_log_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: audit_log audit_log_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: capabilities capabilities_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.capabilities
    ADD CONSTRAINT capabilities_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: chunks chunks_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.chunks
    ADD CONSTRAINT chunks_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: chunks chunks_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.chunks
    ADD CONSTRAINT chunks_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: company_settings company_settings_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.company_settings
    ADD CONSTRAINT company_settings_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: company_settings company_settings_updated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.company_settings
    ADD CONSTRAINT company_settings_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: documents documents_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: documents documents_space_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.knowledge_spaces(id) ON DELETE CASCADE;


--
-- Name: feature_flags feature_flags_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.feature_flags
    ADD CONSTRAINT feature_flags_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: feature_flags feature_flags_updated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.feature_flags
    ADD CONSTRAINT feature_flags_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: integration_secrets integration_secrets_integration_fk; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.integration_secrets
    ADD CONSTRAINT integration_secrets_integration_fk FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE CASCADE;


--
-- Name: integrations integrations_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: integrations integrations_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.integrations
    ADD CONSTRAINT integrations_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.integration_providers(id) ON DELETE RESTRICT;


--
-- Name: knowledge_space_acl knowledge_space_acl_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.knowledge_space_acl
    ADD CONSTRAINT knowledge_space_acl_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: knowledge_space_acl knowledge_space_acl_space_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.knowledge_space_acl
    ADD CONSTRAINT knowledge_space_acl_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.knowledge_spaces(id) ON DELETE CASCADE;


--
-- Name: knowledge_spaces knowledge_spaces_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.knowledge_spaces
    ADD CONSTRAINT knowledge_spaces_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: knowledge_spaces knowledge_spaces_owner_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.knowledge_spaces
    ADD CONSTRAINT knowledge_spaces_owner_agent_id_fkey FOREIGN KEY (owner_agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;


--
-- Name: knowledge_spaces knowledge_spaces_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.knowledge_spaces
    ADD CONSTRAINT knowledge_spaces_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: meeting_media meeting_media_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.meeting_media
    ADD CONSTRAINT meeting_media_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: meeting_media meeting_media_meeting_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.meeting_media
    ADD CONSTRAINT meeting_media_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.meetings(id) ON DELETE CASCADE;


--
-- Name: meeting_messages meeting_messages_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.meeting_messages
    ADD CONSTRAINT meeting_messages_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;


--
-- Name: meeting_messages meeting_messages_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.meeting_messages
    ADD CONSTRAINT meeting_messages_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: meeting_messages meeting_messages_meeting_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.meeting_messages
    ADD CONSTRAINT meeting_messages_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.meetings(id) ON DELETE CASCADE;


--
-- Name: meeting_messages meeting_messages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.meeting_messages
    ADD CONSTRAINT meeting_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: meeting_participants meeting_participants_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.meeting_participants
    ADD CONSTRAINT meeting_participants_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;


--
-- Name: meeting_participants meeting_participants_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.meeting_participants
    ADD CONSTRAINT meeting_participants_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: meeting_participants meeting_participants_meeting_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.meeting_participants
    ADD CONSTRAINT meeting_participants_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.meetings(id) ON DELETE CASCADE;


--
-- Name: meetings meetings_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: meetings meetings_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: meetings meetings_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: objectives objectives_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.objectives
    ADD CONSTRAINT objectives_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: objectives objectives_owner_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.objectives
    ADD CONSTRAINT objectives_owner_agent_id_fkey FOREIGN KEY (owner_agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;


--
-- Name: objectives objectives_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.objectives
    ADD CONSTRAINT objectives_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: org_edges org_edges_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.org_edges
    ADD CONSTRAINT org_edges_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: org_edges org_edges_manager_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.org_edges
    ADD CONSTRAINT org_edges_manager_agent_id_fkey FOREIGN KEY (manager_agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;


--
-- Name: org_edges org_edges_subordinate_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.org_edges
    ADD CONSTRAINT org_edges_subordinate_agent_id_fkey FOREIGN KEY (subordinate_agent_id) REFERENCES public.agents(id) ON DELETE CASCADE;


--
-- Name: projects projects_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: rag_citations rag_citations_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.rag_citations
    ADD CONSTRAINT rag_citations_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;


--
-- Name: rag_citations rag_citations_chunk_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.rag_citations
    ADD CONSTRAINT rag_citations_chunk_id_fkey FOREIGN KEY (chunk_id) REFERENCES public.chunks(id) ON DELETE CASCADE;


--
-- Name: rag_citations rag_citations_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.rag_citations
    ADD CONSTRAINT rag_citations_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: rag_citations rag_citations_meeting_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.rag_citations
    ADD CONSTRAINT rag_citations_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.meetings(id) ON DELETE SET NULL;


--
-- Name: rag_citations rag_citations_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.rag_citations
    ADD CONSTRAINT rag_citations_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;


--
-- Name: roles roles_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: sql_access_policies sql_access_policies_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.sql_access_policies
    ADD CONSTRAINT sql_access_policies_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: sql_access_policies sql_access_policies_data_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.sql_access_policies
    ADD CONSTRAINT sql_access_policies_data_source_id_fkey FOREIGN KEY (data_source_id) REFERENCES public.sql_data_sources(id) ON DELETE CASCADE;


--
-- Name: sql_data_sources sql_data_sources_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.sql_data_sources
    ADD CONSTRAINT sql_data_sources_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: task_dependencies task_dependencies_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_dependencies_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: task_dependencies task_dependencies_dependee_fk; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_dependencies_dependee_fk FOREIGN KEY (dependee_task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_dependencies task_dependencies_depends_on_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_dependencies_depends_on_task_id_fkey FOREIGN KEY (depends_on_task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_dependencies task_dependencies_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_dependencies_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_dependencies task_dependencies_waiter_fk; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.task_dependencies
    ADD CONSTRAINT task_dependencies_waiter_fk FOREIGN KEY (waiter_task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: task_events task_events_actor_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.task_events
    ADD CONSTRAINT task_events_actor_agent_id_fkey FOREIGN KEY (actor_agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;


--
-- Name: task_events task_events_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.task_events
    ADD CONSTRAINT task_events_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: task_events task_events_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.task_events
    ADD CONSTRAINT task_events_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: task_events task_events_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.task_events
    ADD CONSTRAINT task_events_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_assigned_to_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_assigned_to_agent_id_fkey FOREIGN KEY (assigned_to_agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_created_by_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_created_by_agent_id_fkey FOREIGN KEY (created_by_agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_integration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_integration_id_fkey FOREIGN KEY (integration_id) REFERENCES public.integrations(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_objective_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_objective_id_fkey FOREIGN KEY (objective_id) REFERENCES public.objectives(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_parent_task_fk; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_parent_task_fk FOREIGN KEY (parent_task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_parent_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_parent_task_id_fkey FOREIGN KEY (parent_task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_root_task_fk; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_root_task_fk FOREIGN KEY (root_task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;


--
-- Name: tool_calls tool_calls_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.tool_calls
    ADD CONSTRAINT tool_calls_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;


--
-- Name: tool_calls tool_calls_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.tool_calls
    ADD CONSTRAINT tool_calls_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: tool_calls tool_calls_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.tool_calls
    ADD CONSTRAINT tool_calls_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;


--
-- Name: transcriptions transcriptions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.transcriptions
    ADD CONSTRAINT transcriptions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: transcriptions transcriptions_meeting_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.transcriptions
    ADD CONSTRAINT transcriptions_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.meetings(id) ON DELETE CASCADE;


--
-- Name: usage_ledger usage_ledger_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.usage_ledger
    ADD CONSTRAINT usage_ledger_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;


--
-- Name: usage_ledger usage_ledger_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.usage_ledger
    ADD CONSTRAINT usage_ledger_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: usage_ledger usage_ledger_meeting_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.usage_ledger
    ADD CONSTRAINT usage_ledger_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.meetings(id) ON DELETE SET NULL;


--
-- Name: usage_ledger usage_ledger_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.usage_ledger
    ADD CONSTRAINT usage_ledger_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;


--
-- Name: user_roles user_roles_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: worklogs worklogs_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.worklogs
    ADD CONSTRAINT worklogs_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE SET NULL;


--
-- Name: worklogs worklogs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.worklogs
    ADD CONSTRAINT worklogs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: worklogs worklogs_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.worklogs
    ADD CONSTRAINT worklogs_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;


--
-- Name: worklogs worklogs_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: fluidmanager
--

ALTER TABLE ONLY public.worklogs
    ADD CONSTRAINT worklogs_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

\unrestrict BkhQX9kgw7Fle60UkMZPHbEzfPimEzWl5I7TF4k2iHlA75m4RGnifTRLHav9irb

