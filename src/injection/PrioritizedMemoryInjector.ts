/**
 * 分级注入器
 * 
 * 根据优先级和 Token 预算智能注入记忆
 * 
 * @module injection/PrioritizedMemoryInjector
 */

import { MemoryPriorityEvaluator, SearchResultLike } from './MemoryPriorityEvaluator';
import { TokenCounter } from './TokenCounter';
import { 
  ContextBudgetConfig, 
  MemoryPriorityType, 
  InjectionStats,
  DEFAULT_BUDGET_128K 
} from './types';

/**
 * 聊天消息（简化版）
 */
export interface ChatMessageLike {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * 分级注入器
 */
export class PrioritizedMemoryInjector {
  private evaluator: MemoryPriorityEvaluator;
  private tokenCounter: TokenCounter;
  private budget: ContextBudgetConfig;
  
  constructor(budget?: ContextBudgetConfig) {
    this.budget = budget || DEFAULT_BUDGET_128K;
    this.evaluator = new MemoryPriorityEvaluator();
    this.tokenCounter = new TokenCounter();
  }
  
  /**
   * 执行分级注入
   */
  async inject(
    memories: SearchResultLike[],
    context: {
      systemPrompt: string;
      history: ChatMessageLike[];
      userQuery: string;
    }
  ): Promise<{
    messages: ChatMessageLike[];
    stats: InjectionStats;
  }> {
    // 1. 计算已使用 token
    const usedTokens = this.tokenCounter.count([
      context.systemPrompt,
      ...context.history.map(m => m.content),
      context.userQuery
    ]);
    
    // 2. 计算可用预算
    const availableBudget = this.budget.maxContextTokens 
                          - this.budget.reserved.response 
                          - usedTokens;
    
    if (availableBudget <= 0) {
      console.warn('[AMEP] 预算不足，跳过记忆注入');
      const emptyMap = new Map<MemoryPriorityType, SearchResultLike[]>();
      return {
        messages: this.buildMessages(emptyMap, context),
        stats: this.createEmptyStats(memories.length, availableBudget)
      };
    }
    
    // 3. 分级评估
    const prioritized = this.evaluator.evaluateBatch(memories);
    
    // 4. 计算各级别预算
    const budgetAllocation: Record<MemoryPriorityType, number> = {
      P0: Math.floor(availableBudget * this.budget.memory.p0Ratio),
      P1: Math.floor(availableBudget * this.budget.memory.p1Ratio),
      P2: Math.floor(availableBudget * this.budget.memory.p2Ratio),
      P3: 0,
    };
    
    // 5. 按优先级注入
    const injected: Map<MemoryPriorityType, SearchResultLike[]> = new Map([
      ['P0', []],
      ['P1', []],
      ['P2', []],
      ['P3', []]
    ]);
    const tokensUsed: Record<MemoryPriorityType, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
    
    for (const priority of ['P0', 'P1', 'P2'] as MemoryPriorityType[]) {
      const tierMemories = prioritized.get(priority) || [];
      const tierBudget = budgetAllocation[priority];
      const tierInjected: SearchResultLike[] = [];
      let tierTokens = 0;
      
      // 按相关度排序
      tierMemories.sort((a, b) => b.score - a.score);
      
      for (const memory of tierMemories) {
        const memoryTokens = this.tokenCounter.countSingle(memory.text);
        
        if (tierTokens + memoryTokens <= tierBudget) {
          tierInjected.push(memory);
          tierTokens += memoryTokens;
        }
      }
      
      injected.set(priority, tierInjected);
      tokensUsed[priority] = tierTokens;
    }
    
    // 6. 构建消息
    const messages = this.buildMessages(injected, context);
    
    // 7. 统计信息
    const totalInjectedTokens = tokensUsed.P0 + tokensUsed.P1 + tokensUsed.P2;
    
    const stats: InjectionStats = {
      totalMemories: memories.length,
      injectedMemories: (injected.get('P0')?.length || 0) + (injected.get('P1')?.length || 0) + (injected.get('P2')?.length || 0),
      injectedTokens: totalInjectedTokens,
      byPriority: {
        P0: { count: injected.get('P0')?.length || 0, tokens: tokensUsed.P0 },
        P1: { count: injected.get('P1')?.length || 0, tokens: tokensUsed.P1 },
        P2: { count: injected.get('P2')?.length || 0, tokens: tokensUsed.P2 },
        P3: { count: prioritized.get('P3')?.length || 0, tokens: 0 },
      },
      budgetUsed: totalInjectedTokens,
      budgetTotal: availableBudget,
    };
    
    this.logStats(stats);
    
    return { messages, stats };
  }
  
