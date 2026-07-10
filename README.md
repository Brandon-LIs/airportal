# Airport 空投快传

> 一个基于 Cloudflare Workers 的文件快传网站，支持跨设备文件传输、邮箱注册、第三方登录、管理后台。

## 在线体验

https://airportal-clone.cloud-drive-zc.workers.dev/

> ⚠️ 演示站可能因网络原因无法从中国大陆直接访问。

## 功能特性

- **📤 发文件** — 拖拽/选择文件上传，支持有效期设置（1小时 ~ 7天），支持发送文本
- **📥 收文件** — 输入 6 位取件码下载文件
- **🔗 分享链接** — 生成 `/{code}/{key}` 格式的直接下载链接
- **👁️ 文件预览** — 集成 xdocin 预览引擎，支持 doc/docx/xls/xlsx/ppt/pptx/pdf 等 20+ 格式
- **🔐 邮箱注册/登录** — 支持邮箱验证码注册，自由注册无需审核
- **🔗 第三方登录** — 聚合登录（QQ/微信/支付宝/GitHub 等 12 种平台）
- **📁 我的文件** — 已登录用户可查看自己的上传历史
- **🎨 深色模式 + Bing 每日壁纸** — 可切换主题和背景
- **🛡️ 安全验证** — Cloudflare Turnstile 人机验证
- **👑 管理后台** — 管理员可查看/预览/删除所有文件，管理用户
- **🔄 双向绑定** — 第三方账号可绑定邮箱+密码，邮箱账号可绑定第三方

## 技术架构

```
┌─────────────────────────────────────────────────┐
│                 浏览器 (SPA)                     │
│          HTML + CSS + 原生 JavaScript           │
│            事件委托 + data-act 驱动              │
└──────────────────────┬──────────────────────────┘
                       │ HTTPS
┌──────────────────────▼──────────────────────────┐
│            Cloudflare Workers (单 Worker)        │
│  ┌─────────────┐  ┌──────────┐  ┌────────────┐ │
│  │ 路由分发 +   │  │ D1 数据库 │  │ R2 对象存储│ │
│  │ HTML 渲染    │  │ (SQLite) │  │ (文件本体) │ │
│  └─────────────┘  └──────────┘  └────────────┘ │
└─────────────────────────────────────────────────┘
```

### 技术栈

| 组件 | 技术 |
|------|------|
| 前端 | 原生 HTML + CSS + JavaScript（SPA） |
| 后端 | Cloudflare Workers（ES Module） |
| 数据库 | Cloudflare D1（SQLite 兼容） |
| 存储 | Cloudflare R2（S3 兼容对象存储） |
| 认证 | PBKDF2 密码哈希 + Bearer Token 会话 |
| 验证 | Cloudflare Turnstile |
| 邮件 | luckycola.com.cn HTTP API |
| 第三方登录 | u.daib.cn 聚合登录 |
| 文件预览 | view.xdocin.com |
| 定时任务 | Cron Trigger（每日清理过期文件） |
| 部署 | Wrangler CLI |

## 快速部署

### 前置要求

- Node.js 18+
- Cloudflare 账号
- Wrangler CLI

### 1. 克隆并安装

```bash
git clone https://github.com/Brandon-LIs/airportal.git
cd airport
npm install
```

### 2. 创建资源

```bash
# D1 数据库
npx wrangler d1 create airportal-db

# R2 存储桶
npx wrangler r2 bucket create airportal-files
```

### 3. 配置 wrangler.toml

将上一步获得的 `database_id` 填入 `wrangler.toml`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "airportal-db"
database_id = "你的数据库 ID"

[[r2_buckets]]
binding = "R2"
bucket_name = "airportal-files"
```

### 4. 初始化数据库

```bash
npx wrangler d1 execute airportal-db --file=./migrations/0001_init.sql --remote
```

### 5. 部署

```bash
npx wrangler deploy
```

### 6. 配置环境变量（可选）

可通过 `wrangler.toml` 的 `[vars]` 或 `wrangler secret put` 配置：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ADMIN_EMAIL` | 管理员邮箱 | `bcihal@qq.com` |
| `ADMIN_PASSWORD` | 管理员密码 | `87543759` |
| `COLA_KEY` | luckycola 邮件 API Key | - |
| `SMTP_EMAIL` | SMTP 发信邮箱 | `bcihal@163.com` |
| `SMTP_CODE` | SMTP 授权码 | - |
| `SOCIAL_APPID` | 聚合登录 AppID | `2665` |
| `SOCIAL_KEY` | 聚合登录 AppKey | - |
| `TURNSTILE_KEY` | Turnstile 站点密钥 | `0x4AAAAAADx7IIs0jQJMgw5l` |

### 7. 登录管理后台

打开部署后的 URL，用以下账号登录：

- 邮箱：`bcihal@qq.com`
- 密码：`87543759`

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 邮箱注册（含验证码） |
| POST | `/api/auth/login` | 邮箱登录 |
| GET | `/api/auth/profile` | 用户信息 |
| POST | `/api/auth/send-code` | 发送邮箱验证码 |
| POST | `/api/auth/change-password` | 修改密码 |
| GET | `/api/auth/social-login?type=qq` | 获取第三方登录地址 |
| GET | `/api/auth/social-callback` | 第三方登录回调 |
| POST | `/api/airportal/send` | 上传文件 |
| POST | `/api/airportal/sendtext` | 发送文本 |
| POST | `/api/airportal/receive` | 通过取件码获取文件 |
| GET | `/api/airportal/get/:key` | 获取文件信息 |
| GET | `/api/airportal/download/:key` | 下载文件 |
| GET | `/api/user/history` | 我的文件历史 |
| POST | `/api/user/bind-email` | 绑定邮箱 |
| GET | `/api/user/bind-social-start` | 绑定第三方账号 |
| GET | `/api/admin/files` | 所有文件记录（管理） |
| GET | `/api/admin/users` | 用户列表（管理） |
| DELETE | `/api/admin/files/:id` | 删除文件（管理） |
| DELETE | `/api/admin/users/:id` | 删除用户（管理） |

## 数据库结构

```sql
users        (id, email, password_hash, role, nickname, social_type, social_uid, created_at)
files        (id, code, key, filename, filesize, content_type, r2_path, expires_at, ...)
sessions     (id, user_id, token, created_at)
verification_codes (id, email, code, expires_at, used, created_at)
```

## 项目结构

```
airport/
├── src/
│   ├── index.js       # Worker 入口 + API 路由 + 业务逻辑
│   └── html.js        # 前端 SPA HTML/CSS/JS 模板
├── migrations/
│   ├── 0001_init.sql  # 初始数据库结构
│   └── 0002_add_social.sql  # 第三方登录字段
├── wrangler.toml      # Cloudflare 配置
└── package.json
```

## License

MIT
