/**
 * 记忆优先级评估器
 * 
 * 根据关键词和相关度判断记忆的优先级
 * 
 * @module injection/MemoryPriorityEvaluator
 */

import { 
  MemoryPriorityType, 
  MemoryPriority, 
  PriorityKeywords,
  PRIORITY_KEYWORDS,
  UserPriorityRules,
  DEFAULT_USER_RULES
} from './types';

/**
 * 检索结果（简化版，实际使用 amep 的 SearchResult）
 */
export interface SearchResultLike {
  text: string;
  score: number;
  timestamp?: Date;
}

/**
 * 记忆优先级评估器
 */
export class MemoryPriorityEvaluator {
  private keywords: Record<MemoryPriorityType, PriorityKeywords>;
  private userRules: UserPriorityRules;
  
  constructor(userRules?: Partial<UserPriorityRules>) {
    this.keywords = PRIORITY_KEYWORDS;
    this.userRules = { ...DEFAULT_USER_RULES, ...userRules };
  }
  
  /**
   * 评估记忆优先级
   */
  evaluate(memory: SearchResultLike): MemoryPriority {
    const text = memory.text;
    
    // 1. 用户强制 P0 关键词
    for (const keyword of this.userRules.forceP0Keywords) {
      if (text.includes(keyword)) {
        return {
          priority: 'P0',
          reason: `用户关键词命中: "${keyword}"`,
          score: memory.score
        };
      }
    }
    
    // 2. 用户强制 P3 关键词
    for (const keyword of this.userRules.forceP3Keywords) {
      if (text.includes(keyword)) {
        return {
          priority: 'P3',
          reason: `用户降级关键词命中: "${keyword}"`,
          score: memory.score
        };
      }
    }
    
    // 3. 系统关键词匹配（从高到低）
    for (const priority of ['P0', 'P1', 'P2'] as MemoryPriorityType[]) {
      const config = this.keywords[priority];
      
      for (const keyword of config.triggers) {
        if (text.includes(keyword)) {
          return {
            priority,
            reason: `关键词命中: "${keyword}"`,
            score: memory.score
          };
        }
      }
    }
    
    // 4. 相关度判断
    if (memory.score >= 0.9) {
      return { priority: 'P0', reason: '相关度极高', score: memory.score };
    }
    if (memory.score >= 0.7) {
      return { priority: 'P1', reason: '相关度高', score: memory.score };
    }
    if (memory.score >= 0.5) {
      return { priority: 'P2', reason: '相关度中等', score: memory.score };
    }
    
    return { priority: 'P3', reason: '相关度低', score: memory.score };
  }
  
  /**
   * 批量评估
   */
  evaluateBatch(memories: SearchResultLike[]): Map<MemoryPriorityType, SearchResultLike[]> {
    const result = new Map<MemoryPriorityType, SearchResultLike[]>();
    result.set('P0', []);
    result.set('P1', []);
    result.set('P2', []);
    result.set('P3', []);
    
    for (const memory of memories) {
      const { priority } = this.evaluate(memory);
      result.get(priority)!.push(memory);
    }
    
    return result;
  }
  
  /**
   * 应用时间权重
   */
  applyTimeBoost(memory: SearchResultLike): number {
    if (!memory.timestamp) {
      return memory.score;
    }
    
    const now = Date.now();
    const memoryTime = memory.timestamp.getTime();
    const daysAgo = (now - memoryTime) / (1000 * 60 * 60 * 24);
    
    let boost = 1.0;
    
    if (daysAgo <= 7) {
      boost = this.userRules.timeRangeBoost.recent7Days;
    } else if (daysAgo <= 30) {
      boost = this.userRules.timeRangeBoost.recent30Days;
    } else {
      boost = this.userRules.timeRangeBoost.older;
    }
    
    return memory.score * boost;
  }
  
  /**
   * 更新用户规则
   */
  updateUserRules(rules: Partial<UserPriorityRules>): void {
    this.userRules = { ...this.userRules, ...rules };
  }
}