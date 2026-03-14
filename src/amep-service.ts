/**
 * AMEP 记忆服务 - 主入口
 * 
 * 集成会话管理、语义提纯、向量化、存储、检索
 * 支持双模式检索：主动检索 + 被动检索
 */

import { SessionService, SessionServiceConfig } from './session';
import { ExtractorService, ExtractorConfig, ExtractedMemory } from './extractor';
import { IStorageService, StorageServiceFactory } from './storage';
import { MDFileRetrievalService, RetrievalServiceFactory, ILLService } from './retrieval';
import { IEmbeddingService, EmbeddingServiceFactory } from './embedding';
import { FaissConfig, IFaissService } from './faiss';
import { ForgetManager, createForgetManager } from './forget';
import { ConfigLoader, DEFAULT_CONFIG } from './config';
import {
  AMEPConfig,
  Session,
  SessionMessage,
  MemoryEntry,
  MemoryType,
  CreateMemoryRequest,
  MemorySearchRequest,
  MemorySearchResult,
  SearchResult,
  ContextOptions,
  CompiledContext,
  IntentType,
  PassiveRetrievalDecision,
  RetrievalConfig,
  // 水表模式类型
  LLMService,
  ChatMessage,
  ChatOptions,
  ChatResult,
  ProcessMessageOptions,
  ProcessMessageResult,
  ToolCall,
} from './types';

/**
 * 双模式检索结果
 */
export interface ProcessQueryResult {
  /** 是否需要检索 */
  needRetrieval: boolean;
  /** 检索到的记忆 */
  memories?: SearchResult[];
  /** 被动检索判断结果 */
  decision?: PassiveRetrievalDecision;
  /** 检索模式 */
  mode?: 'active' | 'passive' | 'none';
}

/**
 * AMEP 记忆服务
 */
export class AMEP {
  private config: Required<AMEPConfig>;
  
  // 服务组件
  private sessionService: SessionService;
  private extractorService: ExtractorService;
  private storageService: IStorageService;
  private retrievalService: MDFileRetrievalService;
  private embeddingService: IEmbeddingService;
  private forgetManager?: ForgetManager;
  
  // LLM 服务（用于语义提纯和被动检索判断）
  private llmService?: LLMService;
  
  private initialized: boolean = false;

  constructor(config?: AMEPConfig, llmService?: LLMService) {
    // 使用 ConfigLoader 加载并合并配置
    this.config = ConfigLoader.load(config);
    this.llmService = llmService;

    // 初始化服务组件（传递时区配置）
    this.storageService = StorageServiceFactory.create(this.config.storage, this.config.timezone);
    
    this.embeddingService = EmbeddingServiceFactory.create({
      modelType: this.config.embedding.modelType || 'bge-small',
      ...this.config.embedding,
    });
    
    // 初始化检索服务（支持双模式 + Faiss + 时区）
    this.retrievalService = RetrievalServiceFactory.create(
      this.embeddingService,
      this.storageService,
      this.config.retrieval,
      llmService,
      this.config.faiss,  // 传递 Faiss 配置
      this.config.timezone  // 传递时区配置
    ) as MDFileRetrievalService;
    
    this.sessionService = new SessionService({
      storageDir: this.config.storage.cacheDir || './data/amep/cache',
      freshThreshold: this.config.session.freshThreshold || 3600,
      autoSaveInterval: this.config.session.autoSaveInterval || 30000,
      maxContextMessages: this.config.contextManagement?.maxContextMessages || 20,
      inactiveTimeout: this.config.inactiveProtection?.inactiveTimeout || 300,
      checkInterval: this.config.inactiveProtection?.checkInterval || 60,
    });
    
    this.extractorService = new ExtractorService({
      maxMemoriesPerSession: this.config.memory?.maxPerSession || 10,
    }, llmService);
  }

  /**
   * 初始化服务
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('[AMEP] 正在初始化服务...');

    await this.storageService.initialize();
    
    // 设置归档回调
    this.sessionService.setArchiveCallback(async (sessionId, messages) => {
      await this.handleArchive(sessionId, messages);
    });
    
    await this.sessionService.initialize();
    
    // 初始化 Faiss 索引
    if (this.config.faiss) {
      await this.retrievalService.initializeFaiss();
      await this.retrievalService.buildFaissIndex();
    }
    
    // 初始化遗忘机制
    if (this.config.forget?.enabled) {
      this.forgetManager = createForgetManager(
        this.storageService,
        this.retrievalService.getFaissService?.() || null,
        this.config.forget
      );
      this.forgetManager.start();
    }
    
    // 设置崩溃保护
    if (this.config.inactiveProtection?.enableSignalListener !== false) {
      this.setupCrashProtection();
    }

    this.initialized = true;
    console.log('[AMEP] 服务初始化完成');
  }

  /**
   * 关闭服务
   */
  async close(): Promise<void> {
    if (!this.initialized) return;

    // 停止遗忘机制
    if (this.forgetManager) {
      this.forgetManager.stop();
    }

    await this.sessionService.close();
    await this.storageService.close();
    this.initialized = false;
    console.log('[AMEP] 服务已关闭');
  }

