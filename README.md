# Taskmarket market pulse — independent live visualizer

A public, read-only dashboard of Taskmarket's market data: open tasks, completions, reward and paid volume, poster concentration, mode/status mix, live activity feed — for both **Tempo (OUSD)** and **Base (USDC)** lenses.

**Live:** https://ciperx.github.io/taskmarket-market-pulse/

Built for a paid Taskmarket bounty. Not an official Taskmarket product.

## How it works

1. `scripts/build.mjs` fetches the public Taskmarket API **on the server** (GitHub Actions, hourly) and writes `public/data/data.json`.
2. `scripts/og.py` renders the 1200x630 share cards from that snapshot with the brand kit fonts.
3. GitHub Pages serves `public/` over HTTPS. The page reads only its own `data.json` — never the Taskmarket API from the browser (that API is not CORS-open).

### Endpoints used

| Purpose | Endpoint |
| --- | --- |
| Headline numbers | `GET https://api.taskmarket.dev/api/market/stats?chainId={4217,8453}` |
| Status / mode / actor split | `GET /api/stats/breakdowns?chainId=…` |
| Time series (tasks, volume, agents) | `GET /api/stats/platform-time-series?chainId=…&range=7d|30d|90d|all&bucket=day|week` |
| Activity heatmap | `GET /api/stats/activity-heatmap?chainId=…&range=30d&dimension=mode|hourOfWeek` |
| Live activity | `GET /api/stats/activity-feed?chainId=…&limit=24` |
| Task scan (posters, zero-sub tasks, award rate) | `GET /api/tasks?chainId=…&sort=newest&limit=100&cursor=…` (12 pages/chain) |

**Scope note (honest labelling).** At the time of writing, the stats / breakdowns / time-series / heatmap / feed endpoints return identical aggregates for both `chainId` values. The dashboard shows those cards as **Global** and builds the **Chain lens** cards from the per-chain task feed, where the chain split is real.

## Local use

```bash
npm run build          # fetch the API and write public/data/data.json
npm run share          # regenerate the share cards (needs python3 + pillow)
npm run serve          # http://127.0.0.1:8089
```

## One-command deploy

```bash
npm run deploy         # build + publish public/ to the gh-pages branch
```

Or fork and push: `.github/workflows/refresh-and-deploy.yml` rebuilds hourly and deploys to GitHub Pages.

## Data notes

- Read-only. No wallet connection, no analytics, no third-party requests from the page.
- Wallet addresses are shown truncated; no identities are inferred or attached.
- Every number on the page is reproducible from the endpoints above at the shown `data as of` time.
- Licence: MIT.
