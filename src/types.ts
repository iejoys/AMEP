/**
 * AMEP 记忆系统类型定义
 * 
 * 简化版本：移除编码和字典，保留核心记忆管理功能
 */

// ============================================
// 会话管理类型
// ============================================

/**
 * 会话消息
 */
export interface SessionMessage {
  /** 角色 */
  role: 'user' | 'assistant' | 'system';
  /** 内容 */
  content: string;
  /** 时间戳 */
  timestamp?: Date;
}

/**
 * 会话
 */
export interface Session {
  /** 会话 ID */
  id: string;
  /** 用户 ID */
  userId: string;
  /** 智能体 ID */
  agentId: string;
  /** 开始时间 */
  startTime: Date;
  /** 结束时间 */
  endTime?: Date;
  /** 消息列表 */
  messages: SessionMessage[];
  /** 消息数量 */
  messageCount: number;
  /** 状态 */
  status: 'active' | 'ended';
  /** 最后活动时间 */
  lastActivity: Date;
}

/**
 * 创建会话请求
 */
export interface CreateSessionRequest {
  /** 用户 ID */
  userId: string;
  /** 智能体 ID */
  agentId: string;
}

// ============================================
// 记忆类型定义
// ============================================

/**
 * 记忆类型
 */
export enum MemoryType {
  /** 用户偏好 */
  PREFERENCE = 'preference',
  /** 任务经验 */
  EXPERIENCE = 'experience',
  /** 错误教训 */
  LESSON = 'lesson',
  /** 技能成长 */
  SKILL = 'skill',
  /** 关系网络 */
  RELATIONSHIP = 'relationship',
  /** 对话上下文 */
  CONTEXT = 'context',
}

/**
 * 记忆条目
 */
export interface MemoryEntry {
  /** 唯一标识 */
  id: string;
  /** 所属智能体 ID */
  agentId: string;
  /** 用户 ID */
  userId: string;
  /** 记忆类型 */
  type: MemoryType;
  /** 记忆内容（自然语言） */
  content: string;
  /** 语义向量（384 维） */
  embedding: number[];
  /** 重要性 (0-1) */
  importance: number;
  /** 置信度 (0-1) */
  confidence: number;
  /** 访问次数 */
  accessCount: number;
  /** 最后访问时间 */
  lastAccessed: Date;
  /** 创建时间 */
  createdAt: Date;
  /** 更新时间 */
  updatedAt: Date;
  /** 来源会话 ID */
  sessionId?: string;
  /** 过期时间（可选） */
  expiresAt?: Date;
}

/**
 * 创建记忆请求
 */
export interface CreateMemoryRequest {
  /** 智能体 ID */
  agentId: string;
  /** 用户 ID */
  userId: string;
  /** 记忆类型 */
  type?: MemoryType;
  /** 记忆内容 */
  content: string;
  /** 重要性 (0-1) */
  importance?: number;
  /** 来源会话 ID */
  sessionId?: string;
}

/**
 * 记忆检索请求
 */
export interface MemorySearchRequest {
  /** 查询文本 */
  query: string;
  /** 限制智能体 */
  agentId?: string;
  /** 限制用户 */
  userId?: string;
  /** 限制类型 */
  types?: MemoryType[];
  /** 时间范围：今日/昨天/最近一周/最近一个月/具体日期(如 2026.3.10-2026.3.13) */
  timeRange?: string;
  /** 返回数量 */
  limit?: number;
  /** 相似度阈值 (0-1) */
  threshold?: number;
}

/**
 * 记忆检索结果
 */
export interface SearchResult {
  /** 记忆 ID */
  id: string;
  /** 记忆内容 */
  text: string;
  /** 相似度分数 */
  score: number;
  /** 时间戳 */
  timestamp: Date;
  /** 会话 ID */
  sessionId?: string;
}

/**
 * 检索响应
 */