  // ==========================================
  // 会话管理
  // ==========================================

  /**
   * 创建会话
   */
  async createSession(options: { userId: string; agentId: string }): Promise<Session> {
    await this.ensureInitialized();
    return this.sessionService.createSession(options);
  }

  /**
   * 获取会话
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessionService.getSession(sessionId);
  }

  /**
   * 添加消息
   */
  async addMessage(sessionId: string, message: { role: 'user' | 'assistant' | 'system'; content: string }): Promise<{ archived: boolean; archiveCount: number; currentCount: number }> {
    await this.ensureInitialized();
    const result = await this.sessionService.addMessage(sessionId, message);
    return result;
  }

  /**
   * 结束会话（保存记忆）
   * 根据 storageMode 配置决定保存原始对话还是摘要
   */
  async endSession(sessionId: string): Promise<{ sessionId: string; messageCount: number; memoriesCreated: number }> {
    await this.ensureInitialized();

    // 获取会话
    const session = await this.sessionService.endSession(sessionId);
    
    let memoriesCreated = 0;
    
    if (session.messages.length === 0) {
      return {
        sessionId: session.id,
        messageCount: session.messageCount,
        memoriesCreated: 0,
      };
    }

    const storageMode = this.config.memory?.storageMode || 'raw';
    console.log(`[AMEP] 结束会话: ${sessionId}, 存储模式: ${storageMode}`);

    if (storageMode === 'raw') {
      // 保存原始对话
      memoriesCreated = await this.saveRawDialogs(session);
    } else {
      // 保存摘要（LLM 提取）
      memoriesCreated = await this.saveSummaries(session);
    }

    return {
      sessionId: session.id,
      messageCount: session.messageCount,
      memoriesCreated,
    };
  }

  /**
   * 保存原始对话（Q&A 对）
   */
  private async saveRawDialogs(session: Session): Promise<number> {
    let count = 0;
    
    // 按 Q&A 对保存（用户问 + 助手答 = 一条记忆）
    for (let i = 0; i < session.messages.length; i++) {
      const msg = session.messages[i];
      if (msg.role === 'user') {
        const nextMsg = session.messages[i + 1];
        
        // 构建记忆内容（原始对话格式）
        let memoryContent: string;
        if (nextMsg && nextMsg.role === 'assistant') {
          memoryContent = `用户: ${msg.content}\n助手: ${nextMsg.content}`;
          i++; // 跳过下一条（助手消息）
        } else {
          // 只有用户消息，没有回复
          memoryContent = `用户: ${msg.content}`;
        }
        
        const embedding = await this.embeddingService.embed(memoryContent);
        
        const entry = await this.storageService.create(
          {
            agentId: session.agentId,
            userId: session.userId,
            type: 'context' as any,
            content: memoryContent,
            importance: 0.5,
            sessionId: session.id,
          },
          embedding.embedding
        );
        
        // 添加到 Faiss 索引
        this.retrievalService.addToFaissIndex(entry.id, embedding.embedding);
        
        count++;
      }
    }
    
    console.log(`[AMEP] 保存了 ${count} 条原始对话`);
    return count;
  }

  /**
   * 保存摘要（LLM 提取关键信息）
   */
  private async saveSummaries(session: Session): Promise<number> {
    let count = 0;
    
    const extractedMemories = await this.extractMemories(session.messages);
    
    for (const memory of extractedMemories) {
      const embedding = await this.embeddingService.embed(memory.content);
      
      const entry = await this.storageService.create(
        {
          agentId: session.agentId,
          userId: session.userId,
          type: memory.type,
          content: memory.content,
          importance: memory.importance,
          sessionId: session.id,
        },
        embedding.embedding
      );
      
      // 添加到 Faiss 索引
      this.retrievalService.addToFaissIndex(entry.id, embedding.embedding);
      
      count++;
    }
    
    console.log(`[AMEP] 保存了 ${count} 条摘要`);
    return count;
  }

