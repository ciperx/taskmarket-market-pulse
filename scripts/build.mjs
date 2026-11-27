// Fetch Taskmarket market data server-side and write public/data/data.json
// Endpoints (documented in the page methods note):
//   /api/market/stats, /api/stats/breakdowns, /api/stats/platform-time-series,
//   /api/stats/activity-heatmap, /api/stats/activity-feed, /api/tasks
const API = 'https://api.taskmarket.dev'
const CHAINS = [{ id: 4217, name: 'Tempo', unit: 'OUSD' }, { id: 8453, name: 'Base', unit: 'USDC' }]
const RANGES = ['7d', '30d', '90d', 'all']
const TASK_PAGES = 12 // 1200 newest tasks per chain, used for poster/decision metrics

async function j(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'taskmarket-visualizer/1.0' } })
      if (!r.ok) throw new Error(`${r.status} ${url}`)
      return await r.json()
    } catch (e) {
      if (i === tries - 1) throw e
      await new Promise(r => setTimeout(r, 1200 * (i + 1)))
    }
  }
}
const usd = (v) => Number(v || 0) / 1e6
const weekKey = (iso) => {
  const d = new Date(iso); const day = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - day); d.setUTCHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

async function tasksFor(chainId) {
  const out = []; let cursor = null
  for (let p = 0; p < TASK_PAGES; p++) {
    const url = `${API}/api/tasks?chainId=${chainId}&sort=newest&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
    const d = await j(url)
    const arr = d.tasks || []
    out.push(...arr)
    if (!d.hasMore || !d.nextCursor) break
    cursor = d.nextCursor
  }
  return out
}

async function chainData(chain) {
  const c = chain.id
  const [stats, breakdowns, feed] = await Promise.all([
    j(`${API}/api/market/stats?chainId=${c}`),
    j(`${API}/api/stats/breakdowns?chainId=${c}`),
    j(`${API}/api/stats/activity-feed?chainId=${c}&limit=24`)
  ])
  const series = {}
  for (const r of RANGES) {
    const daily = await j(`${API}/api/stats/platform-time-series?chainId=${c}&range=${r}&bucket=day`)
    const weekly = await j(`${API}/api/stats/platform-time-series?chainId=${c}&range=${r}&bucket=week`)
    series[r] = { day: daily, week: weekly }
  }
  const heat = {
    mode: await j(`${API}/api/stats/activity-heatmap?chainId=${c}&range=30d&dimension=mode`),
    hourOfWeek: await j(`${API}/api/stats/activity-heatmap?chainId=${c}&range=30d&dimension=hourOfWeek`)
  }
  const tasks = await tasksFor(c)

  // distinct posters per ISO week
  const byWeek = new Map()
  for (const t of tasks) {
    const w = weekKey(t.createdAt || t.created_at)
    if (!byWeek.has(w)) byWeek.set(w, new Set())
    byWeek.get(w).add(t.requester)
  }
  const postersPerWeek = [...byWeek.entries()].sort().map(([week, s]) => ({ week, posters: s.size }))

  // concentration in the last 30 days of the scanned slice
  const since30 = Date.now() - 30 * 864e5
  const recent = tasks.filter(t => new Date(t.createdAt).getTime() >= since30)
  const counts = new Map()
  for (const t of recent) counts.set(t.requester, (counts.get(t.requester) || 0) + 1)
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const top10 = ranked.slice(0, 10).reduce((s, x) => s + x[1], 0)
  const concentration = {
    posters30d: ranked.length,
    tasks30d: recent.length,
    top10Share: recent.length ? top10 / recent.length : 0,
    top1Share: recent.length && ranked.length ? ranked[0][1] / recent.length : 0
  }

  // dead tasks (expired) share of all scanned
  const expired = tasks.filter(t => t.status === 'expired').length
  const dead = { expired, scanned: tasks.length, share: tasks.length ? expired / tasks.length : 0 }

  // poster payment ratio: rewards put up vs paid, from 30d series
  const s30 = series['30d'].day
  const posted = s30.reduce((s, b) => s + usd(b.rewardVolume), 0)
  const paid = s30.reduce((s, b) => s + usd(b.paidVolume), 0)

  // chain-specific aggregates computed from the task list (the only chain-aware source besides wallet counts)
  const byMode = {}, byStatus = {}
  for (const t of tasks) {
    byMode[t.mode] = (byMode[t.mode] || 0) + 1
    byStatus[t.status] = (byStatus[t.status] || 0) + 1
  }
  const open = tasks.filter(t => t.status === 'open')
  const resolved = tasks.filter(t => ['completed', 'cancelled', 'expired'].includes(t.status))
  const awarded = tasks.filter(t => Number(t.awardCount || 0) > 0)
  const zeroSub = open.filter(t => Number(t.submissionCount || 0) === 0)
  const taskAgg = {
    scanned: tasks.length,
    openCount: open.length,
    openRewardUsd: open.reduce((s, t) => s + usd(t.reward), 0),
    byMode: Object.entries(byMode).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ key: k, count: v })),
    byStatus: Object.entries(byStatus).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ key: k, count: v })),
    awarded: awarded.length,
    resolvedCount: resolved.length,
    awardRate: resolved.length ? awarded.filter(t => ['completed'].includes(t.status)).length / resolved.length : null,
    zeroSubmissionOpen: zeroSub.length,
    zeroSubmissionShare: open.length ? zeroSub.length / open.length : null,
    avgSubsOpen: open.length ? open.reduce((s, t) => s + Number(t.submissionCount || 0), 0) / open.length : null,
    topPosters: ranked.slice(0, 8).map(([addr, n]) => ({ addr, tasks: n }))
  }

  return {
    chainId: c, name: chain.name, unit: chain.unit,
    stats, breakdowns,
    feed: (feed.items || []).map(i => ({ ...i, amountUsd: i.amount == null ? null : usd(i.amount) })),
    series, heat, postersPerWeek, concentration, dead, taskAgg,
    flow30d: { posted, paid, ratio: posted ? paid / posted : null },
    scannedTasks: tasks.length
  }
}

const generatedAt = new Date().toISOString()
const chains = {}
for (const ch of CHAINS) chains[ch.id] = await chainData(ch)

const out = {
  generatedAt,
  source: API,
  ranges: RANGES,
  taskScan: { pagesPerChain: TASK_PAGES, limit: 100 },
  chains
}
await import('node:fs').then(fs => fs.writeFileSync(new URL('../public/data/data.json', import.meta.url), JSON.stringify(out)))
console.log('generatedAt', generatedAt)
for (const c of Object.values(chains)) {
  console.log(c.name, '| open', c.stats.openTasks, '| active7d', c.stats.activeAgents7d, '| scanned', c.scannedTasks,
    '| posters30d', c.concentration.posters30d, '| top10share', (c.concentration.top10Share * 100).toFixed(1) + '%',
    '| posted30d', c.flow30d.posted.toFixed(2), '| paid30d', c.flow30d.paid.toFixed(2), '| expired', c.dead.expired)
}
