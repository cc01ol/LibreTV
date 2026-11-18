// 用浏览器代码(js/api.js) 跑 /api/detail 与 /api/search，验证详情播放源选择
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = f => fs.readFileSync(path.join(root, 'js', f), 'utf8');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

async function proxyFetch(input, init) {
    const url = String(input);
    if (!url.startsWith('/proxy/')) throw new Error('非代理请求: ' + url);
    const target = decodeURIComponent(url.slice('/proxy/'.length));
    return fetch(target, {
        headers: { 'User-Agent': UA, ...(init?.headers || {}) },
        redirect: 'follow',
        signal: init?.signal,
    });
}

const sandbox = {
    console, fetch: proxyFetch, setTimeout, clearTimeout, AbortController, URL, URLSearchParams,
    encodeURIComponent, decodeURIComponent, JSON, Math, String, Number, Array, Object, Error, RegExp,
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    localStorage: { getItem: () => null, setItem: () => { } },
    location: { origin: 'http://localhost' },
};
sandbox.window = sandbox; // 浏览器里 window 即全局对象
vm.createContext(sandbox);

vm.runInContext(read('config.js'), sandbox, { filename: 'config.js' });
vm.runInContext(read('customer_site.js'), sandbox, { filename: 'customer_site.js' });
vm.runInContext(read('search.js'), sandbox, { filename: 'search.js' });
vm.runInContext(read('api.js'), sandbox, { filename: 'api.js' });

const call = async (pathAndQuery) => {
    const out = await sandbox.handleApiRequest(new URL('http://localhost' + pathAndQuery));
    return JSON.parse(out);
};

const KEYWORD = process.argv[2] || '凡人';

// 1. /api/search 相关性
console.log(`=== /api/search?wd=${KEYWORD} ===`);
const firstItems = {};
for (const key of Object.keys(sandbox.API_SITES)) {
    try {
        const r = await call(`/api/search?wd=${encodeURIComponent(KEYWORD)}&source=${key}`);
        const rel = (r.list || []).filter(i => (i.vod_name || '').includes(KEYWORD)).length;
        firstItems[key] = (r.list || [])[0];
        console.log(`${key.padEnd(10)} code=${r.code} 结果=${(r.list || []).length} 标题命中=${rel}`);
    } catch (e) {
        console.log(`${key.padEnd(10)} 异常: ${e.message}`);
    }
}

// 2. /api/detail 播放地址
console.log('\n=== /api/detail 播放源抽检 ===');
for (const key of Object.keys(sandbox.API_SITES)) {
    try {
        let item = firstItems[key];
        if (!item) {
            const s = await call(`/api/search?wd=${encodeURIComponent(KEYWORD)}&source=${key}`);
            item = (s.list || [])[0];
        }
        if (!item) { console.log(`${key.padEnd(10)} 无搜索结果，跳过`); continue; }
        const t0 = Date.now();
        const d = await call(`/api/detail?id=${encodeURIComponent(item.vod_id)}&source=${key}`);
        const eps = d.episodes || [];
        const m3 = eps.filter(u => u.includes('.m3u8')).length;
        console.log(`${key.padEnd(10)} code=${d.code} 集数=${String(eps.length).padEnd(4)} 含m3u8=${String(m3).padEnd(4)} ${Date.now() - t0}ms ${eps[0] ? eps[0].slice(0, 90) : (d.msg || '')}`);
    } catch (e) {
        console.log(`${key.padEnd(10)} 异常: ${e.message}`);
    }
}
