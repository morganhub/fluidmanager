# FluidManager — Spécification fonctionnelle (Interface React)

> Objectif : 
fournir une UI **opérationnelle** pour piloter une **entreprise virtuelle d’agents** (hiérarchies dynamiques), 
animer des **réunions** multi-employés, et exécuter/contrôler un **workflow de tâches** (N-1 ↔ N-2) avec **dépendances**, **connecteurs webhook**, **fichiers/preview**, et **multilingue** (dictionnaires fichiers).

---

## 1) Navigation & concepts UI

### 1.1 Entités (mental model UI)
- **Company** : espace “entreprise virtuelle” (paramétrage, employés, intégrations, projets).
- **Project** : contexte de production (board de tâches, fichiers, livrables, réunions, historique).
- **Employee (Agent)** : “employé IA” avec un rôle, des compétences, une langue, un style, des règles, un statut (actif/inactif), et des permissions.
- **Hierarchy** : organigramme (N-k), équipes, relations manager ↔ subordinate, rôles transverses (juridique, design, RGPD, etc.).
- **Meeting** : session interactive temps réel (humain + employés sélectionnés/embauchés).
- **Co-directeur (Scribe)** : agent responsable du **compte rendu**, de la **structuration** et de la **création/assignation** des missions post-réunion.
- **Task** : unité d’exécution backend (worker/scheduler), pouvant être **bloquée**, dépendante, relancée, etc.
- **Integrations** : connecteurs (n8n/langflow/webhook generic, autres futurs) + secrets (callback_secret).
- **Preview/Artifacts** : fichiers, dossiers, bundles (zip), outputs d’agents, diff, versions.

### 1.2 Sections principales (sidebar)
- **Dashboard**
- **Companies**
  - **Settings**
  - **Employees & Hierarchy**
  - **Integrations**
- **Projects**
  - **Task Board**
  - **Files / Preview**
  - **Meetings**
  - **Activity / Events**
- **Admin / System** (selon permissions)

---

## 2) Auth, sécurité, permissions

### 2.1 Auth (MVP)
- Auth simple (clé admin / token) au départ.
- UI : page “Connexion” (API key) + stockage sécurisé (session/local storage selon choix).

### 2.2 RBAC (Role-Based Access Control) — UI-ready
Rôles minimum :
- **Owner / Admin** : tout.
- **Manager** : projets, employés (limit), meetings, tâches.
- **Member** : lecture + création de tâches assignées.
- **Viewer** : lecture seule.

Permissions fines (à prévoir) :
- manage_company, manage_integrations, manage_employees, manage_hierarchy
- create_meeting, join_meeting
- create_task, assign_task, approve_task

### 2.3 Sécurité connecteurs
UI doit afficher :
- **integration_id** (copiable)
- **callback endpoint** attendu
- **callback_secret** : jamais affiché en clair après création (pattern “show once”)
- historique des callbacks (events)

---

## 3) Paramétrage Company

### 3.1 Settings (Company)
- Code, nom, description.
- Langue par défaut (cf. multilingue).
- “Normes” / règles globales (RGPD, branding, quality bar, interdits, etc.).
- Mode **Auto-hiring** (activation + contraintes : allowed roles, limites).

### 3.2 Templates / Presets
- Charger un preset d’entreprise :
  - Agence web, Cabinet juridique, Studio créatif, etc.
- Import/export JSON (versionné).

---

## 4) Employees (Agents) & Hiérarchie

### 4.1 CRUD Employé
Champs UI :
- **Nom public** + **titre** (ex. “Directeur juridique”).
- **Rôle/fonction** (taxonomie) + **compétences** (tags).
- **Langue principale** + langues secondaires.
- **Style de communication** (formel, concis, technique…).
- **Instructions système** / “charte” :
  - règles globales
  - règles spécifiques à l’employé
- **Outils autorisés** (connecteurs, etc.) : liste.
- **Statut** : actif/inactif.
- (optionnel) disponibilité/capacité (max tâches, horaires).

