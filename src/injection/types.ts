/**
 * AMEP 记忆分级注入模块 - 类型定义
 */

/**
 * 记忆优先级类型
 */
export type MemoryPriorityType = 'P0' | 'P1' | 'P2' | 'P3';

/**
 * 记忆优先级
 */
export interface MemoryPriority {
  /** 优先级 */
  priority: MemoryPriorityType;
  
  /** 判断原因 */
  reason: string;
  
  /** 相关度分数 */
  score: number;
}

/**
 * 优先级关键词配置
 */
export interface PriorityKeywords {
  /** 触发关键词 */
  triggers: string[];
  
  /** 描述 */
  description: string;
}

/**
 * 上下文预算配置
 */
export interface ContextBudgetConfig {
  /** 模型上下文窗口限制 */
  maxContextTokens: number;
  
  /** 预留空间 */
  reserved: {
    response: number;
    system: number;
    history: number;
  };
  
  /** 记忆注入预算比例 */
  memory: {
    p0Ratio: number;
    p1Ratio: number;
    p2Ratio: number;
  };
}

/**
 * 注入统计
 */
export interface InjectionStats {
  /** 总记忆数 */
  totalMemories: number;
  
  /** 注入记忆数 */
  injectedMemories: number;
  
  /** 注入 token 数 */
  injectedTokens: number;
  
  /** 按优先级统计 */
  byPriority: Record<MemoryPriorityType, {
    count: number;
    tokens: number;
  }>;
  
  /** 预算使用情况 */
  budgetUsed: number;
  budgetTotal: number;
}

/**
 * 用户优先级规则
 */
export interface UserPriorityRules {
  /** 强制提升为 P0 的关键词 */
  forceP0Keywords: string[];
  
  /** 强制降级为 P3 的关键词 */
  forceP3Keywords: string[];
  
  /** 时间范围权重 */
  timeRangeBoost: {
    recent7Days: number;
    recent30Days: number;
    older: number;
  };
}

/**
 * 默认预算配置（128K 模型）
 */
export const DEFAULT_BUDGET_128K: ContextBudgetConfig = {
  maxContextTokens: 128000,
  reserved: {
    response: 16000,
    system: 2000,
    history: 8000,
  },
  memory: {
    p0Ratio: 0.40,
    p1Ratio: 0.35,
    p2Ratio: 0.25,
  },
};

/**
 * 默认用户规则
 */
export const DEFAULT_USER_RULES: UserPriorityRules = {
  forceP0Keywords: ['紧急', '重要', 'urgency', 'important'],
  forceP3Keywords: ['闲聊', '测试', 'test', 'joke'],
  timeRangeBoost: {
    recent7Days: 1.2,
    recent30Days: 1.0,
    older: 0.8,
  },
};

/**
 * 优先级关键词默认配置
 */
export const PRIORITY_KEYWORDS: Record<MemoryPriorityType, PriorityKeywords> = {
  P0: {
    triggers: [
      '我喜欢', '我偏好', '我希望', '我的习惯', 'prefer', 'like',
      '决定', '决策', '确定', '敲定', '就这个了', 'decide', 'decision',
      '必须', '一定要', '约定', '规则', '注意', 'must', 'rule',
      '项目名称', '项目目标', '核心功能', '截止日期', 'deadline',
    ],
    description: '关键决策和偏好，必须注入',
  },
  P1: {
    triggers: [
      '项目', '需求', '设计', '架构', '功能', 'project', 'design',
      '技术栈', '框架', '数据库', '接口', 'API', 'framework',
      '具体', '细节', '实现', '方案', 'implementation',
    ],
    description: '项目和需求相关，优先注入',
  },
  P2: {
    triggers: [
      '背景', '上下文', '之前', '前面', '之前说的', 'context',
      '参考', '类似', '借鉴', 'reference',
    ],
    description: '背景和参考信息，按需注入',
  },
  P3: {
    triggers: [],
    description: '一般对话，可舍弃',
  },
};