# FluidManager — Spécification Technique & Fonctionnelle Unifiée

## 1. Vision & Architecture Globale

**FluidManager** est une plateforme SaaS multi-tenant permettant de piloter des entreprises virtuelles composées d'agents IA hiérarchisés. Le système repose sur une architecture hybride où un **Super-Admin** définit les structures métiers (Blueprints) et où des **Clients (Patrons)** orchestrent l'exécution via une interface collaborative assistée par une IA (Co-Président).

### 1.1 Stack Technique
* **Frontend** : React (Next.js), Shadcn/UI, Tailwind CSS, React Flow (Canvas), Zustand (State), React Query.
* **Backend API** : FastAPI (Python), authentification JWT, RBAC.
* **Workers** : Celery + Redis (Exécution asynchrone).
* **Données** : PostgreSQL + pgvector (Métier & RAG), MinIO (Stockage fichiers/Artifacts).
* **IA & Connectivité** : Architecture agnostique (OpenAI, Anthropic, Local LLM) via proxy backend.

### 1.2 Architecture Multi-tenant
* **Niveau Super-Admin** : Provisioning des espaces clients, définition des Blueprints (modèles d'agents), gestion des ressources IA globales ("Managed").
* **Niveau Tenant (Company)** : Espace isolé contenant ses propres données, employés, configurations IA et projets.

---

## 2. Interface Utilisateur (Design System)

L'interface suit les principes du **"Soft UI"** et d'une mise en page "Bento" pour une lisibilité maximale.

### 2.1 Principes Visuels
* **Palette** : Fond neutre et aéré. Couleurs vives (Bleu, Violet, Vert) réservées strictement aux **CTA (Actions)** et **Statuts**.
* **Composants** : Cartes aux bords arrondis, ombres douces, typographie contrastée.
* **Navigation** : Icônes filaires (Outline).

### 2.2 Layout Structurel (3-Pane Layout)
L'application est divisée en trois zones verticales persistantes :
1.  **Sidebar (Navigation)** : Accès global (Dashboard, Structure, Projets, Paramètres).
2.  **Main Content (Flux)** : Espace de travail principal (Canvas Organigramme, Timeline Projet, Board Tâches).
3.  **Context Drawer (Détail)** : Panneau latéral droit superposé pour l'édition (Agent, Tâche, Recrutement) sans perte de contexte.

---

## 3. Gestion de l'Organigramme (Module Structure)

L'organisation humaine virtuelle est visualisée via un **Canvas Infini** (React Flow).

### 3.1 Présentation en Colonnes (Left-to-Right)
L'organigramme se lit de gauche à droite pour supporter la densité :
* **Colonne 1 (Direction)** : Le Patron (Utilisateur) et le Co-Président (IA Scribe). Nœuds fixes.
* **Colonne 2 (Management N-1)** : Liste verticale des managers.
* **Colonne 3 (Exécution N-2)** : Grappes d'agents connectés à leur N-1 respectif par des liens orthogonaux.

### 3.2 Processus de Recrutement Assisté par IA
Le recrutement s'effectue via des nœuds "Placeholder" `[+]` présents dans le Canvas.
1.  **Sélection** : L'utilisateur clique sur `[+]` et choisit un **Blueprint** (ex: "Graphiste") dans le catalogue filtré par le Super-Admin.
2.  **Génération de Persona (Backend)** :
    * L'API appelle le LLM avec le `system_prompt` du Blueprint.
    * Génération automatique : Nom, Bio, Compétences, Avatar, Voix par défaut.
3.  **Modale de Recrutement** :
    * Affichage du profil généré.
    * **Bouton Régénérer (Dice)** : Relance la génération IA si le profil ne convient pas.
    * **Édition** : Modification manuelle possible de tous les champs.
4.  **Validation** : Instanciation de l'agent en base de données avec ses webhooks hérités.

---

## 4. Gestion des Projets & Co-Président

Le module **Projets** est le cœur opérationnel, fonctionnant comme une timeline conversationnelle.

### 4.1 Workflow "Nouvelle Idée"
* **Entrée** : Input texte ou dictée vocale (STT).
* **Analyse** : Le message est traité par le **Co-Président** (Agent IA Système).
* **Réponse** : Le Co-Président propose une action dans la timeline (Création de tâche, Recrutement nécessaire, ou Planification de meeting).

### 4.2 Timeline de Projet (Deployable Items)
Les éléments du projet sont des cartes "Accordéon" :
* **Header** : Résumé de l'étape (ex: "Dév Backend - En cours").
* **Body (Déplié)** :
    * Détail des sous-tâches workers.
    * Barres de progression.
    * **Zone d'Outputs** : Fichiers livrés (Lien MinIO / Preview).
    * **Validation** : Boutons d'approbation humaine.

### 4.3 Chat Contextuel
Une "Prompt Box" en bas de page permet de dialoguer avec le Co-Président spécifiquement sur le contexte du projet actif, pour ajuster des directives ou demander des statuts.

---

## 5. Meetings & Négociation de CTA

### 5.1 Configuration & Live
* **Préparation** : Suggestion automatique des participants ("Auto-select") ou proposition de recrutement ("Auto-hire") si compétence manquante.
* **Bucket Partagé** : Zone de drop pour fichiers (analyse multimodale en séance).
* **Live Room** : Interface modale avec Chat unifié et Audio (STT pour l'humain, TTS pour les agents).

### 5.2 Cycle Post-Meeting (Négociation)
1.  **Analyse** : Le Co-Président analyse le transcript via un Worker d'analyse.
2.  **Proposition** : Génération d'un objet JSON contenant les CTA (Call to Actions).
3.  **Interface de Négociation** :
    * Affichage des tâches proposées en mode "Brouillon".
    * L'utilisateur peut valider ou demander des modifications via un prompt ("Change la deadline du design").
    * L'IA révise les CTA.
4.  **Commit** : Après validation, les tâches sont créées réellement (statut `queued`).

---

## 6. Exécution Technique & Webhooks

Le système repose sur un principe de **"Smart Orchestrator, Dumb Worker"**.

{
  "meeting_url": "[https://n8n.webhook/agentBluePrintName/meeting](https://n8n.webhook/agentBluePrintName/meeting)",
  "task_url": "[https://n8n.webhook/agentBluePrintName/execute](https://n8n.webhook/agentBluePrintName/execute)",
  "review_url": "[https://n8n.webhook/agentBluePrintName/review](https://n8n.webhook/agentBluePrintName/review)"
}


## 7. Proposition de SQL Schema

Ci-après la structure possible du SQL à ajouter dans le projet qui peut être améliorée en fonction des besoins identifiés

-- Extension pour la recherche vectorielle (RAG) et les UUIDs
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- 1. COUCHE SYSTEME & MULTI-TENANT (Super-Admin)
-- =============================================================================

-- Table des entreprises (Clients SaaS)
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    api_key_hash TEXT NOT NULL, -- Master API Key pour l'admin entreprise
    status VARCHAR(20) DEFAULT 'active', -- active, suspended, trial_expired
    plan_type VARCHAR(20) DEFAULT 'free', -- free, pro, enterprise
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table des Blueprints (Modèles d'employés gérés par Super-Admin)
CREATE TABLE blueprints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_name VARCHAR(100) NOT NULL,
    hierarchical_level VARCHAR(10) NOT NULL CHECK (hierarchical_level IN ('N-1', 'N-2')),
    system_prompt_template TEXT NOT NULL, -- Template Jinja2 invisible au client
    default_capabilities JSONB DEFAULT '{}'::jsonb, -- Matrix de webhooks par défaut
    allowed_parents_roles TEXT[] DEFAULT '{}', -- Liste des rôles N-1 autorisés comme supérieurs
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ressources IA globales gérées par Fluidifia
CREATE TABLE global_ai_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_type VARCHAR(20) NOT NULL, -- text, multimodal, tts, stt
    provider_name VARCHAR(50) NOT NULL, -- e.g., 'Fluidifia Qwen-TTS'
    base_url TEXT NOT NULL,
    api_key_encrypted TEXT,
    is_active BOOLEAN DEFAULT TRUE
);

-- =============================================================================
-- 2. COUCHE ENTREPRISE (Admin Client)
-- =============================================================================

-- Configuration spécifique par entreprise (Routage IA)
CREATE TABLE company_settings (
    company_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    ai_routing JSONB DEFAULT '{
        "text": "managed", 
        "multimodal": "managed", 
        "tts": "managed", 
        "stt": "managed"
    }'::jsonb,
    default_locale VARCHAR(5) DEFAULT 'fr-FR',
    branding_json JSONB DEFAULT '{}'::jsonb,
    patron_identity JSONB DEFAULT '{}'::jsonb -- Bio/Photo du patron humain
);

-- Coffre-fort de clés API pour le client (Hybrid AI)
CREATE TABLE credential_store (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    provider_name VARCHAR(50) NOT NULL, -- Nom personnalisé (ex: "Mon OpenAI")
    provider_type VARCHAR(20) NOT NULL, -- text, tts, stt, etc.
    api_key_encrypted TEXT NOT NULL,
    endpoint_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table des Employés (Instances personnalisées des Blueprints)
CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    blueprint_id UUID NOT NULL REFERENCES blueprints(id),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    bio TEXT,
    principles TEXT, -- "Très attentif au détail", etc.
    avatar_url TEXT,
    voice_settings_json JSONB DEFAULT '{}'::jsonb, -- voice_id ou clonage URL
    capabilities_matrix JSONB DEFAULT '{}'::jsonb, -- Surcharge des URLs de webhooks
    is_copresident BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table de l'Organigramme (Edges du Graphe Canvas)
CREATE TABLE org_edges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    manager_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    subordinate_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    edge_type VARCHAR(20) DEFAULT 'direct',
    UNIQUE(subordinate_id) -- Dans ce modèle, un employé a un seul manager direct
);

-- =============================================================================
-- 3. COUCHE OPERATIONNELLE (Projets & Tâches)
-- =============================================================================

-- Projets (Contextes de travail)
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    context_summary TEXT, -- Mis à jour dynamiquement par le Co-Président
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tâches (Workflow asynchrone)
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES tenants(id),
    assigned_to UUID REFERENCES employees(id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'queued', -- queued, running, blocked, done, failed, canceled
    priority INTEGER DEFAULT 1,
    job_type VARCHAR(50) NOT NULL, -- execution, review, meeting, chat
    webhook_url_resolved TEXT, -- URL injectée par l'IA ou le Frontend
    payload_json JSONB DEFAULT '{}'::jsonb, -- Inputs
    runtime_json JSONB DEFAULT '{}'::jsonb, -- Outputs, dates de début/fin
    last_error TEXT,
    attempt_count INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Événements (Audit Trail & Observabilité)
CREATE TABLE task_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES tenants(id),
    event_type VARCHAR(50) NOT NULL, -- status_changed, webhook_sent, callback_received
    actor_type VARCHAR(20) NOT NULL, -- system, human, integration
    payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Réunions
CREATE TABLE meetings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES tenants(id),
    title VARCHAR(255),
    transcript TEXT, -- Stockage brut de la conversation
    draft_ctas_json JSONB DEFAULT '[]'::jsonb, -- CTA en attente de validation
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 4. COUCHE KNOWLEDGE (RAG & Artifacts)
-- =============================================================================

-- Artifacts (Fichiers produits sur MinIO)
CREATE TABLE artifacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id),
    company_id UUID NOT NULL REFERENCES tenants(id),
    file_name VARCHAR(255) NOT NULL,
    minio_path TEXT NOT NULL,
    content_type VARCHAR(100),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Base de connaissance vectorielle
CREATE TABLE knowledge_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id),
    content TEXT NOT NULL,
    embedding VECTOR(1536), -- Dimension pour OpenAI text-embedding-3-small
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 5. INDEXATION & TRIGGERS
-- =============================================================================

CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_employees_company ON employees(company_id);
CREATE INDEX idx_knowledge_vector ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops);

-- Mise à jour automatique du timestamp updated_at
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trg_update_tasks_timestamp
    BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();