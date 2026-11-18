// 全局常量配置
const PROXY_URL = '/proxy/';    // 适用于 Cloudflare, Netlify (带重写), Vercel (带重写)
// const HOPLAYER_URL = 'https://hoplayer.com/index.html';
const SEARCH_HISTORY_KEY = 'videoSearchHistory';
const MAX_HISTORY_ITEMS = 5;

// 密码保护配置
// 注意：PASSWORD 环境变量是必需的，所有部署都必须设置密码以确保安全
const PASSWORD_CONFIG = {
    localStorageKey: 'passwordVerified',  // 存储验证状态的键名
    verificationTTL: 90 * 24 * 60 * 60 * 1000  // 验证有效期（90天，约3个月）
};

// 网站信息配置
const SITE_CONFIG = {
    name: 'LibreTV',
    url: 'https://libretv.is-an.org',
    description: '免费在线视频搜索与观看平台',
    logo: 'image/logo.png',
    version: '1.0.3'
};

// API站点配置
// 搜索适配字段（均为可选）：
//   searchPath     自定义搜索参数模板，{query} 为关键词占位符（缺省用 API_CONFIG.search.path）
//   pagePath       自定义翻页参数模板，{query}/{page} 为占位符（缺省用 API_CONFIG.search.pagePath）
//   filterByTitle  站点按多字段/模糊匹配搜索时置 true，客户端再按标题过滤，保证结果与关键词相关
//   adapter        需要专用解析逻辑的站点标记（目前仅 'freeok'），由 js/api.js 处理
//   detailPagePath / playPagePath  专用适配用的详情页、播放页模板（{id}/{sid}/{nid} 占位符）
// 2026-11-17 全量探测（关键词 "凡人"/"庆余年"）：8 个采集站的搜索/详情/播放均可用，其余已停用，原因见文末注释块。
// 另有网页解析型站点（adapter: 'scrape'，FreeOK / 麦田影视 / 66大片）与 js/customer_site.js 中的追加源。
// 追影猫(zhuiyingmiao4.com) 为导航站，本身无播放源，这里接入的是它导流的第三方播放源中可用的几个。
const API_SITES = {
    dyttzy: {
        api: 'http://caiji.dyttzyapi.com/api.php/provide/vod',
        name: '电影天堂资源',
        // detail 页面有 WAF 人机验证，改用 JSON 详情接口（已确认返回 m3u8 直链）
    },
    bfzy: {
        api: 'https://bfzyapi.com/api.php/provide/vod',
        name: '暴风资源',
        filterByTitle: true, // 站点搜索为多字段/单字模糊匹配，需按标题过滤
    },
    ffzy: {
        api: 'http://ffzy5.tv/api.php/provide/vod',
        name: '非凡影视',
        // detail 页面抓取会混入 3 个播放源共 600 条地址，改用 JSON 详情接口（200 集 m3u8）
    },
    zy360: {
        api: 'https://360zy.com/api.php/provide/vod',
        name: '360资源',
    },
    jisu: {
        api: 'https://jszyapi.com/api.php/provide/vod',
        name: '极速资源',
        // detail 页面无 m3u8 直链，改用 JSON 详情接口（已确认返回 m3u8 直链）
    },
    mdzy: {
        api: 'https://www.mdzyapi.com/api.php/provide/vod',
        name: '魔都资源',
    },
    baidu: {
        api: 'https://api.apibdzy.com/api.php/provide/vod',
        name: '百度云资源'
    },
    lzi: {
        api: 'https://cj.lziapi.com/api.php/provide/vod/',
        name: '量子资源站',
        filterByTitle: true, // 站点搜索为多字段/单字模糊匹配，需按标题过滤
    },
    // 追影猫(https://www.zhuiyingmiao4.com) 是“茶杯狐式”导航站：本身没有播放源，只把影片导流到第三方站点。
    // 以下为其中可用的第三方播放源（均已验证 搜索 + 播放 可用）：
    // 共青春：标准苹果CMS 采集接口，直链 m3u8
    gqc7: {
        api: 'https://gqc7.top/api.php/provide/vod',
        name: '共青春',
    },
    // 麦田影视：采集接口关闭，退回 suggest 搜索 + 详情页/播放页解析，播放页 player_aaaa 里是 m3u8 直链。
    // 注意：部分片源是加密 token(如 NBY-xxx) 或空选集，这类取不到地址会提示“未能解析到播放地址”。
    mtyy7: {
        api: 'https://www.mtyy7.com',
        name: '麦田影视',
        adapter: 'scrape',
        searchPath: '/index.php/ajax/suggest?mid=1&wd={query}&limit=100',
        detailPagePath: '/voddetail/{id}.html',
        playPagePath: '/vodplay/{id}-{sid}-{nid}.html',
    },
    // 66大片：同麦田影视，但播放页地址是 base64+百分号编码，适配器会自动解码。
    // 注意：部分条目只有优酷等平台网页链接（解码后不是流地址，已自动跳过）。
    dpw66: {
        api: 'https://www.66dpw.vip',
        name: '66大片',
        adapter: 'scrape',
        searchPath: '/index.php/ajax/suggest?mid=1&wd={query}&limit=100',
        detailPagePath: '/voddetail/{id}.html',
        playPagePath: '/vodplay/{id}-{sid}-{nid}.html',
    },

    // FreeOK：官方域名 freeok.vip 已失效（权威 DNS 指向 www.huawei.com，TLS 握手被拒），以下为当前可用镜像。
    // 该站关闭了标准采集接口（/api.php/provide/vod 返回 closed），只提供 suggest 搜索与网页播放页，
    // 因此由 api.js 中 adapter: 'scrape' 的专用适配处理：搜索字段映射 + 逐集解析播放页 + 补 /index.m3u8。
    freeok: {
        api: 'https://www.freeokgw.com',
        name: 'FreeOK',
        adapter: 'scrape',
        // 搜索：一次取全（limit=100），返回字段为 {id, name, pic}
        searchPath: '/index.php/ajax/suggest?mid=1&wd={query}&limit=100',
        // 详情页：只提供剧集链接 /K/{id}-{sid}-{nid}.html
        detailPagePath: '/O/{id}.html',
        // 播放页：内含 player_aaaa JSON，其 url 再补 /index.m3u8 即为直链
        playPagePath: '/K/{id}-{sid}-{nid}.html',
    },

    // ===== 以下站点探测不可用/暂不接入（如需恢复，删掉对应注释符即可） =====
    // dgjiawu.com（NO视频镜像）：域名解析正常(154.211.102.65)，但 80/443 连接被拒；曾短暂可访问一次，
    //   期间 /api.php/provide/vod、/index.php/ajax/suggest 均返回 404，接口无法确认，暂不接入。
    // dgjiawu: {
    //     api: 'https://www.dgjiawu.com/api.php/provide/vod',
    //     name: 'NO视频',
    // },
    // 如意资源：TLS 握手/HTTP 连接被重置（ECONNRESET），无法访问
    // ruyi: {
    //     api: 'https://cj.rycjapi.com/api.php/provide/vod',
    //     name: '如意资源',
    // },
    // 天涯资源：搜索接口返回“暂不支持搜索”，换用其它参数均忽略关键词（返回全站列表）
    // tyyszy: {
    //     api: 'https://tyyszy.com/api.php/provide/vod',
    //     name: '天涯资源',
    // },
    // 小猫咪资源：域名 zy.xmm.hk 已无解析记录（NXDOMAIN）
    // xiaomaomi: {
    //     api: 'https://zy.xmm.hk/api.php/provide/vod',
    //     name: '小猫咪资源',
    // },
    // 黑木耳：json.heimuer.xyz 已跳转到域名停放页（welcome），API 不可用
    // heimuer: {
    //     api: 'https://json.heimuer.xyz/api.php/provide/vod',
    //     name: '黑木耳',
    // },
    // iqiyi资源：TLS 握手/HTTP 连接被重置（ECONNRESET），无法访问
    // iqiyi: {
    //     api: 'https://www.iqiyizyapi.com/api.php/provide/vod',
    //     name: 'iqiyi资源',
    // },
    // 卧龙资源：API 地址返回与影视无关的 HTML 页面，无 JSON 数据
    // wolong: {
    //     api: 'https://wolongzyw.com/api.php/provide/vod',
    //     name: '卧龙资源',
    // },
    // 华为吧资源：域名已跳转到广告导航页（成人导航），API 不可用
    // hwba: {
    //     api: 'https://cjhwba.com/api.php/provide/vod',
    //     name: '华为吧资源',
    // },
    // 豆瓣资源：域名 dbzy.tv 已无解析记录（NXDOMAIN）
    // dbzy: {
    //     api: 'https://dbzy.tv/api.php/provide/vod',
    //     name: '豆瓣资源',
    // },
    // 魔爪资源：API 地址返回与影视无关的 HTML 页面，无 JSON 数据
    // mozhua: {
    //     api: 'https://mozhuazy.com/api.php/provide/vod',
    //     name: '魔爪资源',
    // },
    // 最大资源：搜索忽略关键词，任何参数都返回全站列表（pagecount 6299，首条与关键词无关）
    // zuid: {
    //     api: 'https://api.zuidapi.com/api.php/provide/vod',
    //     name: '最大资源'
    // },
    // 樱花资源：ac= 参数请求被 nginx 403 拦截，?q= 忽略关键词（返回全站列表）
    // yinghua: {
    //     api: 'https://m3u8.apiyhzy.com/api.php/provide/vod',
    //     name: '樱花资源'
    // },
    // 无尽资源：Cloudflare 人机验证（403 Just a moment），代理无法获取数据
    // wujin: {
    //     api: 'https://api.wujinapi.me/api.php/provide/vod',
    //     name: '无尽资源'
    // },
    // 旺旺短剧：TCP 连接超时，无法访问
    // wwzy: {
    //     api: 'https://wwzy.tv/api.php/provide/vod',
    //     name: '旺旺短剧'
    // },
    // iKun资源：域名被解析到 0.0.0.0/解析失败（ENOENT），无法访问
    // ikun: {
    //     api: 'https://ikunzyapi.com/api.php/provide/vod',
    //     name: 'iKun资源'
    // },
    //ARCHIVE https://telegra.ph/APIs-08-12
};