  // ==========================================
  // 记忆检索
  // ==========================================

/**
    * 检索记忆
    */
  async search(options: { 
    query: string; 
    userId?: string; 
    agentId?: string; 
    timeRange?: string;  // 时间范围：今日/昨天/最近一周/具体日期
    limit?: number;
    threshold?: number;  // 可选：自定义阈值（不传则使用自适应阈值）
  }): Promise<SearchResult[]> {
    await this.ensureInitialized();

    const result = await this.retrievalService.search({
      query: options.query,
      userId: options.userId,
      agentId: options.agentId,
      timeRange: options.timeRange,
      limit: options.limit || this.config.retrieval.maxResults,
      // 不传 threshold，让检索服务使用自适应阈值
      ...(options.threshold !== undefined && { threshold: options.threshold }),
    });

    return result.results;
  }

  /**
   * 双模式检索处理
   * 
   * 主动检索：触发词驱动，快速响应
   * 被动检索：LLM 智能判断，无感知
   */
  async processQuery(
    message: string,
    options?: {
      userId?: string;
      agentId?: string;
    }
  ): Promise<ProcessQueryResult> {
    await this.ensureInitialized();

    // 使用检索服务的双模式处理
    const result = await this.retrievalService.processQuery(message, {
      userId: options?.userId,
      agentId: options?.agentId,
      llmService: this.llmService,
    });

    // 确定检索模式
    let mode: 'active' | 'passive' | 'none' = 'none';
    if (result.needRetrieval) {
      mode = result.decision ? 'passive' : 'active';
    }

    return {
      ...result,
      mode,
    };
  }

  /**
   * 构建上下文（注入 LLM）
   */
  async buildContext(options: ContextOptions): Promise<CompiledContext> {
    await this.ensureInitialized();

    const parts: string[] = [];
    let memoryCount = 0;
    let hasRecentSession = false;

    // 1. 使用双模式检索获取相关记忆
    const queryResult = await this.processQuery(options.currentQuery, {
      userId: options.userId,
      agentId: options.agentId,
    });

    if (queryResult.needRetrieval && queryResult.memories && queryResult.memories.length > 0) {
      parts.push('[相关记忆]');
      parts.push(...queryResult.memories.map(m => `- ${m.text}`));
      parts.push('');
      memoryCount = queryResult.memories.length;
    }

    // 2. 获取当前会话上下文
    if (options.includeRecentSession) {
      const recentSession = this.sessionService.getRecentSession(options.userId, options.agentId);
      if (recentSession && recentSession.messages.length > 0) {
        parts.push('[当前会话]');
        const recentMessages = recentSession.messages.slice(-10);
        parts.push(...recentMessages.map(m => 
          `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`
        ));
        hasRecentSession = true;
      }
    }

    const text = parts.join('\n');
    const estimatedTokens = Math.ceil(text.length / 4); // 粗略估算

    return {
      text,
      memoryCount,
      hasRecentSession,
      estimatedTokens,
    };
  }

  // ==========================================
  // 意图分类
  // ==========================================

  /**
   * 分类意图（使用检索服务）
   */
  classifyIntent(message: string): IntentType {
    return this.retrievalService.classifyIntent(message);
  }

  // ==========================================
  // 配置管理
  // ==========================================

  /**
   * 获取检索配置
   */
  getRetrievalConfig(): RetrievalConfig {
    return this.config.retrieval;
  }

  /**
   * 设置 LLM 服务（用于被动检索）
   */
  setLLMService(service: LLMService): void {
    this.llmService = service;
    this.retrievalService.setLLMService(service);
    this.extractorService.setLLMService(service);
  }

  // ==========================================
  // 启动上下文（记忆永续）
  // ==========================================

  /**
   * 获取启动时的上下文
   * 用于在智能体启动时自动加载最近的对话历史
   * 实现"记忆永续"的用户体验
   */
  async getStartupContext(options: {
    userId?: string;
    agentId?: string;
    maxMessages?: number;
  } = {}): Promise<{
    text: string;
    messageCount: number;
    lastSessionTime: Date | null;
    hasContext: boolean;
  }> {
    const userId = options.userId || 'default_user';
    const agentId = options.agentId || 'default';
    const maxMessages = options.maxMessages || 10;

    // 获取最近的对话上下文
    const recentContext = await this.sessionService.getRecentContext(userId, agentId, maxMessages);

    if (recentContext.messages.length === 0) {
      return {
        text: '',
        messageCount: 0,
        lastSessionTime: null,
        hasContext: false,
      };
    }

    // 构建上下文文本
    const lines: string[] = ['[最近对话]'];
    for (const msg of recentContext.messages) {
      const role = msg.role === 'user' ? '用户' : '助手';
      lines.push(`${role}: ${msg.content}`);
    }

    return {
      text: lines.join('\n'),
      messageCount: recentContext.messages.length,
      lastSessionTime: recentContext.timestamp,
      hasContext: true,
    };
  }

