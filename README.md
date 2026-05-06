# CragWeather

14-day weather windows for climbing routes.

## Quickstart

```bash
docker compose up -d                  # local Postgres
cp .env.example .env
npm install
npm run db:migrate
npm run dev
```

Visit `http://localhost:3000`.

## Populate the search index

The `/api/search` endpoint returns nothing until the routes table is populated. To populate from MP's sitemap (5+ hours due to mandatory 60-second crawl-delay):

```bash
npm run index:routes
```

Or seed a single route for development:

```bash
docker compose exec postgres psql -U crag -d crag -c \
  "INSERT INTO routes (id, slug, name) VALUES (105862922, 'the-nose', 'The Nose') ON CONFLICT DO NOTHING;"
```

## Tests

```bash
npm test            # all tests, requires Postgres up
npm run test:watch
```

The test suite expects a Postgres at `POSTGRES_URL` (defaults to local Docker).

## Deploy

1. Create a Vercel project linked to this repo.
2. Add a Vercel Postgres database; copy `POSTGRES_URL` into Project → Settings → Environment Variables.
3. Add the same `POSTGRES_URL` and an `MP_USER_AGENT` to GitHub repository secrets so the monthly indexer workflow can write to the same DB.
4. After the first deploy, run `npm run db:migrate` against the prod URL once.
5. Trigger `.github/workflows/index-routes.yml` manually for the first run.

## Operator notes

- **Scraper drift**: if MP changes its HTML, the scraper fixture tests will fail in CI. Re-fetch
  fixtures (`tests/fixtures/mp/*.html`) and update parsers.
- **Cache TTL**: `route_meta` is treated as fresh for 90 days. Adjust `NINETY_DAYS_MS` in
  `app/api/route/[id]/route.ts`.
- **Crawl-delay**: `scripts/build-index.ts` sleeps 60s between sub-sitemap fetches. Do not lower
  this without re-reading MP's `robots.txt`.
