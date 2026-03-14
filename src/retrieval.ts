/**
 * AMEP 检索服务 - 双模式检索实现
 * 
 * 主动检索：触发词驱动
 * 被动检索：LLM 智能判断
 */

import { IEmbeddingService, VectorUtils } from './embedding';
import { IStorageService } from './storage';
import { IFaissService, FaissService, FaissConfig } from './faiss';
import {
  MemorySearchRequest,
  MemorySearchResult,
  SearchResult,
  MemoryIndex,
  RetrievalConfig,
  ActiveRetrievalConfig,
  PassiveRetrievalConfig,
  PassiveRetrievalDecision,
  CachedDecision,
  IntentType,
  LLMConfig,
  ThresholdStrategyConfig,
  TimezoneConfig,
} from './types';
import { TimeUtils } from './time';
import { 
  DEFAULT_RETRIEVAL_CONFIG, 
  DEFAULT_TRIGGERS, 
  DEFAULT_TIME_WORDS,
  DEFAULT_PASSIVE_PROMPT,
  DEFAULT_LLM_CONFIG,
} from './config';

// ============================================
// LLM 服务接口
// ============================================

/**
 * LLM 服务接口 - 用于被动检索判断
 */
export interface ILLService {
  /**
   * 聊天接口
   * @param options.appKey - 业务标识符（非安全密钥），用于区分应用/集群
   */
  chat(options: { messages: Array<{ role: string; content: string }>; userId?: string; agentId?: string; appKey?: string }): Promise<{ content: string }>;
  generate?(prompt: string): Promise<string>;
  healthCheck?(): Promise<boolean>;
}

// ============================================
// 检索服务接口
// ============================================

export interface IRetrievalService {
  search(request: MemorySearchRequest): Promise<MemorySearchResult>;
  searchByVector(embedding: number[], options?: {
    agentId?: string;
    userId?: string;
    limit?: number;
    threshold?: number;
  }): Promise<SearchResult[]>;
  
  // 双模式检索
  processQuery(message: string, options: {
    agentId?: string;
    userId?: string;
    llmService?: ILLService;
  }): Promise<{
    needRetrieval: boolean;
    memories?: SearchResult[];
    decision?: PassiveRetrievalDecision;
  }>;
  
  // 意图分类
  classifyIntent(message: string): IntentType;
  
  // 更新索引
  updateIndex(id: string, embedding: number[]): void;
}

// ============================================
// 主动检索服务
// ============================================

export class ActiveRetrievalService {
  private config: Required<ActiveRetrievalConfig>;

  constructor(config?: ActiveRetrievalConfig) {
    this.config = {
      enabled: config?.enabled ?? true,
      triggers: config?.triggers ?? DEFAULT_TRIGGERS,
      timeWords: config?.timeWords ?? DEFAULT_TIME_WORDS,
      requireBoth: config?.requireBoth ?? true,
    };
  }

  /**
   * 检查是否触发主动检索
   */
  shouldTrigger(message: string): boolean {
    if (!this.config.enabled) return false;

    const hasTrigger = this.config.triggers.some(t => message.includes(t));
    
    if (!this.config.requireBoth) {
      return hasTrigger;
    }
    
    const hasTimeWord = this.config.timeWords.some(t => message.includes(t));
    return hasTrigger && hasTimeWord;
  }

  /**
   * 分类意图
   */
  classifyIntent(message: string): IntentType {
    if (this.shouldTrigger(message)) {
      return 'memory_query';
    }
    return 'normal_chat';
  }

  /**
   * 获取匹配的触发词
   */
  getMatchedTriggers(message: string): { triggers: string[]; timeWords: string[] } {
    const triggers = this.config.triggers.filter(t => message.includes(t));
    const timeWords = this.config.timeWords.filter(t => message.includes(t));
    return { triggers, timeWords };
  }
}

// ============================================
// 被动检索服务
// ============================================

