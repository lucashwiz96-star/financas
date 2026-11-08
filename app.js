'use strict';
/* ==========================================================================
   Finanças — app offline (PWA). Dados locais (localStorage) + sincronização
   com um arquivo JSON no Google Drive via Google Apps Script.
   ========================================================================== */

/* ---------------- utilitários ---------------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const money = v => BRL.format(Math.round((v || 0) * 100) / 100);
const moneyS = v => { const a = Math.abs(v || 0); if (a >= 10000) return (v < 0 ? '-' : '') + 'R$ ' + (a / 1000).toFixed(1).replace('.', ',') + 'k'; return money(v); };
const pct = (v, d = 0) => (isFinite(v) ? (v * 100).toFixed(d).replace('.', ',') : '–') + '%';
const pad = n => String(n).padStart(2, '0');
const r2 = v => Math.round(v * 100) / 100;
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => isoDate(new Date());
const curYM = () => todayISO().slice(0, 7);
const addM = (ym, n) => { let y = +ym.slice(0, 4), m = +ym.slice(5, 7) + n; y += Math.floor((m - 1) / 12); m = ((m - 1) % 12 + 12) % 12 + 1; return `${y}-${pad(m)}`; };
const daysInMonth = ym => new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();
const toDate = s => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MES_L = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const ymShort = ym => `${MES[+ym.slice(5, 7) - 1]}/${ym.slice(2, 4)}`;
const ymLong = ym => `${MES_L[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;
const dShort = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '';
const dLong = s => { if (!s) return ''; const d = toDate(s); return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' }); };
const parseNum = s => { if (typeof s === 'number') return s; s = String(s ?? '').trim().replace(/[R$\s]/g, ''); if (!s) return 0; if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); const v = parseFloat(s); return isFinite(v) ? v : 0; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const nowTS = () => new Date().toISOString();
const sum = (arr, f = x => x) => arr.reduce((a, x) => a + (f(x) || 0), 0);
const groupBy = (arr, f) => arr.reduce((m, x) => { const k = f(x); (m[k] ||= []).push(x); return m; }, {});
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

const ICONS = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 6-6"/>',
  week: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
  check: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  piggy: '<path d="M19 9c1 .5 2 1.6 2 3v2h-2l-1 3h-3v-2H9v2H6l-1-3a6 6 0 0 1 5-9h4a6 6 0 0 1 5 4z"/><path d="M15 9h.01"/>',
  tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><path d="M7.5 7.5h.01"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  bulb: '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>',
};
const icon = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[n]}</svg>`;
const CAT_EMOJI = { 'Moradia': '🏠', 'Alimentação': '🍽️', 'Transporte': '🚗', 'Saúde': '🩺', 'Assinaturas': '📱', 'Educação': '📚', 'Lazer': '🎉', 'Compras': '🛍️', 'Cuidados pessoais': '💆', 'Financeiro': '🏦', 'Outros': '📦', 'Receitas': '💰', 'Doação': '🤝' };
const catEmoji = c => CAT_EMOJI[c] || '•';

/* ---------------- armazenamento ---------------- */
const LS_DB = 'fin.db.v1', LS_SET = 'fin.settings.v1';
const DEFAULT_CONFIG = () => ({
  updatedAt: '1970-01-01T00:00:00.000Z',
  categorias: [], subcategorias: [],
  formas: [{ nome: 'Cartão', cartao: true, fechamento: 30 }, { nome: 'Pix' }, { nome: 'Débito' }, { nome: 'Boleto' }, { nome: 'Dinheiro' }, { nome: 'Transferência' }],
  contas: [], limitesSemanais: [], instituicoes: [],
  regras: { maxParcelamentos: 3, minParcelar: 1000, metaPoupanca: 0.2, alertaAcimaMedia: 0.25 },
  notas: [],
});
const emptyDB = () => ({ app: 'financas', schema: 1, rev: 0, config: DEFAULT_CONFIG(), lancamentos: [], movimentos: [], checks: [] });
const COLS = ['lancamentos', 'movimentos', 'checks'];

let DB, SET;
try { DB = JSON.parse(localStorage.getItem(LS_DB)); } catch { DB = null; }
if (!DB || DB.app !== 'financas') DB = emptyDB();
for (const c of COLS) DB[c] ||= [];
DB.config = Object.assign(DEFAULT_CONFIG(), DB.config || {});
DB.config.regras = Object.assign(DEFAULT_CONFIG().regras, DB.config.regras || {});
try { SET = JSON.parse(localStorage.getItem(LS_SET)) || {}; } catch { SET = {}; }

const saveSet = () => localStorage.setItem(LS_SET, JSON.stringify(SET));
function persist() {
  try { localStorage.setItem(LS_DB, JSON.stringify(DB)); }
  catch (e) { toast('Erro ao salvar localmente: ' + e.message); }
  reindex();
}
function touched() { SET.dirty = true; saveSet(); persist(); scheduleSync(); updateSyncBadge(); }
function upsertMany(col, objs) { const ts = nowTS(); const idx = new Map(DB[col].map((x, i) => [x.id, i])); for (const o of objs) { o.updatedAt = ts; if (idx.has(o.id)) DB[col][idx.get(o.id)] = o; else DB[col].push(o); } touched(); }
const upsert = (col, o) => upsertMany(col, [o]);
function removeMany(col, ids) { const ts = nowTS(); const s = new Set(ids); for (const o of DB[col]) if (s.has(o.id)) { o.deleted = true; o.updatedAt = ts; } touched(); }
function saveConfig() { DB.config.updatedAt = nowTS(); touched(); }

/* ---------------- índices e cálculos ---------------- */
let LIVE = [], FIXOS = [], SUBMAP = new Map(), FORMAMAP = new Map(), CACHE = {};
function reindex() {
  CACHE = { e: {}, s: {} };
  SUBMAP = new Map(DB.config.subcategorias.map(s => [s.nome, s]));
  FORMAMAP = new Map(DB.config.formas.map(f => [f.nome, f]));
  LIVE = DB.lancamentos.filter(l => !l.deleted);
  FIXOS = LIVE.filter(l => l.fixo);
}
const subInfo = n => SUBMAP.get(n) || { nome: n, cat: 'Sem categoria', tipo: 'Despesa' };
const catOf = l => subInfo(l.sub).cat;
const isCartao = forma => { const f = FORMAMAP.get(forma); return f ? !!f.cartao : false; };
const isFaturaForma = forma => isCartao(forma);

function calcMesPgto(data, forma, parcela = 1) {
  let m = data.slice(0, 7);
  const f = FORMAMAP.get(forma);
  if (f && f.cartao) { const fech = +f.fechamento || 31; m = addM(m, (+data.slice(8, 10) <= fech) ? 1 : 2); }
  return addM(m, (parcela || 1) - 1);
}

/** Lançamentos que compõem o caixa do mês (pelo mês de pagamento), incluindo fixos projetados. */
function entriesFor(m) {
  if (CACHE.e[m]) return CACHE.e[m];
  const res = [];
  for (const l of LIVE) if (!l.antecipado && l.mesPgto === m) res.push(l);
  if (m > curYM()) {
    for (const l of FIXOS) if (l.mesPgto < m && (!l.fixoAte || m <= l.fixoAte)) res.push({ ...l, id: l.id + '@' + m, origem: l.id, virtual: true, mesPgto: m });
  }
  return (CACHE.e[m] = res);
}

function summary(m) {
  if (CACHE.s[m]) return CACHE.s[m];
  const es = entriesFor(m);
  const s = { m, rec: 0, desp: 0, fatura: 0, byCat: {}, bySub: {}, recBySub: {}, n: es.length, virtual: 0 };
  for (const l of es) {
    if (l.tipo === 'Receita') { s.rec += l.valor; s.recBySub[l.sub] = (s.recBySub[l.sub] || 0) + l.valor; continue; }
    s.desp += l.valor;
    if (isFaturaForma(l.forma)) s.fatura += l.valor;
    const c = catOf(l);
    s.byCat[c] = (s.byCat[c] || 0) + l.valor;
    s.bySub[l.sub] = (s.bySub[l.sub] || 0) + l.valor;
    if (l.virtual) s.virtual += l.valor;
  }
  s.aportes = sum(DB.movimentos.filter(x => !x.deleted && x.data && x.data.slice(0, 7) === m), x => x.tipo === 'Saque' ? -x.valor : (x.tipo === 'Aporte' ? x.valor : 0));
  s.saldo = s.rec - s.desp - s.aportes;
  s.poupanca = s.rec > 0 ? s.saldo / s.rec : NaN;
  return (CACHE.s[m] = s);
}
function avgPrev(m, n, f) { let t = 0; for (let i = 1; i <= n; i++) t += f(summary(addM(m, -i))); return t / n; }
/** Média dos até 3 meses anteriores que têm histórico "completo" (despesas ≥ 50% do mês analisado). */
function histAvg(m, f) {
  const base = summary(m).desp, ms = [];
  for (let i = 1; i <= 3; i++) { const s = summary(addM(m, -i)); if (s.desp >= base * 0.5 && s.desp > 0) ms.push(s); }
  return ms.length ? sum(ms, f) / ms.length : null;
}

/* semanas segunda→domingo, cortadas no início/fim do mês */
function weeksOf(m) {
  const n = daysInMonth(m), out = []; let start = 1;
  for (let d = 1; d <= n; d++) {
    const dow = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1, d).getDay();
    if (dow === 0 || d === n) { out.push({ de: `${m}-${pad(start)}`, ate: `${m}-${pad(d)}`, dias: d - start + 1 }); start = d + 1; }
  }
  return out;
}
/** Gastos por data da compra (parcelado conta o total na semana da compra). */
function spentByPurchase(m) {
  const by = {};
  for (const l of LIVE) {
    if (l.tipo !== 'Despesa' || !l.data || l.data.slice(0, 7) !== m) continue;
    (by[l.sub] ||= []).push(l);
  }
  return by;
}
function weeklyData(m) {
  const weeks = weeksOf(m), by = spentByPurchase(m), dim = daysInMonth(m), today = todayISO();
  const rows = DB.config.limitesSemanais.filter(x => x.sub).map(x => {
    const ls = by[x.sub] || [];
    const sem = weeks.map(w => { const v = sum(ls.filter(l => l.data >= w.de && l.data <= w.ate), l => l.valor); const lim = x.valor * w.dias / 7; return { v, lim, over: v > lim + 0.005 }; });
    const total = sum(sem, s => s.v), limMes = x.valor * dim / 7;
    let ritmo = null;
    if (m === curYM()) { const dia = +today.slice(8, 10); ritmo = dia >= 5 ? total / dia * dim : null; }
    return { sub: x.sub, limSem: x.valor, sem, total, limMes, eco: limMes - total, uso: limMes ? total / limMes : 0, ritmo };
  });
  const curW = weeks.findIndex(w => today >= w.de && today <= w.ate);
  return { weeks, rows, curW };
}

/* fatura do cartão */
const cartoes = () => DB.config.formas.filter(f => f.cartao);
/** Fatura de `forma` que vence em `fm`: total e composição (compras, parcelas, fixos). */
function faturaDe(forma, fm) {
  const f = FORMAMAP.get(forma) || {}, ls = entriesFor(fm).filter(l => l.tipo === 'Despesa' && l.forma === forma);
  const g = { compras: [], novasParc: [], parcelas: [], fixos: [] };
  for (const l of ls) (l.fixo || l.virtual ? g.fixos : (l.de || 0) > 1 ? ((l.parcela || 1) > 1 ? g.parcelas : g.novasParc) : g.compras).push(l);
  const mc = addM(fm, -1), dim = daysInMonth(mc), dia = Math.min(+f.fechamento || dim, dim);
  const fecha = `${mc}-${String(dia).padStart(2, '0')}`, hoje = todayISO();
  const dias = Math.round((new Date(fecha + 'T12:00') - new Date(hoje + 'T12:00')) / 864e5);
  const porCat = {}; for (const l of ls) porCat[catOf(l)] = (porCat[catOf(l)] || 0) + l.valor;
  return { forma, fm, ls, g, total: sum(ls, l => l.valor), tot: k => sum(g[k], l => l.valor), fecha, dias, aberta: dias >= 0, porCat };
}
const faturaAberta = forma => calcMesPgto(todayISO(), forma, 1);

/* parcelamentos */
function parcelGroups() {
  const g = groupBy(LIVE.filter(l => l.grupo && (l.de || 0) > 1), l => l.grupo), cur = curYM();
  return Object.values(g).map(ps => {
    ps.sort((a, b) => (a.parcela || 0) - (b.parcela || 0));
    const p0 = ps[0];
    const abertas = ps.filter(p => !p.antecipado && p.mesPgto > cur);
    const atual = ps.filter(p => !p.antecipado && p.mesPgto === cur);
    return {
      grupo: p0.grupo, desc: p0.desc, sub: p0.sub, cat: catOf(p0), forma: p0.forma, tipo: p0.tipo, data: p0.data,
      de: p0.de, valorParcela: p0.valor, total: sum(ps, p => p.valor), ps, abertas, atual,
      restante: sum(abertas, p => p.valor), fim: ps[ps.length - 1].mesPgto,
      antecipadas: ps.filter(p => p.antecipado).length,
    };
  }).sort((a, b) => b.restante - a.restante);
}

/* contas a pagar (checklist) */
function contaValor(c, m) {
  const es = entriesFor(m).filter(l => l.tipo === 'Despesa');
  let ls = [];
  if (c.sub) ls = es.filter(l => l.sub === c.sub);
  else if (c.forma) ls = es.filter(l => l.forma === c.forma);
  if (ls.length) return { v: sum(ls, l => l.valor), est: ls.every(l => l.virtual) };
  if (c.sub) { const f = FIXOS.filter(l => l.sub === c.sub).sort((a, b) => b.data.localeCompare(a.data))[0]; if (f) return { v: f.valor, est: true }; }
  return { v: +c.valorPadrao || 0, est: true };
}
function contasDoMes(m) {
  const today = todayISO();
  return DB.config.contas.map(c => {
    const ck = DB.checks.find(x => x.id === `${m}|${c.id}` && !x.deleted);
    const { v, est } = contaValor(c, m);
    const venc = c.dia ? `${m}-${pad(Math.min(c.dia, daysInMonth(m)))}` : null;
    let st = 'A pagar', cls = '';
    if (ck && ck.pago) { st = 'Pago'; cls = 'pos'; }
    else if (venc && venc < today) { st = 'Vencida'; cls = 'danger'; }
    else if (venc && (toDate(venc) - toDate(today)) / 864e5 <= 3) { st = 'Vence em breve'; cls = 'warn'; }
    return { c, ck, v, est, venc, st, cls, pago: !!(ck && ck.pago) };
  });
}

/* ---------------- indicadores, alertas e sugestões ---------------- */
const DISCRICIONARIAS = new Set(['Alimentação', 'Lazer', 'Compras', 'Cuidados pessoais', 'Assinaturas', 'Transporte', 'Outros']);
const ESSENCIAIS_SUB = new Set(['Mercado', 'Combustível', 'Aluguel/Financiamento', 'Condomínio', 'Energia', 'Água', 'Gás', 'Plano de saúde', 'Seguro/IPVA', 'IPTU']);

