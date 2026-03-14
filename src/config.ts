/**
 * AMEP 配置管理
 * 
 * 默认配置 + 配置加载器
 */

import {
  AMEPConfig,
  StorageConfig,
  SessionConfig,
  MemoryConfig,
  RetrievalConfig,
  ActiveRetrievalConfig,
  PassiveRetrievalConfig,
  LLMConfig,
  FaissConfig,
  ForgetConfig,
  ThresholdStrategyConfig,
  TimezoneConfig,
  ContextManagementConfig,
  InactiveProtectionConfig,
} from './types';

// ============================================
// 默认触发词
// ============================================

export const DEFAULT_TRIGGERS = [
  '还记得', '记不记得', '我说过', '我们讨论过', '刚才说的', '之前说过',
];

export const DEFAULT_TIME_WORDS = [
  '昨天', '前天', '上周', '上个月', '之前', '前几天', '刚才', '上次',
];

// ============================================
// 默认被动检索提示词
// ============================================

export const DEFAULT_PASSIVE_PROMPT = `AMEP【系统保存着半年内的对话记忆文件。如果你认为本次对话需要检索记忆上下文来辅助你答话，则只返回JSON（不要有其他任何内容）：
{"needRetrieval": true, "searchQuery": "搜索内容", "timeRange": "时间范围"}，如果你认为不需要检索则直接回复用户消息即可】`;

// ============================================
// 默认配置
// ============================================

export const DEFAULT_STORAGE_CONFIG: Required<StorageConfig> = {
  type: 'file',
  basePath: './data/amep',
  path: './data/amep',  // 兼容旧代码
  memoryDir: '',  // 将在加载时设置为 {basePath}/memory
  sessionDir: '',  // 将在加载时设置为 {basePath}/sessions
  cacheDir: '',    // 将在加载时设置为 {basePath}/cache
  periodHours: 8,
  retentionDays: 90,
  autoSave: true,
  autoSaveInterval: 60000,
  maxMemories: 100000,
};

export const DEFAULT_SESSION_CONFIG: Required<SessionConfig> = {
  freshThreshold: 3600,
  autoSaveInterval: 30000,
};

export const DEFAULT_MEMORY_CONFIG: Required<MemoryConfig> = {
  retentionDays: 90,
  maxPerSession: 10,
  storageMode: 'raw',  // 默认保存原始对话
};

export const DEFAULT_ACTIVE_RETRIEVAL_CONFIG: Required<ActiveRetrievalConfig> = {
  enabled: true,
  triggers: DEFAULT_TRIGGERS,
  timeWords: DEFAULT_TIME_WORDS,
  requireBoth: true,
};

export const DEFAULT_PASSIVE_RETRIEVAL_CONFIG: Required<PassiveRetrievalConfig> = {
  enabled: true,
  promptTemplate: DEFAULT_PASSIVE_PROMPT,
  enableCacheKey: false,  // 默认关闭（推荐）
  cacheDecision: false,   // 默认关闭
  cacheTTL: 3600,
  skipConditions: {
    minMessageLength: 10,
    skipCommands: ['/', '#', '!'],
  },
};

export const DEFAULT_THRESHOLD_STRATEGY_CONFIG = {
  enabled: true,
  semanticThreshold: 0.5,      // 纯语义检索：默认阈值
  timeRangeThreshold: 0.3,     // 时间范围检索：降低阈值提高召回率
  hybridThreshold: 0.4,        // 混合检索：平衡策略
  timeRangeLimitMultiplier: 2, // 时间范围检索时返回更多结果
};

export const DEFAULT_RETRIEVAL_CONFIG: Required<RetrievalConfig> = {
  activeMode: DEFAULT_ACTIVE_RETRIEVAL_CONFIG,
  passiveMode: DEFAULT_PASSIVE_RETRIEVAL_CONFIG,
  threshold: 0.5,
  maxResults: 10,
  thresholdStrategy: DEFAULT_THRESHOLD_STRATEGY_CONFIG,
};

export const DEFAULT_TIMEZONE_CONFIG: Required<TimezoneConfig> = {
  timezone: 'Asia/Shanghai',  // 默认中国时区 (UTC+8)
  locale: 'zh-CN',            // 默认中文环境
};

export const DEFAULT_LLM_CONFIG: Required<LLMConfig> = {
  endpoint: 'http://localhost:18790/api/chat',
  timeout: 60000,
  maxRetries: 3,
};

