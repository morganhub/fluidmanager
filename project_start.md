# Projet : Entreprise Virtuelle Multi-Agents (Dashboard CEO + IA hiérarchique)

## 0) Description complète (vision produit)

Vous construisez l'application web nommée fluidManager qui simule une entreprise virtuelle composée de “personnels IA” (agents) organisés en **organigramme hiérarchique**.  
L’utilisateur est le **PDG** (niveau **N**) et pilote l’entreprise via un **dashboard** : il crée des agents, définit leurs rôles, leurs compétences, leurs consignes, leurs droits d’accès à des outils (RAG, SQL, Web), puis **donne des missions** et **organise des réunions**.

Les agents peuvent se déléguer des tâches **dans le respect de l’organigramme** :  
- **N** (PDG) peut déléguer à ses **N-1** (top management).  
- Un **N-1** peut déléguer à des **N-2**, etc.  
- Il existe des **fourches** : plusieurs agents au même niveau, chacun avec ses équipes en dessous.  
- Des contraintes métier existent (ex : un commercial ne peut pas être au-dessus d’un développeur/CTO, ou ne peut pas lui assigner directement des tâches).

Le système doit permettre :
- des **tâches ponctuelles** (ex : livrer une page web, rédiger une proposition commerciale),
- des **tâches cycliques** (ex : veille, analyse d’emails entrants, reporting hebdo),
- des **réunions** (meeting) avec plusieurs agents, production de **décisions** et **CTA** (Call To Actions), puis dispatch vers les bons niveaux hiérarchiques,
- un **humain dans la boucle** : approbations (publication, dépenses, actions sensibles), arbitrage CEO.

Le tout doit être **monitorable** et **contrôlable** :
- état des tâches (queued/running/paused/blocked/failed/done),
- gestion (pause/resume/cancel/retry/reassign/priority/deadline),
- traçabilité complète (logs, tool calls, coûts/tokens, durées),
- gouvernance des accès (RBAC, budgets, permissions par agent).

---

## 1) Objectifs (fonctionnels)

### 1.1 Objectifs “CEO cockpit”
- Gérer l’entreprise virtuelle :
  - créer/éditer/supprimer agents (nom, photo, rôle, seniorité, affinités),
  - structurer l’organigramme (N, N-1, N-2… + fourches),
  - définir des politiques globales (budget tokens/mois, modèles LLM autorisés, règles de sécurité).
- Gérer les opérations :
  - créer/assigner des tâches,
  - superviser et piloter leur exécution,
  - afficher coûts/tokens/durée par tâche, agent, projet, période.
- Gérer les réunions :
  - sélectionner les participants,
  - conduire une conversation multi-rôles,
  - obtenir une synthèse, décisions, risques, questions ouvertes,
  - générer et dispatcher automatiquement des CTA.

### 1.2 Objectifs “agents”
- Chaque agent a :
  - un “profil” (rôle, compétences, expérience, tonalité),
  - un “prompt système” / consignes,
  - un ensemble d’outils autorisés (RAG, SQL, Web, intégrations),
  - des limites (budget tokens, domaines web autorisés, tables SQL autorisées).
- Les agents peuvent :
  - demander des clarifications,
  - exécuter des tâches,
  - déléguer (uniquement si la hiérarchie/policy l’autorise),
  - remonter des blocages/risques au niveau supérieur.

### 1.3 Objectifs “knowledge & tools”
- RAG multi-espaces :
  - base de connaissance par département/projet/agent,
  - ACL d’accès (qui peut consulter quoi),
  - citations internes (quels documents/chunks ont servi).
- SQL tool (données structurées, dont données clients) :
  - accès read-only à des vues ou schémas autorisés,
  - journalisation des requêtes (audit),
  - possibilité d’exposer des vues de suivi “progrès” (tâches, worklog, blockers) sans créer une DB par agent.
- Web tool :
  - activable/désactivable par agent,
  - allowlist de domaines + quotas,
  - journalisation des recherches.

### 1.4 Objectif “progrès et mémoire évolutive des agents” (important)
Les agents doivent pouvoir “progresser” et capitaliser sans fragmenter l’infra :
- **Progrès opérationnel** : stocké dans la base centrale (Postgres) via `tasks`, `task_events`, `artifacts`, `worklog`.
- **Connaissance** : stockée via des **KnowledgeSpaces** (RAG) par agent/projet/département, avec ACL.
- **SQL d’analyse** : accès contrôlé à des **vues** ou à du **RLS** (Row Level Security) pour que l’agent voie uniquement son périmètre.
- Pas de “une base SQL par agent” : on utilise un **Workspace** (SQL + RAG + Artifacts) piloté par permissions.

---

## 2) Objectifs (non fonctionnels)

### 2.1 Low-cost & self-hosted
- Tout doit tourner en **Docker** sur Ubuntu 24 (Plesk possible en reverse-proxy).
- Pas de dépendance obligatoire à des SaaS payants (hors LLM/API externes).