function insights(m) {
  const out = [], cur = curYM(), s = summary(m), R = DB.config.regras;
  const add = (lvl, txt, extra = {}) => out.push({ lvl, txt, ...extra });

  // 1. saldo e poupança
  if (s.saldo < 0) add('danger', `Saldo de ${ymShort(m)} está <b>negativo em ${money(-s.saldo)}</b>: despesas superam receitas.`);
  else if (s.rec > 0 && s.poupanca < R.metaPoupanca) add('warn', `Taxa de poupança em <b>${pct(s.poupanca)}</b>, abaixo da meta de ${pct(R.metaPoupanca)}. Faltam ${money(R.metaPoupanca * s.rec - s.saldo)} para a meta.`);
  else if (s.rec > 0) add('ok', `Taxa de poupança de <b>${pct(s.poupanca)}</b> — acima da meta de ${pct(R.metaPoupanca)}.`);

  // 2. tetos por categoria
  for (const c of DB.config.categorias) {
    if (!c.teto) continue; const v = s.byCat[c.nome] || 0, u = v / c.teto;
    if (u >= 1) add('danger', `<b>${esc(c.nome)}</b> estourou o teto: ${money(v)} de ${money(c.teto)} (${pct(u)}).`);
    else if (u >= 0.8) add('warn', `<b>${esc(c.nome)}</b> já usou ${pct(u)} do teto (${money(v)} de ${money(c.teto)}).`);
  }

  // 3. categorias acima da média dos meses anteriores (só meses com histórico completo)
  if (m <= addM(cur, 1)) {
    const acima = [];
    for (const [cat, v] of Object.entries(s.byCat)) {
      const avg = histAvg(m, x => x.byCat[cat] || 0);
      if (avg != null && avg >= 150 && v > avg * (1 + R.alertaAcimaMedia) && v - avg >= 100) acima.push({ cat, v, avg });
    }
    acima.sort((a, b) => (b.v - b.avg) - (a.v - a.avg));
    if (acima.length) add('warn', `Acima da sua média: ${acima.slice(0, 4).map(a => `<b>${esc(a.cat)}</b> ${money(a.v)} (+${pct(a.v / a.avg - 1)})`).join(', ')}${acima.length > 4 ? ` e mais ${acima.length - 4}` : ''}.`, { link: '#/indicadores' });
  }

  // 4. caixinhas semanais (só mês corrente)
  if (m === cur) {
    const wd = weeklyData(m);
    const estouradas = wd.rows.filter(r => wd.curW >= 0 && r.sem[wd.curW].over);
    if (estouradas.length) add('warn', `Semana atual acima do limite em: ${estouradas.map(r => `<b>${esc(r.sub)}</b> (${money(r.sem[wd.curW].v)} / ${money(r.sem[wd.curW].lim)})`).join(', ')}.`);
    const passou = wd.rows.filter(r => r.total > r.limMes);
    if (passou.length) add('danger', `Caixinhas que já passaram do limite do mês: ${passou.map(r => `<b>${esc(r.sub)}</b> (${money(r.total)} / ${money(r.limMes)})`).join(', ')}.`, { link: '#/semanal' });
    const ritmo = wd.rows.filter(r => r.total <= r.limMes && r.ritmo && r.ritmo > r.limMes * 1.1 && r.total > 50);
    if (ritmo.length) add('warn', `No ritmo atual vão estourar o mês: ${ritmo.map(r => `<b>${esc(r.sub)}</b> (~${money(r.ritmo)} / ${money(r.limMes)})`).join(', ')}.`, { link: '#/semanal' });
  }

  // 5. regras de parcelamento
  const pg = parcelGroups().filter(g => g.tipo === 'Despesa' && g.abertas.length);
  if (pg.length > R.maxParcelamentos) add('warn', `Você tem <b>${pg.length} parcelamentos ativos</b> (regra: no máximo ${R.maxParcelamentos}). Compromisso futuro: ${money(sum(pg, g => g.restante))}.`, { link: '#/parcelados' });
  const pequenos = pg.filter(g => g.total < R.minParcelar && g.data && g.data >= addM(cur, -2) + '-01');
  if (pequenos.length) add('info', `${pequenos.length} compra(s) recente(s) parcelada(s) abaixo de ${money(R.minParcelar)} (sua regra): ${pequenos.slice(0, 3).map(g => esc(g.desc)).join(', ')}.`);

  // 6. meses futuros negativos
  const neg = [];
  for (let i = 1; i <= 6; i++) { const mm = addM(cur, i), ss = summary(mm); if (ss.saldo < 0) neg.push(`${ymShort(mm)} (${money(ss.saldo)})`); }
  if (neg.length) add('warn', `Projeção com saldo negativo em: ${neg.join(', ')}. Verifique receitas lançadas para esses meses.`, { link: '#/projecao' });

  // 7. fatura do cartão
  const favg = histAvg(m, x => x.fatura);
  if (favg > 0 && s.fatura > favg * 1.2 && s.fatura - favg > 300) add('info', `Fatura do cartão de ${ymShort(m)} (${money(s.fatura)}) está ${pct(s.fatura / favg - 1)} acima da média de 3 meses.`);

  // 8. contas vencidas
  if (m === cur) {
    const venc = contasDoMes(m).filter(x => x.st === 'Vencida');
    if (venc.length) add('danger', `Contas vencidas e não marcadas como pagas: ${venc.map(x => `<b>${esc(x.c.nome)}</b>`).join(', ')}.`, { link: '#/contas' });
  }
  const ord = { danger: 0, warn: 1, info: 2, ok: 3 };
  return out.sort((a, b) => ord[a.lvl] - ord[b.lvl]);
}

/** Sugestões de ajuste: onde cortar e quanto economiza. */
function sugestoes(m) {
  const out = [], s = summary(m), R = DB.config.regras;
  // média de 3 meses (incluindo o atual) por subcategoria discricionária
  const subs = {};
  for (let i = 0; i < 3; i++) { const ss = summary(addM(m, -i)); for (const [k, v] of Object.entries(ss.bySub)) subs[k] = (subs[k] || 0) + v / 3; }
  const cands = Object.entries(subs)
    .filter(([sub, v]) => DISCRICIONARIAS.has(subInfo(sub).cat) && !ESSENCIAIS_SUB.has(sub) && v >= 80)
    .map(([sub, v]) => ({ sub, v, corte: subInfo(sub).cat === 'Assinaturas' ? 0.3 : 0.25 }))
    .map(x => ({ ...x, eco: x.v * x.corte }))
    .sort((a, b) => b.eco - a.eco).slice(0, 4);
  for (const c of cands) out.push({ lvl: 'tip', txt: `Reduzir <b>${esc(c.sub)}</b> em ${pct(c.corte)} (média ${money(c.v)}/mês) economiza ~<b>${money(c.eco)}/mês</b> (${money(c.eco * 12)}/ano).` });

  const ass = Object.entries(s.bySub).filter(([k]) => subInfo(k).cat === 'Assinaturas');
  const tAss = sum(ass, x => x[1]);
  const nAss = entriesFor(m).filter(l => catOf(l) === 'Assinaturas').length;
  if (tAss > 0) out.push({ lvl: 'tip', txt: `Assinaturas somam <b>${money(tAss)}/mês</b> (${nAss} itens, ${money(tAss * 12)}/ano). Revise as que usa pouco.` });

  const pg = parcelGroups().filter(g => g.tipo === 'Despesa' && g.abertas.length);
  if (pg.length) {
    const prox = summary(addM(curYM(), 1)), parcProx = sum(pg, g => sum(g.abertas.filter(p => p.mesPgto === addM(curYM(), 1)), p => p.valor));
    if (prox.rec > 0 && parcProx / prox.rec > 0.1) out.push({ lvl: 'tip', txt: `Parcelas comprometem <b>${pct(parcProx / prox.rec)}</b> da receita de ${ymShort(addM(curYM(), 1))} (${money(parcProx)}). Avalie antecipar as menores para liberar caixa.`, link: '#/parcelados' });
  }
  if (s.rec > 0 && s.saldo > 0) {
    const meta = R.metaPoupanca * s.rec;
    if (s.saldo >= meta) out.push({ lvl: 'tip', txt: `Sobra prevista de <b>${money(s.saldo)}</b> em ${ymShort(m)}. Que tal programar um aporte de ${money(Math.floor(s.saldo * 0.7 / 100) * 100)} nos investimentos?` });
  }
  return out;
}

/* ---------------- sincronização (Google Drive via Apps Script) ---------------- */
let syncing = false, syncTimer = null;
const scheduleSync = debounce(() => sync(false), 2500);
function mergeDB(local, remote) {
  if (!remote) return { data: local, localNewer: true };
  const out = { ...remote, app: 'financas', schema: 1 };
  let localNewer = false;
  for (const c of COLS) {
    const map = new Map((remote[c] || []).map(x => [x.id, x]));
    for (const x of local[c] || []) {
      const r = map.get(x.id);
      if (!r || (x.updatedAt || '') > (r.updatedAt || '')) { map.set(x.id, x); localNewer = true; }
    }
    out[c] = [...map.values()];
  }
  const lc = local.config || {}, rc = remote.config || {};
  if ((lc.updatedAt || '') > (rc.updatedAt || '')) { out.config = lc; localNewer = true; } else out.config = Object.assign(DEFAULT_CONFIG(), rc);
  return { data: out, localNewer };
}
/* ---- troca manual entre aparelhos (sem nuvem) ---- */
function contaNovos(de, para) { // itens de `de` que são novos ou mais recentes que em `para`
  let n = 0;
  for (const c of COLS) { const m = new Map((para[c] || []).map(x => [x.id, x.updatedAt || ''])); for (const x of de[c] || []) if (!m.has(x.id) || (x.updatedAt || '') > m.get(x.id)) n++; }
  if (((de.config || {}).updatedAt || '') > ((para.config || {}).updatedAt || '')) n++;
  return n;
}
function pendentesEnvio() {
  if (!SET.lastExport && !DB.lancamentos.length) return 0;
  const t = SET.lastExport || ''; let n = 0;
  for (const c of COLS) for (const x of DB[c]) if ((x.updatedAt || '') > t) n++;
  if ((DB.config.updatedAt || '') > t) n++;
  return n;
}
async function enviarAparelho() {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
  const txt = JSON.stringify(DB);
  const marcar = () => { SET.lastExport = nowTS(); saveSet(); updateSyncBadge(); if (route() === 'ajustes') render(); };
  if (navigator.share && navigator.canShare) {
    const cand = [new File([txt], `financas-${stamp}.json`, { type: 'application/json' }), new File([txt], `financas-${stamp}.txt`, { type: 'text/plain' })];
    const f = cand.find(x => { try { return navigator.canShare({ files: [x] }); } catch { return false; } });
    if (f) {
      try { await navigator.share({ files: [f], title: 'Finanças — dados' }); marcar(); toast('Enviado ✓ No outro aparelho: Ajustes → Receber.'); return; }
      catch (e) { if (e.name === 'AbortError') return; }
    }
  }
  download(`financas-${stamp}.json`, txt, 'application/json'); marcar();
  toast('Arquivo salvo. Mande-o para o outro aparelho (WhatsApp, e-mail, cabo…).');
}
async function receberAparelho(file) {
  let data; try { data = JSON.parse(await file.text()); } catch { return toast('Arquivo inválido.'); }
  if (data.app !== 'financas') return toast('Este arquivo não é do app Finanças.');
  const vazio = !DB.lancamentos.length;
  const n = contaNovos(data, DB), emDia = vazio || pendentesEnvio() === 0;
  if (vazio) { data.config ||= {}; data.config.updatedAt ||= nowTS(); DB = Object.assign(emptyDB(), data); DB.config = Object.assign(DEFAULT_CONFIG(), data.config); }
  else DB = mergeDB(DB, data).data;
  for (const c of COLS) DB[c] ||= [];
  SET.lastImport = nowTS();
  // se nada daqui estava pendente, o que chegou já está no outro aparelho: continua "em dia"
  if (emDia) { let mx = (DB.config.updatedAt || ''); for (const c of COLS) for (const x of DB[c]) if ((x.updatedAt || '') > mx) mx = x.updatedAt; SET.lastExport = mx || SET.lastImport; }
  saveSet(); persist();
  if (vazio) toast(`Dados carregados ✓ ${DB.lancamentos.filter(l => !l.deleted).length} lançamentos.`); else toast(n ? `Recebido ✓ ${n} ${n === 1 ? 'alteração juntada' : 'alterações juntadas'}.` : 'Recebido ✓ Nada novo — os dois aparelhos já estavam iguais.');
  if (vazio) state.mes = curYM();
  render();
}
async function callApi(body) {
  const res = await fetch(SET.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ key: SET.key, ...body }), redirect: 'follow' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = await res.json();
  if (!j.ok && !j.conflict) throw new Error(j.error || 'erro no servidor');
  return j;
}
async function sync(manual) {
  if (!SET.url || !SET.key) { if (manual) location.hash = '#/ajustes'; return; }
  if (syncing) return; if (!navigator.onLine) { if (manual) toast('Sem internet — os dados ficam salvos no aparelho.'); return; }
  syncing = true; updateSyncBadge();
  try {
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      const g = await callApi({ op: 'get' });
      const { data, localNewer } = mergeDB(DB, g.data);
      if (localNewer || !g.data) {
        const p = await callApi({ op: 'put', baseRev: g.rev, data });
        if (p.conflict) continue;
        data.rev = p.rev;
      } else data.rev = g.rev;
      DB = data; for (const c of COLS) DB[c] ||= [];
      SET.dirty = false; SET.lastSync = nowTS(); SET.syncErr = null; saveSet(); persist();
      if (manual) toast('Sincronizado com o Google Drive ✓');
      render();
      break;
    }
  } catch (e) {
    SET.syncErr = String(e.message || e); saveSet();
    if (manual) toast('Falha ao sincronizar: ' + SET.syncErr);
  } finally { syncing = false; updateSyncBadge(); }
}
function updateSyncBadge() {
  const b = $('#syncBtn'); if (!b) return;
  if (!SET.url) {
    const n = pendentesEnvio();
    b.className = 'sync ' + (n ? 'pend' : SET.lastExport ? 'ok' : '');
    $('.sync-txt', b).textContent = n ? `${n} p/ enviar` : SET.lastExport ? 'Em dia' : 'Só local';
    b.title = n ? `${n} alterações ainda não enviadas ao outro aparelho — toque para enviar` : 'Trocar dados com o outro aparelho';
    return;
  }
  b.className = 'sync ' + (syncing ? 'busy pend' : SET.syncErr ? 'err' : SET.dirty ? 'pend' : 'ok');
  $('.sync-txt', b).textContent = syncing ? 'Sincronizando' : SET.syncErr ? 'Erro' : SET.dirty ? 'Pendente' : 'Drive ✓';
  b.title = 'Sincronizar';
}

/* ---------------- UI base ---------------- */
/** Telas de caixa (Início, Projeção) abrem no mês seguinte: é quando a fatura do cartão de hoje é paga. */
const MES_PROX = ['inicio', 'projecao'];
const mesPadrao = r => SET.abrirProx !== false && MES_PROX.includes(r) ? addM(curYM(), 1) : curYM();
const state = { mes: curYM(), mesManual: false, filtro: { q: '', tipo: '', cat: '', forma: '', periodo: 'compra', de: '', ate: '', ordem: 'data', fixo: '' }, projSub: true, sel: new Set() };
const ROUTES = [
  { id: 'inicio', t: 'Visão geral', i: 'home' },
  { id: 'lancamentos', t: 'Lançamentos', i: 'list' },
  { id: 'projecao', t: 'Projeção', i: 'chart' },
  { id: 'semanal', t: 'Controle', i: 'week' },
  { id: 'fatura', t: 'Fatura do cartão', i: 'card' },
  { id: 'contas', t: 'Contas do mês', i: 'check' },
  { id: 'parcelados', t: 'Parcelados', i: 'card' },
  { id: 'indicadores', t: 'Alertas e ajustes', i: 'bulb' },
  { id: 'investimentos', t: 'Investimentos', i: 'piggy' },
  { id: 'cadastros', t: 'Cadastros', i: 'tag' },
  { id: 'ajustes', t: 'Ajustes e troca de dados', i: 'gear' },
];
function buildNav() {
  $('#sideNav').innerHTML = ROUTES.map(r => `<a href="#/${r.id}" data-r="${r.id}">${icon(r.i)}${r.t}</a>`).join('');
  $('#bottomNav').innerHTML = `
    <a href="#/inicio" data-r="inicio">${icon('home')}Início</a>
    <a href="#/lancamentos" data-r="lancamentos">${icon('list')}Extrato</a>
    <button class="fab" data-act="novo" aria-label="Novo lançamento"><span>+</span></button>
    <a href="#/semanal" data-r="semanal">${icon('week')}Controle</a>
    <a href="#/mais" data-r="mais">${icon('more')}Mais</a>`;
}
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 3200); }
function openSheet(html, wide) { const s = $('#sheet'), c = $('.sheet-card', s); c.className = 'sheet-card' + (wide ? ' wide' : ''); c.innerHTML = html; rotularTabelas(c); s.hidden = false; document.body.style.overflow = 'hidden'; }
function closeSheet() { $('#sheet').hidden = true; document.body.style.overflow = ''; }
const sheetHead = t => `<div class="sheet-head"><h3>${t}</h3><button class="icon-btn" data-act="fechar" aria-label="Fechar">×</button></div>`;