export interface MemorySearchResult {
  /** 匹配的记忆列表 */
  results: SearchResult[];
  /** 查询信息 */
  query: {
    text: string;
    embedding: number[];
  };
  /** 元数据 */
  metadata: {
    total: number;
    latency: number;
  };
}

// ============================================
// 嵌入服务类型定义
// ============================================

/**
 * BGE 模型类型
 */
export type BGEModelType = 
  | 'bge-small-en'    // 英文，384维
  | 'bge-small-zh'    // 中文，512维
  | 'bge-base-en'     // 英文，768维
  | 'bge-base-zh'     // 中文，768维
  | 'bge-m3';         // 多语言，1024维

/**
 * 嵌入服务配置
 */
export interface EmbeddingConfig {
  /** 模型类型 */
  modelType?: 'bge-small' | 'bge-small-en' | 'bge-small-zh' | 'bge-base-en' | 'bge-base-zh' | 'bge-m3' | 'openai' | 'mock';
  /** 模型路径（本地模型） */
  modelPath?: string;
  /** API 地址（远程模型或 HuggingFace 镜像） */
  apiUrl?: string;
  /** API Key（远程模型） */
  apiKey?: string;
  /** 批量大小 */
  batchSize?: number;
  /** 是否缓存向量 */
  enableCache?: boolean;
}

/**
 * 嵌入结果
 */
export interface EmbeddingResult {
  /** 嵌入向量 */
  embedding: number[];
  /** 维度 */
  dimensions: number;
  /** 处理耗时 (ms) */
  latency: number;
}

// ============================================
// 存储服务类型定义
// ============================================

/**
 * 存储配置
 */
export interface StorageConfig {
  /** 存储类型 */
  type?: 'file' | 'memory';
  /** 基础路径 */
  basePath?: string;
  /** 基础路径（别名，兼容旧代码） */
  path?: string;
  /** 记忆文件目录 */
  memoryDir?: string;
  /** 会话文件目录 */
  sessionDir?: string;
  /** 缓存目录 */
  cacheDir?: string;
  /** 时间段小时数，默认 8 */
  periodHours?: number;
  /** 保留天数 */
  retentionDays?: number;
  /** 是否自动保存 */
  autoSave?: boolean;
  /** 自动保存间隔 (ms) */
  autoSaveInterval?: number;
  /** 最大记忆数 */
  maxMemories?: number;
}

/**
 * 存储统计
 */
export interface StorageStats {
  /** 总记忆数 */
  totalMemories: number;
  /** 按类型统计 */
  byType: Record<string, number>;
  /** 按智能体统计 */
  byAgent: Record<string, number>;
  /** 存储大小 (bytes) */
  storageSize: number;
  /** 最后更新时间 */
  lastUpdated: Date;
}

// ============================================
// AMEP 服务配置
// ============================================

/**
 * AHIVECORE 配置（用于语义提纯）
 */
export interface AHIVECOREConfig {
  /** API 端点 */
  endpoint: string;
  /** 请求超时 (ms) */
  timeout?: number;
}

/**
 * 会话配置
 */
export interface SessionConfig {
  /** 新鲜对话阈值（秒）- 超过此时间为历史对话 */
  freshThreshold?: number;
  /** 自动保存间隔（毫秒） */
  autoSaveInterval?: number;
}

/**
 * 记忆配置
 */
export interface MemoryConfig {
  /** 保留天数 */
  retentionDays?: number;
  /** 每会话最大记忆数 */
  maxPerSession?: number;
  /**
   * 记忆存储模式
   * - 'raw': 保存原始对话（用户问 + 助手答）
   * - 'summary': 保存 LLM 提取的摘要
   * 默认: 'raw'
   */
  storageMode?: 'raw' | 'summary';
}

// ============================================
// 检索配置
// ============================================

/**
 * 主动检索配置
 */
export interface ActiveRetrievalConfig {
  /** 是否启用，默认 true */
  enabled?: boolean;
  /** 触发词列表 */
  triggers?: string[];
  /** 时间词列表 */
  timeWords?: string[];
  /** 是否需要触发词+时间词同时存在，默认 true */
  requireBoth?: boolean;
}

