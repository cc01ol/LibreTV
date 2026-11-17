// 全面探测内置站点：可达性(短超时) + 搜索参数变体 + 结果相关性
// 用法: node scripts/probe-search.mjs [关键词1] [关键词2]
import fs from 'fs';
import path from 'path';

const configSrc = fs.readFileSync(path.join(process.cwd(), 'js', 'config.js'), 'utf8');
const m = configSrc.match(/const API_SITES = \{([\s\S]*?)\n\};/);
if (!m) throw new Error('无法从 js/config.js 解析 API_SITES');
const API_SITES = eval('({' + m[1] + '\n})');

const queries = process.argv.slice(2).length ? process.argv.slice(2) : ['凡人', '庆余年'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const PROBE_TIMEOUT = 15000;

const variants = [
    { id: 'ac=videolist&wd=', make: (api, q) => `${api}?ac=videolist&wd=${encodeURIComponent(q)}` },
    { id: 'ac=list&wd=', make: (api, q) => `${api}?ac=list&wd=${encodeURIComponent(q)}` },
    { id: 'ac=search&wd=', make: (api, q) => `${api}?ac=search&wd=${encodeURIComponent(q)}` },
    { id: 'wd=', make: (api, q) => `${api}?wd=${encodeURIComponent(q)}` },
    { id: 'q=', make: (api, q) => `${api}?q=${encodeURIComponent(q)}` },
];

function log(s) { console.log(s); }

async function getJson(url, timeout = PROBE_TIMEOUT) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        const resp = await fetch(url, {
            headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Accept-Language': 'zh-CN,zh;q=0.9' },
            redirect: 'follow',
            signal: controller.signal,
        });
        const text = await resp.text();
        let json = null;
        try { json = JSON.parse(text); } catch { /* not json */ }
        return { status: resp.status, text, json };
    } catch (e) {
        return { error: e.name === 'AbortError' ? `超时(${timeout}ms)` : (e.cause?.code || e.cause?.message || e.message) };
    } finally {
        clearTimeout(timer);
    }
}

function relevance(list, q) {
    if (!list?.length) return 0;
    const nq = q.toLowerCase().replace(/\s+/g, '');
    let matched = 0;
    for (const item of list) {
        const t = (item.vod_name || '').toLowerCase().replace(/\s+/g, '');
        if (t.includes(nq)) matched++;
    }
    return matched / list.length;
}

const report = {};
const summaryRows = [];

for (const [key, site] of Object.entries(API_SITES)) {
    const entry = { name: site.name, api: site.api, variants: {}, base: null };

    log(`\n[${key}] ${site.name} -> ${site.api}`);
    const base = await getJson(`${site.api}?ac=list`);
    entry.base = base.error
        ? { reachable: false, error: base.error }
        : { reachable: true, status: base.status, isJson: !!base.json, head: (base.text || '').slice(0, 70).replace(/\s+/g, ' ') };
    log(`  base: ${entry.base.reachable ? `HTTP ${entry.base.status} json=${entry.base.isJson}` : 'DEAD ' + entry.base.error}`);

    for (const v of variants) {
        const perQuery = [];
        for (const q of queries) {
            const r = await getJson(v.make(site.api, q));
            if (r.error) { perQuery.push({ q, state: 'ERR', error: r.error }); continue; }
            if (!r.json) { perQuery.push({ q, state: 'NOT_JSON', status: r.status, head: (r.text || '').slice(0, 50).replace(/\s+/g, ' ') }); continue; }
            const list = Array.isArray(r.json.list) ? r.json.list : null;
            if (!list) { perQuery.push({ q, state: 'NO_LIST', status: r.status, keys: Object.keys(r.json).slice(0, 6).join(',') }); continue; }
            if (list.length === 0) { perQuery.push({ q, state: 'EMPTY', status: r.status, pagecount: r.json.pagecount ?? null }); continue; }
            perQuery.push({
                q, state: 'OK', status: r.status, count: list.length,
                pagecount: r.json.pagecount ?? null, total: r.json.total ?? null,
                rel: Number(relevance(list, q).toFixed(2)),
                sample: list.slice(0, 3).map(i => i.vod_name).join(' / '),
            });
        }
        entry.variants[v.id] = perQuery;
        const sig = perQuery.map(x => x.state === 'OK'
            ? `OK n=${x.count} rel=${x.rel} pg=${x.pagecount} ${x.sample}`
            : `${x.state}${x.error ? '(' + x.error + ')' : ''}${x.head ? '[' + x.head.slice(0, 24) + ']' : ''}`).join(' || ');
        log(`  ${v.id.padEnd(18)} ${sig}`);
    }

    report[key] = entry;
    const best = Object.entries(entry.variants)
        .filter(([, arr]) => arr.every(x => x.state === 'OK'))
        .map(([id, arr]) => ({ id, rel: Math.min(...arr.map(x => x.rel)), counts: arr.map(x => x.count) }))
        .sort((a, b) => b.rel - a.rel)[0];
    summaryRows.push({
        key,
        name: site.name,
        reachable: entry.base.reachable,
        err: entry.base.error || '',
        best: best ? `${best.id} rel=${best.rel}` : (entry.base.reachable ? '可达但搜索异常' : '不可达'),
    });
}

fs.writeFileSync(path.join(process.cwd(), 'scripts', 'probe-report.json'), JSON.stringify(report, null, 2), 'utf8');

log('\n================ 汇总 ================');
log('key'.padEnd(11) + '站点'.padEnd(9) + '可达'.padEnd(6) + '最佳搜索参数');
for (const r of summaryRows) {
    log(r.key.padEnd(11) + r.name.padEnd(9) + String(r.reachable ? '是' : '否').padEnd(6) + r.best + (r.err ? ` (${r.err})` : ''));
}
log('\n详细结果已写入 scripts/probe-report.json（可用浏览器/编辑器查看完整 raw 数据）');