export class PassiveRetrievalService {
  private config: Required<PassiveRetrievalConfig>;
  private llmService?: ILLService;
  private decisionCache: Map<string, CachedDecision> = new Map();
  private promptTemplate: string;

  constructor(config?: PassiveRetrievalConfig, llmService?: ILLService) {
    this.config = {
      enabled: config?.enabled ?? true,
      promptTemplate: config?.promptTemplate ?? DEFAULT_PASSIVE_PROMPT,
      enableCacheKey: config?.enableCacheKey ?? false,
      cacheDecision: config?.cacheDecision ?? false,
      cacheTTL: config?.cacheTTL ?? 3600,
      skipConditions: config?.skipConditions ?? {
        minMessageLength: 10,
        skipCommands: ['/', '#', '!'],
      },
    };
    this.llmService = llmService;
    this.promptTemplate = this.config.promptTemplate;
  }

  /**
   * 设置 LLM 服务
   */
  setLLMService(service: ILLService): void {
    this.llmService = service;
  }

  /**
   * 判断是否需要检索
   */
  async shouldRetrieve(message: string): Promise<PassiveRetrievalDecision> {
    if (!this.config.enabled) {
      return { needRetrieval: false };
    }

    // 检查跳过条件
    if (this.shouldSkip(message)) {
      return { needRetrieval: false };
    }

    // 检查缓存
    if (this.config.cacheDecision) {
      const cached = this.getCachedDecision(message);
      if (cached) {
        return cached;
      }
    }

    // 调用 LLM 判断
    if (this.llmService) {
      try {
        const decision = await this.getLLMDecision(message);
        
        // 缓存结果
        if (this.config.cacheDecision) {
          this.cacheDecision(message, decision);
        }
        
        return decision;
      } catch (error) {
        console.error('[AMEP] 被动检索 LLM 判断失败:', error);
        return this.fallbackDecision(message);
      }
    }

    // 无 LLM 服务，使用降级判断
    return this.fallbackDecision(message);
  }