/**
 * 被动检索配置
 */
export interface PassiveRetrievalConfig {
  /** 是否启用，默认 true */
  enabled?: boolean;
  /** 判断提示词模板 */
  promptTemplate?: string;
  /** 是否启用缓存键，默认 false（推荐关闭） */
  enableCacheKey?: boolean;
  /** 是否缓存判断结果，默认 false */
  cacheDecision?: boolean;
  /** 缓存时长（秒），默认 3600 */
  cacheTTL?: number;
  /** 跳过条件 */
  skipConditions?: {
    /** 最小消息长度，默认 10 */
    minMessageLength?: number;
    /** 跳过的命令前缀 */
    skipCommands?: string[];
  };
}

/**
 * 检索配置
 */
export interface RetrievalConfig {
  /** 主动检索配置 */
  activeMode?: ActiveRetrievalConfig;
  /** 被动检索配置 */
  passiveMode?: PassiveRetrievalConfig;
  /** 相似度阈值，默认 0.5（已废弃，请使用 thresholdStrategy） */
  threshold?: number;
  /** 最大返回数量，默认 10 */
  maxResults?: number;
  /** 自适应阈值策略配置 */
  thresholdStrategy?: ThresholdStrategyConfig;
}

/**
 * 自适应阈值策略配置
 * 
 * 根据检索类型自动调整阈值：
 * - semantic_only: 纯语义检索，高阈值保证精确性
 * - time_range: 时间范围检索，低阈值提高召回率
 * - hybrid: 混合检索，平衡策略
 */
export interface ThresholdStrategyConfig {
  /** 是否启用自适应阈值，默认 true */
  enabled?: boolean;
  /** 纯语义检索阈值，默认 0.5 */
  semanticThreshold?: number;
  /** 时间范围检索阈值，默认 0.3 */
  timeRangeThreshold?: number;
  /** 混合检索阈值，默认 0.4 */
  hybridThreshold?: number;
  /** 时间范围检索时最大返回数量倍数，默认 2 */
  timeRangeLimitMultiplier?: number;
}

// ============================================
// 上下文管理配置
// ============================================

/**
 * 上下文管理配置
 * 
 * 控制上下文消息数量限制和自动归档行为
 */
export interface ContextManagementConfig {
  /** 
   * 上下文最大消息数
   * 说明：单轮对话 = 1 user + 1 assistant = 2 条消息
   * 示例：10 轮对话 = 20 条消息
   * 超过此数量的消息将立即归档到记忆文件
   * @default 20
   */
  maxContextMessages?: number;
  
  /** 
   * 是否在提示词中声明上下文限制
   * 说明：让大模型知道上下文窗口限制，主动请求检索
   * @default true
   */
  declareContextLimit?: boolean;
}

/**
 * 掉线保护配置
 * 
 * 控制无活动超时检查和进程信号监听
 */
export interface InactiveProtectionConfig {
  /** 
   * 无活动超时时间（秒）
   * 说明：超过此时间无消息，自动保存所有会话到文档
   * 场景：智能体掉线、崩溃、网络中断
   * @default 300 (5分钟)
   */
  inactiveTimeout?: number;
  
  /** 
   * 检查间隔（秒）
   * @default 60
   */
  checkInterval?: number;
  
  /** 
   * 是否启用进程信号监听
   * 说明：监听 SIGTERM/SIGINT 信号，优雅关闭并保存
   * @default true
   */
  enableSignalListener?: boolean;
}

// ============================================
// AMEP 服务完整配置
// ============================================

/**
 * AMEP 服务完整配置
 */
