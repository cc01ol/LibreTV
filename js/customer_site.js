const CUSTOMER_SITES = {
    // ===== 2026-11-17 探测可用 =====
    // 玉兔资源：需使用标准 MacCMS 接口路径（原配置只写了域名，返回的是网页而非 JSON）
    yutu: {
        api: 'https://yutuzy10.com/api.php/provide/vod',
        name: '玉兔资源',
        adult: true
    },

    // ===== 以下站点 2026-11-17 探测不可用，已停用（如需恢复，删掉对应注释符即可） =====
    // 七七资源：TLS 握手/HTTP 连接被重置（ECONNRESET），无法访问
    // qiqi: {
    //     api: 'https://www.qiqidys.com/api.php/provide/vod',
    //     name: '七七资源',
    // },
    // CK资源：TLS 握手/HTTP 连接被重置（ECONNRESET），无法访问
    // ckzy: {
    //     api: 'https://www.ckzy1.com',
    //     name: 'CK资源',
    //     adult: true
    // },
    // jkun资源：域名被解析到 0.0.0.0，无法访问
    // jkun: {
    //     api: 'https://jkunzyapi.com',
    //     name: 'jkun资源',
    //     adult: true
    // },
    // 百万资源：域名解析失败（EAI_AGAIN/ESERVFAIL），无法访问
    // bwzy: {
    //     api: 'https://api.bwzym3u8.com',
    //     name: '百万资源',
    //     adult: true
    // },
    // souav资源：TLS 握手/HTTP 连接被重置（ECONNRESET），无法访问
    // souav: {
    //     api: 'https://api.souavzy.vip',
    //     name: 'souav资源',
    //     adult: true
    // },
    // 155资源：接口路径可达一次后持续被重置（ECONNRESET），当前网络不稳定可用
    // r155: {
    //     api: 'https://155api.com/api.php/provide/vod',
    //     name: '155资源',
    //     adult: true
    // },
    // lsb资源：TLS 握手/HTTP 连接被重置（ECONNRESET），无法访问
    // lsb: {
    //     api: 'https://apilsbzy1.com',
    //     name: 'lsb资源',
    //     adult: true
    // },
    // 黄色仓库：域名被解析到 0.0.0.0，无法访问
    // huangcang: {
    //     api: 'https://hsckzy.vip',
    //     name: '黄色仓库',
    //     adult: true,
    //     detail: 'https://hsckzy.vip'
    // },
};

// 调用全局方法合并
if (window.extendAPISites) {
    window.extendAPISites(CUSTOMER_SITES);
} else {
    console.error("错误：请先加载 config.js！");
}
