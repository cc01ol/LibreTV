// 改进的API请求处理函数
async function handleApiRequest(url) {
    const customApi = url.searchParams.get('customApi') || '';
    const customDetail = url.searchParams.get('customDetail') || '';
    const source = url.searchParams.get('source') || 'dyttzy';
    
    try {
        if (url.pathname === '/api/search') {
            const searchQuery = url.searchParams.get('wd');
            if (!searchQuery) {
                throw new Error('缺少搜索参数');
            }
            
            // 验证API和source的有效性
            if (source === 'custom' && !customApi) {
                throw new Error('使用自定义API时必须提供API地址');
            }
            
            if (!API_SITES[source] && source !== 'custom') {
                throw new Error('无效的API来源');
            }
            
            const apiUrl = buildSearchUrl(customApi || API_SITES[source].api, source, searchQuery, 1);
            
            // 添加超时处理
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            try {
                // 添加鉴权参数到代理URL
                const proxiedUrl = await window.ProxyAuth?.addAuthToProxyUrl ? 
                    await window.ProxyAuth.addAuthToProxyUrl(PROXY_URL + encodeURIComponent(apiUrl)) :
                    PROXY_URL + encodeURIComponent(apiUrl);
                    
                const response = await fetch(proxiedUrl, {
                    headers: API_CONFIG.search.headers,
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    throw new Error(`API请求失败: ${response.status}`);
                }
                
                const data = await response.json();
                
                // 检查JSON格式的有效性
                if (!data || !Array.isArray(data.list)) {
                    throw new Error('API返回的数据格式无效');
                }
                
                // 添加源信息到每个结果
                data.list.forEach(item => {
                    normalizeVodItem(item);
                    item.source_name = source === 'custom' ? '自定义源' : API_SITES[source].name;
                    item.source_code = source;
                    // 对于自定义源，添加API URL信息
                    if (source === 'custom') {
                        item.api_url = customApi;
                    }
                });
                
                // 内置源按标题过滤，保证结果与关键词相关
                const filteredList = source !== 'custom' && typeof filterResultsByTitle === 'function'
                    ? filterResultsByTitle(data.list, searchQuery, source)
                    : data.list;

                return JSON.stringify({
                    code: 200,
                    list: filteredList || [],
                });
            } catch (fetchError) {
                clearTimeout(timeoutId);
                throw fetchError;
            }
        }

        // 详情处理
        if (url.pathname === '/api/detail') {
            const id = url.searchParams.get('id');
            const sourceCode = url.searchParams.get('source') || 'dyttzy'; // 获取源代码
            
            if (!id) {
                throw new Error('缺少视频ID参数');
            }
            
            // 验证ID格式 - 只允许数字和有限的特殊字符
            if (!/^[\w-]+$/.test(id)) {
                throw new Error('无效的视频ID格式');
            }

            // 验证API和source的有效性
            if (sourceCode === 'custom' && !customApi) {
                throw new Error('使用自定义API时必须提供API地址');
            }
            
            if (!API_SITES[sourceCode] && sourceCode !== 'custom') {
                throw new Error('无效的API来源');
            }

            // 需要专用适配的站点（如 FreeOK / 麦田影视 / 66大片：无标准采集接口，只能解析网页）
            if (sourceCode !== 'custom' && API_SITES[sourceCode].adapter) {
                return await handleScrapeDetail(id, sourceCode);
            }

            // 对于有detail参数的源，都使用特殊处理方式
            if (sourceCode !== 'custom' && API_SITES[sourceCode].detail) {
                return await handleSpecialSourceDetail(id, sourceCode);
            }
            
            // 如果是自定义API，并且传递了detail参数，尝试特殊处理
            // 优先 customDetail
            if (sourceCode === 'custom' && customDetail) {
                return await handleCustomApiSpecialDetail(id, customDetail);
            }
            if (sourceCode === 'custom' && url.searchParams.get('useDetail') === 'true') {
                return await handleCustomApiSpecialDetail(id, customApi);
            }
            
            const detailUrl = customApi
                ? `${customApi}${API_CONFIG.detail.path}${id}`
                : `${API_SITES[sourceCode].api}${API_CONFIG.detail.path}${id}`;
            
            // 添加超时处理
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            try {
                // 添加鉴权参数到代理URL
                const proxiedUrl = await window.ProxyAuth?.addAuthToProxyUrl ? 
                    await window.ProxyAuth.addAuthToProxyUrl(PROXY_URL + encodeURIComponent(detailUrl)) :
                    PROXY_URL + encodeURIComponent(detailUrl);
                    
                const response = await fetch(proxiedUrl, {
                    headers: API_CONFIG.detail.headers,
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    throw new Error(`详情请求失败: ${response.status}`);
                }
                
                // 解析JSON
                const data = await response.json();
                
                // 检查返回的数据是否有效
                if (!data || !data.list || !Array.isArray(data.list) || data.list.length === 0) {
                    throw new Error('获取到的详情内容无效');
                }
                
                // 获取第一个匹配的视频详情
                const videoDetail = data.list[0];
                
                // 提取播放地址
                let episodes = [];
                
                if (videoDetail.vod_play_url) {
                    // 分割不同播放源
                    const playSources = videoDetail.vod_play_url.split('$$$');

                    // 优先选择提供 m3u8 直链的播放源：
                    // 多数采集站第一个源是网页解析地址(如 /share/xxx)，无法直接播放，
                    // 真正的直链在后面的 *m3u8 源里
                    let mainSource = playSources[0] || '';
                    const directSource = playSources.find(src => /\.m3u8(\?|$|#)/i.test(src));
                    if (directSource) {
                        mainSource = directSource;
                    }

                    if (mainSource) {
                        const episodeList = mainSource.split('#');

                        // 从每个集数中提取URL
                        episodes = episodeList.map(ep => {
                            const parts = ep.split('$');
                            // 返回URL部分(通常是第二部分，如果有的话)
                            return parts.length > 1 ? parts[1] : '';
                        }).filter(url => url && (url.startsWith('http://') || url.startsWith('https://')));
                    }
                }
                
                // 如果没有找到播放地址，尝试使用正则表达式查找m3u8链接
                if (episodes.length === 0 && videoDetail.vod_content) {
                    const matches = videoDetail.vod_content.match(M3U8_PATTERN) || [];
                    episodes = matches.map(link => link.replace(/^\$/, ''));
                }
                
                return JSON.stringify({
                    code: 200,
                    episodes: episodes,
                    detailUrl: detailUrl,
                    videoInfo: {
                        title: videoDetail.vod_name,
                        cover: videoDetail.vod_pic,
                        desc: videoDetail.vod_content,
                        type: videoDetail.type_name,
                        year: videoDetail.vod_year,
                        area: videoDetail.vod_area,
                        director: videoDetail.vod_director,
                        actor: videoDetail.vod_actor,
                        remarks: videoDetail.vod_remarks,
                        // 添加源信息
                        source_name: sourceCode === 'custom' ? '自定义源' : API_SITES[sourceCode].name,
                        source_code: sourceCode
                    }
                });
            } catch (fetchError) {
                clearTimeout(timeoutId);
                throw fetchError;
            }
        }

        throw new Error('未知的API路径');
    } catch (error) {
        console.error('API处理错误:', error);
        return JSON.stringify({
            code: 400,
            msg: error.message || '请求处理失败',
            list: [],
            episodes: [],
        });
    }
}

// 处理自定义API的特殊详情页
async function handleCustomApiSpecialDetail(id, customApi) {
    try {
        // 构建详情页URL
        const detailUrl = `${customApi}/index.php/vod/detail/id/${id}.html`;
        
        // 添加超时处理
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        // 添加鉴权参数到代理URL
        const proxiedUrl = await window.ProxyAuth?.addAuthToProxyUrl ? 
            await window.ProxyAuth.addAuthToProxyUrl(PROXY_URL + encodeURIComponent(detailUrl)) :
            PROXY_URL + encodeURIComponent(detailUrl);
            
        // 获取详情页HTML
        const response = await fetch(proxiedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`自定义API详情页请求失败: ${response.status}`);
        }
        
        // 获取HTML内容
        const html = await response.text();
        
        // 使用通用模式提取m3u8链接
        const generalPattern = /\$(https?:\/\/[^"'\s]+?\.m3u8)/g;
        let matches = html.match(generalPattern) || [];
        
        // 处理链接
        matches = matches.map(link => {
            link = link.substring(1, link.length);
            const parenIndex = link.indexOf('(');
            return parenIndex > 0 ? link.substring(0, parenIndex) : link;
        });
        
        // 提取基本信息
        const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
        const titleText = titleMatch ? titleMatch[1].trim() : '';
        
        const descMatch = html.match(/<div[^>]*class=["']sketch["'][^>]*>([\s\S]*?)<\/div>/);
        const descText = descMatch ? descMatch[1].replace(/<[^>]+>/g, ' ').trim() : '';
        
        return JSON.stringify({
            code: 200,
            episodes: matches,
            detailUrl: detailUrl,
            videoInfo: {
                title: titleText,
                desc: descText,
                source_name: '自定义源',
                source_code: 'custom'
            }
        });
    } catch (error) {
        console.error(`自定义API详情获取失败:`, error);
        throw error;
    }
}

// 通用特殊源详情处理函数
async function handleSpecialSourceDetail(id, sourceCode) {
    try {
        // 构建详情页URL（使用配置中的detail URL而不是api URL）
        const detailUrl = `${API_SITES[sourceCode].detail}/index.php/vod/detail/id/${id}.html`;
        
        // 添加超时处理
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        // 添加鉴权参数到代理URL
        const proxiedUrl = await window.ProxyAuth?.addAuthToProxyUrl ? 
            await window.ProxyAuth.addAuthToProxyUrl(PROXY_URL + encodeURIComponent(detailUrl)) :
            PROXY_URL + encodeURIComponent(detailUrl);
            
        // 获取详情页HTML
        const response = await fetch(proxiedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`详情页请求失败: ${response.status}`);
        }
        
        // 获取HTML内容
        const html = await response.text();
        
        // 根据不同源类型使用不同的正则表达式
        let matches = [];
        
        if (sourceCode === 'ffzy') {
            // 非凡影视使用特定的正则表达式
            const ffzyPattern = /\$(https?:\/\/[^"'\s]+?\/\d{8}\/\d+_[a-f0-9]+\/index\.m3u8)/g;
            matches = html.match(ffzyPattern) || [];
        }
        
        // 如果没有找到链接或者是其他源类型，尝试一个更通用的模式
        if (matches.length === 0) {
            const generalPattern = /\$(https?:\/\/[^"'\s]+?\.m3u8)/g;
            matches = html.match(generalPattern) || [];
        }
        // 去重处理，避免一个播放源多集显示
        matches = [...new Set(matches)];
        // 处理链接
        matches = matches.map(link => {
            link = link.substring(1, link.length);
            const parenIndex = link.indexOf('(');
            return parenIndex > 0 ? link.substring(0, parenIndex) : link;
        });
        
        // 提取可能存在的标题、简介等基本信息
        const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
        const titleText = titleMatch ? titleMatch[1].trim() : '';
        
        const descMatch = html.match(/<div[^>]*class=["']sketch["'][^>]*>([\s\S]*?)<\/div>/);
        const descText = descMatch ? descMatch[1].replace(/<[^>]+>/g, ' ').trim() : '';
        
        return JSON.stringify({
            code: 200,
            episodes: matches,
            detailUrl: detailUrl,
            videoInfo: {
                title: titleText,
                desc: descText,
                source_name: API_SITES[sourceCode].name,
                source_code: sourceCode
            }
        });
    } catch (error) {
        console.error(`${API_SITES[sourceCode].name}详情获取失败:`, error);
        throw error;
    }
}

// 通过内部代理抓取文本（供需要专用适配的站点使用）
async function fetchTextViaProxy(targetUrl, timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs || 15000);
    try {
        const proxiedUrl = window.ProxyAuth?.addAuthToProxyUrl
            ? await window.ProxyAuth.addAuthToProxyUrl(PROXY_URL + encodeURIComponent(targetUrl))
            : PROXY_URL + encodeURIComponent(targetUrl);
        const response = await fetch(proxiedUrl, {
            signal: controller.signal,
            // 注意：这里不要带 application/json，部分站点(如麦田影视)会因此返回“JSON 转义后的 HTML”
            headers: { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8' }
        });
        if (!response.ok) {
            throw new Error(`请求失败 ${response.status}: ${targetUrl}`);
        }
        let text = await response.text();
        // 少数站点会把整页 HTML 作为 JSON 字符串返回，这里解开
        if (/^\s*"/.test(text) && /\\u|\\"|\\\//.test(text.slice(0, 200))) {
            try {
                const parsed = JSON.parse(text);
                if (typeof parsed === 'string') text = parsed;
            } catch (e) {
                // 保持原样
            }
        }
        return text;
    } finally {
        clearTimeout(timeoutId);
    }
}

// 播放页里的播放地址可能是：直链 m3u8、/play/<token> 解析地址、或 base64/百分号编码后的地址
function decodePlayUrl(url) {
    let current = String(url || '').trim();
    if (typeof atob !== 'function') return current;
    for (let i = 0; i < 3 && current && !/^https?:\/\//i.test(current); i++) {
        let decoded = null;
        try {
            const text = atob(current.replace(/\s+/g, ''));
            if (text && /^[\x20-\x7e]+$/.test(text)) decoded = text;
        } catch (e) {
            decoded = null;
        }
        if (!decoded) break;
        current = decoded;
        if (current.includes('%')) {
            try {
                current = decodeURIComponent(current);
            } catch (e) {
                // 保持原样
            }
        }
    }
    return current;
}

// 判断解析出的地址是否真的能播（排除优酷/爱奇艺等网页链接）
function isStreamableUrl(url) {
    if (!/^https?:\/\//i.test(url)) return false;
    if (/\.m3u8(\?|$)/i.test(url)) return true;
    if (/\.(mp4|m4v|flv|ts)(\?|$)/i.test(url)) return true;
    if (/\/play\/[A-Za-z0-9]+$/i.test(url)) return true;
    return false;
}

// 网页解析地址转直链：多数采集站的 /play/<token> 补上 /index.m3u8 即为可播放地址
function toDirectPlayUrl(url) {
    const current = decodePlayUrl(url);
    if (!/^https?:\/\//i.test(current)) return '';
    if (/\.m3u8(\?|$)/i.test(current)) return current;
    if (/\/play\/[A-Za-z0-9]+$/i.test(current)) return current + '/index.m3u8';
    return isStreamableUrl(current) ? current : '';
}

// 网页解析型站点专用适配（FreeOK / 麦田影视 / 66大片 等）：
// 这些站关闭了标准采集接口，只提供 suggest 搜索 + 网页详情页/播放页，
// 因此从详情页拿到剧集链接，再逐集解析播放页里的 player_aaaa 取播放地址
const scrapeDetailCache = new Map(); // `${source}_${id}` -> { expires, payload }
const SCRAPE_CACHE_TTL = 10 * 60 * 1000;

// 由配置里的播放页模板生成剧集链接正则，例如 /vodplay/{id}-{sid}-{nid}.html
function buildPlayLinkPattern(template) {
    const escaped = template.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const withGroups = escaped
        .replace('\\{sid\\}', '(\\d+)')
        .replace('\\{nid\\}', '(\\d+)')
        .replace('{sid}', '(\\d+)')
        .replace('{nid}', '(\\d+)');
    return new RegExp(withGroups.replace(/\\\{id\\\}|\{id\}/g, '\\d+'), 'g');
}

// 抓播放页并解析出该集的播放地址
async function resolvePlayPageUrl(base, playTemplate, id, ep) {
    const pageUrl = base + playTemplate
        .replace('{id}', encodeURIComponent(id))
        .replace('{sid}', String(ep.sid))
        .replace('{nid}', String(ep.nid));
    const pageHtml = await fetchTextViaProxy(pageUrl);
    const cfgMatch = pageHtml.match(/player_aaaa\s*=\s*(\{[\s\S]*?\})\s*<\/script>/)
        || pageHtml.match(/player_[a-z]+\s*=\s*(\{[\s\S]*?\})\s*<\/script>/);
    if (!cfgMatch) return '';
    let cfg;
    try {
        cfg = JSON.parse(cfgMatch[1]);
    } catch (e) {
        return '';
    }
    return toDirectPlayUrl(cfg.url || '');
}

async function handleScrapeDetail(id, sourceCode) {
    const cacheKey = `${sourceCode}_${id}`;
    const cached = scrapeDetailCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
        return cached.payload;
    }

    const site = API_SITES[sourceCode];
    const base = site.api;
    const playTemplate = site.playPagePath || '/vodplay/{id}-{sid}-{nid}.html';

    // 1. 详情页，收集剧集链接
    const detailUrl = base + (site.detailPagePath || '/voddetail/{id}.html').replace('{id}', encodeURIComponent(id));
    let detailHtml = await fetchTextViaProxy(detailUrl);

    const linkPattern = buildPlayLinkPattern(playTemplate);
    const collectEpisodes = (html) => {
        const seen = new Set();
        const list = [];
        let m;
        linkPattern.lastIndex = 0;
        while ((m = linkPattern.exec(html)) !== null) {
            const sid = Number(m[1]);
            const nid = Number(m[2]);
            if (!sid || !nid) continue;
            const key = `${sid}-${nid}`;
            if (seen.has(key)) continue;
            seen.add(key);
            list.push({ sid, nid });
        }
        return list;
    };

    let episodesMeta = collectEpisodes(detailHtml);

    // 少数页面会返回不含剧集链接的空壳（风控/缓存），带时间戳再取一次
    if (episodesMeta.length === 0) {
        detailHtml = await fetchTextViaProxy(detailUrl + (detailUrl.includes('?') ? '&' : '?') + '_t=' + Date.now());
        episodesMeta = collectEpisodes(detailHtml);
    }

    if (episodesMeta.length === 0) {
        throw new Error('详情页未找到剧集链接');
    }

    // 2. 按播放源分组，集数多的优先（同一影片常有多个线路，部分线路地址加密不可用）
    const bySource = new Map();
    for (const ep of episodesMeta) {
        if (!bySource.has(ep.sid)) bySource.set(ep.sid, []);
        bySource.get(ep.sid).push(ep);
    }
    const candidates = [...bySource.values()]
        .map(list => list.sort((a, b) => a.nid - b.nid))
        .sort((a, b) => b.length - a.length);

    // 3. 逐个线路试播：首集能拿到可播放地址就选中该线路（最多试 3 条）
    let chosen = null;
    for (const list of candidates.slice(0, 3)) {
        try {
            const firstUrl = await resolvePlayPageUrl(base, playTemplate, id, list[0]);
            if (firstUrl) {
                chosen = { list, firstUrl };
                break;
            }
        } catch (e) {
            console.warn(`${site.name} 线路 ${list[0].sid} 解析失败:`, e.message);
        }
    }
    if (!chosen) {
        throw new Error('未能解析到播放地址');
    }

    // 4. 逐集抓播放页（并发 16），首集复用上面的结果
    const episodes = [chosen.firstUrl];
    const rest = chosen.list.slice(1);
    const concurrency = 16;
    for (let i = 0; i < rest.length; i += concurrency) {
        const chunk = rest.slice(i, i + concurrency);
        const chunkUrls = await Promise.all(chunk.map(async ep => {
            try {
                return await resolvePlayPageUrl(base, playTemplate, id, ep);
            } catch (e) {
                console.warn(`${site.name} 第${ep.nid}集解析失败:`, e.message);
                return '';
            }
        }));
        episodes.push(...chunkUrls);
    }

    const validEpisodes = episodes.filter(Boolean);
    if (validEpisodes.length === 0) {
        throw new Error('未能解析到播放地址');
    }

    // 5. 标题/封面
    const bookMatch = detailHtml.match(/<title[^>]*>\s*《([^》]+)》/i);
    const titleMatch = detailHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const titleText = bookMatch
        ? bookMatch[1].trim()
        : (titleMatch ? titleMatch[1].split(/[-_|]/)[0].trim() : '');
    const coverMatch = detailHtml.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);

    const payload = JSON.stringify({
        code: 200,
        episodes: validEpisodes,
        detailUrl: detailUrl,
        videoInfo: {
            title: titleText,
            cover: coverMatch ? coverMatch[1] : '',
            source_name: site.name,
            source_code: sourceCode
        }
    });

    // 详情要逐集抓播放页，结果缓存 10 分钟，避免重复打开同一部剧反复解析
    scrapeDetailCache.set(cacheKey, { expires: Date.now() + SCRAPE_CACHE_TTL, payload });
    if (scrapeDetailCache.size > 50) {
        const now = Date.now();
        for (const [key, value] of scrapeDetailCache) {
            if (value.expires <= now || scrapeDetailCache.size > 50) scrapeDetailCache.delete(key);
        }
    }

    return payload;
}

// 处理聚合搜索
async function handleAggregatedSearch(searchQuery) {
    // 获取可用的API源列表（排除aggregated和custom）
    const availableSources = Object.keys(API_SITES).filter(key => 
        key !== 'aggregated' && key !== 'custom'
    );
    
    if (availableSources.length === 0) {
        throw new Error('没有可用的API源');
    }
    
    // 创建所有API源的搜索请求
    const searchPromises = availableSources.map(async (source) => {
        try {
            const apiUrl = buildSearchUrl(API_SITES[source].api, source, searchQuery, 1);
            
            // 使用Promise.race添加超时处理
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error(`${source}源搜索超时`)), 8000)
            );
            
            // 添加鉴权参数到代理URL
            const proxiedUrl = await window.ProxyAuth?.addAuthToProxyUrl ? 
                await window.ProxyAuth.addAuthToProxyUrl(PROXY_URL + encodeURIComponent(apiUrl)) :
                PROXY_URL + encodeURIComponent(apiUrl);
            
            const fetchPromise = fetch(proxiedUrl, {
                headers: API_CONFIG.search.headers
            });
            
            const response = await Promise.race([fetchPromise, timeoutPromise]);
            
            if (!response.ok) {
                throw new Error(`${source}源请求失败: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (!data || !Array.isArray(data.list)) {
                throw new Error(`${source}源返回的数据格式无效`);
            }
            
            // 为搜索结果添加源信息
            const results = data.list.map(item => ({
                ...normalizeVodItem(item),
                source_name: API_SITES[source].name,
                source_code: source
            }));

            // 按站点配置过滤标题，保证结果与关键词相关
            return typeof filterResultsByTitle === 'function'
                ? filterResultsByTitle(results, searchQuery, source)
                : results;
        } catch (error) {
            console.warn(`${source}源搜索失败:`, error);
            return []; // 返回空数组表示该源搜索失败
        }
    });
    
    try {
        // 并行执行所有搜索请求
        const resultsArray = await Promise.all(searchPromises);
        
        // 合并所有结果
        let allResults = [];
        resultsArray.forEach(results => {
            if (Array.isArray(results) && results.length > 0) {
                allResults = allResults.concat(results);
            }
        });
        
        // 如果没有搜索结果，返回空结果
        if (allResults.length === 0) {
            return JSON.stringify({
                code: 200,
                list: [],
                msg: '所有源均无搜索结果'
            });
        }
        
        // 去重（根据vod_id和source_code组合）
        const uniqueResults = [];
        const seen = new Set();
        
        allResults.forEach(item => {
            const key = `${item.source_code}_${item.vod_id}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueResults.push(item);
            }
        });
        
        // 按照视频名称和来源排序
        uniqueResults.sort((a, b) => {
            // 首先按照视频名称排序
            const nameCompare = (a.vod_name || '').localeCompare(b.vod_name || '');
            if (nameCompare !== 0) return nameCompare;
            
            // 如果名称相同，则按照来源排序
            return (a.source_name || '').localeCompare(b.source_name || '');
        });
        
        return JSON.stringify({
            code: 200,
            list: uniqueResults,
        });
    } catch (error) {
        console.error('聚合搜索处理错误:', error);
        return JSON.stringify({
            code: 400,
            msg: '聚合搜索处理失败: ' + error.message,
            list: []
        });
    }
}

// 处理多个自定义API源的聚合搜索
async function handleMultipleCustomSearch(searchQuery, customApiUrls) {
    // 解析自定义API列表
    const apiUrls = customApiUrls.split(CUSTOM_API_CONFIG.separator)
        .map(url => url.trim())
        .filter(url => url.length > 0 && /^https?:\/\//.test(url))
        .slice(0, CUSTOM_API_CONFIG.maxSources);
    
    if (apiUrls.length === 0) {
        throw new Error('没有提供有效的自定义API地址');
    }
    
    // 为每个API创建搜索请求
    const searchPromises = apiUrls.map(async (apiUrl, index) => {
        try {
            const fullUrl = buildSearchUrl(apiUrl, 'custom', searchQuery, 1);
            
            // 使用Promise.race添加超时处理
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error(`自定义API ${index+1} 搜索超时`)), 8000)
            );
            
            // 添加鉴权参数到代理URL
            const proxiedUrl = await window.ProxyAuth?.addAuthToProxyUrl ? 
                await window.ProxyAuth.addAuthToProxyUrl(PROXY_URL + encodeURIComponent(fullUrl)) :
                PROXY_URL + encodeURIComponent(fullUrl);
            
            const fetchPromise = fetch(proxiedUrl, {
                headers: API_CONFIG.search.headers
            });
            
            const response = await Promise.race([fetchPromise, timeoutPromise]);
            
            if (!response.ok) {
                throw new Error(`自定义API ${index+1} 请求失败: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (!data || !Array.isArray(data.list)) {
                throw new Error(`自定义API ${index+1} 返回的数据格式无效`);
            }
            
            // 为搜索结果添加源信息
            const results = data.list.map(item => ({
                ...item,
                source_name: `${CUSTOM_API_CONFIG.namePrefix}${index+1}`,
                source_code: 'custom',
                api_url: apiUrl // 保存API URL以便详情获取
            }));
            
            return results;
        } catch (error) {
            console.warn(`自定义API ${index+1} 搜索失败:`, error);
            return []; // 返回空数组表示该源搜索失败
        }
    });
    
    try {
        // 并行执行所有搜索请求
        const resultsArray = await Promise.all(searchPromises);
        
        // 合并所有结果
        let allResults = [];
        resultsArray.forEach(results => {
            if (Array.isArray(results) && results.length > 0) {
                allResults = allResults.concat(results);
            }
        });
        
        // 如果没有搜索结果，返回空结果
        if (allResults.length === 0) {
            return JSON.stringify({
                code: 200,
                list: [],
                msg: '所有自定义API源均无搜索结果'
            });
        }
        
        // 去重（根据vod_id和api_url组合）
        const uniqueResults = [];
        const seen = new Set();
        
        allResults.forEach(item => {
            const key = `${item.api_url || ''}_${item.vod_id}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueResults.push(item);
            }
        });
        
        return JSON.stringify({
            code: 200,
            list: uniqueResults,
        });
    } catch (error) {
        console.error('自定义API聚合搜索处理错误:', error);
        return JSON.stringify({
            code: 400,
            msg: '自定义API聚合搜索处理失败: ' + error.message,
            list: []
        });
    }
}

// 拦截API请求
(function() {
    const originalFetch = window.fetch;
    
    window.fetch = async function(input, init) {
        const requestUrl = typeof input === 'string' ? new URL(input, window.location.origin) : input.url;
        
        if (requestUrl.pathname.startsWith('/api/')) {
            if (window.isPasswordProtected && window.isPasswordVerified) {
                if (window.isPasswordProtected() && !window.isPasswordVerified()) {
                    return;
                }
            }
            try {
                const data = await handleApiRequest(requestUrl);
                return new Response(data, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                    },
                });
            } catch (error) {
                return new Response(JSON.stringify({
                    code: 500,
                    msg: '服务器内部错误',
                }), {
                    status: 500,
                    headers: {
                        'Content-Type': 'application/json',
                    },
                });
            }
        }
        
        // 非API请求使用原始fetch
        return originalFetch.apply(this, arguments);
    };
})();

async function testSiteAvailability(apiUrl) {
    try {
        // 使用更简单的测试查询
        const response = await fetch('/api/search?wd=test&customApi=' + encodeURIComponent(apiUrl), {
            // 添加超时
            signal: AbortSignal.timeout(5000)
        });
        
        // 检查响应状态
        if (!response.ok) {
            return false;
        }
        
        const data = await response.json();
        
        // 检查API响应的有效性
        return data && data.code !== 400 && Array.isArray(data.list);
    } catch (error) {
        console.error('站点可用性测试失败:', error);
        return false;
    }
}
