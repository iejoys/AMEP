# AMEP Integration Guide

## Quick Start

### 1. Installation

```bash
npm install amep-protocol
```

Optional (enable BGE embedding model):
```bash
npm install @huggingface/transformers
```

### 2. Create Service

```typescript
import { createAMEP } from 'amep-protocol';

const amep = createAMEP({
  storage: { basePath: './data/amep' },
});
await amep.initialize();
```

### 3. Basic Usage

```typescript
// Store memory
await amep.createMemory({
  userId: 'user-001',
  agentId: 'assistant',
  content: 'User prefers dark mode',
});

// Search memory
const memories = await amep.search({
  query: 'user preferences',
  userId: 'user-001',
});
```

---

## Water Meter Mode (Recommended)

In Water Meter Mode, AMEP fully manages the message flow: record → retrieval decision → retrieve → call LLM → record.

### Implement LLMService Interface

```typescript
import type { LLMService, ChatOptions, ChatResult } from 'amep-protocol';

const llmService: LLMService = {
  // Main chat method
  chat: async (options: ChatOptions): Promise<ChatResult> => {
    // Call your LLM (OpenAI, Claude, local model, etc.)
    const response = await yourLLM.chat(options.messages);
    
    return {
      content: response.content,
      toolCalls: response.toolCalls,  // Optional, for tool calling
    };
  },
  
  // Single turn generation (optional, for memory extraction)
  generate: async (prompt: string): Promise<string> => {
    return await yourLLM.generate(prompt);
  },
  
  // Health check (optional)
  healthCheck: async (): Promise<boolean> => {
    return true;
  },
};
```

### Use Water Meter Mode

```typescript
const result = await amep.processMessage({
  message: 'What did we discuss yesterday?',
  userId: 'user-001',
  agentId: 'assistant',
  systemPrompt: 'You are a helpful assistant.',
  llmService: llmService,  // Pass your LLM adapter
});

console.log(result.content);           // LLM response
console.log(result.retrievalTriggered); // Whether retrieval was triggered
console.log(result.memoryUsed);        // Whether memory was used
```

---

## Full Configuration

```typescript
const amep = createAMEP({
  // Storage config
  storage: {
    basePath: './data/amep',      // Storage path
    retentionDays: 90,            // Memory retention days
  },
  
  // Embedding model config
  embedding: {
    modelType: 'bge-small-zh',    // 'bge-small-zh' | 'bge-m3' | 'mock'
    modelPath: './models/bge',    // Optional, model path
  },
  
  // Retrieval config
  retrieval: {
    maxResults: 5,                // Max results to return
  },
  
  // Session config
  session: {
    maxContextMessages: 20,       // Max context messages
  },
  
  // Timezone config
  timezone: {
    timezone: 'Asia/Shanghai',
    locale: 'zh-CN',
  },
});
```

---

## API Reference

### Main Methods

| Method | Description |
|--------|-------------|
| `initialize()` | Initialize service |
| `createMemory(options)` | Store memory |
| `search(options)` | Search memories |
| `processMessage(options)` | Water meter mode - process message |
| `buildContext(options)` | Build context |
| `getStartupContext(options)` | Get startup context (restore history) |
| `endSession(sessionId)` | End session (trigger memory extraction) |

### LLMService Interface

```typescript
interface LLMService {
  // Required: Main chat method
  chat(options: ChatOptions): Promise<ChatResult>;
  
  // Optional: Single turn generation
  generate?(prompt: string): Promise<string>;
  
  // Optional: Health check
  healthCheck?(): Promise<boolean>;
}

interface ChatOptions {
  messages: ChatMessage[];
  userId?: string;
  agentId?: string;
  appKey?: string;
  isolated?: boolean;  // Isolated call, doesn't affect main session history
}

interface ChatResult {
  content: string;
  toolCalls?: ToolCall[];  // Tool calls (optional)
}
```

---

## FAQ

### Q: How to integrate with local models?

```typescript
import { createGGUFClient } from 'node-llama-cpp';

const llmService: LLMService = {
  chat: async (options) => {
    const client = createGGUFClient({ modelPath: './model.gguf' });
    const response = await client.chat(options.messages);
    return { content: response.content };
  },
};
```

### Q: How to integrate with OpenAI?

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const llmService: LLMService = {
  chat: async (options) => {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: options.messages,
    });
    return { content: response.choices[0].message.content };
  },
};
```

### Q: How to implement memory persistence?

Restore history on startup:
```typescript
const context = await amep.getStartupContext({
  userId: 'user-001',
  agentId: 'assistant',
  maxMessages: 10,
});

if (context.hasContext) {
  console.log('History:', context.text);
}
```

Trigger memory extraction on session end:
```typescript
await amep.endSession(sessionId);
```

---

## License

MIT License © 2026 StarFuture Software Studio (AHIVE.CN)

---

---

## 接入指南

## 快速开始

### 1. 安装

```bash
npm install amep-protocol
```

可选（启用 BGE 嵌入模型）：
```bash
npm install @huggingface/transformers
```

### 2. 创建服务

```typescript
import { createAMEP } from 'amep-protocol';