### 2.2 Fiabilité & traçabilité
- Postgres comme “source de vérité”.
- Historique d’événements (audit log + task events).
- Résilience : retries contrôlés côté workers.
- Sécurité : RBAC + politiques d’accès outils + secrets isolés.

### 2.3 Évolutivité
- Support multi-projets, multi-agents, multi-queues.
- Possibilité de remplacer/augmenter la brique RAG (pgvector → vector DB dédiée) plus tard.
- Possibilité de faire évoluer l’exécution durable (Celery/BullMQ → Temporal/ReState) si besoin.

---

## 3) Architecture cible (macro)

### 3.1 Composants
1. **Next.js** (dashboard / contrôle entreprise)
   - organigramme (CRUD + visualisation),
   - meetings (UI conversation + synthèse + CTA),
   - task board + monitoring,
   - paramètres globaux + profils agents,
   - actions : pause/resume/cancel/retry/reassign/priority/deadline.

2. **FastAPI** (API + policy engine)
   - RBAC,
   - règles hiérarchiques (N, N-1…),
   - budgets,
   - endpoints “commandes” (pause, retry…),
   - orchestrations meeting → CTA → dispatch,
   - RAG endpoints (retrieve, cite),
   - SQL tool sécurisé (read-only, allowlist, vues, ou RLS).

3. **Celery + Redis** (queue + workers)
   - exécution asynchrone,
   - tâches longues/cycliques,
   - retries/backoff,
   - workers par domaine (dev/marketing/compta…),
   - publication d’événements (via DB + éventuellement pub/sub).

4. **Postgres + pgvector** (app + RAG)
   - entités métier (agents, org, tasks, meetings),
   - logs, audit, token usage,
   - index RAG (chunks + embeddings + ACL),
   - “workspaces” (worklog, artifacts, progress views).

5. **MinIO** (documents)
   - stockage fichiers (PDF, images, briefs, contrats, exports),
   - versionning simple via metadata DB.

---

## 4) Modèle de données (conceptuel)

### 4.1 Entités principales
- **Agent**
  - id, first_name, last_name, role, level (N, N-1…), seniority, bio, avatar_url
  - system_prompt, style_guidelines
  - budgets (tokens/day, tokens/month, max_cost)
  - allowed_tools (rag/sql/web/…)
- **OrgEdge**
  - manager_agent_id → subordinate_agent_id
  - constraints (optional), effective_from/to
- **Meeting**
  - id, title, created_by (CEO), participants[]
  - transcript, summary, decisions, open_questions
- **Task**
  - id, title, description, status
  - assigned_to_agent_id, created_by_agent_id
  - priority, scheduled_at, deadline_at
  - attempt_count, max_attempts
  - token_usage, cost_estimate, duration_ms
- **TaskEvent** (audit d’état)
  - task_id, event_type, payload, created_at, actor (agent/system/human)
- **Artifact**
  - task_id, type (spec/file/link/post), minio_path/url, metadata, created_at
- **Worklog**
  - agent_id, task_id (optional), content, created_at, visibility (agent/manager/project)
- **ToolCallLog**
  - task_id, agent_id, tool_type (rag/sql/web), request, response_meta, created_at
- **KnowledgeSpace**
  - id, name, scope (dept/projet/agent), ACL rules
- **Document**
  - id, space_id, source_type, minio_path, metadata
- **Chunk**
  - document_id, text, embedding_vector, tags, ACL fields

---

## 5) Règles de gouvernance (policies)

### 5.1 Hiérarchie (N, N-1, …)
- Un agent ne peut assigner qu’à :
  - ses subordonnés directs (N-x → N-(x+1)), ou
  - via escalation (remonte à son manager si besoin).
- Interdictions : règles explicites (ex : Sales → Dev direct interdit).
- Certaines actions exigent approval CEO : publication, dépenses, actions “externes”.

### 5.2 Accès outils
- RAG : par KnowledgeSpace + ACL.
- SQL : read-only + vues autorisées (ou RLS) + journalisation.
- Web : allowlist + quotas + logs.

---

## 6) Plan projet : étapes (STEP BY STEP)

> Vous n’avez rien d’installé actuellement. On va donc construire l’infrastructure et le produit par incréments, en gardant toujours un système utilisable à chaque étape.

### Étape 1 — Fondation infra Docker (local serveur)
**Livrables**
- Docker + docker compose fonctionnels
- Réseau interne + volumes persistants
- Postgres, Redis, MinIO démarrés
- Mécanismes de backup de base (volumes + dumps)

**Critères de réussite**
- `postgres` accessible depuis conteneurs
- `redis` accessible
- `minio` accessible + bucket de test
- Persistance confirmée après redémarrage

---

