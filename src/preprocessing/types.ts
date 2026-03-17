/**
 * AMEP 记忆预处理模块 - 类型定义
 */

/**
 * 内容过滤规则
 */
export interface ContentFilterRule {
  /** 规则名称 */
  name: string;
  
  /** 匹配模式 */
  pattern: RegExp;
  
  /** 处理方式 */
  action: 'remove' | 'extract' | 'mark';
  
  /** 说明 */
  description: string;
}

/**
 * 去重配置
 */
export interface DeduplicationConfig {
  /** 是否启用 */
  enabled: boolean;
  
  /** 相似度阈值 (0-1) */
  similarityThreshold: number;
  
  /** 检查范围：最近 N 条记忆 */
  checkRange: number;
  
  /** 时间窗口：只检查最近 N 天的记忆 */
  timeWindowDays: number;
}

/**
 * 摘要配置
 */
export interface SummarizerConfig {
  /** 是否启用 */
  enabled: boolean;
  
  /** 触发摘要的长度阈值 */
  lengthThreshold: number;
  
  /** 摘要目标长度 */
  targetLength: number;
  
  /** 摘要策略 */
  strategy: 'extract' | 'llm';
}

/**
 * 长度限制
 */
export interface LengthLimit {
  /** 最小长度 */
  min: number;
  
  /** 最大长度 */
  max: number;
}

/**
 * 预处理配置
 */
export interface PreprocessorConfig {
  /** 内容过滤 */
  filter: {
    enabled: boolean;
    rules?: ContentFilterRule[];
  };
  
  /** 去重 */
  deduplication: DeduplicationConfig;
  
  /** 摘要 */
  summarizer: SummarizerConfig;
  
  /** 长度限制 */
  lengthLimit: LengthLimit;
}

/**
 * 预处理结果
 */
export interface PreprocessResult {
  /** 处理后的内容 */
  processed: string;
  
  /** 是否被过滤 */
  wasFiltered: boolean;
  
  /** 是否重复 */
  wasDuplicate: boolean;
  
  /** 是否被摘要 */
  wasSummarized: boolean;
  
  /** 原因说明 */
  reason?: string;
  
  /** 过滤详情 */
  filterDetails?: {
    rule: string;
    count: number;
  }[];
}

/**
 * 默认预处理配置
 */
export const DEFAULT_PREPROCESSOR_CONFIG: PreprocessorConfig = {
  filter: {
    enabled: true,
  },
  deduplication: {
    enabled: true,
    similarityThreshold: 0.85,
    checkRange: 100,
    timeWindowDays: 7,
  },
  summarizer: {
    enabled: true,
    lengthThreshold: 500,
    targetLength: 200,
    strategy: 'extract',
  },
  lengthLimit: {
    min: 20,
    max: 2000,
  },
};