// 定义合并方法
function extendAPISites(newSites) {
    Object.assign(API_SITES, newSites);
}

// 暴露到全局
window.API_SITES = API_SITES;
window.extendAPISites = extendAPISites;


// 添加聚合搜索的配置选项
const AGGREGATED_SEARCH_CONFIG = {
    enabled: true,             // 是否启用聚合搜索
    timeout: 8000,            // 单个源超时时间（毫秒）
    maxResults: 10000,          // 最大结果数量
    parallelRequests: true,   // 是否并行请求所有源
    showSourceBadges: true    // 是否显示来源徽章
};

// 抽象API请求配置
const API_CONFIG = {
    search: {
        // 只拼接参数部分，不再包含 /api.php/provide/vod/
        // 支持 {query}/{page} 占位符；旧式“末尾直接拼接关键词”的写法仍然兼容
        path: '?ac=videolist&wd={query}',
        pagePath: '?ac=videolist&wd={query}&pg={page}',
        maxPages: 50, // 最大获取页数
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'application/json'
        }
    },
    detail: {
        // 只拼接参数部分
        path: '?ac=videolist&ids=',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'application/json'
        }
    }
};

// 按站点生成搜索 URL：优先使用站点自定义的 searchPath/pagePath，缺省使用 API_CONFIG
// siteKey 为内置站点 key 或自定义源 key（自定义源没有站点配置，直接走默认模板）
function buildSearchUrl(apiBaseUrl, siteKey, query, page) {
    const site = (!siteKey || siteKey.startsWith('custom_')) ? null : API_SITES[siteKey];
    const currentPage = Number(page) > 0 ? Number(page) : 1;

    let template;
    if (currentPage > 1) {
        template = (site && site.pagePath) || (site && site.searchPath) || API_CONFIG.search.pagePath;
    } else {
        template = (site && site.searchPath) || API_CONFIG.search.path;
    }

    let url = apiBaseUrl + template;
    if (url.includes('{query}')) {
        url = url.replace('{query}', encodeURIComponent(query));
    } else {
        // 兼容旧式模板：参数结尾直接拼接关键词
        url += encodeURIComponent(query);
    }
    if (url.includes('{page}')) {
        url = url.replace('{page}', String(currentPage));
    }
    return url;
}