  /**
   * 检查是否应该跳过
   */
  private shouldSkip(message: string): boolean {
    const conditions = this.config.skipConditions;
    
    // 检查消息长度
    if (conditions.minMessageLength && message.length < conditions.minMessageLength) {
      return true;
    }
    
    // 检查命令前缀
    if (conditions.skipCommands) {
      for (const cmd of conditions.skipCommands) {
        if (message.trim().startsWith(cmd)) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * 获取缓存的判断结果
   */
  private getCachedDecision(message: string): PassiveRetrievalDecision | null {
    // 使用简单的关键词匹配作为缓存键
    const cacheKey = this.getCacheKey(message);
    const cached = this.decisionCache.get(cacheKey);
    
    if (cached) {
      const now = Date.now();
      const ttlMs = this.config.cacheTTL * 1000;
      
      if (now - cached.cachedAt < ttlMs) {
        return cached.decision;
      }
      
      // 过期，删除缓存
      this.decisionCache.delete(cacheKey);
    }
    
    return null;
  }

  /**
   * 缓存判断结果
   */
  private cacheDecision(message: string, decision: PassiveRetrievalDecision): void {
    const cacheKey = this.getCacheKey(message);
    this.decisionCache.set(cacheKey, {
      decision,
      cachedAt: Date.now(),
      query: message,
    });
  }

  /**
   * 生成缓存键
   * 
   * 根据 enableCacheKey 配置决定使用哪种策略：
   * - true: 关键词提取 + 哈希（更精确，但有碰撞风险）
   * - false: 直接使用消息内容作为键（简单，无碰撞）
   */
  private getCacheKey(message: string): string {
    if (!this.config.enableCacheKey) {
      // 关闭缓存键优化，直接使用消息
      return message;
    }
    
    // 开启缓存键优化：关键词提取 + 哈希
    const keywords = this.extractKeywords(message);
    
    if (keywords.length === 0) {
      return this.hash(message);
    }
    
    const keyContent = [
      keywords.join('|'),
      `len:${message.length}`,
    ].join('::');
    
    return this.hash(keyContent);
  }

  /**
   * 提取关键词
   */
  private extractKeywords(message: string): string[] {
    const stopWords = this.getStopWords();
    const words: string[] = [];
    
    // 提取中文词组（2-4字）
    const chinesePattern = /[\u4e00-\u9fa5]{2,4}/g;
    const chineseMatches = message.match(chinesePattern) || [];
    words.push(...chineseMatches);
    
    // 提取英文单词
    const englishPattern = /[a-zA-Z]{2,}/g;
    const englishMatches = message.match(englishPattern) || [];
    words.push(...englishMatches.map(w => w.toLowerCase()));
    
    // 过滤停用词
    return words
      .filter(w => !stopWords.has(w))
      .slice(0, 10);
  }

  /**
   * 停用词表
   */
  private getStopWords(): Set<string> {
    return new Set([
      '的', '了', '是', '在', '我', '你', '他', '她', '它',
      '这', '那', '有', '和', '与', '或', '但', '如果', '因为',
      '所以', '但是', '然后', '还是', '什么', '怎么', '为什么',
      '可以', '可能', '应该', '需要', '这个', '那个', '一个',
      '一些', '这些', '那些', '已经', '正在', '将要', '之前',
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'can', 'this',
      'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it',
    ]);
  }

  /**
   * 哈希函数
   */
  private hash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * 调用 LLM 进行判断
   */
  private async getLLMDecision(message: string): Promise<PassiveRetrievalDecision> {
    if (!this.llmService) {
      return { needRetrieval: false };
    }

    const prompt = `${this.promptTemplate}\n\n用户消息: ${message}`;
    
    // 调试日志：记录被动检索提示词
    console.log('[AMEP] 被动检索 - 发送给 LLM 的提示词:');
    console.log('---');
    console.log(prompt);
    console.log('---');
    
    let response: string;
    
    // 优先使用 generate 方法，如果没有则使用 chat 方法
    if (this.llmService.generate) {
      response = await this.llmService.generate(prompt);
    } else {
      const result = await this.llmService.chat({
        messages: [{ role: 'user', content: prompt }],
      });
      response = result.content;
    }
    
    // 调试日志：记录 LLM 响应
    console.log('[AMEP] 被动检索 - LLM 响应:', response);
    
    return this.parseDecision(response);
  }

  /**
   * 解析 LLM 返回的判断结果
   */
  private parseDecision(response: string): PassiveRetrievalDecision {
    try {
      // 尝试提取 JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        // 处理 needRetrieval: true 的情况
        if (parsed.needRetrieval === true) {
          return {
            needRetrieval: true,
            searchQuery: parsed.searchQuery || parsed.keywords?.join(' ') || '',
            timeRange: parsed.timeRange,
            keywords: parsed.keywords,
            reason: parsed.reason,
          };
        }
        
        // needRetrieval: false，但返回了 JSON
        return {
          needRetrieval: false,
          reason: parsed.reason,
        };
      }
      
      // 没有 JSON，说明 LLM 直接回复了用户（不需要检索）
      // 这种情况下，response 本身就是给用户的回复
      return {
        needRetrieval: false,
        directResponse: response,  // 保存直接回复
      } as PassiveRetrievalDecision & { directResponse: string };
      
    } catch (error) {
      console.error('[AMEP] 解析被动检索判断结果失败:', error);
    }
    
    // 解析失败，尝试降级判断
    return { needRetrieval: false };
  }

  /**
   * 降级判断（关键词匹配）
   */
  private fallbackDecision(message: string): PassiveRetrievalDecision {
    const hintKeywords = ['上次', '之前', '那个', '刚才', '之前说的', '以前'];
    const hasHint = hintKeywords.some(k => message.includes(k));
    
    return {
      needRetrieval: hasHint,
      keywords: hasHint ? hintKeywords.filter(k => message.includes(k)) : undefined,
    };
  }

  /**
   * 清理过期缓存
   */
  clearExpiredCache(): void {
    const now = Date.now();
    const ttlMs = this.config.cacheTTL * 1000;
    
    for (const [key, cached] of this.decisionCache.entries()) {
      if (now - cached.cachedAt >= ttlMs) {
        this.decisionCache.delete(key);
      }
    }
  }
}

// ============================================
// 主检索服务
// ============================================

export class MDFileRetrievalService implements IRetrievalService {
  private embeddingService: IEmbeddingService;
  private storageService: IStorageService;
  private indexCache: Map<string, MemoryIndex[]> = new Map();
  
  // 双模式检索
  private activeService: ActiveRetrievalService;
  private passiveService: PassiveRetrievalService;
  private config: Required<RetrievalConfig>;
  
  // Faiss 索引
  private faissService: IFaissService | null = null;
  private faissEnabled: boolean = false;
  private faissIndexBuilt: boolean = false;
  
  // 时区工具
  private timeUtils: TimeUtils;

  constructor(
    embeddingService: IEmbeddingService,
    storageService: IStorageService,
    config?: RetrievalConfig,
    llmService?: ILLService,
    faissConfig?: FaissConfig,
    timezoneConfig?: TimezoneConfig
  ) {
    this.embeddingService = embeddingService;
    this.storageService = storageService;
    
    // 初始化时区工具
    this.timeUtils = new TimeUtils(timezoneConfig);
    
    this.config = {
      activeMode: config?.activeMode ?? DEFAULT_RETRIEVAL_CONFIG.activeMode!,
      passiveMode: config?.passiveMode ?? DEFAULT_RETRIEVAL_CONFIG.passiveMode!,
      threshold: config?.threshold ?? DEFAULT_RETRIEVAL_CONFIG.threshold!,
      maxResults: config?.maxResults ?? DEFAULT_RETRIEVAL_CONFIG.maxResults!,
      thresholdStrategy: {
        enabled: config?.thresholdStrategy?.enabled ?? true,
        semanticThreshold: config?.thresholdStrategy?.semanticThreshold ?? 0.5,
        timeRangeThreshold: config?.thresholdStrategy?.timeRangeThreshold ?? 0.3,
        hybridThreshold: config?.thresholdStrategy?.hybridThreshold ?? 0.4,
        timeRangeLimitMultiplier: config?.thresholdStrategy?.timeRangeLimitMultiplier ?? 2,
      },
    };
    
    this.activeService = new ActiveRetrievalService(this.config.activeMode);
    this.passiveService = new PassiveRetrievalService(this.config.passiveMode, llmService);
    
    // 初始化 Faiss
    if (faissConfig) {
      this.faissService = new FaissService(faissConfig);
      this.faissEnabled = true;
    }
  }
  
  /**
   * 初始化 Faiss 索引
   */
  async initializeFaiss(): Promise<void> {
    if (!this.faissService) return;
    
    await this.faissService.initialize();
    console.log('[AMEP] Faiss 索引服务初始化完成');
  }
  
  /**
   * 构建 Faiss 索引（从现有存储加载）
   * 注意：需要遍历所有 userId/agentId 组合
   */
  async buildFaissIndex(userId?: string, agentId?: string): Promise<void> {
    if (!this.faissService || !this.faissEnabled) {
      console.log('[AMEP] buildFaissIndex: Faiss 未启用');
      return;
    }
    
    console.log('[AMEP] buildFaissIndex: 开始构建，userId:', userId, 'agentId:', agentId);
    
    const indexes = userId && agentId
      ? await this.storageService.loadAllIndexes(userId, agentId)
      : await this.loadAllIndexesGlobal();
    
    console.log('[AMEP] buildFaissIndex: 加载', indexes.length, '条索引');
    
    if (indexes.length === 0) {
      console.log('[AMEP] buildFaissIndex: 没有索引，跳过构建');
      return;
    }
    
    const items = indexes.map(idx => ({
      id: idx.id,
      vector: idx.embedding,
    }));
    
    // 清除旧索引，重新构建
    this.faissService.clear?.();
    this.faissService.addBatch(items);
    this.faissIndexBuilt = true;
    
    console.log(`[AMEP] Faiss 索引构建完成: ${items.length} 条向量`);
  }
  
  /**
   * 添加向量到 Faiss 索引
   */
  addToFaissIndex(id: string, embedding: number[]): void {
    if (this.faissService && this.faissEnabled) {
      this.faissService.add(id, embedding);
    }
  }
  
  /**
   * 获取 Faiss 统计信息
   */
  getFaissStats() {
    return this.faissService?.getStats() || null;
  }
  
  /**
   * 获取 Faiss 服务实例
   */
  getFaissService(): IFaissService | null {
    return this.faissService;
  }

  /**
   * 设置 LLM 服务（用于被动检索）
   */
  setLLMService(service: ILLService): void {
    this.passiveService.setLLMService(service);
  }

  /**
   * 解析时间范围字符串为日期范围
   * 使用 TimeUtils 进行时区感知的解析
   */
  private parseTimeRange(timeRange?: string): { start: Date; end: Date } | null {
    if (!timeRange) return null;
    return this.timeUtils.parseTimeRange(timeRange);
  }

  /**
   * 检索类型
   */
  private classifyQueryType(
    query: string,
    timeFilter: { start: Date; end: Date } | null
  ): 'semantic_only' | 'time_range' | 'hybrid' {
    // 有时间过滤
    if (timeFilter) {
      // 查询文本较长（>10字符），可能是混合检索
      if (query.length > 10) {
        return 'hybrid';
      }
      return 'time_range';
    }
    return 'semantic_only';
  }

  /**
   * 计算自适应阈值
   * 
   * 根据检索类型自动调整：
   * - semantic_only: 纯语义检索，使用默认阈值
   * - time_range: 时间范围检索，降低阈值提高召回率
   * - hybrid: 混合检索，平衡策略
   */
  private computeAdaptiveThreshold(
    queryType: 'semantic_only' | 'time_range' | 'hybrid',
    userThreshold?: number
  ): { threshold: number; limitMultiplier: number } {
    const strategy = this.config.thresholdStrategy;
    
    // 用户明确指定阈值，优先使用用户值
    if (userThreshold !== undefined) {
      return { threshold: userThreshold, limitMultiplier: 1 };
    }
    
    // 自适应阈值未启用，使用默认阈值
    if (!strategy.enabled) {
      return { threshold: this.config.threshold, limitMultiplier: 1 };
    }
    
    // 根据检索类型选择阈值
    const defaultThreshold = this.config.threshold;
    
    switch (queryType) {
      case 'time_range':
        return { 
          threshold: strategy.timeRangeThreshold ?? defaultThreshold, 
          limitMultiplier: strategy.timeRangeLimitMultiplier ?? 1 
        };
      case 'hybrid':
        return { 
          threshold: strategy.hybridThreshold ?? defaultThreshold, 
          limitMultiplier: 1 
        };
      case 'semantic_only':
      default:
        return { 
          threshold: strategy.semanticThreshold ?? defaultThreshold, 
          limitMultiplier: 1 
        };
    }
  }

  async search(request: MemorySearchRequest): Promise<MemorySearchResult> {
    const startTime = Date.now();
    const embeddingResult = await this.embeddingService.embed(request.query);
    const queryEmbedding = embeddingResult.embedding;

    // 解析时间范围
    const timeFilter = this.parseTimeRange(request.timeRange);
    if (timeFilter) {
      console.log(`[AMEP] 时间过滤: ${timeFilter.start.toISOString()} - ${timeFilter.end.toISOString()}`);
    }

    // 自适应阈值：根据检索类型调整
    const queryType = this.classifyQueryType(request.query, timeFilter);
    const { threshold: effectiveThreshold, limitMultiplier } = this.computeAdaptiveThreshold(
      queryType,
      request.threshold
    );
    
    const effectiveLimit = (request.limit || this.config.maxResults) * limitMultiplier;
    
    console.log(`[AMEP] 检索类型: ${queryType}, 阈值: ${effectiveThreshold.toFixed(2)}, 结果数上限: ${effectiveLimit}`);

    const results = await this.searchByVector(queryEmbedding, {
      agentId: request.agentId,
      userId: request.userId,
      timeFilter,
      limit: effectiveLimit,
      threshold: effectiveThreshold,
    });

    // 如果使用了倍数扩展，截取用户请求的数量
    const finalResults = request.limit ? results.slice(0, request.limit) : results;

    return {
      results: finalResults,
      query: { text: request.query, embedding: queryEmbedding },
      metadata: { total: finalResults.length, latency: Date.now() - startTime },
    };
  }

  async searchByVector(
    embedding: number[],
    options?: {
      agentId?: string;
      userId?: string;
      timeFilter?: { start: Date; end: Date } | null;
      limit?: number;
      threshold?: number;
    }
  ): Promise<SearchResult[]> {
    const threshold = options?.threshold || this.config.threshold;
    const limit = options?.limit || this.config.maxResults;

    // 优先使用 Faiss 索引
    if (this.faissEnabled && this.faissService && this.faissIndexBuilt) {
      return this.searchByFaiss(embedding, threshold, limit, options);
    }

    // 降级：线性搜索
    return this.searchByLinear(embedding, threshold, limit, options);
  }
  
  /**
   * 使用 Faiss 索引检索
   */
  private async searchByFaiss(
    embedding: number[],
    threshold: number,
    limit: number,
    options?: { 
      agentId?: string; 
      userId?: string; 
      timeFilter?: { start: Date; end: Date } | null;
    }
  ): Promise<SearchResult[]> {
    if (!this.faissService) return [];

    const faissResults = this.faissService.search(embedding, limit * 2);
    const results: SearchResult[] = [];

    for (const fr of faissResults) {
      if (fr.score < threshold) continue;
      if (results.length >= limit) break;

      const memoryIndex = await this.getMemoryIndex(fr.id, options?.userId, options?.agentId);
      if (!memoryIndex) continue;
      if (options?.userId && memoryIndex.userId !== options.userId) continue;
      
      if (options?.timeFilter) {
        const memoryDate = this.timeUtils.parseTimestamp(memoryIndex.timestamp);
        if (memoryDate < options.timeFilter.start || memoryDate > options.timeFilter.end) {
          continue;
        }
      }

      const text = await this.storageService.readMemoryContent(
        memoryIndex.userId || 'default_user',
        memoryIndex.agentId || options?.agentId || 'default',
        memoryIndex.file,
        memoryIndex.offset,
        memoryIndex.length
      );

      results.push({
        id: fr.id,
        text,
        score: fr.score,
        timestamp: this.timeUtils.parseTimestamp(memoryIndex.timestamp),
      });
    }

    return results;
  }
  
  /**
   * 线性搜索（降级方案）
   */
  private async searchByLinear(
    embedding: number[],
    threshold: number,
    limit: number,
    options?: { 
      agentId?: string; 
      userId?: string; 
      timeFilter?: { start: Date; end: Date } | null;
    }
  ): Promise<SearchResult[]> {
    // 加载索引
    const indexes = options?.userId && options?.agentId
      ? await this.storageService.loadAllIndexes(options.userId, options.agentId)
      : await this.loadAllIndexesGlobal();

    // 计算相似度
    const scores: Array<{ index: MemoryIndex; score: number }> = [];
    for (const idx of indexes) {
      if (options?.userId && idx.userId !== options.userId) continue;
      
      // 时间过滤
      if (options?.timeFilter) {
        const memoryDate = this.timeUtils.parseTimestamp(idx.timestamp);
        if (memoryDate < options.timeFilter.start || memoryDate > options.timeFilter.end) {
          continue;
        }
      }
      
      const score = VectorUtils.cosineSimilarity(embedding, idx.embedding);
      if (score >= threshold) scores.push({ index: idx, score });
    }

    // 排序
    scores.sort((a, b) => b.score - a.score);

    // 读取内容
    const results: SearchResult[] = [];
    for (const { index, score } of scores.slice(0, limit)) {
      const text = await this.storageService.readMemoryContent(
        index.userId || 'default_user',
        index.agentId || options?.agentId || 'default',
        index.file,
        index.offset,
        index.length
      );
      results.push({ 
        id: index.id, 
        text, 
        score, 
        timestamp: this.timeUtils.parseTimestamp(index.timestamp)
      });
      if (results.length >= limit) break;
    }

    return results;
  }
  
  /**
   * 获取记忆索引
   */
  private async getMemoryIndex(id: string, userId?: string, agentId?: string): Promise<MemoryIndex | null> {
    const indexes = userId && agentId
      ? await this.storageService.loadAllIndexes(userId, agentId)
      : await this.loadAllIndexesGlobal();
    
    return indexes.find(idx => idx.id === id) || null;
  }

  /**
   * 双模式检索处理
   */
  async processQuery(
    message: string,
    options?: {
      agentId?: string;
      userId?: string;
      llmService?: ILLService;
    }
  ): Promise<{
    needRetrieval: boolean;
    memories?: SearchResult[];
    decision?: PassiveRetrievalDecision;
  }> {
    // 1. 检查主动检索
    if (this.activeService.shouldTrigger(message)) {
      // 主动检索触发，直接执行检索
      const results = await this.search({
        query: message,
        agentId: options?.agentId,
        userId: options?.userId,
      });
      
      return {
        needRetrieval: true,
        memories: results.results,
      };
    }

    // 2. 被动检索模式
    const decision = await this.passiveService.shouldRetrieve(message);
    
    if (decision.needRetrieval) {
      // 执行检索
      const results = await this.search({
        query: decision.keywords?.join(' ') || message,
        agentId: options?.agentId,
        userId: options?.userId,
      });
      
      return {
        needRetrieval: true,
        memories: results.results,
        decision,
      };
    }

    return {
      needRetrieval: false,
      decision,
    };
  }

  /**
   * 意图分类
   */
  classifyIntent(message: string): IntentType {
    return this.activeService.classifyIntent(message);
  }

  /**
   * 更新索引（占位实现）
   */
  updateIndex(id: string, embedding: number[]): void {
    // MD 文件存储自动更新索引，此处为接口兼容
    console.log(`[AMEP] 索引更新: ${id}`);
  }

  /**
   * 全局加载所有索引（遍历所有 userId/agentId）
   * 用于 Faiss 构建和无参数搜索
   */
  private async loadAllIndexesGlobal(): Promise<MemoryIndex[]> {
    const stats = await this.storageService.getStats();
    const allIndexes: MemoryIndex[] = [];
    
    for (const key of Object.keys(stats.byAgent)) {
      const [userId, agentId] = key.split('/');
      if (userId && agentId) {
        const indexes = await this.storageService.loadAllIndexes(userId, agentId);
        allIndexes.push(...indexes);
      }
    }
    
    return allIndexes;
  }
}

// ============================================
// 工厂函数
// ============================================

export class RetrievalServiceFactory {
  static create(
    embeddingService: IEmbeddingService,
    storageService: IStorageService,
    config?: RetrievalConfig,
    llmService?: ILLService,
    faissConfig?: FaissConfig,
    timezoneConfig?: TimezoneConfig
  ): IRetrievalService {
    return new MDFileRetrievalService(
      embeddingService, 
      storageService, 
      config, 
      llmService, 
      faissConfig,
      timezoneConfig
    );
  }
}