export const DEFAULT_FAISS_CONFIG: Required<FaissConfig> = {
  indexType: 'hnsw',
  dimensions: 384,
  hnsw: {
    M: 32,
    efSearch: 64,
    efConstruction: 64,
  },
  indexPath: './data/amep/faiss',
  autoSave: true,
  autoSaveInterval: 60000,
  maxElements: 1000000,
};

export const DEFAULT_FORGET_CONFIG: Required<ForgetConfig> = {
  enabled: true,
  retentionDays: 90,
  minAccessCount: 0,
  minImportance: 0.1,
  cooldownDays: 7,
  checkInterval: 86400000,  // 24 小时
};

export const DEFAULT_CONTEXT_MANAGEMENT_CONFIG: Required<ContextManagementConfig> = {
  maxContextMessages: 20,      // 默认 10 轮对话
  declareContextLimit: true,   // 默认声明上下文限制
};

export const DEFAULT_INACTIVE_PROTECTION_CONFIG: Required<InactiveProtectionConfig> = {
  inactiveTimeout: 300,        // 5分钟无活动
  checkInterval: 60,           // 每分钟检查一次
  enableSignalListener: true,  // 默认监听进程信号
};


export const DEFAULT_CONFIG: Required<AMEPConfig> = {
  storage: DEFAULT_STORAGE_CONFIG,
  embedding: {
    modelType: 'bge-small-zh',  // 默认中文模型
    enableCache: true,
    batchSize: 8,
    modelPath: './models/bge-small-zh-v1.5-onnx',  // 本地 ONNX 模型
    apiUrl: '',
    apiKey: '',
  },
  ahivecore: {
    endpoint: 'http://localhost:18790/api/chat',
    timeout: 60000,
  },
  session: DEFAULT_SESSION_CONFIG,
  memory: DEFAULT_MEMORY_CONFIG,
  retrieval: DEFAULT_RETRIEVAL_CONFIG,
  llm: DEFAULT_LLM_CONFIG,
  faiss: {
    ...DEFAULT_FAISS_CONFIG,
    dimensions: 512,  // 匹配 bge-small-zh 维度
  },
  forget: DEFAULT_FORGET_CONFIG,
  timezone: DEFAULT_TIMEZONE_CONFIG,
  contextManagement: DEFAULT_CONTEXT_MANAGEMENT_CONFIG,
  inactiveProtection: DEFAULT_INACTIVE_PROTECTION_CONFIG,
};

// ============================================
// 配置加载器
// ============================================

export class ConfigLoader {
  /**
   * 加载并合并配置
   */
  static load(config?: AMEPConfig): Required<AMEPConfig> {
    const merged = this.mergeDeep({}, DEFAULT_CONFIG, config || {}) as Required<AMEPConfig>;
    
    // 处理路径
    this.resolvePaths(merged);
    
    return merged;
  }
  
  /**
   * 解析路径
   */
  private static resolvePaths(config: Required<AMEPConfig>): void {
    const basePath = config.storage.basePath;
    
    if (!config.storage.memoryDir) {
      config.storage.memoryDir = `${basePath}/memory`;
    }
    if (!config.storage.sessionDir) {
      config.storage.sessionDir = `${basePath}/sessions`;
    }
    if (!config.storage.cacheDir) {
      config.storage.cacheDir = `${basePath}/cache`;
    }
    
    // 兼容旧的 path 字段
    if (!config.storage.basePath && (config.storage as any).path) {
      config.storage.basePath = (config.storage as any).path;
    }
  }
  
  /**
   * 深度合并
   */
  private static mergeDeep(target: any, ...sources: any[]): any {
    if (!sources.length) return target;
    const source = sources.shift();
    
    if (this.isObject(target) && this.isObject(source)) {
      for (const key in source) {
        if (this.isObject(source[key])) {
          if (!target[key]) {
            Object.assign(target, { [key]: {} });
          }
          this.mergeDeep(target[key], source[key]);
        } else {
          Object.assign(target, { [key]: source[key] });
        }
      }
    }
    
    return this.mergeDeep(target, ...sources);
  }
  
  /**
   * 判断是否为对象
   */
  private static isObject(item: any): boolean {
    return item && typeof item === 'object' && !Array.isArray(item);
  }
}

/**
 * 创建配置
 */
export function createConfig(config?: AMEPConfig): Required<AMEPConfig> {
  return ConfigLoader.load(config);
}