  /**
   * 构建消息数组
   */
  private buildMessages(
    injected: Map<MemoryPriorityType, SearchResultLike[]>,
    context: {
      systemPrompt: string;
      history: ChatMessageLike[];
      userQuery: string;
    }
  ): ChatMessageLike[] {
    const messages: ChatMessageLike[] = [
      { role: 'system', content: context.systemPrompt }
    ];
    
    // 构建记忆内容
    const memoryContent = this.buildMemoryContent(injected);
    
    if (memoryContent) {
      messages.push({
        role: 'system',
        content: `【相关记忆】\n${memoryContent}`
      });
    }
    
    // 添加历史
    messages.push(...context.history);
    
    // 添加用户问题
    messages.push({ role: 'user', content: context.userQuery });
    
    return messages;
  }
  
  /**
   * 构建记忆内容文本
   */
  private buildMemoryContent(injected: Map<MemoryPriorityType, SearchResultLike[]>): string {
    const sections: string[] = [];
    
    // P0 关键信息
    const p0 = injected.get('P0') || [];
    if (p0.length > 0) {
      sections.push('【关键信息 - 必须参考】');
      for (const m of p0) {
        sections.push(`• ${m.text}`);
      }
    }
    
    // P1 重要信息
    const p1 = injected.get('P1') || [];
    if (p1.length > 0) {
      sections.push('\n【重要信息 - 优先参考】');
      for (const m of p1) {
        sections.push(`• ${m.text}`);
      }
    }
    
    // P2 背景信息
    const p2 = injected.get('P2') || [];
    if (p2.length > 0) {
      sections.push('\n【背景信息 - 按需参考】');
      for (const m of p2) {
        sections.push(`• ${m.text}`);
      }
    }
    
    return sections.join('\n');
  }
  
  /**
   * 创建空统计
   */
  private createEmptyStats(totalMemories: number, budget: number): InjectionStats {
    return {
      totalMemories,
      injectedMemories: 0,
      injectedTokens: 0,
      byPriority: {
        P0: { count: 0, tokens: 0 },
        P1: { count: 0, tokens: 0 },
        P2: { count: 0, tokens: 0 },
        P3: { count: totalMemories, tokens: 0 },
      },
      budgetUsed: 0,
      budgetTotal: budget,
    };
  }
  
  /**
   * 打印统计日志
   */
  private logStats(stats: InjectionStats): void {
    console.log(`[AMEP] 记忆注入统计:`);
    console.log(`  - P0: ${stats.byPriority.P0.count} 条, ${stats.byPriority.P0.tokens} tokens`);
    console.log(`  - P1: ${stats.byPriority.P1.count} 条, ${stats.byPriority.P1.tokens} tokens`);
    console.log(`  - P2: ${stats.byPriority.P2.count} 条, ${stats.byPriority.P2.tokens} tokens`);
    console.log(`  - 总计: ${stats.injectedMemories}/${stats.totalMemories} 条`);
    console.log(`  - 预算: ${stats.budgetUsed}/${stats.budgetTotal} tokens`);
  }
  
  /**
   * 更新预算配置
   */
  updateBudget(budget: ContextBudgetConfig): void {
    this.budget = budget;
  }
}