// 部分站点（如 FreeOK 的 suggest 接口）返回 {id,name,pic} 这类简写字段，
// 这里统一补齐成页面渲染所需的 vod_* 字段
function normalizeVodItem(item) {
    if (!item || typeof item !== 'object') return item;
    if (item.vod_id === undefined && item.id !== undefined) item.vod_id = item.id;
    if (!item.vod_name && item.name) item.vod_name = item.name;
    if (!item.vod_pic && item.pic) item.vod_pic = item.pic;
    if (!item.vod_remarks && item.note) item.vod_remarks = item.note;
    return item;
}

// 优化后的正则表达式模式
const M3U8_PATTERN = /\$https?:\/\/[^"'\s]+?\.m3u8/g;

// 添加自定义播放器URL
const CUSTOM_PLAYER_URL = 'player.html'; // 使用相对路径引用本地player.html

// 增加视频播放相关配置
const PLAYER_CONFIG = {
    autoplay: true,
    allowFullscreen: true,
    width: '100%',
    height: '600',
    timeout: 15000,  // 播放器加载超时时间
    filterAds: true,  // 是否启用广告过滤
    autoPlayNext: true,  // 默认启用自动连播功能
    adFilteringEnabled: true, // 默认开启分片广告过滤
    adFilteringStorage: 'adFilteringEnabled' // 存储广告过滤设置的键名
};

// 增加错误信息本地化
const ERROR_MESSAGES = {
    NETWORK_ERROR: '网络连接错误，请检查网络设置',
    TIMEOUT_ERROR: '请求超时，服务器响应时间过长',
    API_ERROR: 'API接口返回错误，请尝试更换数据源',
    PLAYER_ERROR: '播放器加载失败，请尝试其他视频源',
    UNKNOWN_ERROR: '发生未知错误，请刷新页面重试'
};

// 添加进一步安全设置
const SECURITY_CONFIG = {
    enableXSSProtection: true,  // 是否启用XSS保护
    sanitizeUrls: true,         // 是否清理URL
    maxQueryLength: 100,        // 最大搜索长度
    // allowedApiDomains 不再需要，因为所有请求都通过内部代理
};

// 添加多个自定义API源的配置
const CUSTOM_API_CONFIG = {
    separator: ',',           // 分隔符
    maxSources: 5,            // 最大允许的自定义源数量
    testTimeout: 5000,        // 测试超时时间(毫秒)
    namePrefix: 'Custom-',    // 自定义源名称前缀
    validateUrl: true,        // 验证URL格式
    cacheResults: true,       // 缓存测试结果
    cacheExpiry: 5184000000,  // 缓存过期时间(2个月)
    adultPropName: 'isAdult' // 用于标记成人内容的属性名
};

// 隐藏内置黄色采集站API的变量
const HIDE_BUILTIN_ADULT_APIS = false;