### Étape 2 — Base de données (schéma v0) + migrations
**Livrables**
- Schéma Postgres initial : agents, org_edges, tasks, task_events, worklog, artifacts, meetings
- Outil migrations (Alembic si Python, ou Prisma migrations si Node côté Next)
- Données seed (agents de test + org de test)

**Critères de réussite**
- CRUD DB stable
- Requêtes organigramme et tâches fonctionnelles

---

### Étape 3 — FastAPI v0 (API + RBAC minimal)
**Livrables**
- Auth simple (token/session) + rôles (CEO/admin)
- Endpoints CRUD :
  - agents, org_edges, tasks, worklog, artifacts, meetings
- Contrôles hiérarchiques de base (N délègue à N-1, etc.)
- Endpoints “commandes” tâches :
  - pause/resume/cancel/retry/reassign/priority/deadline

**Critères de réussite**
- Vous pouvez créer agents + org via API
- Vous pouvez créer et assigner une tâche en respectant les règles
- Vous pouvez piloter l’état d’une tâche via commandes

---

### Étape 4 — Next.js v0 (Dashboard minimal)
**Livrables**
- Login
- Pages :
  - Organigramme (liste + visualisation simple)
  - Tasks (liste + détail + timeline events)
  - Worklog / Artifacts (par agent et par tâche)
- Actions sur tâches via API :
  - pause/resume/cancel/retry/reassign

**Critères de réussite**
- Un “cockpit” utilisable avec lecture/écriture
- Suivi “progrès agent” via worklog + tasks

---

### Étape 5 — Celery workers v0 (exécution asynchrone)
**Livrables**
- Mise en place Celery + Redis broker
- Worker générique + queue
- Pipeline minimal :
  - création task → enfile job → exécution mock → update status + events + worklog

**Critères de réussite**
- Une tâche passe de queued → running → done sans bloquer l’UI
- Logs d’état visibles dans Next.js

---

### Étape 6 — Meetings v0 (transcript + synthèse + CTA)
**Livrables**
- Modèle meeting + messages
- “Meeting room” UI
- Orchestration FastAPI :
  - conversation (multi-agents) contrôlée
  - synthèse + décisions + CTA
  - dispatch CTA → tasks + worklog + artifacts

**Critères de réussite**
- Un meeting produit une liste de tâches assignées aux bons niveaux

---

### Étape 7 — Traçabilité, coûts/tokens, observabilité v0
**Livrables**
- ToolCallLog + token_usage + cost_estimate
- Dashboards :
  - coûts par agent/projet/période
  - durées et taux d’échec
- Erreurs structurées + tracing minimal

**Critères de réussite**
- Vous pouvez auditer “qui a fait quoi” et “combien ça a coûté”

---

### Étape 8 — RAG v0 (pgvector) + KnowledgeSpaces + ACL
**Livrables**
- pgvector
- pipeline ingestion (MinIO → chunks → embeddings → pgvector)
- retrieve + citations
- ACL par space (marketing/projet/dev/agent_personal…)

**Critères de réussite**
- Un agent peut répondre en citant la base autorisée
- Un agent non autorisé est bloqué

---

### Étape 9 — SQL Tool v0 (données clients + vues “progrès”)
**Livrables**
- Connecteur SQL read-only (vues allowlist / schéma autorisé)
- Journalisation requêtes
- UI “Data Sources” par agent (permissions + périmètre)
- Vues de suivi (progress) :
  - tâches assignées, blockers, KPIs, worklog

**Critères de réussite**
- Un agent peut requêter uniquement des vues autorisées (clients + progrès)
- Toutes les requêtes sont auditables

---

### Étape 10 — Automatisations cycliques v0
**Livrables**
- Celery Beat ou scheduler
- Tâches cycliques : veille / check mails (placeholder)
- Approvals CEO sur actions externes

**Critères de réussite**
- Une tâche cyclique se déclenche, se loggue, et peut être suspendue

---

## 7) Définition “Done” (MVP)
Le MVP est considéré terminé si :
- vous pouvez créer une entreprise virtuelle (agents + org),
- lancer un meeting multi-agents,
- générer des CTA,
- dispatcher en tâches,
- exécuter des tâches via workers,
- monitorer, interrompre, relancer,
- tracer tool calls + coûts/tokens,
- intégrer au moins une source de connaissance (RAG OU SQL),
- assurer un “progrès agent” via tasks + worklog + artifacts.

---

## 8) Règles de mise en œuvre (discipline projet)
- Postgres = vérité (états + audit + progrès).
- Toute action UI = “commande” API (RBAC + policies).
- Les workers ne décident pas des permissions : ils exécutent.
- Logs obligatoires (tool calls, transitions d’état, erreurs).
- Commencer simple (polling), passer à SSE/WebSocket ensuite.
- Éviter la fragmentation : workspaces logiques (SQL/RAG/Artifacts) plutôt que bases physiques par agent.

---