  /**
   * 构建初始上下文（启动时调用）
   * 组合：最近对话 + 相关记忆
   */
  async buildInitialContext(options: {
    userId?: string;
    agentId?: string;
    maxMessages?: number;
    includeMemories?: boolean;
  } = {}): Promise<{
    text: string;
    messageCount: number;
    memoryCount: number;
    lastSessionTime: Date | null;
  }> {
    const userId = options.userId || 'default_user';
    const agentId = options.agentId || 'default';

    const parts: string[] = [];
    let messageCount = 0;
    let memoryCount = 0;
    let lastSessionTime: Date | null = null;

    // 1. 获取最近对话
    const startupContext = await this.getStartupContext(options);
    if (startupContext.hasContext) {
      parts.push(startupContext.text);
      parts.push('');
      messageCount = startupContext.messageCount;
      lastSessionTime = startupContext.lastSessionTime;
    }

    // 2. 获取相关记忆（可选）
    if (options.includeMemories !== false) {
      try {
        const stats = await this.getStats();
        if (stats.totalMemories > 0) {
          // 检索最近的记忆
          const recentMemories = await this.search({
            query: '最近的重要信息',
            userId,
            agentId,
            limit: 5,
          });

          if (recentMemories.length > 0) {
            parts.push('[相关记忆]');
            parts.push(...recentMemories.map(m => `- ${m.text}`));
            memoryCount = recentMemories.length;
          }
        }
      } catch (e) {
        console.error('[AMEP] 检索记忆失败:', e);
      }
    }

    return {
      text: parts.join('\n'),
      messageCount,
      memoryCount,
      lastSessionTime,
    };
  }

  // ==========================================
  // 水表模式（智能体 ↔ AMEP ↔ LLM）
  // ==========================================

