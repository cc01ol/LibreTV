// 部分站点的搜索会模糊匹配副标题、演员或单个字符，需再按标题过滤
function filterResultsByTitle(results, query, apiId) {
    if (!API_SITES[apiId]?.filterByTitle) return results;
    const normalizedQuery = normalizeKeyword(query);
    if (!normalizedQuery) return results;
    return results.filter(item => normalizeKeyword(item.vod_name || '').includes(normalizedQuery));
}

// 关键词归一化：忽略大小写与空白，便于中英文/带空格标题匹配
function normalizeKeyword(text) {
    return String(text || '').toLowerCase().replace(/\s+/g, '');
}

// 检查一页结果里是否有标题命中关键词
function hasTitleMatch(results, query) {
    const normalizedQuery = normalizeKeyword(query);
    if (!normalizedQuery) return true;
    return results.some(item => normalizeKeyword(item.vod_name || '').includes(normalizedQuery));
}

// 按 vod_id 去重，避免翻页时重复数据
function dedupeResults(results) {
    const seen = new Set();
    return results.filter(item => {
        const id = `${item.source_code || ''}_${item.vod_id}`;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
    });
}

async function searchByAPIAndKeyWord(apiId, query) {
    try {
        let apiBaseUrl, apiName;

        // 处理自定义API
        if (apiId.startsWith('custom_')) {
            const customIndex = apiId.replace('custom_', '');
            const customApi = getCustomApiInfo(customIndex);
            if (!customApi) return [];

            apiBaseUrl = customApi.url;
            apiName = customApi.name;
        } else {
            // 内置API
            if (!API_SITES[apiId]) return [];
            apiBaseUrl = API_SITES[apiId].api;
            apiName = API_SITES[apiId].name;
        }

        // 搜索 URL 由站点配置的 searchPath 决定，缺省使用 API_CONFIG.search.path
        const apiUrl = buildSearchUrl(apiBaseUrl, apiId, query, 1);

        // 添加超时处理
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

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
            return [];
        }

        const data = await response.json();

        if (!data || !data.list || !Array.isArray(data.list) || data.list.length === 0) {
            return [];
        }

        // 处理第一页结果
        const results = data.list.map(item => normalizeVodItem({
            ...item,
            source_name: apiName,
            source_code: apiId,
            api_url: apiId.startsWith('custom_') ? getCustomApiInfo(apiId.replace('custom_', ''))?.url : undefined
        }));

        // 获取总页数
        const pageCount = Number(data.pagecount) > 0 ? Number(data.pagecount) : 1;
        const firstPageMatched = hasTitleMatch(results, query);

        // 站点若忽略关键词（原样返回全站列表），首页标题不会命中关键词且页数极大，直接丢弃该源结果
        if (!firstPageMatched && pageCount > 100) {
            console.warn(`API ${apiId} 搜索未按关键词过滤（返回全站列表），已忽略该源结果`);
            return [];
        }

        // 首页没有任何标题命中时不翻页：避免为不相关的列表额外请求几十页
        const pagesToFetch = firstPageMatched
            ? Math.min(pageCount - 1, API_CONFIG.search.maxPages - 1)
            : 0;

        // 如果有额外页数，获取更多页的结果
        if (pagesToFetch > 0) {
            const additionalPagePromises = [];

            for (let page = 2; page <= pagesToFetch + 1; page++) {
                // 构建分页URL
                const pageUrl = buildSearchUrl(apiBaseUrl, apiId, query, page);

                // 创建获取额外页的Promise
                const pagePromise = (async () => {
                    try {
                        const pageController = new AbortController();
                        const pageTimeoutId = setTimeout(() => pageController.abort(), 15000);

                        // 添加鉴权参数到代理URL
                        const proxiedPageUrl = await window.ProxyAuth?.addAuthToProxyUrl ?
                            await window.ProxyAuth.addAuthToProxyUrl(PROXY_URL + encodeURIComponent(pageUrl)) :
                            PROXY_URL + encodeURIComponent(pageUrl);

                        const pageResponse = await fetch(proxiedPageUrl, {
                            headers: API_CONFIG.search.headers,
                            signal: pageController.signal
                        });

                        clearTimeout(pageTimeoutId);

                        if (!pageResponse.ok) return [];

                        const pageData = await pageResponse.json();

                        if (!pageData || !pageData.list || !Array.isArray(pageData.list)) return [];

                        // 处理当前页结果
                        return pageData.list.map(item => normalizeVodItem({
                            ...item,
                            source_name: apiName,
                            source_code: apiId,
                            api_url: apiId.startsWith('custom_') ? getCustomApiInfo(apiId.replace('custom_', ''))?.url : undefined
                        }));
                    } catch (error) {
                        console.warn(`API ${apiId} 第${page}页搜索失败:`, error);
                        return [];
                    }
                })();

                additionalPagePromises.push(pagePromise);
            }

            // 等待所有额外页的结果
            const additionalResults = await Promise.all(additionalPagePromises);

            // 合并所有页的结果
            additionalResults.forEach(pageResults => {
                if (pageResults.length > 0) {
                    results.push(...pageResults);
                }
            });
        }

        return filterResultsByTitle(dedupeResults(results), query, apiId);
    } catch (error) {
        console.warn(`API ${apiId} 搜索失败:`, error);
        return [];
    }
}
