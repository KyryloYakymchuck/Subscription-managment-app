# Деплой на live store (Render)

Покроково. Зараз робимо **Крок 1**.

## Крок 1 — GitHub (зараз)

1. Створи новий репозиторій на GitHub:
   https://github.com/new
   Назва, наприклад: `subscription-management-admin`
   **Не** додавай README / .gitignore (репо має бути порожнім).

2. У PowerShell у папці проєкту виконай (підстав свій URL):

```powershell
git add .
git status
git commit -m "Prepare production deployment for Render"
git remote add origin https://github.com/YOUR_USER/subscription-management-admin.git
git push -u origin main
```

Якщо `remote origin` вже є — замість `add` зроби:

```powershell
git remote set-url origin https://github.com/YOUR_USER/subscription-management-admin.git
git push -u origin main
```

3. Напиши мені URL репозиторію — підемо до **Кроку 2 (Render)**.

---

## Крок 2 — Render (після GitHub)

1. https://render.com → увійти через GitHub
2. **New +** → **Blueprint** → обери репозиторій
3. Render створить Web Service + PostgreSQL з `render.yaml`
4. У Web Service → **Environment** заповни секрети:
   - `SHOPIFY_API_KEY` = Client ID з Partner Dashboard
   - `SHOPIFY_API_SECRET` = Client secret
   - `SUBSCRIPTION_ADMIN_TOKEN` = токен oplata
   - `SHOPIFY_APP_URL` = після першого деплою, наприклад `https://subscription-management-admin.onrender.com`
5. Збережи і зроби **Deploy latest**

---

## Крок 3 — Shopify URLs

У `shopify.app.subscription-management.toml` постав Render URL замість `localhost`, потім:

```powershell
shopify app deploy
```

---

## Крок 4 — Install на live store

Partner Dashboard → App → Install на production store.

---

## Локальна розробка (окремо)

База тепер PostgreSQL (не SQLite):

```powershell
docker compose up -d
# у .env має бути DATABASE_URL з .env.example
npm run setup
npm run dev
```
