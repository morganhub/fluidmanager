# Organisation Chart System - FluidManager

## Vue d'ensemble

Système d'organigramme permettant aux managers de visualiser et gérer la structure hiérarchique de leur entreprise avec recrutement depuis les blueprints.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js)                    │
├─────────────────────────────────────────────────────────┤
│  /companies/[code]/organigramme/page.tsx                │
│  ├── OrgNode.tsx (custom React Flow node)               │
│  ├── RecruitmentDrawer.tsx (panneau latéral)            │
│  ├── RecruitConfirmDialog.tsx (confirmation ID card)    │
│  └── EmployeeEditDialog.tsx (édition employé)           │
├─────────────────────────────────────────────────────────┤
│                    BACKEND (FastAPI)                     │
├─────────────────────────────────────────────────────────┤
│  org_chart.py router                                    │
│  ├── GET  /companies/{id}/org-chart                     │
│  ├── GET  /companies/{id}/org-chart/available-blueprints│
│  ├── POST /companies/{id}/org-chart/recruit             │
│  ├── PUT  /companies/{id}/employees/{id}                │
│  └── DELETE /companies/{id}/employees/{id}              │
├─────────────────────────────────────────────────────────┤
│                    DATABASE (PostgreSQL)                 │
├─────────────────────────────────────────────────────────┤
│  org_positions, company_employees                       │
│  init_company_org_chart(), create_company_manager()     │
└─────────────────────────────────────────────────────────┘
```

---

## Base de données

### Fichier : `fluidmanager_schema_5.sql`

**Enum `position_level`**
```sql
CREATE TYPE position_level AS ENUM ('MANAGER', 'N', 'N-1', 'N-2');
```

**Table `org_positions`** - Postes structurels de l'organigramme
| Colonne | Type | Description |
|---------|------|-------------|
| id | UUID | Identifiant unique |
| company_id | UUID | Référence entreprise |
| level | position_level | MANAGER, N, N-1, N-2 |
| position_index | INT | Index pour ordonner les postes du même niveau |
| parent_position_id | UUID | Poste parent (pour N-1 → N, N-2 → N-1) |

**Table `company_employees`** - Instances d'employés recrutés
| Colonne | Type | Description |
|---------|------|-------------|
| id | UUID | Identifiant unique |
| company_id | UUID | Référence entreprise |
| position_id | UUID | Poste occupé |
| blueprint_id | UUID | Blueprint source (NULL pour manager humain) |
| first_name, last_name | TEXT | Nom personnalisable |
| bio | JSONB | Biographie multilingue |
| portrait_id | UUID | Portrait sélectionné |
| skills | TEXT[] | Compétences |
| is_removable | BOOLEAN | FALSE pour le manager |

**Fonctions**
- `init_company_org_chart(company_id)` : Crée les postes par défaut (1 MANAGER, 1 N, 3 N-1, 9 N-2)
- `create_company_manager(...)` : Crée le profil manager non-supprimable

---

## Backend API

### Fichier : `apps/api/app/org_chart.py`

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/companies/{id}/org-chart` | GET | Récupère l'organigramme complet (positions + employés) |
| `/companies/{id}/org-chart/available-blueprints` | GET | Liste les blueprints disponibles pour un poste, filtrés par niveau et contraintes N-1 |
| `/companies/{id}/org-chart/recruit` | POST | Recrute un blueprint dans un poste vacant |
| `/companies/{id}/org-chart/reset` | POST | Réinitialise l'organigramme à sa structure par défaut (conserve le manager) |
| `/companies/{id}/employees/{id}` | PUT | Met à jour un employé (nom, bio, email, phone) |
| `/companies/{id}/employees/{id}` | DELETE | Retire un employé du poste (sauf manager) |

### Authentification
Nouvelle fonction `require_company_access()` dans `auth.py` validant l'accès utilisateur à l'entreprise.

---

## Frontend

### Page principale
**`app/(dashboard)/companies/[code]/organigramme/page.tsx`**

Canvas React Flow avec :
- Layout 3 rangées (Manager+N, 3 N-1, 9 N-2)
- Bouton "Remettre à zéro" pour réinitialiser la structure
- Zoom/pan via contrôles et molette
- MiniMap pour navigation
- Edges connectant la hiérarchie
- Utilisation standardisée de `@/lib/api` pour les appels backend (fixes 404/Auth)

### Composants org-chart

**`OrgNode.tsx`**
- Affichage conditionnel (poste vacant vs occupé)
- Badges colorés par niveau (MANAGER=or, N=violet, N-1=bleu, N-2=gris)
- Portrait ou icône placeholder
- Handlers pour clic recrutement/édition
- Correction intéraction : `pointer-events-auto` sur le contenu pour contourner les limitations de React Flow (`elementsSelectable={false}`)
- Correction drag : `nodrag` pour éviter les conflits de glissement

**`RecruitmentDrawer.tsx`**
- Panneau latéral droit (Sheet)
- Recherche de blueprints avec debounce
- Affichage portrait, rôle, compétences, count "en poste"
- Ouverture du dialog de confirmation

**`RecruitConfirmDialog.tsx`**
- Preview style carte d'identité
- Portrait, nom, rôle, bio, compétences
- Boutons Annuler/Recruter

**`EmployeeEditDialog.tsx`**
- Champs éditables : prénom, nom, bio
- Champs supplémentaires pour MANAGER : email, téléphone
- Champs readonly : niveau, rôle (avec icône cadenas)
- Bouton "Retirer" avec confirmation AlertDialog

### Composants UI ajoutés
- `components/ui/sheet.tsx` - Panneaux latéraux
- `components/ui/alert-dialog.tsx` - Dialogs de confirmation

---

## Sidebar

### Fichier : `components/layout/Sidebar.tsx`

**Modifications :**
- Header dynamique : affiche logo entreprise + code quand une entreprise est sélectionnée
- Menu "Employees" et "Hierarchy" fusionnés en "Organigramme"
- Icône GitBranch pour le menu organigramme

**Assets :**
- `public/icon.svg` copié depuis `assets/img/icon.svg`

---

## Traductions

### Fichiers : `lib/i18n/fr.json` et `lib/i18n/en.json`

Nouvelle section `orgChart` avec clés :
- `title`, `recruit`, `recruiting`, `confirmRecruit`
- `searchRole`, `noProfilesAvailable`, `vacantPosition`
- `alreadyHired`, `recruitAction`
- `editEmployee`, `removeEmployee`, `removeConfirmMessage`
- `levels.MANAGER`, `levels.N`, `levels.N-1`, `levels.N-2`
- Ajout de `common` : `retry`, `reset`, `confirm`, `cancel`, `save`, `delete`, `edit` 

---

## Flux d'utilisation

1. **Création entreprise** → `init_company_org_chart()` crée les postes par défaut
2. **Accès organigramme** → Canvas React Flow affiche la structure (Bouton Reset dispo en cas de problème)
3. **Clic poste vacant** → Ouvre RecruitmentDrawer avec blueprints filtrés
4. **Sélection blueprint** → Dialog confirmation avec preview
5. **Confirmation** → API recruit, rafraîchissement canvas
6. **Clic employé existant** → EmployeeEditDialog pour modifier ou retirer

---

## Déploiement

```bash
# 1. Exécuter le schema SQL
psql -d fluidmanager -f fluidmanager_schema_5.sql

# 2. Rebuild des containers
docker-compose build web api
docker-compose up -d
```