  /**
   * 处理消息（水表模式）
   * 
   * 智能体只需调用此方法，AMEP 完全接管消息流：
   * 1. 记录用户消息
   * 2. 被动检索判断（内部调用 LLM）
   * 3. 检索记忆（如果需要）
   * 4. 构建上下文
   * 5. 调用 LLM 生成回复
   * 6. 记录助手回复
   * 7. 返回结果
   */
  async processMessage(options: ProcessMessageOptions): Promise<ProcessMessageResult> {
    await this.ensureInitialized();

    const userId = options.userId || 'default_user';
    const agentId = options.agentId || 'default';
    // appKey: 业务标识符（非安全密钥），用于区分不同的应用/集群
    const appKey = options.appKey || 'default';
    const message = options.message;
    const systemPrompt = options.systemPrompt || '';

    console.log(`[AMEP] 水表模式处理消息: userId=${userId}, agentId=${agentId}, appKey=${appKey}`);

    // 1. 获取或创建会话
    let session = this.sessionService.getRecentSession(userId, agentId);
    if (!session) {
      session = await this.sessionService.createSession({ userId, agentId });
      console.log(`[AMEP] 创建新会话: ${session.id}`);
    }

    // 2. 记录用户消息
    await this.sessionService.addMessage(session.id, {
      role: 'user',
      content: message,
    });

    // 3. 构建带检索判断指令的系统提示词
    const retrievalPrompt = this.buildRetrievalPrompt();
    const currentSessionContext = this.getSessionContext(session);

    const fullSystemPrompt = systemPrompt + '\n\n' + retrievalPrompt + currentSessionContext;

    // 4. 第1次调用 LLM（合并检索判断 + 回复）
    console.log('[AMEP] 调用 LLM（含检索判断指令）');

    const messages: ChatMessage[] = [
      { role: 'system', content: fullSystemPrompt },
      { role: 'user', content: message },
    ];

    // 记录发送的上下文
    console.log('[AMEP] 发送上下文:', JSON.stringify({
      systemPromptLength: systemPrompt.length,
      retrievalPromptLength: retrievalPrompt.length,
      sessionContextLength: currentSessionContext.length,
      userMessage: message,
    }, null, 2));

    const chatResult = await this.llmService!.chat({
      messages,
      userId,
      agentId,
      appKey,
    });

    // 5. 解析返回结果
    const decision = this.parseRetrievalDecision(chatResult.content);
    
    let retrievalTriggered = false;
    let memoryContext = '';
    let memoryCount = 0;
    let finalContent = chatResult.content;

    if (decision.needRetrieval) {
      // 需要检索
      retrievalTriggered = true;
      console.log(`[AMEP] 需要检索: searchQuery=${decision.searchQuery}, timeRange=${decision.timeRange}`);

      // 检索记忆
      const searchQuery = decision.searchQuery || message;
      const memories = await this.search({
        query: searchQuery,
        userId,
        agentId,
        timeRange: decision.timeRange,
        limit: this.config.retrieval.maxResults || 5,
      });

      console.log('[AMEP] 检索结果:', JSON.stringify({
        query: searchQuery,
        timeRange: decision.timeRange,
        resultCount: memories.length,
      }, null, 2));

      // 第2次调用：带记忆上下文重新回复
      // 无论是否检索到记忆，都需要重新回复（不能返回 JSON）
      console.log('[AMEP] 第2次调用 LLM（带记忆上下文）');
      
      if (memories.length > 0) {
        memoryCount = memories.length;
        
        // 格式化记忆内容，提取关键信息
        const formattedMemories = memories.map((m: SearchResult, index: number) => {
          let text = m.text;
          
          // 提取时间
          const timeMatch = text.match(/时间:\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/);
          const time = timeMatch ? timeMatch[1] : '未知时间';
          
          // 提取对话内容
          const userMatch = text.match(/用户:\s*([\s\S]*?)(?=\n助手:|$)/);
          const assistantMatch = text.match(/助手:\s*([\s\S]*?)(?=\n---|$)/);
          
          const userContent = userMatch ? userMatch[1].trim() : '';
          const assistantContent = assistantMatch ? assistantMatch[1].trim() : '';
          
          return {
            index: index + 1,
            time,
            userContent,
            assistantContent,
            relevance: m.score ? `${(m.score * 100).toFixed(0)}%` : '-',
          };
        });
        
        // 构建条理化的记忆上下文
        memoryContext = `

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                    📚 历史记忆检索结果                              ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

共找到 ${memoryCount} 条相关记忆，按相关度排序：

${formattedMemories.map(m => `
【记忆 ${m.index}】(${m.time}) 相关度: ${m.relevance}
  用户问: ${m.userContent}
  助手答: ${m.assistantContent}
`).join('\n')}

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                         ⚠️ 使用指南                                 ┃
┠────────────────────────────────────────────────────────────────────┨
┃ 1. 以上记忆与你当前问题相关，请参考内容回答                          ┃
┃ 2. 优先使用相关度高的记忆（排在前面的）                              ┃
┃ 3. 保持与历史一致的称呼、语气、角色设定                              ┃
┃ 4. 不要说"根据记忆"或"检索到"等话术，自然融入即可                    ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

`;
      } else {
        // 没有检索到记忆，明确告知 LLM
        memoryContext = `

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                    📚 记忆检索结果                                  ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

未找到与用户问题相关的历史记忆。

请直接根据当前对话上下文回复用户，不要再返回 JSON 格式。

`;
        console.log('[AMEP] 未检索到相关记忆');
      }
      
      // 移除检索指令，避免 LLM 再次返回 JSON
      const systemPromptClean = this.removeRetrievalPrompt(systemPrompt);
      
      const messagesWithMemory: ChatMessage[] = [
        { role: 'system', content: systemPromptClean + memoryContext + currentSessionContext },
        { role: 'user', content: message },
      ];

      const resultWithMemory = await this.llmService!.chat({
        messages: messagesWithMemory,
        userId,
        agentId,
        appKey,
      });

      finalContent = resultWithMemory.content;
    } else {
      // 不需要检索，LLM 已直接回复
      console.log('[AMEP] 不需要检索，直接回复');
      if (decision.directResponse) {
        finalContent = decision.directResponse;
      }
    }

    // 6. 记录助手回复
    await this.sessionService.addMessage(session.id, {
      role: 'assistant',
      content: finalContent,
    });

    console.log(`[AMEP] 消息处理完成: retrievalTriggered=${retrievalTriggered}, memoryCount=${memoryCount}`);

    return {
      content: finalContent,
      toolCalls: chatResult.toolCalls,
      sessionId: session.id,
      memoryUsed: memoryCount > 0,
      retrievalTriggered,
    };
  }

