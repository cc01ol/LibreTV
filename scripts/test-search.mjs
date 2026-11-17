// 在 Node 中用浏览器代码(js/config.js + js/search.js) 跑真实搜索流程
// 用法: node scripts/test-search.mjs [关键词...]
// 说明: 把 /proxy/<encoded> 请求映射成直连请求，等价于本地代理的行为
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const configSrc = fs.readFileSync(path.join(root, 'js', 'config.js'), 'utf8');
const searchSrc = fs.readFileSync(path.join(root, 'js', 'search.js'), 'utf8');
const customerSrc = fs.readFileSync(path.join(root, 'js', 'customer_site.js'), 'utf8');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const proxyLog = [];
async function proxyFetch(input, init) {
    const url = String(input);
    if (!url.startsWith('/proxy/')) throw new Error('非代理请求: ' + url);
    const target = decodeURIComponent(url.slice('/proxy/'.length));
    proxyLog.push(target);
    return fetch(target, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        redirect: 'follow',
        signal: init?.signal,
    });
}

const sandbox = {
    console,
    window: {},
    fetch: proxyFetch,
    setTimeout,
    clearTimeout,
    AbortController,
    URL,
    encodeURIComponent,
    decodeURIComponent,
    JSON,
};
sandbox.window = sandbox; // 让 window.X 与全局同名变量互通(浏览器里脚本顶层 const 不挂 window，这里够用)
vm.createContext(sandbox);

// config.js 里的 window.API_SITES 等赋值对象指向 sandbox
vm.runInContext(configSrc, sandbox, { filename: 'config.js' });
vm.runInContext(customerSrc, sandbox, { filename: 'customer_site.js' });
vm.runInContext(searchSrc, sandbox, { filename: 'search.js' });

const queries = process.argv.slice(2).length ? process.argv.slice(2) : ['凡人', '庆余年'];
const keys = Object.keys(sandbox.API_SITES);
console.log(`加载站点 ${keys.length} 个: ${keys.join(', ')}\n`);

const runSearch = sandbox.searchByAPIAndKeyWord;

for (const q of queries) {
    console.log(`\n================ 关键词: ${q} ================`);
    let total = 0;
    const rows = [];
    // 串行执行，避免同时打多个站点
    for (const key of keys) {
        proxyLog.length = 0;
        const t0 = Date.now();
        const results = await runSearch(key, q);
        const ms = Date.now() - t0;
        total += results.length;
        const names = results.slice(0, 3).map(r => r.vod_name).join(' / ');
        rows.push({ key, n: results.length, ms, reqs: proxyLog.length, names });
    }
    for (const r of rows) {
        console.log(`${r.key.padEnd(10)} 结果=${String(r.n).padEnd(4)} 请求=${String(r.reqs).padEnd(3)} ${String(r.ms + 'ms').padEnd(8)} ${r.names}`);
    }
    console.log(`合计 ${total} 条`);

    // 关键词相关性抽检: 结果标题必须包含关键词或属于 fuzzy 站点(已按标题过滤)
    let bad = 0;
    for (const key of keys) {
        const results = await runSearch(key, q);
        const fuzzy = sandbox.API_SITES[key].filterByTitle;
        for (const item of results) {
            const t = String(item.vod_name || '').toLowerCase().replace(/\s+/g, '');
            if (!t.includes(q.toLowerCase().replace(/\s+/g, ''))) {
                if (fuzzy) continue;
                bad++;
                if (bad <= 5) console.log(`  [不相关] ${key}: ${item.vod_name}`);
            }
        }
    }
    console.log(`不相关结果: ${bad}`);
}

// 无关关键词应返回 0 条（防止站点忽略关键词返回全站列表）
console.log('\n================ 反例: 无意义关键词 zzqqxxyy ================');
for (const key of keys) {
    const results = await runSearch(key, 'zzqqxxyy');
    console.log(`${key.padEnd(10)} 结果=${results.length}${results.length ? ' 首条=' + results[0].vod_name : ''}`);
}