UI attendue :
- Liste filtrable + recherche.
- Fiche employé (tabs) : Profil / Instructions / Permissions / Historique / Fichiers.

### 4.2 Hiérarchie (Org Chart)
- Visualisation organigramme :
  - drag & drop pour changer manager
  - niveaux multiples (N-1 / N-2 / N-3…)
- Support “matrix org” possible :
  - manager principal + managers secondaires (ou contrainte chef unique).
- Groupes/équipes :
  - Juridique, Créatif, Produit, RGPD/Compliance, CTO/Dev, etc.

### 4.3 Auto-hiring (dynamique)
- Écran “Recommandations d’embauche” (meeting prep / post-meeting) :
  - l’IA suggère les rôles nécessaires selon sujet et effectif existant
  - bouton “Embaucher” → crée un agent via template
- Historique des embauches : quand/pourquoi/qui a validé.

---

## 5) Meetings (réunion de direction + participants dynamiques)

### 5.1 Création de réunion
- Input : sujet + contexte + contraintes (deadline, budget, stack…).
- Participants :
  - N-1 et/ou N-2 existants
  - “Auto-select” (suggestion IA + validation)
  - “Auto-hire” si manque de compétences
- Choix du **Co-directeur (Scribe)** :
  - assignation obligatoire (par défaut un agent “Co-directeur”).

### 5.2 Live meeting (sans worker)
- Chat multi-intervenants :
  - humain parle
  - chaque employé intervient “en son nom”
  - affichage clair de qui parle (avatar, rôle)
- Contrôles :
  - muter un employé
  - demander une prise de parole ciblée (“@Juridique : …”)
  - “Synthèse intermédiaire”
  - marquer “Décision” / “Action item” sur un message

### 5.3 Fin de réunion (structurant)
- Bouton “Clôturer” :
  - déclenche une tâche du **Co-directeur** :
    - compte rendu structuré
    - objectifs
    - segmentation en missions
    - proposition d’assignations (N-1 → N-2)
- UI “Post-meeting” :
  - statut de la tâche scribe
  - preview du compte rendu
  - liste des missions proposées (draft) + validation/édition avant création des tasks

---

## 6) Tâches (workflow N-1 ↔ N-2, dépendances, validation)

### 6.1 Board par projet
Colonnes :
- Draft / Queued / Running / Blocked / Done / Failed / Canceled

Cartes :
- titre, assignee, priorité, âge, tentatives, job_type
- badges : dépendances, intégration, fichiers outputs, needs review

Filtres :
- agent, statut, priorité, job_type, dépendances, “bloquées uniquement”

### 6.2 Création de tâche (humain ou agent)
- création directe à un N-2 (sans réunion)
- création à un N-1 (qui décompose ensuite)
Champs :
- title
- assignee (employee_id) si dispo dans ton modèle
- job_type + payload (JSON editor + templates)
- integration_id si job_type webhook
- dépendances (multi-select)
- fichiers d’entrée (attach/upload)

### 6.3 Modèle “validation” par N-1
Workflow recommandé :
1) N-1 crée tâches N-2 (avec dépendances)
2) N-1 crée une tâche “review” dépendante des N-2
3) N-2 terminées → review passe queue → exécution “reviewer”
4) reviewer : OK / relance N-2 / crée nouvelle tâche / modifie dépendances

Task detail (obligatoire) :
- payload/runtime/control
- dépendances (waiters/dependees)
- events (audit trail)
- outputs/preview/fichiers
- actions : pause/resume/cancel/reset

### 6.4 Dépendances (DAG)
- UI “Add dependencies” :
  - picker de tâches
  - récap
  - (optionnel) mini-graphe

---

## 7) Intégrations & Webhooks (n8n / langflow / generic)

### 7.1 Ecran Integrations
- Liste par provider : n8n / langflow / webhook
- Détails :
  - base_url
  - is_active
  - provider_code
  - callback endpoint (doc + exemple)
  - callback_secret : générer/rotater (affiché une fois)
  - bouton “Test webhook” (crée une task webhook)

