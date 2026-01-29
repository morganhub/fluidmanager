# FluidManager — Commandes Projet

> Ce fichier contient toutes les commandes à exécuter sur le serveur pour déployer, mettre à jour et gérer FluidManager.
> Aucun build local (docker, node, react) — tout est push via Git.

---

## 1) Commandes Docker de base

### Démarrer l'ensemble de la stack
```bash
cd /path/to/fluidmanager
docker compose up -d
```

### Reconstruire les images après modification du code
```bash
docker compose build --no-cache
docker compose up -d
```

### Reconstruire un service spécifique
```bash
docker compose build api --no-cache
docker compose up -d api

docker compose build worker --no-cache
docker compose up -d worker beat
```

### Voir les logs en temps réel
```bash
# Tous les services
docker compose logs -f

# Un service spécifique
docker compose logs -f api
docker compose logs -f worker
docker compose logs -f beat
docker compose logs -f postgres
```

### Redémarrer les services
```bash
docker compose restart api
docker compose restart worker beat
```

### Arrêter la stack
```bash
docker compose down
```

### Arrêter et supprimer les volumes (ATTENTION: perd les données)
```bash
docker compose down -v
```

---

## 2) Commandes PostgreSQL

### Accéder au shell psql dans le conteneur
```bash
docker compose --env-file .env exec postgres psql -U fluidmanager -d fluidmanager
```

### Exécuter un fichier SQL
```bash
docker compose --env-file .env exec -T postgres psql -U fluidmanager -d fluidmanager < fluidmanager_schema_X.sql
```

### Dump de la base (backup)
```bash
docker compose --env-file .env exec postgres pg_dump -U fluidmanager fluidmanager > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Restaurer un dump
```bash
docker compose --env-file .env exec -T postgres psql -U fluidmanager -d fluidmanager < backup_YYYYMMDD_HHMMSS.sql
```

---

## 3) Commandes Redis

### Accéder au CLI Redis
```bash
docker compose exec redis redis-cli
```

### Vider le cache Redis
```bash
docker compose exec redis redis-cli FLUSHALL
```

---

## 4) Commandes MinIO

### Accéder à la console MinIO
URL: `http://localhost:9001` (ou votre domaine configuré)
Credentials: voir `.env` (MINIO_ROOT_USER / MINIO_ROOT_PASSWORD)

---

## 5) Commandes Celery

### Voir les tâches en cours
```bash
docker compose exec worker celery -A worker.celery_app inspect active
```

### Voir les tâches programmées (scheduled)
```bash
docker compose exec worker celery -A worker.celery_app inspect scheduled
```

### Purger toutes les tâches en attente
```bash
docker compose exec worker celery -A worker.celery_app purge -f
```

---

## 6) Git & Déploiement

### Push du code (depuis local Windows)
```bash
git add .
git commit -m "description"
git push origin main
```

### Pull sur le serveur et redéploiement
```bash
cd /path/to/fluidmanager
git pull origin main
docker compose build --no-cache
docker compose up -d
```

---

## 7) Commandes SQL de référence

### Créer une nouvelle company (tenant)
```sql
INSERT INTO companies (code, name, locale, timezone) 
VALUES ('new_company', 'New Company Name', 'fr-FR', 'Europe/Paris');
```

### Créer un utilisateur admin pour une company
```sql
-- Récupérer l'ID de la company
SELECT id FROM companies WHERE code = 'new_company';

-- Créer l'utilisateur
INSERT INTO users (company_id, email, display_name, is_active)
VALUES ('<company_id>', 'admin@example.com', 'Admin User', true);

-- Récupérer l'ID des rôles
SELECT id, code FROM roles WHERE company_id = '<company_id>';

-- Assigner les rôles
INSERT INTO user_roles (company_id, user_id, role_id)
VALUES ('<company_id>', '<user_id>', '<role_id>');
```

### Créer un agent (employé IA)
```sql
INSERT INTO agents (company_id, slug, first_name, last_name, title, department, level, system_prompt)
VALUES (
    '<company_id>',
    'directeur-marketing',
    'Marie',
    'Dupont',
    'Directrice Marketing',
    'Marketing',
    'N-1',
    'Tu es Marie Dupont, Directrice Marketing. Tu es experte en stratégie digitale et branding.'
);
```

### Créer un projet
```sql
INSERT INTO projects (company_id, code, name, description, status)
VALUES ('<company_id>', 'PRJ-001', 'Nouveau Projet', 'Description du projet', 'active');
```

### Créer une tâche
```sql
INSERT INTO tasks (company_id, project_id, title, description, status, priority)
VALUES (
    '<company_id>',
    '<project_id>',
    'Titre de la tâche',
    'Description détaillée',
    'queued',
    'normal'
);
```

### Voir les tâches d'une company
```sql
SELECT t.id, t.title, t.status, t.priority, t.created_at
FROM tasks t
WHERE t.company_id = '<company_id>'
ORDER BY t.created_at DESC;
```

### Voir l'organigramme
```sql
SELECT 
    m.first_name || ' ' || m.last_name as manager,
    s.first_name || ' ' || s.last_name as subordinate,
    m.level as manager_level,
    s.level as subordinate_level
FROM org_edges oe
JOIN agents m ON m.id = oe.manager_agent_id
JOIN agents s ON s.id = oe.subordinate_agent_id
WHERE oe.company_id = '<company_id>';
```

---

## 8) Mise à jour du schéma

Tous les fichiers de migration SQL sont nommés `fluidmanager_schema_X.sql` où X est incrémenté.

Pour appliquer une migration:
```bash
docker compose exec -T postgres psql -U fluidmanager -d fluidmanager < fluidmanager_schema_1.sql
```

---

## 9) Frontend React (apps/web)

### Construire et démarrer le frontend
```bash
docker compose build web --no-cache
docker compose up -d web
```

### Reconstruire après modification du code frontend
```bash
git pull origin main
docker compose build web --no-cache
docker compose up -d web
```

### Voir les logs du frontend
```bash
docker compose logs -f web
```

### Redémarrer le frontend
```bash
docker compose restart web
```

---

## 10) Variables d'environnement (.env)

Fichier `.env` à la racine du projet:
```env
POSTGRES_DB=fluidmanager
POSTGRES_USER=fluidmanager
POSTGRES_PASSWORD=<secure_password>

MINIO_ROOT_USER=<minio_user>
MINIO_ROOT_PASSWORD=<minio_password>

API_ADMIN_KEY=<admin_api_key>

PREVIEW_BASE_URL=https://preview.manager.fluidifia.com
PREVIEW_BUCKET=fluidmanager-previews

S3_ENDPOINT=https://s3.fluidifia.com
S3_ACCESS_KEY=<access_key>
S3_SECRET_KEY=<secret_key>
S3_REGION=eu-west-1

# Frontend React
NEXT_PUBLIC_API_URL=https://api.manager.fluidifia.com
```

---

## 11) Déploiement complet (première fois)

```bash
# 1. Cloner le projet
git clone <repo_url> fluidmanager
cd fluidmanager

# 2. Configurer .env
cp .env.example .env
# Editer .env avec vos valeurs

# 3. Construire toutes les images
docker compose build --no-cache

# 4. Démarrer la stack complète
docker compose up -d

# 5. Appliquer les migrations SQL
docker compose exec -T postgres psql -U fluidmanager -d fluidmanager < fluidmanager_schema.sql
docker compose exec -T postgres psql -U fluidmanager -d fluidmanager < fluidmanager_schema_1.sql

# 6. Vérifier que tout fonctionne
docker compose ps
docker compose logs -f
```

