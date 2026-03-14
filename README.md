# AMEP Protocol

[![npm version](https://badge.fury.io/js/amep-protocol.svg)](https://www.npmjs.com/package/amep-protocol)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**AHIVE Memory Encoding Protocol** - Plug-and-play memory management for AI agents.

[中文文档](#-中文文档) | [Usage Guide](./USAGE.md)

---

## 📖 Overview

AMEP is a **plug-and-play memory management protocol library for AI agents**, providing memory storage, semantic retrieval, and context management capabilities.

### Core Features

| Feature | Description |
|---------|-------------|
| 🧠 Water Meter Mode | Full message flow management: record → retrieve → respond |
| 🔍 Semantic Retrieval | BGE vector search with time range filtering |
| 💾 Memory Persistence | Session recovery, automatic history loading |
| 🗜️ Memory Extraction | LLM-based key information extraction |
| 🌐 Multi-Backend | Local GGUF, Ollama, OpenAI-compatible APIs |

### Comparison with Other Solutions

| Feature | AMEP | LangChain Memory | Mem0 |
|---------|------|------------------|------|
| Zero-config startup | ✅ | ❌ | ❌ |
| Local model support | ✅ Built-in | ❌ | ❌ |
| Water Meter Mode | ✅ Fully managed | ❌ Manual | ⚠️ Partial |
| Chinese optimized | ✅ BGE-small-zh | ⚠️ Needs config | ⚠️ Needs config |
| Memory extraction | ✅ LLM automatic | ❌ | ✅ |
| Package size | ~1MB | ~50MB | ~10MB |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Your Agent                              │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    AMEP Water Meter Mode                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │  Record  │→│  Decide  │→│  Retrieve │→│ Call LLM │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
└─────────────────────────┬───────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │BGE Embed │    │Faiss Index│    │ MD Store │
    └──────────┘    └──────────┘    └──────────┘
```

### Message Flow

```
User Message
    │
    ▼
┌─────────────────┐
│ 1. Record User  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 2. Retrieval    │  ← LLM decides if retrieval needed
│    Decision     │
└────────┬────────┘
         │ Need?
    ┌────┴────┐
    │ Yes     │ No
    ▼         │
┌───────────┐ │
│ 3. Search │ │
└─────┬─────┘ │
      │       │
      ▼       │
┌───────────┐ │
│ 4. Context│ │
└─────┬─────┘ │
      │       │
      └───┬───┘
          ▼
┌─────────────────┐
│ 5. Call LLM     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 6. Record Reply │
└────────┬────────┘
         │
         ▼
    Return Response
```

---

## 📊 Performance

| Metric | Value | Description |
|--------|-------|-------------|
| Embedding speed | ~10ms | BGE-small-zh single query |
| Retrieval latency | <50ms | Faiss HNSW index |
| Memory compression | 85-90% | After LLM extraction |
| Memory usage | ~100MB | Including embedding model |
| Startup time | <2s | Cold start |

---

## 📦 Installation

```bash
# Basic installation (with mock embedding)
npm install amep-protocol

# Full installation (with BGE embedding model)
npm install amep-protocol @huggingface/transformers
```

---

## 🚀 Quick Start

### Basic Usage

```typescript
import { createAMEP } from 'amep-protocol';

const amep = createAMEP({
  storage: { basePath: './data/amep' },
});
await amep.initialize();

// Store memory
await amep.createMemory({
  userId: 'user-001',
  content: 'User prefers dark mode',
});

// Search memory
const memories = await amep.search({
  query: 'user preferences',
  userId: 'user-001',
});
```

### Water Meter Mode (Recommended)

```typescript
import type { LLMService } from 'amep-protocol';

// 1. Implement LLMService interface
const llmService: LLMService = {
  chat: async (options) => {
    const response = await yourLLM.chat(options.messages);
    return { content: response.content };
  },
};

// 2. Use water meter mode
const result = await amep.processMessage({
  message: 'What did we discuss yesterday?',
  userId: 'user-001',
  systemPrompt: 'You are a helpful assistant.',
  llmService,
});

console.log(result.content);            // LLM response
console.log(result.retrievalTriggered); // Whether retrieval was triggered
```

📖 **Full Usage Guide**: [USAGE.md](./USAGE.md)

---

## ⚙️ Configuration

```typescript
const amep = createAMEP({
  storage: {
    basePath: './data/amep',    // Storage path
    retentionDays: 90,          // Memory retention days
  },
  embedding: {
    modelType: 'bge-small-zh',  // Embedding model
  },
  retrieval: {
    maxResults: 5,              // Max retrieval results
  },
  session: {
    maxContextMessages: 20,     // Context message count
  },
});
```

---

## 🔧 API Reference

| Method | Description |
|--------|-------------|
| `initialize()` | Initialize the service |
| `createMemory(options)` | Store memory |
| `search(options)` | Search memories |
| `processMessage(options)` | Water meter mode - process message |
| `getStartupContext(options)` | Get startup context (restore history) |
| `endSession(sessionId)` | End session (trigger memory extraction) |

---

## ❓ FAQ

### Q: Why is it called "Water Meter Mode"?

Water Meter Mode means all messages flow through AMEP, just like water flows through a meter to be measured and recorded. AMEP automatically handles recording, retrieval, and LLM calls.

### Q: What embedding models are supported?

- **bge-small-zh**: Chinese optimized, 512 dimensions, ~100MB (recommended)
- **bge-m3**: Multilingual, 1024 dimensions
- **mock**: For testing, zero dependencies

### Q: How to integrate with local models?

```typescript
const llmService: LLMService = {
  chat: async (options) => {
    const response = await localModel.chat(options.messages);
    return { content: response.content };
  },
};
```

### Q: How is memory persisted?

By default, uses Markdown file storage with:
- User/agent isolation
- Automatic archiving
- 90-day retention

### Q: Does it support multi-user?

Yes. Use `userId` and `agentId` to distinguish different users and agents. Memories are completely isolated.

---

## 📄 License

MIT License © 2026 StarFuture Software Studio (AHIVE.CN)

---

---

## 📖 中文文档

**AMEP** (AHIVE Memory Encoding Protocol) 是一个**即插即用的智能体记忆管理协议库**，提供记忆存储、语义检索、上下文管理能力。

### 核心特性

| 特性 | 说明 |
|------|------|
| 🧠 水表模式 | 消息流全托管，自动完成记录→检索→回复 |
| 🔍 语义检索 | BGE 向量检索，支持时间范围过滤 |
| 💾 记忆永续 | 会话恢复，历史对话自动加载 |
| 🗜️ 记忆提纯 | LLM 提取关键信息，压缩存储 |
| 🌐 多后端支持 | 本地 GGUF、Ollama、OpenAI 兼容 API |

### 安装

```bash
npm install amep-protocol
```

### 快速开始

```typescript
import { createAMEP } from 'amep-protocol';

const amep = createAMEP();
await amep.initialize();

// 水表模式
const result = await amep.processMessage({
  message: '我们昨天聊了什么？',
  userId: 'user-001',
  llmService: myLLMService,
});
```

### 常见问题

**Q: 为什么叫"水表模式"？**

水表模式比喻所有消息流都经过 AMEP，就像自来水经过水表一样被计量和记录。

**Q: 支持哪些嵌入模型？**

- **bge-small-zh**: 中文优化（推荐）
- **bge-m3**: 多语言
- **mock**: 测试用

---

**定位**：智能体记忆管理的 "Windows DLL"