export interface AMEPConfig {
  /** 存储配置 */
  storage?: StorageConfig;
  /** 嵌入配置 */
  embedding?: EmbeddingConfig;
  /** AHIVECORE 配置（语义提纯） */
  ahivecore?: AHIVECOREConfig;
  /** 会话配置 */
  session?: SessionConfig;
  /** 记忆配置 */
  memory?: MemoryConfig;
  /** 检索配置 */
  retrieval?: RetrievalConfig;
  /** LLM 服务配置 */
  llm?: LLMConfig;
  /** Faiss 索引配置 */
  faiss?: FaissConfig;
  /** 遗忘机制配置 */
  forget?: ForgetConfig;
  /** 时区配置 */
  timezone?: TimezoneConfig;
  /** 上下文管理配置 */
  contextManagement?: ContextManagementConfig;
  /** 掉线保护配置 */
  inactiveProtection?: InactiveProtectionConfig;
}

/**
 * 时区配置
 * 
 * 影响所有时间相关功能：
 * - 记忆存储文件夹命名
 * - 时间戳记录
 * - 时间范围检索
 */
export interface TimezoneConfig {
  /** 时区标识，默认 'Asia/Shanghai'（中国时区）
   *  常用值：
   *  - 'Asia/Shanghai' 中国标准时间 (UTC+8)
   *  - 'America/New_York' 美国东部时间
   *  - 'Europe/London' 英国时间
   *  - 'UTC' 协调世界时
   */
  timezone?: string;
  /** 语言环境，默认 'zh-CN' */
  locale?: string;
}

// ============================================
// 上下文编译类型
// ============================================

/**
 * 上下文编译选项
 */
export interface ContextOptions {
  /** 用户 ID */
  userId: string;
  /** 智能体 ID */
  agentId?: string;
  /** 当前查询 */
  currentQuery: string;
  /** 最大 token 数 */
  maxTokens?: number;
  /** 是否包含当前会话 */
  includeRecentSession?: boolean;
}

/**
 * 编译后的上下文
 */
export interface CompiledContext {
  /** 上下文文本 */
  text: string;
  /** 包含的记忆数 */
  memoryCount: number;
  /** 是否包含当前会话 */
  hasRecentSession: boolean;
  /** 估算 token 数 */
  estimatedTokens: number;
}

// ============================================
// AMEP 编码解析类型
// ============================================

/**
 * AMEP 编码解析结果
 */
export interface AMEPParsed {
  /** 类别，例如 PREF/TASK/EXP */
  category: string;
  /** 字段映射 */
  fields: Record<string, string>;
}

// ============================================
// 工具函数类型
// ============================================

/**
 * 意图类型
 */
export type IntentType = 'memory_query' | 'normal_chat';

/**
 * 意图分类结果
 */
export interface IntentResult {
  /** 意图类型 */
  type: IntentType;
  /** 置信度 */
  confidence: number;
  /** 检测到的触发词 */
  triggers?: string[];
}

// ============================================
// 文件存储类型定义 (MD + 索引)
// ============================================

/**
 * 向量索引项
 */
export interface MemoryIndex {
  /** 记忆唯一 ID */
  id: string;
  /** 相对文件路径 */
  file: string;
  /** 在文件中的字节偏移量 */
  offset: number;
  /** 记忆内容长度 */
  length: number;
  /** 384 维向量 */
  embedding: number[];
  /** 记忆创建时间 */
  timestamp: string;
  /** 来源会话 ID */
  sessionId?: string;
  /** 用户 ID */
  userId?: string;
  /** 智能体 ID */
  agentId?: string;
}

/** 字典条目（字典内部使用） */
export interface DictionaryEntry {
  code: string;
  createdAt: string;
  lastAccess: string;
  accessCount: number;
}

/** 字典统计信息 */
export interface DictionaryStats {
  version: string;
  shortcutCount: number;
  loadedAt: Date;
  optimizer?: string;
  memoryUsage?: number;
}

/**
 * 存储路径信息
 */
export interface StoragePath {
  /** 智能体目录: openclaw/ */
  agentDir: string;
  /** 时间段目录: 2026-03-12_00-08/ */
  periodDir: string;
  /** 小时文件: 03-04.md */
  hourFile: string;
  /** 索引文件: index/2026-03-12_00-08.json */
  indexFile: string;
  /** 完整 MD 文件路径 */
  mdFilePath: string;
  /** 完整索引文件路径 */
  indexFilePath: string;
}

