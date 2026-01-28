# 🚀 fluidManager — Status Report (28 Janvier 2026)

## 📊 État Global : Moteur d'Exécution Validé & Prêt pour l'IA Métier
Le système a franchi l'étape de l'infrastructure pure. Nous avons maintenant un "tuyau" fonctionnel et sécurisé entre le CEO (API), les employés (Workers) et les outils tiers (N8N/Langflow).

### ✅ Fondations Robustes (Opérationnelles)
* **Système de Webhooks Flexibles :** Le worker peut désormais exécuter n'importe quel job externe. Le cycle de callback HMAC est validé, garantissant que seuls les agents autorisés peuvent finaliser une tâche.
* **Infrastructure Docker :** Postgres (pgvector), Redis, et MinIO sont sains et interconnectés.
* **Pipeline d'Artifacts :** La capacité de livrer des "previews" web (SPA-friendly) via MinIO est active.
* **Audit Trail :** Chaque micro-changement d'état est tracé dans `task_events`.

---

## 🧠 Le Système Initial : Rappel des Piliers à ne pas oublier
Pour rester fidèle à la vision "CEO Cockpit", les développements prioritaires doivent maintenant porter sur :

### 1. La Mémoire Évolutive (Progrès Agents)
Le projet stipule que les agents ne doivent pas être "amnésiques". 
* **Workspace Logique :** Contrairement à une base par agent, nous utilisons un espace partagé (SQL + RAG) piloté par permissions (ACL/RLS).
* **Capitalisation :** Chaque tâche réussie doit nourrir le `Worklog` et les `KnowledgeSpaces` pour améliorer les futures exécutions.

### 2. La Gouvernance Hiérarchique (N-1 / N-2)
* **Délégation Contrôlée :** Un agent ne peut déléguer qu'à ses subordonnés directs définis dans l'organigramme.
* **Arbitrage Humain :** Le CEO (utilisateur) reste le juge final pour les actions sensibles (approbation de publication ou dépenses).

### 3. Les Réunions Multi-Agents (Pipelines Fans)
* Ce n'est pas un simple chat, mais une usine à décisions.
* **Scribe (Co-directeur) :** Son rôle est critique : transformer le transcript de réunion en missions segmentées et assignées automatiquement.

---

## 🛠 Prochaines Étapes Stratégiques (Roadmap Senior)

### Phase 1 : Intelligence & Organigramme (Back-end)
* **Modèle OrgEdge :** Implémenter les relations manager ↔ subordonné en base de données.
* **Validateur de Policies :** Créer le moteur de règles interdisant, par exemple, à un agent commercial d'assigner une tâche technique à un développeur sans passer par le CTO.
* **Budgets :** Suivi réel des coûts (tokens/API) pour bloquer les tâches si le quota de l'agent est atteint.

### Phase 2 : Cockpit de Pilotage (Front-end Next.js)
* **Visualisation Graph :** Un dashboard pour voir l'entreprise "vivre" (qui travaille sur quoi en temps réel).
* **Interface Scribe :** Une vue pour valider/éditer les missions proposées par l'IA après une réunion avant leur mise en file d'attente.

### Phase 3 : RAG & Outils (Connaissance)
* **Ingestion automatisée :** Pipeline `Upload` ➔ `pgvector` pour que les agents aient accès aux documents du projet via l'outil `search_knowledge`.
* **SQL Tool :** Accès sécurisé (Read-only) aux données métier pour que les agents puissent faire du reporting.

---

## 💡 Expertise & Discipline Projet
* **Postgres reste la vérité :** Les workers ne décident de rien, ils exécutent et rapportent.
* **Observabilité totale :** Pour éviter l'effet "boîte noire", l'utilisateur doit pouvoir déplier chaque `ToolCallLog` pour comprendre le raisonnement d'un agent.
* **Découplage Webhook :** Nous maintenons la flexibilité actuelle : l'API envoie des consignes, l'agent (N8N/autre) exécute et rappelle avec le résultat.