function route() { return (location.hash.replace(/^#\/?/, '') || 'inicio').split('?')[0]; }
function render() {
  const r = route();
  if (!state.mesManual) state.mes = mesPadrao(r);
  const def = ROUTES.find(x => x.id === r) || { t: 'Mais' };
  $('#pageTitle').textContent = def.t;
  $('#mesLabel').textContent = ymLong(state.mes) + (state.mes === mesPadrao(r) ? '' : ' •');
  $('#mesLabel').title = state.mes === mesPadrao(r) ? '' : 'Toque para voltar ao mês padrão';
  $$('[data-r]').forEach(a => a.classList.toggle('active', a.dataset.r === r || (r !== 'inicio' && a.dataset.r === 'mais' && !['lancamentos', 'semanal'].includes(r))));
  const v = VIEWS[r] || VIEWS.inicio;
  $('#view').innerHTML = v();
  rotularTabelas($('#view'));
  updateSyncBadge();
}

/** No celular as tabelas viram listas: cada célula recebe o nome da coluna (data-label). */
function rotularTabelas(root) {
  for (const t of root.querySelectorAll('table.tbl')) {
    const ths = t.querySelectorAll('thead tr:first-child th'); if (!ths.length) continue;
    const labels = []; ths.forEach(th => { const n = +th.getAttribute('colspan') || 1; for (let i = 0; i < n; i++) labels.push(th.textContent.trim()); });
    for (const tr of t.querySelectorAll('tbody tr')) { let i = 0; for (const td of tr.children) { if (td.colSpan > 1) { i += td.colSpan; continue; } td.dataset.label = labels[i] || ''; i++; } }
  }
}
/* ---------------- gráficos SVG ---------------- */
function chartMeses(months) {
  const data = months.map(m => summary(m));
  const W = 720, H = 230, P = { l: 52, r: 10, t: 12, b: 26 };
  const max = Math.max(1, ...data.map(d => Math.max(d.rec, d.desp)));
  const minS = Math.min(0, ...data.map(d => d.saldo));
  const top = niceMax(max), bot = minS < 0 ? -niceMax(-minS) : 0;
  const y = v => P.t + (top - v) / (top - bot) * (H - P.t - P.b);
  const bw = (W - P.l - P.r) / months.length, cur = curYM();
  let g = '';
  for (let i = 0; i <= 4; i++) { const v = bot + (top - bot) * i / 4; g += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--border)"/><text x="${P.l - 6}" y="${y(v) + 4}" text-anchor="end">${axisFmt(v)}</text>`; }
  g += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(0)}" y2="${y(0)}" stroke="var(--faint)"/>`;
  data.forEach((d, i) => {
    const x = P.l + i * bw, w = Math.min(18, bw / 3.2), cx = x + bw / 2;
    const fut = d.m > cur ? ' opacity=".55"' : '';
    if (d.m === cur) g += `<rect x="${x + 2}" y="${P.t}" width="${bw - 4}" height="${H - P.t - P.b}" fill="var(--brand-soft)" rx="6"/>`;
    g += `<rect x="${cx - w - 1}" y="${y(d.rec)}" width="${w}" height="${Math.max(0, y(0) - y(d.rec))}" rx="3" fill="var(--bar-rec)"${fut}><title>Receitas ${ymShort(d.m)}: ${money(d.rec)}</title></rect>`;
    g += `<rect x="${cx + 1}" y="${y(d.desp)}" width="${w}" height="${Math.max(0, y(0) - y(d.desp))}" rx="3" fill="var(--bar-desp)"${fut}><title>Despesas ${ymShort(d.m)}: ${money(d.desp)}</title></rect>`;
    g += `<text x="${cx}" y="${H - 8}" text-anchor="middle"${d.m === cur ? ' font-weight="700"' : ''}>${ymShort(d.m)}</text>`;
  });
  const pts = data.map((d, i) => `${P.l + i * bw + bw / 2},${y(d.saldo)}`).join(' ');
  g += `<polyline points="${pts}" fill="none" stroke="var(--line)" stroke-width="2"/>`;
  data.forEach((d, i) => g += `<circle cx="${P.l + i * bw + bw / 2}" cy="${y(d.saldo)}" r="3.5" fill="${d.saldo < 0 ? 'var(--danger)' : 'var(--line)'}"><title>Saldo ${ymShort(d.m)}: ${money(d.saldo)}</title></circle>`);
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Receitas, despesas e saldo por mês">${g}</svg>
    <div class="legend"><span><i style="background:var(--bar-rec)"></i>Receitas</span><span><i style="background:var(--bar-desp)"></i>Despesas</span><span><i style="background:var(--line);height:3px"></i>Saldo</span><span class="faint">Meses futuros = projeção (parcelas + fixos)</span></div></div>`;
}
const axisFmt = v => Math.abs(v) >= 1000 ? (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'k' : String(Math.round(v));
function niceMax(v) { const p = Math.pow(10, Math.floor(Math.log10(v))); for (const k of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (k * p >= v) return k * p; return v; }
function spark(vals, w = 90, h = 24) {
  const max = Math.max(1, ...vals), st = w / Math.max(1, vals.length - 1);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${vals.map((v, i) => `${i * st},${h - 2 - (v / max) * (h - 4)}`).join(' ')}" fill="none" stroke="var(--brand-2)" stroke-width="1.6"/></svg>`;
}
const barHtml = (u, mark, neutro) => `<div class="bar ${neutro ? '' : u >= 1 ? 'over' : u >= .8 ? 'warn' : ''}"><i style="width:${Math.min(100, Math.max(0, u * 100)).toFixed(1)}%"></i>${mark != null ? `<span class="mark" style="left:${Math.min(100, mark * 100)}%"></span>` : ''}</div>`;
const alertHtml = a => `<div class="alert ${a.lvl}"><span class="ai">${{ danger: '!', warn: '!', info: 'i', ok: '✓', tip: '★' }[a.lvl]}</span><div>${a.txt}${a.link ? ` <a class="link" href="${a.link}">ver</a>` : ''}</div></div>`;

/* ---------------- telas ---------------- */
const VIEWS = {};

VIEWS.inicio = () => {
  if (!DB.lancamentos.length) return emptyState();
  const m = state.mes, s = summary(m), cur = curYM();
  const ins = insights(m), sug = sugestoes(m);
  const cats = Object.entries(s.byCat).sort((a, b) => b[1] - a[1]);
  const tetos = Object.fromEntries(DB.config.categorias.map(c => [c.nome, c.teto]));
  const usoDesp = s.rec > 0 ? s.desp / s.rec : 1;
  const months = Array.from({ length: 10 }, (_, i) => addM(m, i - 3));
  const invTotal = sum(DB.config.instituicoes, i => i.saldo);
  const wd = weeklyData(m);
  const recentes = entriesFor(m).filter(l => !l.virtual).sort((a, b) => (b.data || '').localeCompare(a.data || '') || (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 6);
  const contas = contasDoMes(m), pagas = contas.filter(c => c.pago).length;

  const cartaoDepois = sum(LIVE.filter(l => l.tipo === 'Despesa' && (l.data || '').slice(0, 7) === m && l.mesPgto === addM(m, 1) && !l.fixo), l => l.valor);
  const hero = `<div class="card hero">
      <div class="lbl">Saldo previsto de ${ymLong(m)}</div>
      <div class="big">${money(s.saldo)}</div>
      <div class="split"><div><span class="lbl">Receitas</span><b>${money(s.rec)}</b></div><div><span class="lbl">Despesas</span><b>${money(s.desp)}</b></div></div>
      <div class="meter"><i style="width:${Math.min(100, usoDesp * 100)}%"></i></div>
      <div class="lbl" style="margin-top:6px">${pct(usoDesp)} da receita comprometida · fatura ${money(s.fatura)}</div>
      ${cartaoDepois ? `<div class="lbl" style="margin-top:4px">+ ${money(cartaoDepois)} comprados no cartão este mês vão para a fatura de ${ymShort(addM(m, 1))}</div>` : ''}
    </div>`;

  const kpis = `<div class="grid kpis desk">
      ${kpi('Receitas', money(s.rec), (histAvg(m, x => x.rec) != null ? `média ${money(histAvg(m, x => x.rec))}` : ''))}
      ${kpi('Despesas', money(s.desp), (histAvg(m, x => x.desp) != null ? `média ${money(histAvg(m, x => x.desp))}` : ''))}
      ${kpi('Saldo do mês', `<span class="${s.saldo < 0 ? 'neg' : 'pos'}">${money(s.saldo)}</span>`, s.aportes ? `aportes ${money(s.aportes)}` : 'receitas − despesas − aportes')}
      ${kpi('Taxa de poupança', `<span class="${s.poupanca < DB.config.regras.metaPoupanca ? 'warn-t' : 'pos'}">${pct(s.poupanca)}</span>`, `meta ${pct(DB.config.regras.metaPoupanca)}`)}
      ${kpi('Fatura do cartão', money(s.fatura), `${pct(s.desp ? s.fatura / s.desp : 0)} das despesas`)}
      ${kpi('Investimentos', money(invTotal), `${DB.config.instituicoes.filter(i => i.saldo).length} instituições`)}
    </div>`;

  const catCard = `<div class="card"><h2>Gastos por categoria <a href="#/projecao">projeção →</a></h2>
      ${cats.length ? cats.map(([c, v]) => {
        const t = tetos[c], avg = histAvg(m, x => x.byCat[c] || 0), d = avg ? v / avg - 1 : null;
        return `<div class="catrow"><div class="row"><span>${catEmoji(c)}</span><span class="grow ellipsis">${esc(c)}</span>
          <span class="desk tiny ${d > .25 ? 'warn-t' : 'faint'}">${d == null ? '' : (d > 0 ? '▲' : '▼') + pct(Math.abs(d))} vs média</span>
          <b class="num">${money(v)}</b><span class="tiny faint num" style="width:38px;text-align:right">${pct(v / s.desp)}</span></div>
          ${t ? barHtml(v / t) : barHtml(v / (cats[0][1] || 1), null, true)}${t ? `<div class="tiny faint">teto ${money(t)}</div>` : ''}</div>`;
      }).join('') : '<div class="empty">Sem despesas neste mês.</div>'}</div>`;

  const alertCard = `<div class="card"><h2>Alertas e ajustes <a href="#/indicadores">todos →</a></h2>
      ${ins.length ? ins.slice(0, innerWidth < 1024 ? 3 : 5).map(alertHtml).join('') : '<div class="alert ok"><span class="ai">✓</span><div>Nenhum alerta para este mês.</div></div>'}
      <div class="desk" style="margin-top:8px">${sug.slice(0, 3).map(alertHtml).join('')}</div></div>`;

  const semCard = m === cur && wd.rows.length ? `<div class="card"><h2>Caixinhas desta semana <a href="#/semanal">detalhes →</a></h2>
      ${wd.rows.slice().sort((a, b) => (b.sem[wd.curW]?.v || 0) / (b.sem[wd.curW]?.lim || 1) - (a.sem[wd.curW]?.v || 0) / (a.sem[wd.curW]?.lim || 1)).slice(0, 6).map(r => {
        const w = r.sem[wd.curW] || { v: 0, lim: r.limSem };
        return `<div class="catrow"><div class="row"><span class="grow ellipsis">${esc(r.sub)}</span><span class="num small"><b>${money(w.v)}</b> <span class="faint">/ ${money(w.lim)}</span></span></div>${barHtml(w.lim ? w.v / w.lim : 0)}</div>`;
      }).join('')}</div>` : '';

  const fatCard = cartoes().length ? `<div class="card"><h2>Fatura do cartão <a href="#/fatura">detalhes →</a></h2>${cartoes().map(c => {
      const fa = faturaDe(c.nome, faturaAberta(c.nome)), fp = faturaDe(c.nome, curYM());
      return `<div class="click" data-act="verFatura" data-forma="${esc(c.nome)}" data-m="${fa.fm}">
        ${cartoes().length > 1 ? `<div class="tiny muted" style="margin-bottom:2px">${esc(c.nome)}</div>` : ''}
        <div class="row between"><span class="muted small">Aberta · vence em ${ymShort(fa.fm)}</span><b class="num" style="font-size:20px">${money(fa.total)}</b></div>
        <div class="tiny faint" style="margin:2px 0 8px">${fa.dias > 0 ? `fecha em ${fa.dias} ${fa.dias === 1 ? 'dia' : 'dias'} (${dShort(fa.fecha)})` : fa.dias === 0 ? 'fecha hoje' : 'fechada'} · compras ${money(fa.tot('compras') + fa.tot('novasParc'))} · parcelas antigas ${money(fa.tot('parcelas'))} · fixos ${money(fa.tot('fixos'))}</div></div>
        ${fp.total ? `<div class="row between click sub-l" data-act="verFatura" data-forma="${esc(c.nome)}" data-m="${fp.fm}"><span class="muted small">Fechada · paga em ${ymShort(fp.fm)}</span><span class="num small"><b>${money(fp.total)}</b></span></div>` : ''}`;
    }).join('<hr style="border:0;border-top:1px solid var(--border);margin:10px 0">')}</div>` : '';

  const recCard = `<div class="card"><h2>Últimos lançamentos <a href="#/lancamentos">extrato →</a></h2><div class="list">${recentes.map(liLanc).join('') || '<div class="empty">Nada lançado ainda.</div>'}</div></div>`;

  const contasCard = `<div class="card"><h2>Contas do mês <a href="#/contas">${pagas} de ${contas.length} pagas →</a></h2>
      <div class="list">${contas.filter(c => !c.pago).slice(0, 6).map(x => `<div class="li"><div class="grow"><div class="t ellipsis">${esc(x.c.nome)}</div><div class="tiny faint">${x.venc ? 'vence ' + dShort(x.venc) : 'sem vencimento'}</div></div><span class="tag ${x.cls}">${x.st}</span><b class="num small">${money(x.v)}</b></div>`).join('') || '<div class="alert ok"><span class="ai">✓</span><div>Todas as contas pagas.</div></div>'}</div></div>`;

  const top = entriesFor(m).filter(l => l.tipo === 'Despesa').sort((a, b) => b.valor - a.valor).slice(0, 8);
  const topCard = `<div class="card desk"><h2>Maiores despesas do mês</h2><div class="tbl-wrap"><table class="tbl"><tbody>${top.map(l => `<tr class="click ${l.virtual ? 'virtual' : ''}" data-act="editar" data-id="${l.origem || l.id}"><td class="ellipsis" style="max-width:220px">${esc(l.desc)}${l.de > 1 ? ` <span class="tag">${l.parcela}/${l.de}</span>` : ''}${l.virtual ? ' <span class="tag">fixo</span>' : ''}</td><td class="muted">${esc(l.sub)}</td><td class="n">${money(l.valor)}</td></tr>`).join('')}</tbody></table></div></div>`;

  // ---- celular: só o essencial; detalhes nos ⓘ e nas telas próprias ----
  const wdHoje = weeklyData(cur), cHoje = contasDoMes(cur), aPagar = cHoje.filter(c => !c.pago);
  const ultimos = LIVE.slice().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 5);
  const heroTip = `Receitas ${money(s.rec)}<br>Despesas ${money(s.desp)}<br>${pct(usoDesp)} da receita comprometida<br>Fatura do cartão neste mês: ${money(s.fatura)}${s.aportes ? `<br>Aportes ${money(s.aportes)}` : ''}`;
  const heroM = `<div class="card hero">
      <div class="row between"><span class="lbl">Saldo previsto · ${ymLong(m)}</span>${tip(heroTip, 'on-dark')}</div>
      <div class="big">${money(s.saldo)}</div>
      <div class="meter"><i style="width:${Math.min(100, usoDesp * 100)}%"></i></div>
      <div class="lbl" style="margin-top:6px">${pct(usoDesp)} da receita comprometida</div></div>`;
  const fatM = cartoes().map(c => { const fa = faturaDe(c.nome, faturaAberta(c.nome)), fp = faturaDe(c.nome, cur);
      return `<div class="li click" data-act="verFatura" data-forma="${esc(c.nome)}" data-m="${fa.fm}"><div class="ico">💳</div>
        <div class="grow"><div class="t">Fatura ${cartoes().length > 1 ? esc(c.nome) : 'aberta'}</div><div class="tiny faint">vence ${ymShort(fa.fm)} · ${fa.dias > 0 ? `fecha em ${fa.dias}d` : 'fechada'}</div></div>
        <b class="num">${money(fa.total)}</b>${tip(`Compras ${money(fa.tot('compras') + fa.tot('novasParc'))}<br>Parcelas antigas ${money(fa.tot('parcelas'))}<br>Fixos ${money(fa.tot('fixos'))}${fp.total ? `<br><br>Fatura fechada (paga em ${ymShort(cur)}): ${money(fp.total)}` : ''}`)}</div>`; }).join('');
  const nAl = ins.filter(a => a.lvl !== 'ok').length;
  const resumoM = `<div class="card"><div class="list">${fatM}
      ${nAl ? `<a class="li click" href="#/indicadores" style="text-decoration:none;color:inherit"><div class="ico">⚠️</div><div class="grow"><div class="t">${nAl} ${nAl === 1 ? 'ponto' : 'pontos'} de atenção</div><div class="tiny faint ellipsis">${esc(ins[0].txt.replace(/<[^>]+>/g, '').slice(0, 70))}…</div></div><span class="faint">›</span></a>` : ''}
      ${cHoje.length ? `<a class="li click" href="#/contas" style="text-decoration:none;color:inherit"><div class="ico">✅</div><div class="grow"><div class="t">Contas de ${ymShort(cur)}</div><div class="tiny faint">${cHoje.length - aPagar.length} de ${cHoje.length} pagas</div></div><span class="num small">${aPagar.length ? 'faltam ' + money(sum(aPagar, c => c.v)) : 'tudo pago ✓'}</span><span class="faint" style="margin-left:6px">›</span></a>` : ''}
    </div></div>`;
  const semRows = wdHoje.curW >= 0 ? wdHoje.rows.filter(r => r.limSem > 1).map(r => ({ r, w: r.sem[wdHoje.curW] })).sort((a, b) => b.w.v / (b.w.lim || 1) - a.w.v / (a.w.lim || 1)).slice(0, 3) : [];
  const semM = semRows.length ? `<div class="card"><h2>Esta semana <a href="#/semanal">controle →</a></h2>${semRows.map(({ r, w }) => `<div class="catrow"><div class="row"><span class="grow ellipsis">${esc(r.sub)}</span><span class="num small"><b class="${w.over ? 'danger-t' : ''}">${money(w.v)}</b> <span class="faint">/ ${money(w.lim)}</span></span></div>${barHtml(w.lim ? w.v / w.lim : 0)}</div>`).join('')}</div>` : '';
  const catM = cats.length ? `<div class="card"><h2>Maiores gastos de ${ymShort(m)} <a href="#/projecao">todos →</a></h2>${cats.slice(0, 4).map(([c, v]) => `<div class="catrow"><div class="row"><span>${catEmoji(c)}</span><span class="grow ellipsis">${esc(c)}</span><b class="num small">${money(v)}</b></div>${barHtml(v / (cats[0][1] || 1), null, true)}</div>`).join('')}</div>` : '';
  const ultM = `<div class="card"><h2>Últimos lançados <a href="#/lancamentos">extrato →</a></h2><div class="list">${ultimos.map(liLanc).join('') || '<div class="empty">Nada lançado ainda.</div>'}</div></div>`;
  const mobile = `<div class="stack mob">${heroM}${resumoM}${semM}${catM}${ultM}</div>`;

  return `${mobile}<div class="stack desk">
    ${kpis}
    <div class="card desk"><h2>Receitas × despesas × saldo <a href="#/projecao">tabela →</a></h2>${chartMeses(months)}</div>
    <div class="grid c3">
      <div class="stack">${fatCard}${alertCard}${catCard}</div>
      <div class="stack">${semCard}${contasCard}${topCard}<div class="mob">${recCard}</div></div>
    </div>
    <div class="desk">${recCard}</div>
  </div>`;
};
/** Botão ⓘ que abre um balão com o detalhe (HTML já escapado por quem chama). */
const tip = (html, cls = '') => `<button type="button" class="info-btn ${cls}" data-tip="${esc(html)}" aria-label="Mais informações">i</button>`;
const kpi = (l, v, s) => `<div class="card kpi"><div class="lbl">${l}</div><div class="val">${v}</div><div class="sub">${s || ''}</div></div>`;
function liLanc(l) {
  const c = catOf(l), rec = l.tipo === 'Receita';
  return `<div class="li click" data-act="editar" data-id="${l.origem || l.id}">
    <div class="ico">${catEmoji(c)}</div>
    <div class="grow"><div class="t ellipsis">${esc(l.desc || l.sub)}</div>
      <div class="tiny faint ellipsis">${esc(l.sub)} · ${esc(l.forma || '')}${l.de > 1 ? ` · ${l.parcela}/${l.de}` : ''}${l.fixo ? ' · fixo' : ''}${l.virtual ? ' · projetado' : ''}</div></div>
    <div class="right"><div class="num ${rec ? 'pos' : ''}" style="font-weight:600">${rec ? '+' : '−'} ${money(l.valor)}</div><div class="tiny faint">${dShort(l.data)}</div></div></div>`;
}
function emptyState() {
  return `<div class="card empty" style="max-width:560px;margin:30px auto"><b>Bem-vindo! 👋</b>
    Ainda não há dados neste aparelho.<br><br>
    • <b>Primeiro uso:</b> vá em <a class="link" href="#/ajustes">Ajustes</a> e importe o arquivo <code>carga_inicial.json</code> gerado da sua planilha.<br>
    • <b>Já usa em outro aparelho?</b> Lá, toque em <i>Enviar para o outro aparelho</i>; aqui, em <a class="link" href="#/ajustes">Ajustes</a> → <i>Receber do outro aparelho</i>.<br><br>
    <button class="btn primary" data-act="novo">+ Fazer um lançamento</button></div>`;
}

/* ---- Lançamentos / extrato ---- */
VIEWS.lancamentos = () => {
  const f = state.filtro, m = state.mes;
  let ls;
  // fixas: no mês selecionado mostra as que valem para o mês (inclui as repetições projetadas)
  if (f.periodo === 'pgto' || (f.periodo === 'compra' && f.fixo === 'sim')) ls = entriesFor(m).slice();
  else if (f.periodo === 'compra') ls = LIVE.filter(l => (l.data || '').slice(0, 7) === m);
  else if (f.periodo === 'datas') ls = LIVE.filter(l => l.data && (!f.de || l.data >= f.de) && (!f.ate || l.data <= f.ate));
  else ls = LIVE.slice();
  if (f.tipo) ls = ls.filter(l => l.tipo === f.tipo);
  if (f.cat) ls = ls.filter(l => catOf(l) === f.cat);
  if (f.forma) ls = ls.filter(l => l.forma === f.forma);
  if (f.fixo) ls = ls.filter(l => !!(l.fixo || l.virtual) === (f.fixo === 'sim'));
  if (f.q) { const q = f.q.toLowerCase(); ls = ls.filter(l => `${l.desc} ${l.sub} ${l.obs || ''} ${l.forma}`.toLowerCase().includes(q)); }
  const porRecente = (a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '');
  if (f.ordem === 'recente') ls.sort((a, b) => porRecente(a, b) || (b.data || '').localeCompare(a.data || ''));
  else if (f.ordem === 'valor') ls.sort((a, b) => b.valor - a.valor);
  else if (f.ordem === 'antiga') ls.sort((a, b) => (a.data || '9').localeCompare(b.data || '9') || porRecente(b, a));
  else ls.sort((a, b) => (b.data || '').localeCompare(a.data || '') || porRecente(a, b));
  const nFiltros = [f.tipo, f.cat, f.forma, f.fixo].filter(Boolean).length;
  const descPeriodo = { pgto: 'com pagamento em ' + ymLong(m), compra: f.fixo === 'sim' ? 'fixos de ' + ymLong(m) : 'comprados em ' + ymLong(m), datas: (f.de || f.ate) ? `de ${f.de ? dShort(f.de) + '/' + f.de.slice(2, 4) : 'início'} até ${f.ate ? dShort(f.ate) + '/' + f.ate.slice(2, 4) : 'hoje'}` : 'no intervalo', todos: 'em todos os meses' }[f.periodo] || '';
  const tr = sum(ls.filter(l => l.tipo === 'Receita'), l => l.valor), td = sum(ls.filter(l => l.tipo === 'Despesa'), l => l.valor);
  const cats = [...new Set(DB.config.subcategorias.map(s => s.cat))];
  const filtros = `<div class="filters">
    <input class="input" type="search" placeholder="Buscar descrição, subcategoria, obs…" value="${esc(f.q)}" data-filtro="q">
    <select class="input" data-filtro="periodo" title="Período">
      <option value="compra" ${f.periodo === 'compra' ? 'selected' : ''}>Compra no mês</option>
      <option value="pgto" ${f.periodo === 'pgto' ? 'selected' : ''}>Pagamento no mês</option>
      <option value="datas" ${f.periodo === 'datas' ? 'selected' : ''}>Entre datas…</option>
      <option value="todos" ${f.periodo === 'todos' ? 'selected' : ''}>Todos os meses</option></select>
    <select class="input" data-filtro="ordem" title="Ordenar">
      <option value="data" ${f.ordem === 'data' ? 'selected' : ''}>Mais novos</option>
      <option value="recente" ${f.ordem === 'recente' ? 'selected' : ''}>Últimos lançados</option>
      <option value="antiga" ${f.ordem === 'antiga' ? 'selected' : ''}>Mais antigos</option>
      <option value="valor" ${f.ordem === 'valor' ? 'selected' : ''}>Maior valor</option></select>
    ${f.periodo === 'datas' ? `<div class="datas"><label>de <input class="input" type="date" data-filtro="de" value="${esc(f.de)}"></label><label>até <input class="input" type="date" data-filtro="ate" value="${esc(f.ate)}"></label></div>` : ''}
    <details class="mais-filtros" ${nFiltros ? 'open' : ''}><summary class="btn sm">Filtros${nFiltros ? ` (${nFiltros})` : ''}</summary><div class="filters" style="margin:8px 0 0">
    <select class="input" data-filtro="tipo"><option value="">Tudo</option><option ${f.tipo === 'Despesa' ? 'selected' : ''}>Despesa</option><option ${f.tipo === 'Receita' ? 'selected' : ''}>Receita</option></select>
    <select class="input" data-filtro="cat"><option value="">Todas as categorias</option>${cats.map(c => `<option ${f.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
    <select class="input" data-filtro="forma"><option value="">Todas as formas</option>${DB.config.formas.map(x => `<option ${f.forma === x.nome ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select>
    <select class="input" data-filtro="fixo"><option value="">Fixas e variáveis</option><option value="sim" ${f.fixo === 'sim' ? 'selected' : ''}>Só fixas (mensais)</option><option value="nao" ${f.fixo === 'nao' ? 'selected' : ''}>Só variáveis</option></select>
    ${nFiltros ? '<button class="btn sm" data-act="limparFiltros">Limpar</button>' : ''}</div></details>
  </div>
  <div class="row small" style="margin-bottom:10px;gap:14px;flex-wrap:wrap"><span class="muted">${ls.length} lançamentos ${descPeriodo}</span><span class="pos">Receitas ${money(tr)}</span><span class="neg">Despesas ${money(td)}</span>
    <span class="grow"></span><button class="btn sm desk" data-act="csv">Exportar CSV</button></div>`;

  const mobile = (() => {
    if (f.ordem !== 'data' && f.ordem !== 'antiga') return `<div class="list">${ls.slice(0, 400).map(liLanc).join('')}</div>` || '';
    const byDay = groupBy(ls.slice(0, 400), l => l.data || '');
    return Object.entries(byDay).map(([d, arr]) => `<div class="day-h">${dLong(d)}</div><div class="list">${arr.map(liLanc).join('')}</div>`).join('') || '<div class="empty">Nenhum lançamento.</div>';
  })();
  const table = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Compra</th><th>Descrição</th><th>Subcategoria</th><th>Categoria</th><th>Forma</th><th class="n">Parcela</th><th>Mês pgto</th><th class="n">Valor</th><th>Obs</th></tr></thead><tbody>
    ${ls.slice(0, 1500).map(l => `<tr class="click ${l.virtual ? 'virtual' : ''} ${l.antecipado ? 'antecip' : ''}" data-act="editar" data-id="${l.origem || l.id}">
      <td>${dShort(l.data)}/${(l.data || '').slice(2, 4)}</td><td class="ellipsis" style="max-width:260px">${esc(l.desc)}${l.fixo ? ' <span class="tag brand">fixo</span>' : ''}${l.virtual ? ' <span class="tag">projetado</span>' : ''}</td>
      <td>${esc(l.sub)}</td><td class="muted">${esc(catOf(l))}</td><td>${esc(l.forma)}</td><td class="n">${l.de > 1 ? l.parcela + '/' + l.de : ''}</td><td>${ymShort(l.mesPgto)}</td>
      <td class="n ${l.tipo === 'Receita' ? 'pos' : ''}">${l.tipo === 'Receita' ? '+' : ''}${money(l.valor)}</td><td class="muted ellipsis" style="max-width:180px">${esc(l.obs || '')}</td></tr>`).join('')}
  </tbody></table></div>`;
  return `<div class="card">${filtros}<div class="mob">${mobile}</div><div class="desk">${table}</div></div>`;
};

/* ---- Projeção ---- */
VIEWS.projecao = () => {
  const months = Array.from({ length: 10 }, (_, i) => addM(state.mes, i - 3)), cur = curYM();
  const S = months.map(summary);
  const cls = m => m === cur ? 'cur' : m > cur ? 'future' : '';
  const cell = (v, m, extra = '') => `<td class="n ${cls(m)} ${extra}">${v ? money(v) : '<span class="faint">–</span>'}</td>`;
  let acc = 0;
  const head = `<tr><th>Item</th>${months.map(m => `<th class="n ${m === cur ? 'cur' : ''}">${ymShort(m)}</th>`).join('')}<th class="n">Total</th></tr>`;
  const line = (lbl, f, c = '') => `<tr class="${c}"><td>${lbl}</td>${S.map(s => cell(f(s), s.m)).join('')}<td class="n"><b>${money(sum(S, f))}</b></td></tr>`;
  let body = line('Receitas', s => s.rec, 'cat') + line('Despesas', s => s.desp, 'cat') + line('&nbsp;&nbsp;dos quais: fatura do cartão', s => s.fatura, 'sub') + line('Aportes líquidos', s => s.aportes, 'sub');
  body += `<tr class="tot"><td>Saldo do mês</td>${S.map(s => `<td class="n ${cls(s.m)} ${s.saldo < 0 ? 'neg' : 'pos'}">${money(s.saldo)}</td>`).join('')}<td class="n">${money(sum(S, s => s.saldo))}</td></tr>`;
  body += `<tr><td class="muted">Saldo acumulado</td>${S.map(s => { acc += s.saldo; return `<td class="n ${cls(s.m)} ${acc < 0 ? 'neg' : ''}">${money(acc)}</td>`; }).join('')}<td></td></tr>`;
  body += `<tr><td class="muted">Taxa de poupança</td>${S.map(s => `<td class="n ${cls(s.m)}">${pct(s.poupanca)}</td>`).join('')}<td></td></tr>`;

  const tetos = Object.fromEntries(DB.config.categorias.map(c => [c.nome, c.teto]));
  const catsAll = [...new Set([...DB.config.categorias.map(c => c.nome), ...S.flatMap(s => Object.keys(s.byCat))])].filter(c => S.some(s => s.byCat[c]));
  let cats = '';
  for (const c of catsAll) {
    cats += `<tr class="cat"><td>${catEmoji(c)} ${esc(c)}${tetos[c] ? ` <span class="tag">teto ${moneyS(tetos[c])}</span>` : ''}</td>${S.map(s => { const v = s.byCat[c] || 0; return cell(v, s.m, tetos[c] && v > tetos[c] ? 'over' : ''); }).join('')}<td class="n"><b>${money(sum(S, s => s.byCat[c] || 0))}</b></td></tr>`;
    if (state.projSub) {
      const subs = [...new Set(S.flatMap(s => Object.keys(s.bySub)))].filter(x => subInfo(x).cat === c).sort();
      for (const sb of subs) cats += `<tr class="sub click" data-act="celula" data-sub="${esc(sb)}"><td>${esc(sb)}</td>${S.map(s => cell(s.bySub[sb] || 0, s.m)).join('')}<td class="n">${money(sum(S, s => s.bySub[sb] || 0))}</td></tr>`;
    }
  }
  const recSubs = [...new Set(S.flatMap(s => Object.keys(s.recBySub)))];
  const recRows = recSubs.map(sb => `<tr class="sub"><td>${esc(sb)}</td>${S.map(s => cell(s.recBySub[sb] || 0, s.m)).join('')}<td class="n">${money(sum(S, s => s.recBySub[sb] || 0))}</td></tr>`).join('');

  const depois = LIVE.filter(l => l.tipo === 'Despesa' && (l.data || '').slice(0, 7) === state.mes && l.mesPgto > state.mes);
  const depoisTot = sum(depois, l => l.valor), depoisProx = sum(depois.filter(l => l.mesPgto === addM(state.mes, 1)), l => l.valor);
  const sm = summary(state.mes), prox = Array.from({ length: 6 }, (_, i) => summary(addM(state.mes, i + 1)));
  const catsMes = Object.entries(sm.byCat).sort((a, b) => b[1] - a[1]);
  const subsDe = c => Object.entries(sm.bySub).filter(([x]) => subInfo(x).cat === c).sort((a, b) => b[1] - a[1]);
  const mobile = `<div class="stack mob">
    <div class="card"><div class="grid two-k">
      <div><div class="tiny muted">Receitas</div><div class="num pos" style="font-weight:700">${money(sm.rec)}</div></div>
      <div><div class="tiny muted">Despesas ${tip(`Fatura do cartão: ${money(sm.fatura)}${sm.aportes ? `<br>Aportes: ${money(sm.aportes)}` : ''}${sm.virtual ? `<br>${money(sm.virtual)} de fixos projetados` : ''}${depoisTot ? `<br><br>Compras de ${ymShort(state.mes)} no cartão (${money(depoisTot)}) não entram aqui: ${money(depoisProx)} caem em ${ymShort(addM(state.mes, 1))}${depoisTot - depoisProx > 0.005 ? ` e ${money(depoisTot - depoisProx)} nas parcelas seguintes` : ''}.` : ''}`)}</div><div class="num" style="font-weight:700">${money(sm.desp)}</div></div>
      <div><div class="tiny muted">Saldo do mês</div><div class="num ${sm.saldo < 0 ? 'neg' : 'pos'}" style="font-weight:700">${money(sm.saldo)}</div></div>
      <div><div class="tiny muted">Poupança</div><div class="num" style="font-weight:700">${pct(sm.poupanca)}</div></div></div>
      </div>
    <div class="card"><h2>Despesas por categoria</h2>
      ${catsMes.map(([c, v]) => { const t = tetos[c]; return `<details class="cat-det"><summary><span class="grow ellipsis">${catEmoji(c)} ${esc(c)}</span><span class="num ${t && v > t ? 'danger-t' : ''}"><b>${money(v)}</b>${t ? ` <span class="faint tiny">/ ${moneyS(t)}</span>` : ''}</span></summary>
        <div class="list">${subsDe(c).map(([sb, sv]) => `<div class="row sub-l click" data-act="celula" data-sub="${esc(sb)}"><span class="grow ellipsis">${esc(sb)}</span><span class="num small">${money(sv)}</span></div>`).join('')}</div></details>`; }).join('') || '<div class="empty">Sem despesas neste mês.</div>'}</div>
    ${Object.keys(sm.recBySub).length ? `<div class="card"><h2>Receitas</h2>${Object.entries(sm.recBySub).sort((a, b) => b[1] - a[1]).map(([sb, v]) => `<div class="row sub-l"><span class="grow ellipsis">${esc(sb)}</span><span class="num small pos">${money(v)}</span></div>`).join('')}</div>` : ''}
    <div class="card"><h2>Próximos meses <span class="tiny muted">toque para abrir</span></h2>
      ${prox.map(x => `<div class="row sub-l click" data-act="irMes" data-m="${x.m}"><span class="grow">${ymLong(x.m)}</span><span class="tiny faint" style="margin-right:10px">desp. ${moneyS(x.desp)}</span><span class="num small ${x.saldo < 0 ? 'neg' : 'pos'}"><b>${money(x.saldo)}</b></span></div>`).join('')}</div>
  </div>`;
  return `<div class="stack">${mobile}
    <div class="card desk"><h2>Evolução</h2>${chartMeses(months)}</div>
    <div class="card desk"><h2>3 meses anteriores, mês selecionado e 6 seguintes
      <label class="check small"><input type="checkbox" data-act="projSub" ${state.projSub ? 'checked' : ''}> subcategorias</label></h2>
      <p class="small muted" style="margin:-4px 0 10px">Meses futuros = parcelas já lançadas + lançamentos fixos (em itálico no extrato). Cartão entra no mês de vencimento da fatura.</p>
      <div class="tbl-wrap"><table class="tbl sticky1"><thead>${head}</thead><tbody>${body}
        <tr><td colspan="${months.length + 2}" style="padding-top:16px"><b>Receitas por subcategoria</b></td></tr>${recRows}
        <tr><td colspan="${months.length + 2}" style="padding-top:16px"><b>Despesas por categoria${state.projSub ? ' e subcategoria' : ''}</b></td></tr>${cats}
      </tbody></table></div></div></div>`;
};

/* ---- Fatura do cartão ---- */
VIEWS.fatura = () => {
  const cs = cartoes();
  if (!cs.length) return `<div class="card empty"><b>Nenhum cartão</b>Marque uma forma de pagamento como cartão (e o dia de fechamento) em <a class="link" href="#/cadastros">Cadastros</a>.</div>`;
  const forma = cs.some(c => c.nome === state.fatForma) ? state.fatForma : cs[0].nome;
  const ab = faturaAberta(forma), fm = state.fatM || ab;
  const F = faturaDe(forma, fm), meses = Array.from({ length: 7 }, (_, i) => addM(ab, i - 2));
  const status = fm === ab ? (F.dias > 0 ? `aberta · fecha em ${F.dias} ${F.dias === 1 ? 'dia' : 'dias'} (${dShort(F.fecha)})` : 'fecha hoje') : fm < ab ? 'fechada' : 'futura · por enquanto só parcelas e fixos';
  const ant = faturaDe(forma, addM(fm, -1)).total, dif = F.total - ant;
  const parte = (k, t, d) => F.tot(k) ? `<div class="row between sub-l"><span class="row" style="gap:2px">${t}${tip(d)}</span><b class="num">${money(F.tot(k))}</b></div>` : '';
  const cats = Object.entries(F.porCat).sort((a, b) => b[1] - a[1]);
  const grupo = (k, t) => F.g[k].length ? `<div class="day-h">${t} · ${money(F.tot(k))}</div><div class="list">${F.g[k].slice().sort((a, b) => (b.data || '').localeCompare(a.data || '')).map(liLanc).join('')}</div>` : '';
  return `<div class="stack">
    ${cs.length > 1 ? `<div class="seg ctrl-seg">${cs.map(c => `<button class="${c.nome === forma ? 'on' : ''}" data-act="verFatura" data-forma="${esc(c.nome)}" data-m="">${esc(c.nome)}</button>`).join('')}</div>` : ''}
    <div class="chips">${meses.map(x => `<button class="chip ${x === fm ? 'on' : ''}" data-act="verFatura" data-forma="${esc(forma)}" data-m="${x}">${ymShort(x)}${x === ab ? ' •' : ''}</button>`).join('')}</div>
    <div class="grid c2">
      <div class="stack">
        <div class="card hero"><div class="lbl">Fatura ${esc(forma)} · vence em ${ymLong(fm)}</div><div class="big">${money(F.total)}</div>
          <div class="lbl">${status}</div>
          <div class="lbl" style="margin-top:4px">${ant ? `${dif >= 0 ? '▲' : '▼'} ${money(Math.abs(dif))} vs. fatura anterior (${money(ant)})` : ''}</div></div>
        <div class="card"><h2>Composição</h2>
          ${parte('compras', 'Compras à vista', 'feitas no período desta fatura')}
          ${parte('novasParc', '1ª parcela de compras novas', 'parceladas no período')}
          ${parte('parcelas', 'Parcelas de compras anteriores', 'já estavam comprometidas')}
          ${parte('fixos', 'Fixos e assinaturas', 'recorrentes mensais')}
          ${F.total ? '' : '<div class="empty">Nada nesta fatura.</div>'}</div>
        ${cats.length ? `<div class="card"><h2>Por categoria</h2>${cats.map(([c, v]) => `<div class="catrow"><div class="row"><span>${catEmoji(c)}</span><span class="grow ellipsis">${esc(c)}</span><b class="num small">${money(v)}</b><span class="tiny faint num" style="width:38px;text-align:right">${pct(v / F.total)}</span></div>${barHtml(v / (cats[0][1] || 1), null, true)}</div>`).join('')}</div>` : ''}
      </div>
      <div class="card"><h2>Lançamentos da fatura <span class="tiny muted">${F.ls.length}</span></h2>
        ${grupo('compras', 'Compras')}${grupo('novasParc', 'Compras parceladas (1ª parcela)')}${grupo('parcelas', 'Parcelas anteriores')}${grupo('fixos', 'Fixos e assinaturas')}
        ${F.ls.length ? '' : '<div class="empty">Nenhum lançamento.</div>'}</div>
    </div></div>`;
};

/* ---- Semanal ---- */
VIEWS.semanal = () => {
  const m = state.mes, wd = weeklyData(m), cur = curYM();
  if (!wd.rows.length) return `<div class="card empty"><b>Sem caixinhas</b>Defina limites semanais por subcategoria em <a class="link" href="#/cadastros">Cadastros</a>.</div>`;
  const totLimSem = sum(wd.rows, r => r.limSem), totMes = sum(wd.rows, r => r.total), totLimMes = sum(wd.rows, r => r.limMes);
  const wi = wd.curW >= 0 ? wd.curW : 0;
  const wsel = state.semana != null && state.semana < wd.weeks.length ? state.semana : wi;
  const w = wd.weeks[wsel];
  const totW = sum(wd.rows, r => r.sem[wsel].v), limW = sum(wd.rows, r => r.sem[wsel].lim);
  const mobile = `<div class="card mob">
      <div class="chips" style="margin-bottom:12px">${wd.weeks.map((x, i) => `<button class="chip ${i === wsel ? 'on' : ''}" data-act="semana" data-i="${i}">${dShort(x.de)}–${dShort(x.ate)}</button>`).join('')}</div>
      <div class="row between" style="margin-bottom:6px"><span class="muted small">Semana ${wsel + 1}${m === cur && wsel === wd.curW ? ' (atual)' : ''}</span><span class="row" style="gap:6px"><span class="num"><b>${money(totW)}</b> <span class="faint">/ ${money(limW)}</span></span><button class="info-btn" data-act="infoSemana" aria-label="Resumo do mês">i</button></span></div>
      ${barHtml(limW ? totW / limW : 0)}
      <div style="margin-top:12px">${wd.rows.map((r, k) => { const s = r.sem[wsel]; return `<div class="catrow"><div class="row"><span class="grow ellipsis">${esc(r.sub)}</span><span class="num small"><b class="${s.over ? 'danger-t' : ''}">${money(s.v)}</b> <span class="faint">/ ${money(s.lim)}</span></span><button class="info-btn" data-act="infoCaixa" data-k="${k}" aria-label="Detalhes de ${esc(r.sub)}">i</button></div>${barHtml(s.lim ? s.v / s.lim : 0)}</div>`; }).join('')}</div></div>`;
  const desk = `<div class="card desk"><h2>Controle do mês por semana <span class="small muted">data da compra · parcelado conta o total na semana da compra</span></h2>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Caixinha</th><th class="n">Limite/sem</th>${wd.weeks.map((x, i) => `<th class="n ${m === cur && i === wd.curW ? 'cur' : ''}">S${i + 1}<br><span class="faint">${dShort(x.de)}–${dShort(x.ate)}</span></th>`).join('')}<th class="n">Total mês</th><th class="n">Limite mês</th><th class="n">Economia</th><th class="n">% usado</th><th class="n">Ritmo</th></tr></thead><tbody>
    ${wd.rows.map(r => `<tr class="click" data-act="celula" data-sub="${esc(r.sub)}" data-porcompra="1"><td>${esc(r.sub)}</td><td class="n">${money(r.limSem)}</td>${r.sem.map((s, i) => `<td class="n ${s.over ? 'over' : ''} ${m === cur && i === wd.curW ? 'cur' : ''}">${s.v ? money(s.v) : '<span class="faint">–</span>'}</td>`).join('')}
      <td class="n"><b>${money(r.total)}</b></td><td class="n">${money(r.limMes)}</td><td class="n ${r.eco < 0 ? 'neg' : 'pos'}">${money(r.eco)}</td><td class="n" style="min-width:110px">${barHtml(r.uso)}<span class="tiny">${pct(r.uso)}</span></td><td class="n ${r.ritmo > r.limMes ? 'warn-t' : 'faint'}">${r.ritmo ? money(r.ritmo) : '–'}</td></tr>`).join('')}
    <tr class="tot"><td>Total</td><td class="n">${money(totLimSem)}</td>${wd.weeks.map((_, i) => `<td class="n">${money(sum(wd.rows, r => r.sem[i].v))}</td>`).join('')}<td class="n">${money(totMes)}</td><td class="n">${money(totLimMes)}</td><td class="n">${money(totLimMes - totMes)}</td><td class="n">${pct(totLimMes ? totMes / totLimMes : 0)}</td><td></td></tr>
    </tbody></table></div><p class="tiny muted">Semana em vermelho: gastou mais que o limite (semanas incompletas têm limite proporcional aos dias). Ritmo = projeção do mês no ritmo de gasto atual.</p></div>`;
  const modo = state.ctrl || 'semana';
  const seg = `<div class="seg ctrl-seg"><button class="${modo === 'semana' ? 'on' : ''}" data-act="ctrlModo" data-m="semana">Semanal</button><button class="${modo === 'mes' ? 'on' : ''}" data-act="ctrlModo" data-m="mes">Mensal</button></div>`;
  return `<div class="stack">${seg}${modo === 'mes' ? controleMensal(m, wd) : mobile + desk}</div>`;
};

/** Visão mensal do Controle: quanto já foi de cada caixinha no mês e quanto ainda dá para gastar. */
function controleMensal(m, wd) {
  const cur = curYM(), dim = daysInMonth(m);
  const restam = m === cur ? dim - +todayISO().slice(8, 10) + 1 : m > cur ? dim : 0;
  const tot = sum(wd.rows, r => r.total), lim = sum(wd.rows, r => r.limMes), sobra = lim - tot;
  const porDia = v => restam > 0 && v > 0 ? ` · dá ${money(v / restam)}/dia` : '';
  const idx = new Map(wd.rows.map((r, k) => [r, k]));
  const rows = wd.rows.slice().sort((a, b) => b.uso - a.uso);
  const resumo = `<div class="card">
    <div class="row between" style="margin-bottom:6px"><span class="muted small">Caixinhas em ${ymLong(m)}</span><span class="row" style="gap:6px"><span class="num"><b>${money(tot)}</b> <span class="faint">/ ${money(lim)}</span></span><button class="info-btn" data-act="infoSemana" aria-label="Resumo do mês">i</button></span></div>
    ${barHtml(lim ? tot / lim : 0)}
    <div class="tiny row between" style="margin-top:6px"><span class="${sobra < 0 ? 'danger-t' : 'pos'}">${sobra < 0 ? 'Estourou ' + money(-sobra) : 'Sobra ' + money(sobra) + porDia(sobra)}</span><span class="faint">${m === cur ? `faltam ${restam} ${restam === 1 ? 'dia' : 'dias'}` : m < cur ? 'mês encerrado' : 'mês futuro'}</span></div></div>`;
  const lista = `<div class="card"><h2>Por caixinha <span class="tiny muted">mais usadas primeiro</span></h2>
    ${rows.map(r => `<div class="catrow"><div class="row"><span class="grow ellipsis">${esc(r.sub)}</span><span class="num small"><b class="${r.eco < 0 ? 'danger-t' : ''}">${money(r.total)}</b> <span class="faint">/ ${money(r.limMes)}</span></span><button class="info-btn" data-act="infoCaixa" data-k="${idx.get(r)}" aria-label="Detalhes de ${esc(r.sub)}">i</button></div>${barHtml(r.uso)}
      ${r.eco < 0 ? `<div class="tiny danger-t">estourou ${money(-r.eco)}</div>` : ''}</div>`).join('')}</div>`;
  // tetos por categoria (mês de pagamento), se definidos em Cadastros
  const s = summary(m), tetos = DB.config.categorias.filter(c => c.teto > 0);
  const catCard = tetos.length ? `<div class="card"><h2>Tetos por categoria <span class="tiny muted">mês de pagamento</span></h2>${tetos.map(c => { const v = s.byCat[c.nome] || 0; return `<div class="catrow"><div class="row"><span class="grow ellipsis">${catEmoji(c.nome)} ${esc(c.nome)}</span><span class="num small"><b class="${v > c.teto ? 'danger-t' : ''}">${money(v)}</b> <span class="faint">/ ${money(c.teto)}</span></span></div>${barHtml(v / c.teto)}</div>`; }).join('')}</div>`
    : `<p class="tiny muted" style="margin:0 4px">Dica: defina tetos mensais por categoria em <a class="link" href="#/cadastros">Cadastros</a> para controlá-los aqui também.</p>`;
  return `<div class="grid c2 ctrl-mes"><div class="stack">${resumo}${catCard}</div>${lista}</div>`;
}

/* ---- Contas ---- */
VIEWS.contas = () => {
  const m = state.mes, cs = contasDoMes(m), pagas = cs.filter(c => c.pago);
  return `<div class="card"><h2>Checklist de ${ymLong(m)} <span class="small muted">${pagas.length} de ${cs.length} pagas · ${money(sum(pagas, c => c.v))} de ${money(sum(cs, c => c.v))}</span></h2>
    ${barHtml(cs.length ? pagas.length / cs.length : 0)}
    <div class="list" style="margin-top:8px">${cs.map(x => `<label class="li" style="cursor:pointer">
      <input type="checkbox" class="check" style="width:22px;height:22px;accent-color:var(--brand)" data-act="pagar" data-id="${x.c.id}" ${x.pago ? 'checked' : ''}>
      <div class="grow"><div class="t">${esc(x.c.nome)}</div><div class="tiny faint">${x.venc ? 'vence ' + dShort(x.venc) : 'sem vencimento'}${x.c.sub ? ' · ' + esc(x.c.sub) : x.c.forma ? ' · fatura ' + esc(x.c.forma) : ''}${x.est ? ' · valor estimado' : ''}${x.ck?.pagoEm ? ' · pago em ' + dShort(x.ck.pagoEm) : ''}</div></div>
      <span class="tag ${x.cls}">${x.st}</span><b class="num">${money(x.v)}</b></label>`).join('') || '<div class="empty">Cadastre contas em Cadastros.</div>'}</div>
    <p class="tiny muted">O valor vem dos lançamentos do mês na subcategoria (ou forma de pagamento) vinculada; se ainda não foi lançado, usa o último fixo ou o valor padrão.</p></div>`;
};

/* ---- Parcelados ---- */
VIEWS.parcelados = () => {
  const cur = curYM(), gs = parcelGroups().filter(g => g.tipo === 'Despesa');
  const ativos = gs.filter(g => g.abertas.length), R = DB.config.regras;
  const meses = Array.from({ length: 8 }, (_, i) => addM(cur, i + 1));
  const porMes = meses.map(mm => sum(ativos, g => sum(g.abertas.filter(p => p.mesPgto === mm), p => p.valor)));
  const sel = ativos.filter(g => state.sel.has(g.grupo));
  const porMesSel = meses.map(mm => sum(sel, g => sum(g.abertas.filter(p => p.mesPgto === mm), p => p.valor)));
  return `<div class="stack">
    <div class="grid kpis">
      ${kpi('Parcelamentos ativos', `<span class="${ativos.length > R.maxParcelamentos ? 'warn-t' : ''}">${ativos.length}</span>`, `regra: até ${R.maxParcelamentos}`)}
      ${kpi('Saldo a pagar', money(sum(ativos, g => g.restante)), 'após o mês atual')}
      ${kpi(`Parcelas em ${ymShort(addM(cur, 1))}`, money(porMes[0]), `de ${money(summary(addM(cur, 1)).rec)} de receita`)}
    </div>
    <div class="card"><h2>Compromisso futuro com parcelas</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th></th>${meses.map(mm => `<th class="n">${ymShort(mm)}</th>`).join('')}</tr></thead><tbody>
      <tr><td>Hoje</td>${porMes.map(v => `<td class="n">${money(v)}</td>`).join('')}</tr>
      ${sel.length ? `<tr><td>Se antecipar selecionados</td>${porMes.map((v, i) => `<td class="n pos">${money(v - porMesSel[i])}</td>`).join('')}</tr>` : ''}
    </tbody></table></div>
    ${sel.length ? `<div class="row" style="margin-top:10px;flex-wrap:wrap"><span class="small">${sel.length} selecionado(s) · saldo ${money(sum(sel, g => g.restante))}</span><span class="grow"></span><button class="btn primary sm" data-act="antecipar">Registrar antecipação…</button></div>` : '<p class="tiny muted">Selecione parcelamentos abaixo para simular uma antecipação.</p>'}</div>
    <div class="card"><h2>Compras parceladas</h2><div class="list">
      ${gs.map(g => `<div class="li"><input type="checkbox" style="width:20px;height:20px;accent-color:var(--brand)" data-act="selParc" data-g="${g.grupo}" ${state.sel.has(g.grupo) ? 'checked' : ''} ${g.abertas.length ? '' : 'disabled'}>
        <div class="grow click" data-act="editar" data-id="${g.ps[0].id}"><div class="t ellipsis">${esc(g.desc)}</div>
        <div class="tiny faint">${esc(g.sub)} · ${esc(g.forma)} · compra ${dShort(g.data)}/${(g.data || '').slice(2, 4)} · ${g.de}x ${money(g.valorParcela)} · termina ${ymShort(g.fim)}${g.antecipadas ? ` · ${g.antecipadas} antecipada(s)` : ''}</div>
        ${barHtml((g.de - g.abertas.length) / g.de)}</div>
        <div class="right"><div class="num"><b>${money(g.restante)}</b></div><div class="tiny faint">${g.abertas.length ? `faltam ${g.abertas.length}` : 'quitado'}</div></div></div>`).join('') || '<div class="empty">Nenhuma compra parcelada.</div>'}
    </div></div></div>`;
};

/* ---- Indicadores ---- */
VIEWS.indicadores = () => {
  const m = state.mes, ins = insights(m), sug = sugestoes(m);
  const subs = {};
  const ult = Array.from({ length: 6 }, (_, i) => addM(m, i - 5));
  for (const mm of ult) for (const [k, v] of Object.entries(summary(mm).bySub)) (subs[k] ||= Array(6).fill(0))[ult.indexOf(mm)] = v;
  const rank = Object.entries(subs).map(([k, vs]) => ({ k, vs, avg: sum(vs) / 6, last: vs[5] })).sort((a, b) => b.avg - a.avg).slice(0, 15);
  return `<div class="grid c2">
    <div class="stack"><div class="card"><h2>Alertas de ${ymLong(m)}</h2>${ins.map(alertHtml).join('') || '<div class="alert ok"><span class="ai">✓</span><div>Nenhum alerta.</div></div>'}</div>
    <div class="card"><h2>Ajustes possíveis</h2>${sug.map(alertHtml).join('') || '<div class="muted small">Sem sugestões no momento.</div>'}</div></div>
    <div class="card"><h2>Onde vai o dinheiro (6 meses)</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Subcategoria</th><th>Tendência</th><th class="n">Média/mês</th><th class="n">${ymShort(m)}</th></tr></thead><tbody>
      ${rank.map(r => `<tr class="click" data-act="celula" data-sub="${esc(r.k)}"><td>${esc(r.k)}<div class="tiny faint">${esc(subInfo(r.k).cat)}</div></td><td>${spark(r.vs)}</td><td class="n">${money(r.avg)}</td><td class="n ${r.last > r.avg * 1.25 && r.last - r.avg > 100 ? 'warn-t' : ''}">${money(r.last)}</td></tr>`).join('')}
    </tbody></table></div></div></div>`;
};

/* ---- Investimentos ---- */
VIEWS.investimentos = () => {
  const inst = DB.config.instituicoes, movs = DB.movimentos.filter(x => !x.deleted).sort((a, b) => b.data.localeCompare(a.data));
  return `<div class="grid c2">
    <div class="card"><h2>Saldos por instituição <span class="num">${money(sum(inst, i => i.saldo))}</span></h2>
      <div class="list">${inst.map((i, k) => `<div class="li"><div class="grow t">${esc(i.nome)}</div><input class="input num right" style="max-width:160px" inputmode="decimal" value="${String(i.saldo || 0).replace('.', ',')}" data-act="saldoInst" data-k="${k}"></div>`).join('')}</div>
      <p class="tiny muted">Edite o saldo e saia do campo para salvar. Instituições são cadastradas em Cadastros.</p></div>
    <div class="card"><h2>Aportes e saques <button class="btn sm" data-act="novoMov">+ Movimento</button></h2>
      <div class="list">${movs.map(x => `<div class="li"><div class="grow"><div class="t">${esc(x.tipo)} · ${esc(x.inst || '')}</div><div class="tiny faint">${dShort(x.data)}/${x.data.slice(2, 4)} ${esc(x.motivo || '')}</div></div><b class="num ${x.tipo === 'Saque' ? 'neg' : 'pos'}">${money(x.valor)}</b><button class="icon-btn" data-act="delMov" data-id="${x.id}" aria-label="Excluir">×</button></div>`).join('') || '<div class="empty small">Nenhum movimento. Aportes entram no saldo do mês como "aportes líquidos".</div>'}</div></div></div>`;
};

/* ---- Cadastros ---- */
VIEWS.cadastros = () => {
  const C = DB.config, cats = C.categorias.map(c => c.nome);
  const subsOpts = sel => `<option value=""></option>` + C.subcategorias.map(s => `<option ${s.nome === sel ? 'selected' : ''}>${esc(s.nome)}</option>`).join('');
  const formOpts = sel => `<option value=""></option>` + C.formas.map(s => `<option ${s.nome === sel ? 'selected' : ''}>${esc(s.nome)}</option>`).join('');
  const del = t => `<td><button class="icon-btn" data-act="delRow" aria-label="Remover">×</button></td>`;
  return `<form id="fCad" class="stack" onsubmit="return false">
  <div class="row"><p class="small muted grow" style="margin:0">Renomear uma subcategoria ou categoria atualiza os lançamentos automaticamente.</p><button class="btn primary" data-act="salvarCad">Salvar cadastros</button></div>
  <div class="grid c2">
  <details class="card" open><summary>Categorias e tetos mensais</summary><div class="tbl-wrap"><table class="tbl" data-t="categorias"><thead><tr><th>Categoria</th><th>Teto mensal (R$)</th><th></th></tr></thead><tbody>
    ${C.categorias.map(c => `<tr data-orig="${esc(c.nome)}"><td><input name="nome" value="${esc(c.nome)}"></td><td><input name="teto" inputmode="decimal" value="${c.teto ? String(c.teto).replace('.', ',') : ''}" placeholder="sem teto"></td>${del()}</tr>`).join('')}
  </tbody></table></div><button class="btn sm" data-act="addRow" data-t="categorias">+ categoria</button></details>

  <details class="card" open><summary>Caixinhas semanais (limite por semana)</summary><div class="tbl-wrap"><table class="tbl" data-t="limites"><thead><tr><th>Subcategoria</th><th>Limite semanal (R$)</th><th></th></tr></thead><tbody>
    ${C.limitesSemanais.map(l => `<tr><td><select name="sub">${subsOpts(l.sub)}</select></td><td><input name="valor" inputmode="decimal" value="${String(l.valor || 0).replace('.', ',')}"></td>${del()}</tr>`).join('')}
  </tbody></table></div><button class="btn sm" data-act="addRow" data-t="limites">+ caixinha</button></details>

  <details class="card"><summary>Subcategorias (${C.subcategorias.length})</summary><div class="tbl-wrap"><table class="tbl" data-t="subcategorias"><thead><tr><th>Subcategoria</th><th>Categoria</th><th>Tipo</th><th></th></tr></thead><tbody>
    ${C.subcategorias.map(s => `<tr data-orig="${esc(s.nome)}"><td><input name="nome" value="${esc(s.nome)}"></td><td><select name="cat">${cats.map(c => `<option ${c === s.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></td><td><select name="tipo"><option ${s.tipo === 'Despesa' ? 'selected' : ''}>Despesa</option><option ${s.tipo === 'Receita' ? 'selected' : ''}>Receita</option></select></td>${del()}</tr>`).join('')}
  </tbody></table></div><button class="btn sm" data-act="addRow" data-t="subcategorias">+ subcategoria</button></details>

  <details class="card"><summary>Formas de pagamento e fechamento do cartão</summary><div class="tbl-wrap"><table class="tbl" data-t="formas"><thead><tr><th>Forma</th><th>É cartão de crédito?</th><th>Dia de fechamento</th><th></th></tr></thead><tbody>
    ${C.formas.map(f => `<tr><td><input name="nome" value="${esc(f.nome)}"></td><td><select name="cartao"><option value="">Não</option><option value="1" ${f.cartao ? 'selected' : ''}>Sim</option></select></td><td><input name="fechamento" inputmode="numeric" value="${f.fechamento || ''}"></td>${del()}</tr>`).join('')}
  </tbody></table></div><p class="tiny muted">Cartão: compra até o dia de fechamento cai na fatura do mês seguinte; depois, na do outro mês.</p><button class="btn sm" data-act="addRow" data-t="formas">+ forma</button></details>

  <details class="card"><summary>Contas a pagar (checklist)</summary><div class="tbl-wrap"><table class="tbl" data-t="contas"><thead><tr><th>Conta</th><th>Dia venc.</th><th>Subcategoria vinculada</th><th>ou fatura da forma</th><th>Valor padrão</th><th></th></tr></thead><tbody>
    ${C.contas.map(c => `<tr data-id="${c.id}"><td><input name="nome" value="${esc(c.nome)}"></td><td><input name="dia" inputmode="numeric" value="${c.dia || ''}" style="min-width:50px"></td><td><select name="sub">${subsOpts(c.sub)}</select></td><td><select name="forma">${formOpts(c.forma)}</select></td><td><input name="valorPadrao" inputmode="decimal" value="${c.valorPadrao ? String(c.valorPadrao).replace('.', ',') : ''}"></td>${del()}</tr>`).join('')}
  </tbody></table></div><button class="btn sm" data-act="addRow" data-t="contas">+ conta</button></details>

  <details class="card"><summary>Instituições (investimentos)</summary><div class="tbl-wrap"><table class="tbl" data-t="instituicoes"><thead><tr><th>Instituição</th><th>Saldo</th><th></th></tr></thead><tbody>
    ${C.instituicoes.map(i => `<tr><td><input name="nome" value="${esc(i.nome)}"></td><td><input name="saldo" inputmode="decimal" value="${String(i.saldo || 0).replace('.', ',')}"></td>${del()}</tr>`).join('')}
  </tbody></table></div><button class="btn sm" data-act="addRow" data-t="instituicoes">+ instituição</button></details>

  <details class="card" open><summary>Regras e metas</summary>
    <div class="two"><label class="field"><span>Máx. de parcelamentos ativos</span><input class="input" name="maxParcelamentos" inputmode="numeric" value="${C.regras.maxParcelamentos}"></label>
    <label class="field"><span>Só parcelar acima de (R$)</span><input class="input" name="minParcelar" inputmode="decimal" value="${C.regras.minParcelar}"></label>
    <label class="field"><span>Meta de poupança (% da receita)</span><input class="input" name="metaPoupanca" inputmode="decimal" value="${Math.round(C.regras.metaPoupanca * 100)}"></label>
    <label class="field"><span>Alertar categoria acima da média em (%)</span><input class="input" name="alertaAcimaMedia" inputmode="decimal" value="${Math.round(C.regras.alertaAcimaMedia * 100)}"></label></div>
    ${C.notas?.length ? `<div class="small muted">${C.notas.map(n => `<p>📝 ${esc(n)}</p>`).join('')}</div>` : ''}
  </details>
  </div></form>`;
};
const ROW_TPL = {
  categorias: () => `<tr><td><input name="nome"></td><td><input name="teto" inputmode="decimal" placeholder="sem teto"></td><td><button class="icon-btn" data-act="delRow">×</button></td></tr>`,
  limites: () => `<tr><td><select name="sub"><option></option>${DB.config.subcategorias.filter(s => s.tipo === 'Despesa').map(s => `<option>${esc(s.nome)}</option>`).join('')}</select></td><td><input name="valor" inputmode="decimal"></td><td><button class="icon-btn" data-act="delRow">×</button></td></tr>`,
  subcategorias: () => `<tr><td><input name="nome"></td><td><select name="cat">${DB.config.categorias.map(c => `<option>${esc(c.nome)}</option>`).join('')}</select></td><td><select name="tipo"><option>Despesa</option><option>Receita</option></select></td><td><button class="icon-btn" data-act="delRow">×</button></td></tr>`,
  formas: () => `<tr><td><input name="nome"></td><td><select name="cartao"><option value="">Não</option><option value="1">Sim</option></select></td><td><input name="fechamento" inputmode="numeric"></td><td><button class="icon-btn" data-act="delRow">×</button></td></tr>`,
  contas: () => `<tr data-id="${uid()}"><td><input name="nome"></td><td><input name="dia" inputmode="numeric"></td><td><select name="sub"><option></option>${DB.config.subcategorias.map(s => `<option>${esc(s.nome)}</option>`).join('')}</select></td><td><select name="forma"><option></option>${DB.config.formas.map(s => `<option>${esc(s.nome)}</option>`).join('')}</select></td><td><input name="valorPadrao" inputmode="decimal"></td><td><button class="icon-btn" data-act="delRow">×</button></td></tr>`,
  instituicoes: () => `<tr><td><input name="nome"></td><td><input name="saldo" inputmode="decimal"></td><td><button class="icon-btn" data-act="delRow">×</button></td></tr>`,
};
function salvarCadastros() {
  const f = $('#fCad'), C = DB.config;
  const rows = t => $$(`table[data-t="${t}"] tbody tr`, f).map(tr => { const o = { _orig: tr.dataset.orig, _id: tr.dataset.id }; $$('input,select', tr).forEach(i => o[i.name] = i.value.trim()); return o; });
  const renSub = {}, renCat = {};
  const categorias = rows('categorias').filter(r => r.nome).map(r => { if (r._orig && r._orig !== r.nome) renCat[r._orig] = r.nome; return { nome: r.nome, teto: parseNum(r.teto) || null }; });
  const subcategorias = rows('subcategorias').filter(r => r.nome).map(r => { if (r._orig && r._orig !== r.nome) renSub[r._orig] = r.nome; return { nome: r.nome, cat: renCat[r.cat] || r.cat, tipo: r.tipo }; });
  const nomesSub = subcategorias.map(s => s.nome);
  if (new Set(nomesSub).size !== nomesSub.length) { toast('Há subcategorias com nome repetido.'); return; }
  C.categorias = categorias; C.subcategorias = subcategorias;
  C.limitesSemanais = rows('limites').filter(r => r.sub).map(r => ({ sub: renSub[r.sub] || r.sub, valor: parseNum(r.valor) }));
  C.formas = rows('formas').filter(r => r.nome).map(r => ({ nome: r.nome, cartao: !!r.cartao, fechamento: r.cartao ? (parseInt(r.fechamento) || 31) : null }));
  C.contas = rows('contas').filter(r => r.nome).map(r => ({ id: r._id || uid(), nome: r.nome, dia: parseInt(r.dia) || null, sub: renSub[r.sub] || r.sub || null, forma: r.forma || null, valorPadrao: parseNum(r.valorPadrao) || null }));
  C.instituicoes = rows('instituicoes').filter(r => r.nome).map(r => ({ nome: r.nome, saldo: parseNum(r.saldo) }));
  const g = n => $(`[name="${n}"]`, f).value;
  C.regras = { maxParcelamentos: parseInt(g('maxParcelamentos')) || 3, minParcelar: parseNum(g('minParcelar')), metaPoupanca: parseNum(g('metaPoupanca')) / 100, alertaAcimaMedia: parseNum(g('alertaAcimaMedia')) / 100 };
  const ren = DB.lancamentos.filter(l => renSub[l.sub]);
  if (ren.length) { for (const l of ren) l.sub = renSub[l.sub]; upsertMany('lancamentos', ren); }
  saveConfig(); toast('Cadastros salvos' + (ren.length ? ` · ${ren.length} lançamentos atualizados` : '')); render();
}

/* ---- Ajustes / Drive ---- */
const dtBR = ts => new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
VIEWS.ajustes = () => { const pend = pendentesEnvio(); return `<div class="grid c2">
  <div class="card"><h2>Trocar dados com o outro aparelho</h2>
    <p class="small muted" style="margin-top:0">Sem nuvem: envie um arquivo deste aparelho para o outro (WhatsApp para você mesmo, e-mail, cabo…) e lá toque em <b>Receber</b>. Os lançamentos dos dois lados são juntados — nada é apagado.</p>
    <div class="stack" style="gap:10px">
      <button class="btn primary block" data-act="enviarAparelho">📤 Enviar para o outro aparelho${pend ? ` · ${pend} novas` : ''}</button>
      <label class="btn block" style="justify-content:center;cursor:pointer">📥 Receber do outro aparelho<input type="file" id="fReceber" accept=".json,.txt,application/json,text/plain" hidden></label>
    </div>
    <p class="small muted">${SET.lastExport ? 'Último envio: ' + dtBR(SET.lastExport) : 'Ainda não enviado.'} · ${SET.lastImport ? 'Último recebimento: ' + dtBR(SET.lastImport) : 'Nada recebido ainda.'}
    ${pend ? `<br><span class="warn-t">${pend} ${pend === 1 ? 'alteração feita aqui ainda não foi enviada' : 'alterações feitas aqui ainda não foram enviadas'}.</span>` : ''}</p></div>
  <div class="card"><h2>Sincronização automática (opcional)</h2>
    <p class="small muted" style="margin-top:0">Só se quiser que os aparelhos se atualizem sozinhos, via um Apps Script seu no Google Drive (passo a passo no LEIAME). Sem isso, use a troca manual acima.</p>
    <label class="field"><span>URL do Web App (Apps Script)</span><input class="input" id="sUrl" value="${esc(SET.url || '')}" placeholder="https://script.google.com/macros/s/…/exec"></label>
    <label class="field"><span>Chave secreta</span><input class="input" id="sKey" type="password" value="${esc(SET.key || '')}" placeholder="a mesma definida no script"></label>
    <div class="row"><button class="btn primary" data-act="salvarSync">Salvar e sincronizar</button>${SET.url ? '<button class="btn" data-act="desligarSync">Desconectar</button>' : ''}</div>
    <p class="small muted">${SET.lastSync ? 'Última sincronização: ' + new Date(SET.lastSync).toLocaleString('pt-BR') : 'Nunca sincronizado.'} ${SET.syncErr ? `<br><span class="danger-t">Erro: ${esc(SET.syncErr)}</span>` : ''} ${SET.dirty ? '<br><span class="warn-t">Há alterações ainda não enviadas.</span>' : ''}</p></div>
  <div class="card"><h2>Importar / exportar</h2>
    <label class="field"><span>Importar carga inicial ou backup (.json)</span><input class="input" type="file" accept=".json,application/json" id="fImport"></label>
    <div class="row" style="flex-wrap:wrap"><button class="btn" data-act="importar" data-modo="substituir">Substituir dados deste aparelho</button><button class="btn" data-act="importar" data-modo="mesclar">Mesclar</button></div>
    <hr style="border:0;border-top:1px solid var(--border);margin:16px 0">
    <div class="row" style="flex-wrap:wrap"><button class="btn" data-act="backup">Baixar backup (.json)</button><button class="btn" data-act="csv">Exportar lançamentos (CSV)</button></div>
    <p class="small muted">${LIVE.length} lançamentos · ${DB.config.subcategorias.length} subcategorias · ${(JSON.stringify(DB).length / 1024).toFixed(0)} KB</p></div>
  <div class="card"><h2>Mês ao abrir</h2>
    <label class="check"><input type="checkbox" data-act="abrirProx" ${SET.abrirProx !== false ? 'checked' : ''}> Início e Projeção abrem no mês seguinte</label>
    <p class="tiny muted">Compras no cartão de hoje são pagas na fatura do mês que vem; por isso o saldo que importa é o do mês seguinte. Controle, Extrato e Contas sempre abrem no mês atual. Toque no nome do mês, no topo, para voltar ao padrão.</p></div>
  <div class="card"><h2>Aparência</h2><div class="seg" style="max-width:320px">${['auto', 'light', 'dark'].map(t => `<button class="${(SET.theme || 'auto') === t ? 'on' : ''}" data-act="tema" data-t="${t}">${{ auto: 'Automático', light: 'Claro', dark: 'Escuro' }[t]}</button>`).join('')}</div></div>
  <div class="card"><h2>Zona de perigo</h2><button class="btn danger" data-act="limpar">Apagar dados deste aparelho</button><p class="tiny muted">Envie para o outro aparelho ou baixe um backup antes.</p></div>
</div>`; };

VIEWS.mais = () => `<div class="card"><div class="more-grid">${ROUTES.filter(r => !['inicio'].includes(r.id)).map(r => `<a href="#/${r.id}">${icon(r.i)}${r.t}</a>`).join('')}</div></div>
  <div style="margin-top:14px">${VIEWS.indicadores()}</div>`;

/* ---------------- formulário de lançamento ---------------- */
function usoSubs(tipo) {
  const c = {}; const lim = addM(curYM(), -4);
  for (const l of LIVE) if (l.tipo === tipo && (l.data || '') >= lim) c[l.sub] = (c[l.sub] || 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1]).map(x => x[0]);
}
function ultimoPorDesc() {
  const m = new Map();
  for (const l of LIVE.slice().sort((a, b) => (a.data || '').localeCompare(b.data || ''))) if (l.desc) m.set(l.desc.trim().toLowerCase(), l);
  return m;
}
function formLanc(l) {
  const ed = !!l, tipo = l?.tipo || 'Despesa';
  const g = ed && l.grupo ? LIVE.filter(x => x.grupo === l.grupo) : [];
  const descs = [...new Set(LIVE.map(x => x.desc).filter(Boolean))].slice(-400);
  openSheet(`${sheetHead(ed ? 'Editar lançamento' : 'Novo lançamento')}
  <form id="fLanc" autocomplete="off" data-id="${ed ? l.id : ''}">
    <div class="seg" style="margin-bottom:14px"><button type="button" class="${tipo === 'Despesa' ? 'on desp' : ''}" data-act="tipoL" data-t="Despesa">Despesa</button><button type="button" class="${tipo === 'Receita' ? 'on rec' : ''}" data-act="tipoL" data-t="Receita">Receita</button></div>
    <input type="hidden" name="tipo" value="${tipo}">
    <input class="money-in" name="valor" inputmode="decimal" placeholder="R$ 0,00" value="${ed ? String(l.valor).replace('.', ',') : ''}" required>
    <div class="hint center" id="hValor" style="margin-top:4px">${ed && l.de > 1 ? `Parcela ${l.parcela} de ${l.de}` : ''}</div>
    <label class="field"><span>Descrição</span><input class="input" name="desc" list="dlDesc" value="${esc(l?.desc || '')}" placeholder="Ex.: Mercado, iFood, Salário…"></label>
    <datalist id="dlDesc">${descs.map(d => `<option value="${esc(d)}">`).join('')}</datalist>
    <div class="field"><span>Subcategoria</span><div class="chips" id="subChips"></div>
      <select class="input" name="sub" style="margin-top:6px"></select></div>
    <div class="field"><span>Forma de pagamento</span><div class="chips" id="formaChips">${DB.config.formas.map(f => `<button type="button" class="chip ${(l?.forma || 'Cartão') === f.nome ? 'on' : ''}" data-act="formaL" data-v="${esc(f.nome)}">${esc(f.nome)}</button>`).join('')}</div><input type="hidden" name="forma" value="${esc(l?.forma || (FORMAMAP.has('Cartão') ? 'Cartão' : DB.config.formas[0]?.nome || ''))}"></div>
    <div class="two"><label class="field"><span>Data da compra</span><input class="input" type="date" name="data" value="${l?.data || todayISO()}" required></label>
      <label class="field" ${ed ? 'hidden' : ''}><span>Parcelas</span><input class="input" name="parcelas" type="number" min="1" max="72" value="1"></label>
      ${ed ? `<label class="field"><span>Mês de pagamento</span><input class="input" type="month" name="mesPgto" value="${l.mesPgto}"></label>` : ''}</div>
    <div class="hint" id="hInfo"></div>
    <label class="check" style="margin-bottom:12px"><input type="checkbox" name="fixo" ${l?.fixo ? 'checked' : ''}> Repete todo mês (conta fixa, assinatura, salário)</label>
    <label class="field"><span>Observação</span><input class="input" name="obs" value="${esc(l?.obs || '')}"></label>
    ${g.length > 1 ? `<label class="check" style="margin-bottom:12px"><input type="checkbox" name="todas" checked> Aplicar descrição/subcategoria/forma às ${g.length} parcelas</label>` : ''}
    ${ed ? `<label class="check" style="margin-bottom:12px"><input type="checkbox" name="antecipado" ${l.antecipado ? 'checked' : ''}> Parcela antecipada (sai da projeção e dos totais)</label>` : ''}
    <div class="sheet-actions">${ed ? '<button type="button" class="btn danger" data-act="excluirL">Excluir</button>' : '<button type="button" class="btn" data-act="salvarL" data-mais="1">Salvar e +1</button>'}<button type="submit" class="btn primary">Salvar</button></div>
  </form>`);
  const f = $('#fLanc');
  fillSubs(f, tipo, l?.sub);
  f.addEventListener('submit', e => { e.preventDefault(); salvarLanc(false); });
  f.addEventListener('input', e => { if (e.target.name === 'desc' && !ed) autoFill(f); infoLanc(f); });
  f.addEventListener('change', () => infoLanc(f));
  infoLanc(f);
  if (!ed) setTimeout(() => f.valor.focus(), 60);
}
function fillSubs(f, tipo, sel) {
  const subs = DB.config.subcategorias.filter(s => s.tipo === tipo);
  const top = usoSubs(tipo).filter(s => subs.some(x => x.nome === s)).slice(0, 8);
  if (!top.length) top.push(...subs.slice(0, 8).map(s => s.nome));
  sel = sel || top[0] || subs[0]?.nome || '';
  if (sel && !top.includes(sel)) top.unshift(sel);
  $('#subChips', f).innerHTML = top.map(s => `<button type="button" class="chip ${s === sel ? 'on' : ''}" data-act="subL" data-v="${esc(s)}">${esc(s)}</button>`).join('');
  const byCat = groupBy(subs, s => s.cat);
  f.sub.innerHTML = Object.entries(byCat).map(([c, ss]) => `<optgroup label="${esc(c)}">${ss.map(s => `<option ${s.nome === sel ? 'selected' : ''}>${esc(s.nome)}</option>`).join('')}</optgroup>`).join('');
  f.sub.value = sel;
}
function setChip(f, wrap, name, v) { f[name].value = v; $$(`#${wrap} .chip`, f).forEach(c => c.classList.toggle('on', c.dataset.v === v)); }
function autoFill(f) {
  const l = ultimoPorDesc().get(f.desc.value.trim().toLowerCase());
  if (!l) return;
  if (l.tipo !== f.tipo.value) { f.tipo.value = l.tipo; $$('[data-act="tipoL"]', f).forEach(b => b.className = b.dataset.t === l.tipo ? 'on ' + (l.tipo === 'Despesa' ? 'desp' : 'rec') : ''); }
  fillSubs(f, l.tipo, l.sub);
  if (FORMAMAP.has(l.forma)) setChip(f, 'formaChips', 'forma', l.forma);
  if (!f.valor.value) f.valor.value = String(l.valor).replace('.', ',');
}
function infoLanc(f) {
  const v = parseNum(f.valor.value), n = Math.max(1, parseInt(f.parcelas?.value) || 1), data = f.data.value, R = DB.config.regras;
  const info = [];
  if (data && !f.mesPgto) info.push(`Entra no caixa de <b>${ymLong(calcMesPgto(data, f.forma.value, 1))}</b>${isCartao(f.forma.value) ? ' (fatura)' : ''}.`);
  if (n > 1 && v) info.push(`${n}x de <b>${money(v / n)}</b> (valor informado = total), até ${ymShort(calcMesPgto(data, f.forma.value, n))}.`);
  let warn = '';
  if (n > 1 && f.tipo.value === 'Despesa') {
    if (v < R.minParcelar) warn += `⚠ Sua regra: só parcelar valores acima de ${money(R.minParcelar)}. `;
    const at = parcelGroups().filter(g => g.tipo === 'Despesa' && g.abertas.length).length;
    if (at >= R.maxParcelamentos) warn += `⚠ Já existem ${at} parcelamentos ativos (máx. ${R.maxParcelamentos}).`;
  }
  if (f.tipo.value === 'Despesa' && v > 0) {
    const sub = f.sub.value, lim = DB.config.limitesSemanais.find(x => x.sub === sub);
    if (lim && data) { const wd = weeklyData(data.slice(0, 7)); const r = wd.rows.find(x => x.sub === sub); const wi = wd.weeks.findIndex(w => data >= w.de && data <= w.ate); if (r && wi >= 0 && !f.closest('form').dataset.id) { const s = r.sem[wi]; const nv = s.v + v; info.push(`Caixinha ${esc(sub)} na semana: ${money(nv)} de ${money(s.lim)}${nv > s.lim ? ' — <span class="danger-t">vai estourar</span>' : ''}.`); } }
  }
  $('#hInfo', f).innerHTML = info.join('<br>') + (warn ? `<div class="warn-t" style="margin-top:4px">${warn}</div>` : '');
}
function salvarLanc(mais) {
  const f = $('#fLanc'); const id = f.dataset.id;
  const v = r2(parseNum(f.valor.value));
  if (!v) { toast('Informe o valor.'); f.valor.focus(); return; }
  if (!f.sub.value) { toast('Escolha a subcategoria.'); return; }
  const base = { data: f.data.value, desc: f.desc.value.trim() || f.sub.value, sub: f.sub.value, forma: f.forma.value, tipo: f.tipo.value, obs: f.obs.value.trim() || null, fixo: f.fixo.checked };
  if (id) {
    const old = DB.lancamentos.find(x => x.id === id); if (!old) return;
    const upd = { ...old, ...base, valor: v, antecipado: f.antecipado?.checked || false };
    if (f.mesPgto.value && f.mesPgto.value !== old.mesPgto) upd.mesPgto = f.mesPgto.value;
    else if (old.data !== base.data || old.forma !== base.forma) upd.mesPgto = calcMesPgto(base.data, base.forma, old.parcela || 1);
    if (!upd.fixo) delete upd.fixoAte;
    const batch = [upd];
    if (f.todas?.checked && old.grupo) for (const p of DB.lancamentos.filter(x => x.grupo === old.grupo && x.id !== id && !x.deleted)) batch.push({ ...p, desc: base.desc, sub: base.sub, forma: base.forma, tipo: base.tipo });
    upsertMany('lancamentos', batch);
    toast('Lançamento atualizado');
  } else {
    const n = Math.max(1, parseInt(f.parcelas.value) || 1);
    if (n === 1) upsert('lancamentos', { id: uid(), ...base, valor: v, parcela: null, de: null, grupo: null, mesPgto: calcMesPgto(base.data, base.forma, 1), antecipado: false });
    else {
      const grupo = uid(), pv = r2(v / n), arr = [];
      for (let i = 1; i <= n; i++) arr.push({ id: uid(), ...base, fixo: false, valor: i === n ? r2(v - pv * (n - 1)) : pv, parcela: i, de: n, grupo, mesPgto: calcMesPgto(base.data, base.forma, i), antecipado: false });
      upsertMany('lancamentos', arr);
    }
    const mp = calcMesPgto(base.data, base.forma, 1);
    toast(`${base.tipo} de ${money(v)} lançada ✓` + (mp !== base.data.slice(0, 7) ? ` · entra em ${ymShort(mp)}${n > 1 ? ' a ' + ymShort(calcMesPgto(base.data, base.forma, n)) : ''} (fatura do cartão)` : ''));
  }
  if (mais) { const keep = { data: f.data.value, forma: f.forma.value, tipo: f.tipo.value }; formLanc(null); const nf = $('#fLanc'); nf.data.value = keep.data; setChip(nf, 'formaChips', 'forma', keep.forma); }
  else closeSheet();
  render();
}
function excluirLanc() {
  const f = $('#fLanc'), l = DB.lancamentos.find(x => x.id === f.dataset.id); if (!l) return;
  const g = l.grupo ? DB.lancamentos.filter(x => x.grupo === l.grupo && !x.deleted) : [];
  openSheet(`${sheetHead('Excluir lançamento')}<p><b>${esc(l.desc)}</b> · ${money(l.valor)}${l.de > 1 ? ` · parcela ${l.parcela}/${l.de}` : ''}</p>
    <div class="stack" style="gap:8px">
      <button class="btn danger block" data-act="confExcl" data-modo="um" data-id="${l.id}">Excluir só este</button>
      ${g.length > 1 ? `<button class="btn danger block" data-act="confExcl" data-modo="futuras" data-id="${l.id}">Excluir esta e as próximas parcelas</button><button class="btn danger block" data-act="confExcl" data-modo="todas" data-id="${l.id}">Excluir todas as ${g.length} parcelas</button>` : ''}
      ${l.fixo ? `<button class="btn block" data-act="encerrarFixo" data-id="${l.id}">Manter e só parar de repetir a partir de ${ymShort(addM(curYM(), 1))}</button>` : ''}
      <button class="btn block" data-act="fechar">Cancelar</button></div>`);
}

/* antecipação */
function formAntecipar() {
  const gs = parcelGroups().filter(g => state.sel.has(g.grupo) && g.abertas.length);
  openSheet(`${sheetHead('Registrar antecipação')}
    <p class="small muted" style="margin-top:0">As parcelas futuras (após ${ymShort(curYM())}) serão marcadas como antecipadas e sairão da projeção. Um novo lançamento com o valor pago é criado para cada compra.</p>
    <form id="fAnt"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Compra</th><th class="n">Parcelas</th><th class="n">Saldo</th><th>Valor pago</th></tr></thead><tbody>
    ${gs.map(g => `<tr><td class="ellipsis" style="max-width:200px">${esc(g.desc)}</td><td class="n">${g.abertas.length}</td><td class="n">${money(g.restante)}</td><td><input name="v_${g.grupo}" inputmode="decimal" value="${String(r2(g.restante)).replace('.', ',')}"></td></tr>`).join('')}
    </tbody></table></div>
    <div class="two" style="margin-top:12px"><label class="field"><span>Data do pagamento</span><input class="input" type="date" name="data" value="${todayISO()}"></label>
    <label class="field"><span>Forma</span><select class="input" name="forma">${DB.config.formas.map(f => `<option ${f.nome === 'Cartão' ? 'selected' : ''}>${esc(f.nome)}</option>`).join('')}</select></label></div>
    <div class="sheet-actions"><button type="button" class="btn" data-act="fechar">Cancelar</button><button type="button" class="btn primary" data-act="confAnt">Confirmar</button></div></form>`, true);
}
function confirmarAntecipacao() {
  const f = $('#fAnt'), gs = parcelGroups().filter(g => state.sel.has(g.grupo) && g.abertas.length);
  const batch = [], novos = []; let desc = 0;
  for (const g of gs) {
    const pago = r2(parseNum(f[`v_${g.grupo}`].value));
    desc += g.restante - pago;
    for (const p of g.abertas) batch.push({ ...p, antecipado: true });
    novos.push({ id: uid(), data: f.data.value, desc: `Antecipação: ${g.desc}`, sub: g.sub, forma: f.forma.value, tipo: 'Despesa', valor: pago, parcela: null, de: null, grupo: null, fixo: false, obs: `${g.abertas.length} parcelas antecipadas (saldo ${money(g.restante)})`, mesPgto: calcMesPgto(f.data.value, f.forma.value, 1), antecipado: false });
  }
  upsertMany('lancamentos', [...batch, ...novos]);
  state.sel.clear(); closeSheet(); render();
  toast(`Antecipação registrada · desconto de ${money(desc)}`);
}

/* ---------------- eventos ---------------- */
const ACTS = {
  novo: () => formLanc(null),
  fechar: () => closeSheet(),
  mes: t => { state.mes = addM(state.mes, +t.dataset.d); state.mesManual = true; state.semana = null; render(); },
  mesHoje: () => { state.mesManual = false; state.mes = mesPadrao(route()); state.semana = null; render(); },
  sync: () => { if (SET.url) return sync(true); if (pendentesEnvio()) return enviarAparelho(); location.hash = '#/ajustes'; },
  enviarAparelho: () => enviarAparelho(),
  editar: t => { const l = DB.lancamentos.find(x => x.id === t.dataset.id); if (l) formLanc(l); },
  tipoL: t => { const f = $('#fLanc'); f.tipo.value = t.dataset.t; $$('[data-act="tipoL"]', f).forEach(b => b.className = b === t ? 'on ' + (t.dataset.t === 'Despesa' ? 'desp' : 'rec') : ''); fillSubs(f, t.dataset.t); if (t.dataset.t === 'Receita' && FORMAMAP.has('Transferência')) setChip(f, 'formaChips', 'forma', 'Transferência'); infoLanc(f); },
  subL: t => { const f = $('#fLanc'); setChip(f, 'subChips', 'sub', t.dataset.v); infoLanc(f); },
  formaL: t => { const f = $('#fLanc'); setChip(f, 'formaChips', 'forma', t.dataset.v); infoLanc(f); },
  salvarL: t => salvarLanc(!!t.dataset.mais),
  excluirL: () => excluirLanc(),
  confExcl: t => {
    const l = DB.lancamentos.find(x => x.id === t.dataset.id); let ids = [l.id];
    if (t.dataset.modo === 'todas') ids = DB.lancamentos.filter(x => x.grupo === l.grupo).map(x => x.id);
    if (t.dataset.modo === 'futuras') ids = DB.lancamentos.filter(x => x.grupo === l.grupo && (x.parcela || 0) >= (l.parcela || 0)).map(x => x.id);
    removeMany('lancamentos', ids); closeSheet(); render(); toast(`${ids.length} lançamento(s) excluído(s)`);
  },
  encerrarFixo: t => { const l = DB.lancamentos.find(x => x.id === t.dataset.id); upsert('lancamentos', { ...l, fixoAte: curYM() }); closeSheet(); render(); toast('Recorrência encerrada'); },
  semana: t => { state.semana = +t.dataset.i; render(); },
  abrirProx: t => { SET.abrirProx = t.checked; saveSet(); toast(t.checked ? 'Início e Projeção vão abrir no mês seguinte' : 'Tudo abre no mês atual'); },
  ctrlModo: t => { state.ctrl = t.dataset.m; render(); },
  verFatura: t => { state.fatForma = t.dataset.forma; state.fatM = t.dataset.m || null; if (route() !== 'fatura') location.hash = '#/fatura'; else render(); },
  irMes: t => { state.mes = t.dataset.m; state.mesManual = true; render(); window.scrollTo(0, 0); },
  limparFiltros: () => { Object.assign(state.filtro, { tipo: '', cat: '', forma: '', fixo: '' }); render(); },
  infoCaixa: t => {
    const m = state.mes, wd = weeklyData(m), r = wd.rows[+t.dataset.k], cur = curYM();
    const linha = (l, v, c = '') => `<div class="row between sub-l"><span class="muted">${l}</span><span class="num ${c}"><b>${v}</b></span></div>`;
    openSheet(`${sheetHead(esc(r.sub) + ' · ' + ymLong(m))}
      ${linha('Gasto no mês', money(r.total))}${linha('Limite do mês', money(r.limMes))}
      ${linha(r.eco < 0 ? 'Estourou' : 'Sobra', money(Math.abs(r.eco)), r.eco < 0 ? 'neg' : 'pos')}
      ${linha('Usado', pct(r.uso))}${r.ritmo ? linha('No ritmo atual, fecha o mês em', money(r.ritmo), r.ritmo > r.limMes ? 'warn-t' : '') : ''}
      ${linha('Limite por semana', money(r.limSem))}
      <h3 style="margin:16px 0 6px;font-size:14px">Semana a semana</h3>
      ${r.sem.map((s, i) => `<div class="catrow"><div class="row"><span class="grow small">S${i + 1} · ${dShort(wd.weeks[i].de)}–${dShort(wd.weeks[i].ate)}${m === cur && i === wd.curW ? ' <span class="tag brand">atual</span>' : ''}</span><span class="num small"><b class="${s.over ? 'danger-t' : ''}">${money(s.v)}</b> <span class="faint">/ ${money(s.lim)}</span></span></div>${barHtml(s.lim ? s.v / s.lim : 0)}</div>`).join('')}
      <button class="btn block" style="margin-top:14px" data-act="celula" data-sub="${esc(r.sub)}" data-porcompra="1">Ver compras do mês</button>`);
  },
  infoSemana: () => {
    const m = state.mes, wd = weeklyData(m);
    const tot = sum(wd.rows, r => r.total), lim = sum(wd.rows, r => r.limMes);
    const piores = wd.rows.filter(r => r.eco < 0).sort((a, b) => a.eco - b.eco);
    openSheet(`${sheetHead('Caixinhas · ' + ymLong(m))}
      <div class="row between sub-l"><span class="muted">Gasto no mês</span><b class="num">${money(tot)}</b></div>
      <div class="row between sub-l"><span class="muted">Limite do mês</span><b class="num">${money(lim)}</b></div>
      <div class="row between sub-l"><span class="muted">${lim - tot < 0 ? 'Estourou' : 'Sobra'}</span><b class="num ${lim - tot < 0 ? 'neg' : 'pos'}">${money(Math.abs(lim - tot))}</b></div>
      <h3 style="margin:16px 0 6px;font-size:14px">Por semana</h3>
      ${wd.weeks.map((w, i) => { const v = sum(wd.rows, r => r.sem[i].v), l = sum(wd.rows, r => r.sem[i].lim); return `<div class="catrow"><div class="row"><span class="grow small">S${i + 1} · ${dShort(w.de)}–${dShort(w.ate)}</span><span class="num small"><b class="${v > l ? 'danger-t' : ''}">${money(v)}</b> <span class="faint">/ ${money(l)}</span></span></div>${barHtml(l ? v / l : 0)}</div>`; }).join('')}
      ${piores.length ? `<h3 style="margin:16px 0 6px;font-size:14px">Estouradas no mês</h3>${piores.map(r => `<div class="row between sub-l"><span>${esc(r.sub)}</span><span class="num neg">+${money(-r.eco)}</span></div>`).join('')}` : ''}
      <p class="tiny muted" style="margin-top:12px">Conta pela data da compra; parcelado entra inteiro na semana da compra. Semanas incompletas têm limite proporcional aos dias.</p>`);
  },
  projSub: t => { state.projSub = t.checked; render(); },
  celula: t => {
    const sub = t.dataset.sub, m = state.mes;
    const ls = t.dataset.porcompra ? LIVE.filter(l => l.sub === sub && (l.data || '').slice(0, 7) === m) : Array.from({ length: 10 }, (_, i) => addM(m, i - 3)).flatMap(mm => entriesFor(mm).filter(l => l.sub === sub));
    openSheet(`${sheetHead(esc(sub))}<div class="list">${ls.sort((a, b) => (b.mesPgto + b.data).localeCompare(a.mesPgto + a.data)).map(l => liLanc(l).replace('<div class="tiny faint">' + dShort(l.data), `<div class="tiny faint">${ymShort(l.mesPgto)} · ` + dShort(l.data))).join('') || '<div class="empty">Nada.</div>'}</div>`);
  },
  pagar: t => {
    const id = `${state.mes}|${t.dataset.id}`, old = DB.checks.find(x => x.id === id);
    const c = DB.config.contas.find(x => x.id === t.dataset.id), v = contaValor(c, state.mes).v;
    upsert('checks', { ...(old || {}), id, mes: state.mes, conta: t.dataset.id, pago: t.checked, pagoEm: t.checked ? todayISO() : null, valor: v, deleted: false });
    render();
  },
  selParc: t => { t.checked ? state.sel.add(t.dataset.g) : state.sel.delete(t.dataset.g); render(); },
  antecipar: () => formAntecipar(),
  confAnt: () => confirmarAntecipacao(),
  novoMov: () => openSheet(`${sheetHead('Novo movimento')}<form id="fMov">
    <div class="two"><label class="field"><span>Data</span><input class="input" type="date" name="data" value="${todayISO()}"></label>
    <label class="field"><span>Tipo</span><select class="input" name="tipo"><option>Aporte</option><option>Saque</option><option>Rendimento</option></select></label></div>
    <label class="field"><span>Instituição</span><select class="input" name="inst">${DB.config.instituicoes.map(i => `<option>${esc(i.nome)}</option>`).join('')}</select></label>
    <label class="field"><span>Valor</span><input class="input" name="valor" inputmode="decimal"></label>
    <label class="field"><span>Motivo</span><input class="input" name="motivo"></label>
    <label class="check" style="margin-bottom:12px"><input type="checkbox" name="atualiza" checked> Atualizar o saldo da instituição</label>
    <div class="sheet-actions"><button type="button" class="btn" data-act="fechar">Cancelar</button><button type="button" class="btn primary" data-act="salvarMov">Salvar</button></div></form>`),
  salvarMov: () => {
    const f = $('#fMov'), v = r2(parseNum(f.valor.value)); if (!v) return toast('Informe o valor.');
    const mv = { id: uid(), data: f.data.value, tipo: f.tipo.value, inst: f.inst.value, valor: v, motivo: f.motivo.value.trim() || null };
    if (f.atualiza.checked) { const i = DB.config.instituicoes.find(x => x.nome === mv.inst); if (i) { i.saldo = r2((i.saldo || 0) + (mv.tipo === 'Saque' ? -v : v)); DB.config.updatedAt = nowTS(); } }
    upsert('movimentos', mv); closeSheet(); render();
  },
  delMov: t => { if (confirm('Excluir este movimento?')) { removeMany('movimentos', [t.dataset.id]); render(); } },
  addRow: t => { $(`table[data-t="${t.dataset.t}"] tbody`).insertAdjacentHTML('beforeend', ROW_TPL[t.dataset.t]()); },
  delRow: t => t.closest('tr').remove(),
  salvarCad: () => salvarCadastros(),
  salvarSync: () => { SET.url = $('#sUrl').value.trim(); SET.key = $('#sKey').value.trim(); SET.syncErr = null; saveSet(); sync(true).then(render); },
  desligarSync: () => { if (confirm('Desconectar do Google Drive neste aparelho? Os dados locais permanecem.')) { delete SET.url; delete SET.key; delete SET.lastSync; saveSet(); render(); } },
  importar: async t => {
    const file = $('#fImport').files[0]; if (!file) return toast('Escolha o arquivo .json primeiro.');
    let data; try { data = JSON.parse(await file.text()); } catch { return toast('Arquivo inválido.'); }
    if (data.app !== 'financas') return toast('Este arquivo não é do app Finanças.');
    if (t.dataset.modo === 'substituir') {
      if (!confirm(`Substituir os dados deste aparelho por ${data.lancamentos.length} lançamentos do arquivo?`)) return;
      const ts = nowTS(); data.config.updatedAt = ts; for (const c of COLS) for (const x of data[c] || []) x.updatedAt = ts;
      DB = Object.assign(emptyDB(), data); DB.config = Object.assign(DEFAULT_CONFIG(), data.config);
    } else DB = mergeDB(DB, data).data;
    touched(); state.mes = curYM(); toast('Dados importados ✓'); location.hash = '#/inicio'; render();
  },
  backup: () => download(`financas-backup-${todayISO()}.json`, JSON.stringify(DB), 'application/json'),
  csv: () => {
    const h = ['Data da compra', 'Descrição', 'Subcategoria', 'Categoria', 'Tipo', 'Forma pgto', 'Valor', 'Parcela', 'de', 'Fixo', 'Mês pgto', 'Antecipado', 'Obs'];
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = LIVE.slice().sort((a, b) => (a.data || '').localeCompare(b.data || '')).map(l => [l.data, l.desc, l.sub, catOf(l), l.tipo, l.forma, String(l.valor).replace('.', ','), l.parcela || '', l.de || '', l.fixo ? 'S' : '', l.mesPgto, l.antecipado ? 'S' : '', l.obs || ''].map(q).join(';'));
    download(`lancamentos-${todayISO()}.csv`, '﻿' + [h.map(q).join(';'), ...rows].join('\r\n'), 'text/csv');
  },
  tema: t => { SET.theme = t.dataset.t; saveSet(); applyTheme(); render(); },
  limpar: () => { if (confirm('Apagar TODOS os dados deste aparelho? Isso não pode ser desfeito.')) { localStorage.removeItem(LS_DB); DB = emptyDB(); SET.dirty = false; SET.rev = 0; saveSet(); reindex(); render(); } },
};
function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
function applyTheme() { const t = SET.theme; if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }

function fecharDica() { $('#tipPop')?.remove(); }
function abrirDica(btn) {
  const aberto = $('#tipPop'); if (aberto && aberto._dono === btn) return fecharDica(); fecharDica();
  const d = document.createElement('div'); d.id = 'tipPop'; d.className = 'tip-pop'; d.innerHTML = btn.getAttribute('data-tip'); d._dono = btn;
  document.body.appendChild(d);
  const b = btn.getBoundingClientRect(), W = document.documentElement.clientWidth, w = d.offsetWidth;
  let left = Math.min(Math.max(8, b.left + b.width / 2 - w / 2), W - w - 8), top = b.bottom + 8;
  if (top + d.offsetHeight > innerHeight - 80) top = Math.max(8, b.top - d.offsetHeight - 8);
  d.style.left = left + 'px'; d.style.top = top + 'px';
}
document.addEventListener('click', e => {
  const tb = e.target.closest('[data-tip]');
  if (tb) { e.preventDefault(); e.stopPropagation(); return abrirDica(tb); }
  if (!e.target.closest('#tipPop')) fecharDica();
}, true);
window.addEventListener('scroll', fecharDica, { passive: true });
window.addEventListener('hashchange', fecharDica);
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  const a = t.dataset.act; if (!ACTS[a]) return;
  if (['pagar', 'selParc', 'projSub', 'abrirProx'].includes(a)) return; // tratados no change
  if (t.tagName === 'A') e.preventDefault();
  ACTS[a](t, e);
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.act && ['pagar', 'selParc', 'projSub', 'abrirProx'].includes(t.dataset.act)) return ACTS[t.dataset.act](t);
  if (t.id === 'fReceber') { const f = t.files[0]; t.value = ''; if (f) receberAparelho(f); return; }
  if (t.dataset.act === 'saldoInst') { const i = DB.config.instituicoes[+t.dataset.k]; i.saldo = r2(parseNum(t.value)); saveConfig(); render(); return; }
  if (t.dataset.filtro) { const f = state.filtro; f[t.dataset.filtro] = t.type === 'checkbox' ? t.checked : t.value; if (t.dataset.filtro === 'periodo' && t.value === 'datas' && !f.de && !f.ate) { f.de = state.mes + '-01'; f.ate = todayISO() >= f.de ? todayISO() : ''; } render(); }
});
const filtroQ = debounce(v => { state.filtro.q = v; render(); const i = $('[data-filtro="q"]'); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); } }, 300);
document.addEventListener('input', e => { if (e.target.dataset.filtro === 'q') filtroQ(e.target.value); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); if (e.key === 'n' && e.altKey) formLanc(null); });
let rotaAnt = null;
window.addEventListener('hashchange', () => { const r = route(); if (r !== rotaAnt) state.mesManual = false; rotaAnt = r; render(); window.scrollTo(0, 0); });
window.addEventListener('online', () => sync(false));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { sync(false); } });
setInterval(() => { if (document.visibilityState === 'visible' && SET.dirty) sync(false); }, 60000);

/* ---------------- início ---------------- */
applyTheme(); reindex(); buildNav(); render(); sync(false);
if (location.hash.includes('novo=1')) { history.replaceState(null, '', '#/inicio'); formLanc(null); }
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { });
// exposto para testes/console
window.FIN = { summary, entriesFor, weeklyData, insights, sugestoes, parcelGroups, contasDoMes, mergeDB, sync, get DB() { return DB; }, get SET() { return SET; } };