const amep = createAMEP({
  storage: { basePath: './data/amep' },
});
await amep.initialize();
```

### 3. 基本使用

```typescript
// 存储记忆
await amep.createMemory({
  userId: 'user-001',
  agentId: 'assistant',
  content: '用户喜欢深色模式',
});

// 检索记忆
const memories = await amep.search({
  query: '用户偏好',
  userId: 'user-001',
});
```

---

## 水表模式（推荐）

水表模式下，AMEP 完全接管消息流，自动完成：记录 → 检索判断 → 检索 → 调用 LLM → 记录。

### 实现 LLMService 接口

```typescript
import type { LLMService, ChatOptions, ChatResult } from 'amep-protocol';

const llmService: LLMService = {
  // 主对话方法
  chat: async (options: ChatOptions): Promise<ChatResult> => {
    // 调用你的 LLM（OpenAI、Claude、本地模型等）
    const response = await yourLLM.chat(options.messages);
    
    return {
      content: response.content,
      toolCalls: response.toolCalls,  // 可选，工具调用
    };
  },
  
  // 单轮生成（可选，用于记忆提纯）
  generate: async (prompt: string): Promise<string> => {
    return await yourLLM.generate(prompt);
  },
  
  // 健康检查（可选）
  healthCheck: async (): Promise<boolean> => {
    return true;
  },
};
```

### 使用水表模式

```typescript
const result = await amep.processMessage({
  message: '我们昨天聊了什么？',
  userId: 'user-001',
  agentId: 'assistant',
  systemPrompt: '你是一个友好的助手。',
  llmService: llmService,  // 传入你的 LLM 适配器
});

console.log(result.content);           // LLM 回复
console.log(result.retrievalTriggered); // 是否触发检索
console.log(result.memoryUsed);        // 是否使用了记忆
```

---

## 完整配置

```typescript
const amep = createAMEP({
  // 存储配置
  storage: {
    basePath: './data/amep',      // 存储路径
    retentionDays: 90,            // 记忆保留天数
  },
  
  // 嵌入模型配置
  embedding: {
    modelType: 'bge-small-zh',    // 'bge-small-zh' | 'bge-m3' | 'mock'
    modelPath: './models/bge',    // 可选，模型路径
  },
  
  // 检索配置
  retrieval: {
    maxResults: 5,                // 最大返回结果数
  },
  
  // 会话配置
  session: {
    maxContextMessages: 20,       // 上下文最大消息数
  },
  
  // 时区配置
  timezone: {
    timezone: 'Asia/Shanghai',
    locale: 'zh-CN',
  },
});
```

---

## API 参考

### 主要方法

| 方法 | 说明 |
|------|------|
| `initialize()` | 初始化服务 |
| `createMemory(options)` | 存储记忆 |
| `search(options)` | 检索记忆 |
| `processMessage(options)` | 水表模式处理消息 |
| `buildContext(options)` | 构建上下文 |
| `getStartupContext(options)` | 获取启动上下文（恢复历史对话）|
| `endSession(sessionId)` | 结束会话（触发记忆提纯）|

### LLMService 接口

```typescript
interface LLMService {
  // 必需：主对话方法
  chat(options: ChatOptions): Promise<ChatResult>;
  
  // 可选：单轮生成
  generate?(prompt: string): Promise<string>;
  
  // 可选：健康检查
  healthCheck?(): Promise<boolean>;
}

interface ChatOptions {
  messages: ChatMessage[];
  userId?: string;
  agentId?: string;
  appKey?: string;
  isolated?: boolean;  // 隔离调用，不影响主会话历史
}

interface ChatResult {
  content: string;
  toolCalls?: ToolCall[];  // 工具调用（可选）
}
```

---

## 常见问题

### Q: 如何与本地模型集成？

```typescript
import { createGGUFClient } from 'node-llama-cpp';

const llmService: LLMService = {
  chat: async (options) => {
    const client = createGGUFClient({ modelPath: './model.gguf' });
    const response = await client.chat(options.messages);
    return { content: response.content };
  },
};
```

### Q: 如何与 OpenAI 集成？

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const llmService: LLMService = {
  chat: async (options) => {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: options.messages,
    });
    return { content: response.choices[0].message.content };
  },
};
```

### Q: 如何实现记忆永续？

启动时恢复历史对话：
```typescript
const context = await amep.getStartupContext({
  userId: 'user-001',
  agentId: 'assistant',
  maxMessages: 10,
});

if (context.hasContext) {
  console.log('历史对话:', context.text);
}
```

会话结束时触发记忆提纯：
```typescript
await amep.endSession(sessionId);
```

---

## 许可证

MIT License © 2026 星未来软件工作室 (AHIVE.CN)