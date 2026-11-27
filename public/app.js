// Taskmarket live market visualizer — renders ./data/data.json (built server-side, hourly).
const SNAP = './data/data.json'
const REFRESH_MS = 60_000
const C = { cream: '#EFE9E2', paper: '#FFF6E8', muted: '#B0A79D', line: '#453E37', magenta: '#E74079', salmon: '#D9A097', panel: '#221E1A' }
const $ = (s) => document.querySelector(s)
const fmt = (n) => n == null ? '—' : new Intl.NumberFormat('en-US').format(n)
const usd = (n, d = 2) => n == null ? '—' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
const short = (a) => a ? a.slice(0, 6) + '…' + a.slice(-4) : '—'
const ago = (iso) => { const s = (Date.now() - new Date(iso).getTime()) / 1000; if (!isFinite(s)) return '—'; if (s < 90) return Math.max(1, Math.round(s)) + 's ago'; if (s < 5400) return Math.round(s / 60) + 'm ago'; if (s < 172800) return Math.round(s / 3600) + 'h ago'; return Math.round(s / 86400) + 'd ago' }

let DATA = null
let chainId = 4217
let range = '30d'

async function load() {
  const r = await fetch(`${SNAP}?t=${Date.now()}`, { cache: 'no-store' })
  if (!r.ok) throw new Error('snapshot ' + r.status)
  DATA = await r.json()
  return DATA
}

function chain() { return DATA.chains[String(chainId)] }

function guard() {
  const age = (Date.now() - new Date(DATA.generatedAt).getTime()) / 3600e3
  const bad = age > 3
  const dot = $('#statusDot')
  dot.className = 'status-dot ' + (bad ? 'warn' : 'ok')
  $('#statusLine').textContent = bad ? `Snapshot is ${age.toFixed(1)}h old` : 'Snapshot fresh'
  $('#statusSub').textContent = 'server-built, cached'
}

function renderMeta() {
  const t = new Date(DATA.generatedAt)
  $('#updatedAt').textContent = t.toISOString().replace('T', ' ').slice(0, 16) + 'Z'
  $('#nextRefresh').textContent = new Date(Date.now() + REFRESH_MS).toISOString().slice(11, 16) + 'Z'
  guard()
}

function renderKPIs() {
  const g = DATA.chains['4217'].stats // global market stats (chain-agnostic except wallets)
  const c = chain()
  const s = c.series[range]
  const day = s.day
  const completed = day.reduce((a, b) => a + (b.completedTasks || 0), 0)
  const paid = day.reduce((a, b) => a + Number(b.paidVolume || 0), 0) / 1e6
  const created = day.reduce((a, b) => a + (b.tasksCreated || 0), 0)

  KPISET('#kpiOpen', g.openTasks, 'open tasks on the market')
  KPISET('#kpiAgents', g.activeAgents7d, `${fmt(g.activeWorkers7d)} active workers · ${fmt(g.registeredWorkers)} registered`)
  KPISET('#kpiCompleted', fmt(completed), `${fmt(created)} posted in ${range}`)
  KPISET('#kpiPaid', usd(paid), `paid out in ${range} · ${fmt(day.reduce((a, b) => a + (b.settlements || 0), 0))} settlements`)
  KPISET('#kpiOpenReward', usd(c.taskAgg.openRewardUsd), `${fmt(c.taskAgg.openCount)} open in ${c.name} scan`)
  KPISET('#kpiZeroSub', fmt(c.taskAgg.zeroSubmissionOpen), `${Math.round((c.taskAgg.zeroSubmissionShare || 0) * 100)}% of open tasks on ${c.name}`)
}
function KPISET(sel, v, sub) { const el = $(sel); if (el) el.textContent = v; const s = $(sel + 'Sub'); if (s) s.textContent = sub }

function renderDecision() {
  const c = chain(); const a = c.taskAgg
  const items = [
    { cls: a.zeroSubmissionShare > .35 ? 'good' : '', label: 'Uncontested open tasks', value: fmt(a.zeroSubmissionOpen), note: `Tasks on ${c.name} with zero submissions. Cheapest place to be seen: ${usd(a.openRewardUsd)} of open reward is still on the table.` },
    { cls: c.concentration.top10Share > .6 ? 'hot' : '', label: 'Top 10 posters share', value: Math.round(c.concentration.top10Share * 100) + '%', note: `${fmt(c.concentration.posters30d)} distinct posters created ${fmt(c.concentration.tasks30d)} tasks in 30d. Higher share = fewer, louder requesters.` },
    { cls: '', label: 'Award rate (resolved)', value: a.awardRate == null ? '—' : Math.round(a.awardRate * 100) + '%', note: `${fmt(a.resolvedCount)} resolved in scan; ${fmt(a.awarded)} had an award. The rest cancelled or expired.` },
    { cls: a.avgSubsOpen > 20 ? 'hot' : '', label: 'Avg submissions (open)', value: a.avgSubsOpen == null ? '—' : a.avgSubsOpen.toFixed(1), note: `Mean competition per open task on ${c.name}. Above ~20 you are in a lottery, not a market.` }
  ]
  $('#decisionGrid').innerHTML = items.map(i => `<div class="decision-item ${i.cls}"><div class="d-label">${i.label}</div><div class="d-value">${i.value}</div><div class="d-note">${i.note}</div></div>`).join('')
}

