# Cloudflare Pages 发布

游戏是Vite静态站，模型请求由浏览器发往玩家配置的API地址，没有Vercel专属后端。使用Cloudflare Pages Direct Upload发布本地构建的`dist`，无需在CF云端构建。发布命令固定Wrangler版本，避免上传工具升级影响复现。

## 首次连接

```powershell
npx --yes wrangler@4.131.2 login --scopes account:read user:read pages:write
npx --yes wrangler@4.131.2 pages project create farewell-web --production-branch=master --force
```

已有同名项目时先用`pages project list`核对项目归属与用途，再部署。账号授权保存在Wrangler本机配置中，不提交令牌到仓库。

Wrangler 4.131.2在Agent环境中会尝试把新建Pages项目转向Workers；首次创建加`--force`明确使用Pages静态项目。该选项在此处只关闭产品转向，后续对已存在项目发布不需要它。

## 发布与检查

```powershell
npm run deploy:cloudflare
```

命令会发布当前工作区构建出来的内容；`--branch=master`只指定Pages生产分支标签，不会替你检出Git的master。发布前需确认当前代码就是要上线的版本。

`public/_headers`随Vite构建进入`dist`，保留CSP等响应头、资源清单强制更新与素材缓存规则。没有顶层`404.html`，由Pages默认SPA回退处理深链接，不需要新增Worker或Functions。

发布后检查：首页与深链接HTTP200；入口JS/CSS、资源清单、开场视频和结局文本可读；安全响应头与清单缓存头正确；线上已修改文本/脚本与本地SHA256相同。

```powershell
node scripts/verify-cloudflare-deployment.mjs https://farewell-web.pages.dev
```

该命令核对28个脚本/样式/清单/结局文件的SHA256，另检查深链接、视频和响应头，结果写入本地`.codex-test-tmp/cloudflare-production-verification.json`。

## 数据与后续维护

不同域名的浏览器IndexedDB/localStorage互相隔离。新地址需要重新配置API，旧存档和结局收藏仍保留在原域名；当前应用没有存档整库导出/导入入口，因此不会自动迁移。若API供应商限制请求来源，需允许新Pages域名。

Direct Upload项目以后仍可通过此命令或自建CI发布；不能直接切换成Cloudflare内建Git集成项目。需要内建Git自动部署时应创建新的Git集成项目。

部署状态：本地生产构建通过，Wrangler本地预览的28文件核验通过，首页、深链接和视频可访问，CSP与缓存规则正确。账号已授权，`farewell-web` Pages项目已创建，生产分支为master，等待首次上传与线上核验。

依据：[Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)、[Headers](https://developers.cloudflare.com/pages/configuration/headers/)、[SPA回退](https://developers.cloudflare.com/pages/configuration/serving-pages/)。
