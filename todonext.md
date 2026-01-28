# fluidmanager — todonext.md

## Contexte
fluidmanager est un système “cockpit” (interface web) pour piloter une entreprise virtuelle d’employés IA organisés en organigramme (N, N-1, N-2, …) avec :
- tâches déléguées selon la hiérarchie et des contraintes (RBAC, budgets, scopes),
- réunions multi-agents (questions / challenge / décisions / CTA),
- traçabilité complète (logs, events, coûts/tokens),
- livrables publiables (previews web) et monitoring/contrôle runtime (pause/resume/cancel/reset).

Stack actuelle (low cost, auto-hébergeable) :
- Postgres + pgvector : base applicative + RAG
- Redis : broker/result Celery + éventuellement PubSub
- MinIO : stockage objets (documents / previews)
- FastAPI : API + règles + orchestration (envoi jobs Celery)
- Celery worker : exécution des jobs + mise à jour DB/metadata
- Nginx/Plesk : reverse proxy + domaines (api.manager..., preview.manager..., manager...)

## Objectif produit (MVP)
Être “CEO” dans un dashboard web :
- voir l’organigramme, agents, compétences, ressources,
- créer/assigner des tâches, suivre état + logs + coûts,
- contrôler les jobs (pause/resume/cancel/reset/retry),
- organiser une réunion avec agents choisis, obtenir questions/CTA,
- produire des livrables “preview” consultables via URL propre.

## Où on en est (status)
### Infra
- Postgres pgvector : OK (docker) + schéma v0 + seed OK
- Redis : OK
- MinIO : OK + bucket previews public download
- Nginx/Plesk : OK
  - api.manager.fluidifia.com -> FastAPI (proxy)
  - preview.manager.fluidifia.com -> MinIO previews (SPA-friendly)

### API/Worker
- FastAPI en prod via Docker : /health OK, /db/ping protégé via X-API-Key OK
- Celery worker OK (redis broker/result OK)
- Publication preview ZIP :
  - endpoint publish OK
  - worker unzip/upload OK
  - content-type MIME OK (HTML/JS)
  - DB metadata artifact mise à jour OK (state STARTED/SUCCESS + counts)
- Contrôles tasks :
  - pause/resume/cancel OK via `control_json`
  - ajout prévu/validé : endpoint `reset` pour remettre pause/cancel à false

## Prochaines grosses étapes (ordre recommandé)

### 1) Stabiliser le “Task Control Plane” (API + Worker)
Objectif : contrôle robuste et observable.
- [ ] Ajouter endpoint `reset` (pause=false, cancel=false) + tests curl
- [ ] Ajouter endpoint `retry` (requeue) : crée un job Celery lié à un task_id existant
- [ ] Ajouter endpoint `status` job Celery consolidé : task(app) + job(celery) en une réponse
- [ ] Normaliser `runtime_json` (celery_task_id, started_at, finished_at, error, attempts, worker_id)
- [ ] Ajouter logs structurés (task_events) sur pause/resume/cancel/reset/run/retry

### 2) Mettre en place un “Runner” standard (au lieu des jobs ad-hoc)
Objectif : 1 task_id applicatif => N runs => 1 run actif.
- [ ] Table `task_runs` (ou équivalent) : run_id, task_id, celery_task_id, state, timestamps, payload, result, error
- [ ] Endpoints :
  - POST /tasks/{id}/run (crée run + enqueue)
  - GET /tasks/{id}/runs + GET /runs/{run_id}
  - POST /runs/{run_id}/cancel (optionnel, sinon via task control)
- [ ] Worker met à jour `task_runs` plutôt que `tasks.runtime_json` en direct

### 3) “Deliverables” unifiés (Artifacts)
Objectif : chaque tâche peut produire des livrables consultables.
- [ ] Convention de prefix previews : {company_code}/{project_code}/{task_id}/
- [ ] Endpoint list previews d’une task + dernier preview + pin “approved”
- [ ] Support “multi-artifacts” : zip preview, lien externe, doc, screenshot, etc.
- [ ] Politique de rétention (garder X derniers previews par task)

### 4) Agents + Compétences + Délégation hiérarchique (règles)
Objectif : le CTO sait à qui déléguer, PM ne délègue pas au dev si contrainte, etc.
- [ ] API : endpoints org (agents, edges, capacités) + recherche “qui peut faire quoi”
- [ ] Règles d’assignation :
  - N-X peut assigner à N-(X+1) uniquement si edge manager->subordinate existe
  - contraintes JSON : departments interdits, budgets, scopes
- [ ] “Agent profiles” versionnés (system prompts, outils autorisés, RAG spaces)

### 5) Meetings (orchestration multi-agents)
Objectif : une réunion produit questions + décisions + CTA.
- [ ] Modèle “meeting_run” : participants, transcript, decisions, actions
- [ ] Pipeline :
  1) collecte questions par rôle (parallèle)
  2) consolidation PM/CTO (N-1) -> questions au CEO
  3) synthèse + CTA + next tasks
- [ ] Exécution via Celery (fan-out/fan-in) + états observables dans UI

### 6) Dashboard Web (Next.js)
Objectif : cockpit utilisable (MVP UI).
- [ ] Auth (clé admin temporaire puis login)
- [ ] Pages :
  - organigramme (graph)
  - tasks (liste + détail + contrôle)
  - artifacts (previews)
  - meetings (runs)
  - settings (company + integrations)
- [ ] Temps réel : polling au début, puis SSE/WebSocket ensuite

### 7) RAG (pgvector) + Ingestion documents
Objectif : base connaissance multi-scope (company / project / agent).
- [ ] Ingestion : upload -> MinIO -> chunk -> embeddings -> pgvector
- [ ] Retrieval : par scope + ACL
- [ ] Outils agent : search_knowledge(space_ids, query)

### 8) Sécurité / Ops
Objectif : safe-by-default.
- [ ] Secrets : sortir les clés du .env vers Plesk secrets / Docker secrets si possible
- [ ] Rate limiting API + audit log
- [ ] Backups (pg + minio) + restore test
- [ ] Monitoring basique (health endpoints + logs)

## Notes d’implémentation
- Toujours distinguer :
  - Task applicative (task_id) = objet de travail “métier”
  - Job Celery (celery_task_id) = exécution technique d’un run
- URL previews sans extension :
  - /.../TASK-ID/ => sert index.html
  - /.../TASK-ID/action => fallback index.html (SPA)
  - Les assets gardent leur extension (JS/CSS/img)