function canvas2d(id, h) {
  const cv = $(id); const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1))
  cv.width = cv.clientWidth * dpr; cv.height = h * dpr
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr)
  return { ctx, w: cv.clientWidth, h }
}

function renderFlow() {
  const day = chain().series[range].day
  const { ctx, w, h } = canvas2d('#flowChart', 280)
  const pad = { l: 46, r: 12, t: 12, b: 26 }
  const maxV = Math.max(...day.map(d => Number(d.rewardVolume || 0) / 1e6), 1)
  const maxN = Math.max(...day.map(d => Math.max(d.tasksCreated || 0, d.completedTasks || 0)), 1)
  const n = day.length
  const bw = (w - pad.l - pad.r) / n
  ctx.clearRect(0, 0, w, h)
  ctx.strokeStyle = 'rgba(69,62,55,.7)'; ctx.lineWidth = 1; ctx.font = '10px "Departure Mono", monospace'; ctx.fillStyle = C.muted
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + (h - pad.t - pad.b) * (i / 4)
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke()
    const v = maxV * (1 - i / 4)
    ctx.fillText('$' + (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(0)), 4, y + 3)
  }
  day.forEach((d, i) => {
    const x = pad.l + i * bw
    const rv = Number(d.rewardVolume || 0) / 1e6
    const bh = (h - pad.t - pad.b) * (rv / maxV)
    ctx.fillStyle = 'rgba(217,160,151,.55)'
    ctx.fillRect(x + 1, h - pad.b - bh, Math.max(1, bw - 2), bh)
    const ch = (h - pad.t - pad.b) * ((d.completedTasks || 0) / maxN)
    ctx.fillStyle = 'rgba(239,233,226,.15)'
    ctx.fillRect(x + bw * .3, h - pad.b - ch, Math.max(1, bw * .4), ch)
  })
  // created line
  ctx.beginPath(); ctx.strokeStyle = C.magenta; ctx.lineWidth = 1.6
  day.forEach((d, i) => {
    const x = pad.l + i * bw + bw / 2
    const y = h - pad.b - (h - pad.t - pad.b) * ((d.tasksCreated || 0) / maxN)
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
  })
  ctx.stroke()
  // x labels
  ctx.fillStyle = C.muted; ctx.font = '9.5px "Departure Mono", monospace'
  const step = Math.ceil(n / 7)
  day.forEach((d, i) => { if (i % step === 0) ctx.fillText(String(d.bucket).slice(5), pad.l + i * bw, h - 8) })
  $('#flowLegend').innerHTML = `<span><i class="swatch" style="background:rgba(217,160,151,.8)"></i>reward put up (USD, left axis)</span><span><i class="swatch" style="background:${C.magenta}"></i>tasks posted</span><span><i class="swatch" style="background:rgba(239,233,226,.4)"></i>tasks completed</span>`
}

function renderPosters() {
  const p = chain().postersPerWeek.slice(-12)
  const { ctx, w, h } = canvas2d('#posterChart', 280)
  const pad = { l: 34, r: 10, t: 12, b: 26 }
  ctx.clearRect(0, 0, w, h)
  const max = Math.max(...p.map(x => x.posters), 1)
  ctx.font = '10px "Departure Mono", monospace'
  ctx.strokeStyle = 'rgba(69,62,55,.7)'; ctx.fillStyle = C.muted
  for (let i = 0; i <= 3; i++) { const y = pad.t + (h - pad.t - pad.b) * (i / 3); ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke(); ctx.fillText(Math.round(max * (1 - i / 3)), 4, y + 3) }
  const bw = (w - pad.l - pad.r) / Math.max(p.length, 1)
  p.forEach((x, i) => {
    const bh = (h - pad.t - pad.b) * (x.posters / max)
    ctx.fillStyle = i === p.length - 1 ? C.magenta : 'rgba(217,160,151,.6)'
    ctx.fillRect(pad.l + i * bw + bw * .18, h - pad.b - bh, bw * .64, bh)
    ctx.fillStyle = C.muted; ctx.fillText(x.week.slice(5), pad.l + i * bw + bw * .1, h - 8)
  })
  const last = p[p.length - 1], prev = p[p.length - 2]
  const delta = last && prev ? last.posters - prev.posters : 0
  $('#posterNote').innerHTML = `Week of ${last ? last.week : '—'}: <strong style="color:#EFE9E2">${last ? last.posters : '—'}</strong> distinct posters on ${chain().name} (${delta >= 0 ? '+' : ''}${delta} vs prior week, from a ${fmt(chain().taskAgg.scanned)}-task scan).`
}