/**
 * MD 文件中的记忆片段
 */
export interface MemoryFragment {
  /** 记忆 ID */
  id: string;
  /** 记忆内容 */
  content: string;
  /** 时间戳 */
  timestamp: string;
  /** 会话 ID */
  sessionId?: string;
}

/**
 * 时间段信息
 */
export interface PeriodInfo {
  /** 开始小时 (0-23) */
  startHour: number;
  /** 结束小时 (0-23) */
  endHour: number;
  /** 文件夹名称 */
  folderName: string;
  /** 索引文件名 */
  indexFileName: string;
}

// ============================================
// 自动学习/优化相关类型
// ============================================

/** 自动学习中记录的模式统计 */
export interface PatternStats {
  code: string;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
  variants: string[];
}

/** 自动学习配置 */
export interface LearningConfig {
  learnThreshold?: number;
  minCompressionRatio?: number;
  windowDays?: number;
  maxVariants?: number;
}

// ============================================
// 引擎相关类型
// ============================================

/** LookupFunctions: 用于编译/已编译优化器回调 */
export interface LookupFunctions {
  getCode(shortcut: string): string | undefined;
  getShortcut(code: string): string | undefined;
}

/** 引擎配置 */
export interface EngineConfig {
  optimizer?: 'fst' | 'compiled';
  lookupFunctions?: LookupFunctions;
  dictionary?: string | Record<string, string>;
}

/**
 * 文件存储统计
 */
export interface FileStorageStats {
  /** 总记忆数 */
  totalMemories: number;
  /** 总文件数 */
  totalFiles: number;
  /** 总索引文件数 */
  totalIndexFiles: number;
  /** 按智能体统计 */
  byAgent: Record<string, number>;
  /** 存储总大小 (bytes) */
  storageSize: number;
  /** 最早记忆时间 */
  earliestMemory?: Date;
  /** 最新记忆时间 */
  latestMemory?: Date;
}

// ============================================
// LLM 服务配置
// ============================================

/**
 * LLM 服务配置
 */
export interface LLMConfig {
  /** 服务端点 */
  endpoint?: string;
  /** 请求超时（毫秒），默认 60000 */
  timeout?: number;
  /** 最大重试次数，默认 3 */
  maxRetries?: number;
}

// ============================================
// Faiss 索引配置
// ============================================

/**
 * Faiss 索引配置
 */
export interface FaissConfig {
  /** 索引类型 */
  indexType?: 'hnsw' | 'flat' | 'ivf';
  /** 向量维度，默认 384 */
  dimensions?: number;
  /** HNSW 参数 */
  hnsw?: {
    M?: number;
    efSearch?: number;
    efConstruction?: number;
  };
  /** 索引文件路径 */
  indexPath?: string;
  /** 是否自动保存 */
  autoSave?: boolean;
  /** 自动保存间隔 (ms) */
  autoSaveInterval?: number;
  /** 最大元素数 */
  maxElements?: number;
}

// ============================================
// 遗忘机制配置
// ============================================

/**
 * 遗忘机制配置
 */
export interface ForgetConfig {
  /** 是否启用遗忘机制 */
  enabled?: boolean;
  /** 保留天数，默认 90 */
  retentionDays?: number;
  /** 最少访问次数，低于此值可能被删除 */
  minAccessCount?: number;
  /** 最低重要性阈值 */
  minImportance?: number;
  /** 冷却期天数 */
  cooldownDays?: number;
  /** 检查间隔（毫秒），默认 24 小时 */
  checkInterval?: number;
}

// ============================================
// 被动检索类型
// ============================================

/**
 * 时间范围选项
 */
export type TimeRange = 'recent_week' | 'recent_month' | 'recent_quarter' | 'all';

/**
 * 被动检索判断结果
 */
