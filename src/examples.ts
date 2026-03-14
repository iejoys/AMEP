/**
 * AMEP 使用示例 - 水表模式
 */

import { AMEP, LLMService, createAMEP, ChatOptions, ChatResult } from './index';

// ==========================================
// 示例 1: 水表模式（推荐）
// ==========================================

/**
 * 自定义 LLM 服务实现（水表模式）
 */
class MyLLMService implements LLMService {
  async chat(options: ChatOptions): Promise<ChatResult> {
    // 调用智能体的大模型接口
    const response = await fetch('http://localhost:18790/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: options.messages,
        userId: options.userId,
        agentId: options.agentId,
        appKey: options.appKey,
      }),
    });
    
    const data = await response.json() as any;
    return {
      content: data.reply || data.content || '',
      toolCalls: data.toolCalls,
    };
  }
  
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch('http://localhost:18790/health');
      return response.ok;
    } catch {
      return false;
    }
  }
}

async function waterMeterExample() {
  // 1. 创建 LLM 服务
  const llmService = new MyLLMService();

  // 2. 创建 AMEP 实例（水表模式）
  const amep = createAMEP({
    storage: { basePath: './data/amep/memory' },
    embedding: { modelType: 'bge-small-zh' },
  }, llmService);

  await amep.initialize();

  // 3. 智能体只需调用 processMessage
  const result = await amep.processMessage({
    message: '上一轮对话说了些什么？',
    userId: 'user_001',
    agentId: 'ahive',
    appKey: 'app_cluster_001',
    systemPrompt: '你是 AHIVE 智能体...',
  });

  // 4. 返回结果
  console.log('回复:', result.content);
  console.log('是否使用记忆:', result.memoryUsed);
  console.log('是否触发检索:', result.retrievalTriggered);

  await amep.close();
}

// ==========================================
// 示例 2: 基本使用（非水表模式）
// ==========================================

async function basicExample() {
  // 创建 AMEP 实例
  const amep = createAMEP({
    storage: {
      type: 'file',
      path: './data/amep/memory',
    },
    embedding: {
      modelType: 'bge-small',
    },
  });

  // 初始化
  await amep.initialize();

  // 创建会话
  const session = await amep.createSession({
    userId: 'user_001',
    agentId: 'openclaw',
  });

  console.log('创建会话:', session.id);

  // 添加消息
  await amep.addMessage(session.id, {
    role: 'user',
    content: '我喜欢用中文回复，特别是列表格式',
  });

  await amep.addMessage(session.id, {
    role: 'assistant',
    content: '好的，我会用中文和列表格式回复你。',
  });

  // 结束会话（触发提纯）
  const result = await amep.endSession(session.id);
  console.log('会话结束:', result);

  // 检索记忆
  const memories = await amep.search({
    query: '用户的语言偏好',
    userId: 'user_001',
    limit: 5,
  });

  console.log('检索结果:', memories);

  // 关闭服务
  await amep.close();
}

// ==========================================
// 示例 3: AHIVECORE 适配器
// ==========================================

/**
 * AHIVECORE LLM 服务适配器
 */
class AHIVECOREAdapter implements LLMService {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:18790') {
    this.baseUrl = baseUrl;
  }

  async chat(options: ChatOptions): Promise<ChatResult> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: options.messages,
        userId: options.userId,
        agentId: options.agentId,
        appKey: options.appKey,
      }),
    });

    const data = await response.json() as any;
    return {
      content: data.reply || data.content || '',
      toolCalls: data.toolCalls,
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

async function ahivecoreExample() {
  const llmService = new AHIVECOREAdapter('http://localhost:18790');

  const amep = createAMEP({
    storage: { basePath: './data/amep-memory' },
    embedding: { modelType: 'bge-small-zh' },
  }, llmService);

  await amep.initialize();

  // 水表模式处理消息
  const result = await amep.processMessage({
    message: '你好',
    userId: 'default_user',
    agentId: 'ahive',
    appKey: 'default',
    systemPrompt: '你是 AHIVE 智能体',
  });

  console.log(result.content);

  await amep.close();
}

// ==========================================
// 示例 4: 完整对话流程
// ==========================================

async function fullConversationExample() {
  const amep = createAMEP();
  await amep.initialize();

  // 1. 用户开始对话
  const session = await amep.createSession({
    userId: 'user_001',
    agentId: 'openclaw',
  });

  // 2. 对话过程
  const conversations = [
    { user: '你好', assistant: '你好！有什么可以帮你的？' },
    { user: '我喜欢用中文回复', assistant: '好的，我会用中文回复你。' },
    { user: '帮我写一个 Python 脚本', assistant: '好的，什么功能的脚本？' },
    { user: '爬虫脚本，抓取网页内容', assistant: '好的，我来帮你写一个 Python 爬虫脚本...' },
  ];

  for (const conv of conversations) {
    await amep.addMessage(session.id, { role: 'user', content: conv.user });
    await amep.addMessage(session.id, { role: 'assistant', content: conv.assistant });
  }

  // 3. 对话结束（用户离开）
  const result = await amep.endSession(session.id);
  console.log(`会话结束，提取了 ${result.memoriesCreated} 条记忆`);

  // 4. 下次对话时检索历史
  const memories = await amep.search({
    query: '用户喜欢什么语言',
    userId: 'user_001',
  });

  console.log('检索到的记忆:', memories.map(m => m.text));

  // 5. 获取统计信息
  const stats = await amep.getStats();
  console.log('统计信息:', stats);

  await amep.close();
}

// ==========================================
// 运行示例
// ==========================================

// basicExample().catch(console.error);
// waterMeterExample().catch(console.error);
// ahivecoreExample().catch(console.error);
// fullConversationExample().catch(console.error);

export {
  basicExample,
  waterMeterExample,
  ahivecoreExample,
  fullConversationExample,
  AHIVECOREAdapter,
  MyLLMService,
};