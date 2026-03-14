# AMEP 发布记录

## v1.0.0 发布状态

### 发布时间
2026-03-14

### 发布平台

| 平台 | 地址 | 状态 |
|------|------|------|
| npm | https://www.npmjs.com/package/amep-protocol | ✅ 已发布 |
| Gitee | https://gitee.com/ahive/amep | ✅ 已推送 |
| GitHub | https://github.com/iejoys/AMEP | ✅ 已同步 |

### 包信息

- **名称**: `amep-protocol`
- **版本**: `1.0.0`
- **大小**: 239.2 KB
- **文件数**: 51

### 安装方式

```bash
npm install amep-protocol
```

---

## 账号信息

| 平台 | 用户名 | 邮箱 |
|------|--------|------|
| npm | ahive | 8980188@qq.com |
| Gitee | ahive | 8980188@qq.com |
| GitHub | iejoys | 8980188@qq.com |

---

## SSH 密钥位置

| 平台 | 私钥路径 | 公钥 |
|------|----------|------|
| GitHub | `C:\Users\Admin\.ssh\id_ed25519_github` | `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPFiqe/Fk6oH6pZghyX5iGbcHN6b2r3b7QOcWDdc0We8 8980188@qq.com` |
| Gitee | `C:\Users\Admin\.ssh\id_ed25519_gitee` | `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJDcOe5TiLA6lhsfrmXS58MLTyJGXqieJwPbkRaVUWEw 8980188@qq.com` |

---

## Token 配置

### GitHub Token

- 用途：Gitee 同步到 GitHub
- 权限：`Contents: Read and write`, `Workflows: Read and write`
- 仓库：`iejoys/AMEP`
- 配置位置：Gitee 仓库设置 → 强制同步

### npm Token

- 用途：发布到 npm
- 类型：Granular Access Token
- 权限：`Packages: Read and write`
- 过期：90 天
- 配置位置：GitHub Secrets → `NPM_TOKEN`

---

## 后续更新流程

### 1. 代码修改后

```bash
# 1. 更新版本号
npm version patch  # 或 minor / major

# 2. 构建
npm run build

# 3. 提交代码
git add .
git commit -m "fix: 修复描述"
git push origin main

# 4. 发布到 npm
npm publish
```

### 2. 版本号规则

| 命令 | 版本变化 | 适用场景 |
|------|----------|----------|
| `npm version patch` | 1.0.0 → 1.0.1 | Bug 修复 |
| `npm version minor` | 1.0.0 → 1.1.0 | 新功能，向后兼容 |
| `npm version major` | 1.0.0 → 2.0.0 | 破坏性变更 |

### 3. 同步流程

```
本地修改 → 推送到 Gitee → Gitee 自动同步到 GitHub
                ↓
          npm publish（手动）
```

---

## 注意事项

### 发布前检查

- [ ] 更新 `package.json` 版本号
- [ ] 运行 `npm run build` 编译
- [ ] 运行 `npm test` 测试（如有）
- [ ] 更新 `README.md` 和 `USAGE.md`（如有变更）
- [ ] 提交所有更改到 Git

### 发布时注意

1. **npm Token 过期**：90 天后需重新生成并更新 GitHub Secrets
2. **GitHub 同步失败**：检查 Gitee 同步设置里的 Token 是否有效
3. **版本已存在**：npm 不允许重复发布相同版本，必须更新版本号

### Git 分支

- 主分支：`main`
- 不要使用 `master`（已删除）

### 敏感信息

- ❌ 不要提交 Token、密码到代码仓库
- ❌ 不要在 `package.json` 里写 Token
- ✅ Token 存储在 GitHub Secrets

---

## 常见问题

### Q: npm publish 失败？

1. 检查是否已登录：`npm whoami`
2. 检查 Token 是否过期
3. 检查版本号是否已存在

### Q: GitHub 同步失败？

1. 检查 Gitee 同步设置里的 Token 权限
2. 确保 Token 有 `Contents` 和 `Workflows` 权限
3. 确保分支是 `main` 不是 `master`

### Q: 如何撤销已发布的版本？

```bash
npm unpublish amep-protocol@1.0.0 --force
```

⚠️ 只能在发布 24 小时内撤销

---

## 更新日志

### v1.0.0 (2026-03-14)

- 初始发布
- 修复 `parseRetrievalDecision` 正则，避免截断嵌套 JSON
- 双语文档（英文在前，中文在后）
- 水表模式支持
- BGE 向量检索
- 记忆提纯功能