### 7.2 Convention payload webhook (UI assistée)
- path (ex. /webhook/test)
- body JSON
- callback_base_url (auto: API_BASE)
- metadata utile (task_id, company_code, project_code, employee_id…)

### 7.3 Callback sécurisé (HMAC)
- UI doc :
  - X-FM-Timestamp
  - X-FM-Signature
  - fenêtre de validité
- UI logs :
  - callbacks reçus
  - signature ok/ko
  - latence/retours

---

## 8) Fichiers, preview, partage (inputs/outputs)

### 8.1 Files explorer (par projet)
- Arborescence
- Upload (drag & drop), download, delete (selon droits)
- “Attach to task”
- (optionnel) versioning simple (snapshot par task)

### 8.2 Preview outputs
- Panneau “Preview” (PREVIEW_BASE_URL)
- Liens depuis task detail
- Packaging ZIP (publish_preview_zip)

### 8.3 Partage externe
- Lien public (token) pour preview/ZIP
- TTL configurable

---

## 9) Interaction humain ↔ agents (hors meeting)

### 9.1 Chat 1:1 avec un employé
- Fil conversation
- Boutons :
  - “Créer tâche”
  - “Ajouter au meeting”
  - “Demander un avis” (consult)

### 9.2 Mentions & Hand-off
- Dans un projet : mentionner un employé, convertir en mission/tâche

---

## 10) Observabilité : Activity / Events

### 10.1 Event stream
- par projet + par tâche :
  - task_created
  - dependencies_added
  - started/finished
  - webhook_triggered
  - callback_received
  - status_changed
- UI : timeline + filtres

### 10.2 Diagnostics
- Queue health : counts queued/running/blocked
- Scheduler : dernier tick, picked/enqueued
- Worker : erreurs récentes, tasks en échec

---

## 11) Multilingue (impératif)

### 11.1 Principe
- UI i18n via **dictionnaires fichiers** (JSON/TS)
- Toutes chaînes UI via keys (ex. ui.task.status.done)
- Contenu métier :
  - soit stocké “as-is” dans la langue de production
  - soit stocké avec traductions (si besoin)

### 11.2 Changements BDD induits (minimum viable)
- companies.default_locale (ex. fr-FR)
- employees.locale (langue principale d’interaction)
- projects.locale (recommandé : langue de travail du projet)
- meetings.locale (recommandé)

Optionnels (selon ambition) :
- tasks.title_translations JSONB (si tu veux titre multilingue)
- employees.system_prompt_translations JSONB
- meeting_summary_translations JSONB

### 11.3 Stratégie pragmatique
- UI : dictionnaires fichiers pour tout le chrome
- Résumés/livrables : générés dans la langue du projet/meeting
- Option “Traduire” via task (LLM) si besoin

---

## 12) Écrans minimum à livrer (MVP UI)

1. Login / API Key
2. Company switcher + Settings
3. Employees list + Employee detail + Create employee
4. Hierarchy view (org chart)
5. Integrations list + Integration detail + Create integration
6. Projects list + Project create
7. Task board (par projet) + Task detail (events, deps, outputs)
8. Meeting create + Meeting live + Meeting post-summary
9. Files/Preview explorer
10. Activity feed

---

## 13) Conventions UI à figer (recommandées)

- Tout est contextualisé : Company → Project → (Tasks/Meetings/Files)
- Un task detail doit être autonome :
  - payload/runtime/control, intégration, deps, events, outputs
- Polling léger :
  - board tasks : 2–5s
  - meetings : websocket plus tard, sinon long-polling MVP
- JSON editor (payload/runtime) avec templates par job_type
- Switch de langue (company/user) + persistance

---

## 14) Backlog (après MVP)

- Notifications (in-app + email)
- Websocket pour meetings + streaming events
- Versioning avancé fichiers/livrables
- “Marketplace” templates d’agents
- Quotas & facturation
- Audit RGPD + export activité
- Recherche full-text (tasks/events/files)