  /**
   * 获取会话上下文
   */
  private getSessionContext(session: Session): string {
    if (!session.messages?.length) return '';
    
    const maxMessages = this.config.contextManagement?.maxContextMessages || 20;
    
    return '\n\n[当前会话]\n' + session.messages
      .slice(-maxMessages)
      .map(m => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
      .join('\n');
  }

  /**
   * 构建上下文限制声明
   */
  private buildContextLimitNotice(currentCount: number): string {
    if (!this.config.contextManagement?.declareContextLimit) {
      return '';
    }
    
    const maxMessages = this.config.contextManagement?.maxContextMessages || 20;
    const maxRounds = Math.floor(maxMessages / 2);
    
    if (currentCount <= maxMessages) {
      return '';  // 未超限，无需声明
    }
    
    return `

【上下文说明】
• 当前会话已有 ${currentCount} 条消息
• 系统仅附带最近 ${maxRounds} 轮对话
• 更早的对话已自动保存为记忆
• 如需引用更早的内容，请使用检索功能

`;
  }

  /**
   * 构建检索判断提示词（嵌入到系统提示词中）
   */
  private buildRetrievalPrompt(): string {
    const maxMessages = this.config.contextManagement?.maxContextMessages || 20;
    const maxRounds = Math.floor(maxMessages / 2);
    const retentionDays = this.config.storage?.retentionDays || 90;
    
    return `【记忆检索指令】

┌─────────────────────────────────────────────────────────────┐
│  上下文窗口限制                                              │
├─────────────────────────────────────────────────────────────┤
│  • 当前仅附带最近 ${maxRounds} 轮对话                        │
│  • 系统保存着最近 ${retentionDays} 天的对话记忆              │
│  • 更早的对话已自动归档为记忆摘要                            │
└─────────────────────────────────────────────────────────────┘

## 什么时候需要检索？

当用户消息涉及以下情况，且当前上下文中找不到相关信息时：

1. **时间指代** - "上次"、"之前"、"昨天"、"上周"
2. **延续话题** - 继续讨论过的项目、任务、决策
3. **询问历史** - "我们说过什么"、"你建议过什么"
4. **信息缺失** - 用户提到的内容不在当前对话中

## 如何检索？

返回以下 JSON 格式（只需一行）：

\`\`\`json
{
  "needRetrieval": true,
  "searchQuery": "关键词（不含时间词）",
  "timeRange": "时间范围"
}
\`\`\`

### timeRange 可选值：
| 值 | 含义 |
|---|---|
| "今日" | 今天的记忆 |
| "昨天" | 昨天的记忆 |
| "最近一周" | 最近7天 |
| "最近一个月" | 最近30天 |
| "最近三个月" | 最近90天 |

如果不需要检索，直接正常回复用户即可。

`;
  }

  /**
   * 移除检索判断提示词
   * 第2次调用时使用，避免 LLM 再次返回 JSON
   */
  private removeRetrievalPrompt(systemPrompt: string): string {
    // 移除【记忆检索指令】块
    const retrievalPromptRegex = /【记忆检索指令】[\s\S]*?如果不需要检索，直接正常回复用户即可。[\s]*/;
    return systemPrompt.replace(retrievalPromptRegex, '');
  }

  /**
   * 解析检索判断结果
   */
  private parseRetrievalDecision(response: string): PassiveRetrievalDecision {
    try {
      // 只匹配包含 needRetrieval 的 JSON（避免误匹配工具调用的嵌套 JSON）
      // 检索判断格式: {"needRetrieval": true/false, "searchQuery": "...", "timeRange": "..."}
      if (!response.includes('"needRetrieval"')) {
        // 没有 needRetrieval 字段，说明是普通回复（可能包含工具调用）
        return {
          needRetrieval: false,
          directResponse: response,
        } as PassiveRetrievalDecision & { directResponse: string };
      }
      
      // 尝试提取包含 needRetrieval 的 JSON
      // 使用更精确的正则，匹配以 {"needRetrieval" 开头的扁平对象
      const jsonMatch = response.match(/\{"needRetrieval"[^}]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          
          // 需要检索
          if (parsed.needRetrieval === true) {
            return {
              needRetrieval: true,
              searchQuery: parsed.searchQuery || parsed.keywords?.join(' ') || '',
              timeRange: parsed.timeRange,
              keywords: parsed.keywords,
              reason: parsed.reason,
            };
          }
          
          // needRetrieval: false（LLM 违反指令返回了 JSON）
          console.log('[AMEP] LLM 返回了 needRetrieval:false 的 JSON（应直接回复而非返回JSON）');
          return {
            needRetrieval: false,
            reason: parsed.reason,
          };
        } catch (parseError) {
          // JSON 解析失败，尝试提取关键信息
          if (response.includes('"needRetrieval"') && response.includes('true')) {
            const searchQueryMatch = response.match(/"searchQuery"\s*:\s*"([^"]+)"/);
            const timeRangeMatch = response.match(/"timeRange"\s*:\s*"([^"]+)"/);
            return {
              needRetrieval: true,
              searchQuery: searchQueryMatch?.[1] || '',
              timeRange: timeRangeMatch?.[1],
            };
          }
        }
      }
      
