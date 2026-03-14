/**
 * 语义提纯服务
 * 
 * 从对话中提取关键信息，支持自定义 LLM 服务实现解耦
 */

import {
  SessionMessage,
  MemoryType,
  ChatOptions,
  ChatResult,
} from './types';

/**
 * LLM 服务接口 - 用于语义提纯
 * 
 * 实现此接口可以接入任何 LLM 服务（AHIVECORE、OpenAI、本地模型等）
 */
export interface LLMService {
  /**
   * 主对话方法
   */
  chat(options: ChatOptions): Promise<ChatResult>;
  
  /**
   * 单轮生成（可选，如果不实现则使用 chat 方法）
   */
  generate?(prompt: string): Promise<string>;
  
  /**
   * 健康检查（可选）
   */
  healthCheck?(): Promise<boolean>;
}

/**
 * 提纯服务配置
 */
export interface ExtractorConfig {
  /** 每次提取的最大记忆数 */
  maxMemoriesPerSession?: number;
  /** 自定义提取 Prompt 模板 */
  promptTemplate?: string;
}

/**
 * 提取的记忆
 */
export interface ExtractedMemory {
  /** 记忆内容 */
  content: string;
  /** 记忆类型 */
  type: MemoryType;
  /** 重要性 */
  importance: number;
}

/**
 * 默认提取 Prompt
 */
const DEFAULT_EXTRACTION_PROMPT = `请从以下对话中提取关键信息，生成简洁的记忆摘要。

提取规则：
1. 用户偏好（语言、格式、风格等）
2. 重要决策和结论
3. 项目相关信息
4. 错误教训和经验

格式要求：
- 每条记忆一行
- 使用自然语言，简洁明了
- 按重要性排序

对话内容：
{conversation}

请直接输出记忆列表，每行一条，不要其他说明。`;

/**
 * 提纯服务
 */
export class ExtractorService {
  private config: Required<ExtractorConfig>;
  private llmService: LLMService | null = null;
  private promptTemplate: string;

  constructor(config?: ExtractorConfig, llmService?: LLMService) {
    this.config = {
      maxMemoriesPerSession: config?.maxMemoriesPerSession || 10,
      promptTemplate: config?.promptTemplate || DEFAULT_EXTRACTION_PROMPT,
    };
    this.llmService = llmService || null;
    this.promptTemplate = this.config.promptTemplate;
  }

  /**
   * 设置 LLM 服务
   */
  setLLMService(service: LLMService): void {
    this.llmService = service;
  }

  /**
   * 从对话中提取关键信息
   */
  async extract(messages: SessionMessage[]): Promise<ExtractedMemory[]> {
    if (messages.length === 0) {
      return [];
    }

    // 格式化对话
    const conversationText = this.formatConversation(messages);

    // 如果有 LLM 服务，使用它
    if (this.llmService) {
      try {
        const prompt = this.promptTemplate.replace('{conversation}', conversationText);
        
        let response: string;
        if (this.llmService.generate) {
          response = await this.llmService.generate(prompt);
        } else {
          const result = await this.llmService.chat({
            messages: [{ role: 'user', content: prompt }],
          });
          response = result.content;
        }
        
        const memories = this.parseExtractionResult(response);
        return memories.slice(0, this.config.maxMemoriesPerSession);
      } catch (error) {
        console.error('[AMEP] LLM 提纯失败:', error);
        return this.fallbackExtraction(messages);
      }
    }

    // 无 LLM 服务，使用降级方案
    return this.fallbackExtraction(messages);
  }

  /**
   * 检查服务是否可用
   */
  async healthCheck(): Promise<boolean> {
    if (!this.llmService) return false;
    if (this.llmService.healthCheck) {
      return this.llmService.healthCheck();
    }
    return true;
  }

  // ==========================================
  // 私有方法
  // ==========================================

  private formatConversation(messages: SessionMessage[]): string {
    return messages
      .map(m => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
      .join('\n');
  }

  private parseExtractionResult(response: string): ExtractedMemory[] {
    const memories: ExtractedMemory[] = [];
    const lines = response.split('\n').filter(line => line.trim());

    for (const line of lines) {
      // 移除编号前缀
      const content = line.replace(/^[\d\-•*.]+\s*/, '').trim();

      if (content.length < 5) continue;
      if (content.length > 200) continue;

      const type = this.inferMemoryType(content);
      const importance = this.inferImportance(content);

      memories.push({
        content,
        type,
        importance,
      });
    }

    return memories;
  }

  private inferMemoryType(content: string): MemoryType {
    const lower = content.toLowerCase();

    if (lower.includes('偏好') || lower.includes('喜欢') || lower.includes('习惯')) {
      return MemoryType.PREFERENCE;
    }
    if (lower.includes('错误') || lower.includes('失败') || lower.includes('教训')) {
      return MemoryType.LESSON;
    }
    if (lower.includes('项目') || lower.includes('任务') || lower.includes('开发')) {
      return MemoryType.EXPERIENCE;
    }
    if (lower.includes('技能') || lower.includes('学习')) {
      return MemoryType.SKILL;
    }

    return MemoryType.CONTEXT;
  }

  private inferImportance(content: string): number {
    const importantKeywords = ['重要', '关键', '必须', '切记', '不要'];
    const lower = content.toLowerCase();

    for (const keyword of importantKeywords) {
      if (lower.includes(keyword)) {
        return 0.8;
      }
    }

    return 0.5;
  }

  private fallbackExtraction(messages: SessionMessage[]): ExtractedMemory[] {
    // 简单降级：提取用户消息作为记忆
    const userMessages = messages.filter(m => m.role === 'user');

    if (userMessages.length === 0) {
      return [];
    }

    // 只保留最后几条
    const recentMessages = userMessages.slice(-3);

    return recentMessages.map(m => ({
      content: m.content.length > 100 
        ? m.content.substring(0, 100) + '...' 
        : m.content,
      type: MemoryType.CONTEXT,
      importance: 0.3,
    }));
  }
}

/**
 * 创建提纯服务实例
 */
export function createExtractorService(config?: ExtractorConfig, llmService?: LLMService): ExtractorService {
  return new ExtractorService(config, llmService);
}