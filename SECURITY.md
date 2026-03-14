# Security Policy

[中文版](#-安全政策)

## 🔒 Security Policy

### Reporting a Vulnerability

If you discover a security vulnerability, please **do not** report it in a public Issue.

Contact us through:
- GitHub [Security Advisories](../../security/advisories/new)

### Supported Versions

| Version | Supported |
| ------- | --------- |
| 2.x     | ✅ Yes    |
| < 2.0   | ❌ No     |

### Security Best Practices

1. **API Key Management**
   - Store API keys in environment variables
   - Never hardcode keys in your code
   - Use `AMEP_API_KEY` environment variable

2. **Input Validation**
   - AMEP has built-in path traversal protection
   - `userId` and `agentId` are automatically sanitized

3. **Storage Security**
   - Storage paths are confined within `basePath`
   - `ensureSafePath()` prevents path injection

---

## 🔒 安全政策

### 报告安全漏洞

如果你发现了安全漏洞，请**不要**在公开 Issue 中报告。

请通过以下方式联系我们：
- GitHub [Security Advisories](../../security/advisories/new)

### 支持版本

| 版本 | 支持状态 |
|------|---------|
| 2.x  | ✅ 支持  |
| < 2.0 | ❌ 不支持 |

### 安全最佳实践

1. **API Key 管理**
   - 使用环境变量存储 API 密钥
   - 不要在代码中硬编码密钥
   - 使用 `AMEP_API_KEY` 环境变量

2. **输入验证**
   - AMEP 内置了路径遍历防护
   - `userId` 和 `agentId` 会自动过滤非法字符

3. **存储安全**
   - 存储路径在 `basePath` 内部，无法访问外部文件
   - 使用 `ensureSafePath()` 防止路径注入