      // 没有匹配到有效的检索 JSON，当作普通回复
      return {
        needRetrieval: false,
        directResponse: response,
      } as PassiveRetrievalDecision & { directResponse: string };
      
    } catch (e) {
      console.error('[AMEP] 解析检索判断结果失败:', e);
    }
    
    return { needRetrieval: false };
  }

  // ==========================================
  // 统计信息
  // ==========================================

  /**
   * 获取统计信息
   */
  async getStats(): Promise<{
    activeSessions: number;
    totalMemories: number;
    embedding: { dimensions: number; cacheSize: number };
    faiss: { enabled: boolean; count: number; backend: string } | null;
    config: {
      activeRetrievalEnabled: boolean;
      passiveRetrievalEnabled: boolean;
      threshold: number;
      maxResults: number;
    };
  }> {
    const storageStats = await this.storageService.getStats();
    const faissStats = this.retrievalService.getFaissStats();
    
    return {
      activeSessions: this.sessionService.getActiveSessionCount(),
      totalMemories: storageStats.totalMemories,
      embedding: {
        dimensions: this.embeddingService.getDimensions(),
        cacheSize: 0,
      },
      faiss: faissStats ? {
        enabled: true,
        count: faissStats.count,
        backend: faissStats.backend,
      } : null,
      config: {
        activeRetrievalEnabled: this.config.retrieval.activeMode?.enabled ?? true,
        passiveRetrievalEnabled: this.config.retrieval.passiveMode?.enabled ?? true,
        threshold: this.config.retrieval.threshold ?? 0.5,
        maxResults: this.config.retrieval.maxResults ?? 10,
      },
    };
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    components: {
      storage: boolean;
      embedding: boolean;
      session: boolean;
      llm?: boolean;
    };
  }> {
    const storageHealthy = await this.storageService.getStats().then(() => true).catch(() => false);
    const embeddingHealthy = await this.embeddingService.healthCheck();
    const sessionHealthy = true;
    const llmHealthy = this.llmService ? await this.llmService.healthCheck().catch(() => false) : undefined;

    const allHealthy = storageHealthy && embeddingHealthy && sessionHealthy && (llmHealthy !== false);
    const someHealthy = storageHealthy || embeddingHealthy || sessionHealthy;

    return {
      status: allHealthy ? 'healthy' : someHealthy ? 'degraded' : 'unhealthy',
      components: {
        storage: storageHealthy,
        embedding: embeddingHealthy,
        session: sessionHealthy,
        llm: llmHealthy,
      },
    };
  }

  // ==========================================
  // 私有方法
  // ==========================================

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private async extractMemories(messages: SessionMessage[]): Promise<ExtractedMemory[]> {
    // 如果有 LLM 服务，使用它
    if (this.llmService) {
      try {
        const conversationText = messages
          .map(m => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
          .join('\n');

        const prompt = this.buildExtractionPrompt(conversationText);
        
        let response: string;
        if (this.llmService.generate) {
          response = await this.llmService.generate(prompt);
        } else {
          // 使用 chat 方法代替
          const result = await this.llmService.chat({
            messages: [{ role: 'user', content: prompt }],
          });
          response = result.content;
        }
        
        return this.parseExtractionResult(response);
      } catch (error) {
        console.error('[AMEP] LLM 提纯失败:', error);
        return this.fallbackExtraction(messages);
      }
    }

    // 使用内置提纯服务
    return this.extractorService.extract(messages);
  }

  private buildExtractionPrompt(conversation: string): string {
    return `请从以下对话中提取关键信息，生成简洁的记忆摘要。

提取规则：
1. 用户偏好（语言、格式、风格等）
2. 重要决策和结论
3. 项目相关信息
4. 错误教训和经验

格式要求：每条记忆一行，简洁明了。

对话内容：
${conversation}

请直接输出记忆列表：`;
  }

  private parseExtractionResult(response: string): ExtractedMemory[] {
    const memories: ExtractedMemory[] = [];
    const lines = response.split('\n').filter(line => line.trim());

    for (const line of lines) {
      const content = line.replace(/^[\d\-•*.]+\s*/, '').trim();
      if (content.length < 5 || content.length > 200) continue;

      memories.push({
        content,
        type: this.inferMemoryType(content),
        importance: 0.5,
      });
    }

    return memories;
  }

  private inferMemoryType(content: string): MemoryType {
    const lower = content.toLowerCase();

    if (lower.includes('偏好') || lower.includes('喜欢')) {
      return MemoryType.PREFERENCE;
    }
    if (lower.includes('错误') || lower.includes('失败')) {
      return MemoryType.LESSON;
    }
    if (lower.includes('项目') || lower.includes('任务')) {
      return MemoryType.EXPERIENCE;
    }

    return MemoryType.CONTEXT;
  }

  private fallbackExtraction(messages: SessionMessage[]): ExtractedMemory[] {
    const userMessages = messages.filter(m => m.role === 'user').slice(-3);

    return userMessages.map(m => ({
      content: m.content.length > 100 ? m.content.substring(0, 100) + '...' : m.content,
      type: MemoryType.CONTEXT,
      importance: 0.3,
    }));
  }

  // ==========================================
  // 实时归档处理
  // ==========================================

  /**
   * 处理归档（将消息转换为记忆并保存）
   */
  private async handleArchive(sessionId: string, messages: SessionMessage[]): Promise<void> {
    if (messages.length === 0) return;
    
    console.log(`[AMEP] 开始归档 ${messages.length} 条消息...`);
    
    try {
      // 获取会话信息
      const session = this.sessionService.getSession(sessionId);
      const userId = session?.userId || 'default_user';
      const agentId = session?.agentId || 'default';
      
      // 提取记忆
      const extractedMemories = await this.extractorService.extract(messages);
      
      if (extractedMemories.length === 0) {
        // 降级：直接使用原始消息
        extractedMemories.push(...this.fallbackExtraction(messages));
      }
      
      // 保存记忆并生成索引
      for (const memory of extractedMemories) {
        try {
          const embedding = await this.embeddingService.embed(memory.content);
          
          await this.storageService.create({
            userId,
            agentId,
            content: memory.content,
            importance: memory.importance,
            type: memory.type,
            sessionId,
          }, embedding.embedding);
          
          // 更新 Faiss 索引
          const memoryId = `mem_${Date.now().toString(36)}`;
          this.retrievalService.updateIndex(memoryId, embedding.embedding);
        } catch (e) {
          console.error('[AMEP] 保存记忆失败:', e);
        }
      }
      
      console.log(`[AMEP] 归档完成: ${extractedMemories.length} 条记忆已保存`);
    } catch (error) {
      console.error('[AMEP] 归档处理失败:', error);
    }
  }

  // ==========================================
  // 崩溃保护
  // ==========================================

  /**
   * 设置崩溃保护
   */
  private setupCrashProtection(): void {
    // 正常关闭信号
    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
    
    // 未捕获异常
    process.on('uncaughtException', (err) => {
      console.error('[AMEP] 未捕获异常:', err);
      this.gracefulShutdown('uncaughtException').catch(() => {
        process.exit(1);
      });
    });
    
    // 未处理的 Promise 拒绝
    process.on('unhandledRejection', (reason) => {
      console.error('[AMEP] 未处理的 Promise 拒绝:', reason);
    });
    
    console.log('[AMEP] 崩溃保护已启用');
  }

  /**
   * 优雅关闭
   */
  private async gracefulShutdown(reason: string): Promise<void> {
    console.log(`[AMEP] 收到 ${reason} 信号，正在关闭...`);
    
    try {
      await this.close();
      console.log('[AMEP] 优雅关闭完成');
      process.exit(0);
    } catch (err) {
      console.error('[AMEP] 关闭失败:', err);
      process.exit(1);
    }
  }
}

/**
 * 创建 AMEP 实例
 */
export function createAMEP(config?: AMEPConfig, llmService?: LLMService): AMEP {
  return new AMEP(config, llmService);
}

/**
 * 默认导出
 */
export default AMEP;