export interface PassiveRetrievalDecision {
  /** 是否需要检索 */
  needRetrieval: boolean;
  /** 搜索查询内容（纯粹的搜索内容，不包含时间词） */
  searchQuery?: string;
  /** 时间范围（具体的时间范围，如 "2026.3.13 00:01-2026.3.13 12:23" 或预设值） */
  timeRange?: string;
  /** 关键词（兼容旧格式） */
  keywords?: string[];
  /** 原因 */
  reason?: string;
  /** 直接回复（LLM 直接回复用户，无需检索） */
  directResponse?: string;
}

/**
 * 缓存的判断结果
 */
export interface CachedDecision {
  /** 判断结果 */
  decision: PassiveRetrievalDecision;
  /** 缓存时间 */
  cachedAt: number;
  /** 原始查询 */
  query: string;
}

// ============================================
// 水表模式类型（智能体 ↔ AMEP ↔ LLM）
// ============================================

/**
 * 聊天消息
 */
export interface ChatMessage {
  /** 角色 */
  role: 'system' | 'user' | 'assistant';
  /** 内容 */
  content: string;
}

/**
 * 工具定义
 */
export interface ToolDefinition {
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description: string;
  /** 参数定义 */
  parameters?: any;
}

/**
 * 工具调用
 */
export interface ToolCall {
  /** 工具名称 */
  name: string;
  /** 参数 */
  arguments: Record<string, any>;
}

/**
 * AMEP → LLMService 调用选项
 */
export interface ChatOptions {
  /** 消息数组 */
  messages: ChatMessage[];
  /** 用户ID */
  userId?: string;
  /** 智能体ID */
  agentId?: string;
  /**
   * 集群/应用标识符
   *
   * 注意：这只是一个业务标识符，用于区分不同的应用/集群，不是安全密钥！
   * 不要在此字段中存储密码、API Key 等敏感信息。
   */
  appKey?: string;
  /** 温度参数 */
  temperature?: number;
  /** 最大 tokens */
  maxTokens?: number;
  /**
   * 是否隔离调用（不记录到主 session 历史）
   * - true: 用于被动检索判断等内部调用，使用临时 session
   * - false/undefined: 主对话，使用主 session
   */
  isolated?: boolean;
}

/**
 * AMEP → LLMService 返回结果
 */
export interface ChatResult {
  /** 回复内容 */
  content: string;
  /** 工具调用 */
  toolCalls?: ToolCall[];
}

/**
 * LLM 服务接口（智能体实现，AMEP 调用）
 */
export interface LLMService {
  /**
   * 主对话（用于被动检索判断和主对话）
   */
  chat(options: ChatOptions): Promise<ChatResult>;
  
  /**
   * 单轮生成（可选，用于语义提纯等内部调用）
   * 如果不实现，AMEP 会使用 chat 方法代替
   */
  generate?(prompt: string): Promise<string>;
  
  /**
   * 健康检查
   */
  healthCheck(): Promise<boolean>;
}

/**
 * 智能体 → AMEP 调用选项
 */
export interface ProcessMessageOptions {
  /** 用户消息 ✅ 必需 */
  message: string;
  /** 用户ID */
  userId?: string;
  /** 智能体ID */
  agentId?: string;
  /**
   * 集群/应用标识符
   *
   * 注意：这只是一个业务标识符，用于区分不同的应用/集群，不是安全密钥！
   * 不要在此字段中存储密码、API Key 等敏感信息。
   */
  appKey?: string;
  /** 基础系统提示词 */
  systemPrompt?: string;
  /** 工具定义 */
  tools?: ToolDefinition[];
}

/**
 * AMEP → 智能体 返回结果
 */
export interface ProcessMessageResult {
  /** 回复内容 */
  content: string;
  /** 工具调用列表 */
  toolCalls?: ToolCall[];
  /** 当前会话ID */
  sessionId: string;
  /** 是否使用了记忆 */
  memoryUsed: boolean;
  /** 是否触发了检索 */
  retrievalTriggered: boolean;
}