function renderConcentration() {
  const c = chain(); const top = c.taskAgg.topPosters
  const { ctx, w, h } = canvas2d('#concentrationChart', 280)
  ctx.clearRect(0, 0, w, h)
  ctx.font = '11px "Departure Mono", monospace'
  const max = Math.max(...top.map(t => t.tasks), 1)
  const rowH = Math.min(30, (h - 10) / Math.max(top.length, 1))
  top.forEach((t, i) => {
    const y = 6 + i * rowH
    const bw = (w - 190) * (t.tasks / max)
    ctx.fillStyle = 'rgba(217,160,151,' + (i === 0 ? '.9' : '.55') + ')'
    ctx.fillRect(120, y, bw, rowH - 9)
    ctx.fillStyle = C.muted; ctx.fillText(short(t.addr), 0, y + rowH - 12)
    ctx.fillStyle = C.cream; ctx.fillText(t.tasks, 120 + bw + 6, y + rowH - 12)
  })
  $('#concentrationNote').innerHTML = `Top 10 posters created <strong style="color:#EFE9E2">${Math.round(c.concentration.top10Share * 100)}%</strong> of the ${fmt(c.concentration.tasks30d)} tasks posted in the last 30 days on ${c.name}. Wallet addresses only — no identities inferred.`
}

function renderBars() {
  const a = chain().taskAgg
  const maxM = Math.max(...a.byMode.map(x => x.count), 1)
  const maxS = Math.max(...a.byStatus.map(x => x.count), 1)
  $('#modeBars').innerHTML = a.byMode.map(m => `<div class="bar-row"><span class="bar-k">${m.key}</span><span class="bar-track"><span class="bar-fill" style="width:${(m.count / maxM * 100).toFixed(1)}%;display:block"></span></span><span class="bar-v">${fmt(m.count)}</span></div>`).join('')
  $('#statusBars').innerHTML = a.byStatus.map(m => `<div class="bar-row"><span class="bar-k">${m.key}</span><span class="bar-track"><span class="bar-fill alt" style="width:${(m.count / maxS * 100).toFixed(1)}%;display:block"></span></span><span class="bar-v">${fmt(m.count)}</span></div>`).join('')
}

function renderFeed() {
  const items = DATA.chains['4217'].feed.slice(0, 24)
  const el = $('#activityFeed')
  if (!items.length) { el.innerHTML = '<div class="feed-empty">No recent activity returned.</div>'; return }
  el.innerHTML = items.map(i => `<div class="feed-item"><span class="feed-time">${ago(i.timestamp)}</span><span><div class="feed-title">${(i.taskTitle || i.type || '').slice(0, 120)}</div><div class="feed-meta">${i.type} · ${short(i.actor)} · chain ${i.chainId}</div></span><span class="feed-amt">${i.amountUsd != null ? usd(i.amountUsd) : ''}</span></div>`).join('')
}

function renderAll() { renderMeta(); renderKPIs(); renderDecision(); renderFlow(); renderPosters(); renderConcentration(); renderBars(); renderFeed() }

// hash views: #overview | #money | #posters | #feed
const VIEWS = { overview: null, money: '.chart-card', posters: '#posterChart', feed: '#activityFeed' }
function applyHash() {
  const v = location.hash.replace('#/', '') || 'overview'
  const target = v === 'money' ? document.getElementById('flowChart') : v === 'posters' ? document.getElementById('posterChart') : v === 'feed' ? document.getElementById('activityFeed') : null
  if (target) target.closest('.card, .chart-card, article')?.scrollIntoView({ block: 'center' })
  const og = document.querySelector('meta[property="og:image"]')
  if (og) og.setAttribute('content', './assets/share-' + (v in VIEWS ? v : 'overview') + '.png')
}

$('#chainSelect').addEventListener('change', (e) => { chainId = Number(e.target.value); renderAll() })
$('#rangeSelect').addEventListener('change', (e) => { range = e.target.value; renderAll() })
$('#refreshBtn').addEventListener('click', () => reload(true))
window.addEventListener('hashchange', applyHash)
window.addEventListener('resize', () => { if (DATA) renderAll() })

async function reload(manual) {
  try { await load(); renderAll(); if (manual) $('#statusSub').textContent = 'refreshed from snapshot' }
  catch (e) { $('#statusDot').className = 'status-dot warn'; $('#statusLine').textContent = 'Snapshot unavailable'; $('#statusSub').textContent = String(e.message || e).slice(0, 80) }
}

load().then(() => { renderAll(); applyHash() }).catch(e => { $('#statusLine').textContent = 'Could not load market data'; $('#statusSub').textContent = String(e) })
setInterval(() => { if (document.visibilityState === 'visible') reload(false) }, REFRESH_MS)
