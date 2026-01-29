# FluidManager Web

Interface React Next.js pour piloter FluidManager.

## Stack

- Next.js 14 (App Router)
- Shadcn/UI + Tailwind CSS
- React Query (polling)
- Zustand (state management)
- React Flow (organigramme)

## Structure

```
app/                    # Routes Next.js
  (dashboard)/          # Routes protégées (layout 3-pane)
    dashboard/          # Page d'accueil
    companies/          # Gestion companies
    ...
  login/                # Page de connexion
components/
  ui/                   # Composants Shadcn/UI
  layout/               # Sidebar, ContextDrawer
lib/
  api.ts                # Client API
  store.ts              # Zustand stores
  utils.ts              # Utilitaires
  i18n/                 # Traductions fr/en
```

## Déploiement

```bash
# Build et démarrage
docker compose build web --no-cache
docker compose up -d web
```

## Variables d'environnement

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | URL de l'API FluidManager |
