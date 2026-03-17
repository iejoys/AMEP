/**
 * Token 计数器
 * 
 * 估算文本的 token 数量，用于上下文预算管理
 * 
 * @module injection/TokenCounter
 */

/**
 * Token 计数器
 */
export class TokenCounter {
  // 中文约 1.5 字符/token，英文约 4 字符/token
  // 取中间值保守估算
  private charsPerToken: number;
  
  constructor(charsPerToken: number = 2) {
    this.charsPerToken = charsPerToken;
  }
  
  /**
   * 计算文本 token 数（估算）
   */
  count(texts: string[]): number {
    const total = texts.reduce((sum, text) => sum + text.length, 0);
    return Math.ceil(total / this.charsPerToken);
  }
  
  /**
   * 计算单个文本 token 数
   */
  countSingle(text: string): number {
    return Math.ceil(text.length / this.charsPerToken);
  }
  
  /**
   * 精确计算（使用 tiktoken）
   * 需要安装：npm install tiktoken
   */
  async countExact(texts: string[], model: string = 'gpt-4'): Promise<number> {
    try {
      // 动态导入 tiktoken（可选依赖）
      // @ts-ignore - tiktoken 是可选依赖
      const { encoding_for_model } = await import('tiktoken');
      const enc = encoding_for_model(model as any);
      
      let total = 0;
      for (const text of texts) {
        total += enc.encode(text).length;
      }
      
      enc.free();
      return total;
    } catch {
      // tiktoken 不可用，使用估算
      return this.count(texts);
    }
  }
  
  /**
   * 计算消息数组的 token 数
   */
  countMessages(messages: Array<{ content: string }>): number {
    // 每条消息额外约 4 tokens 开销
    let total = messages.length * 4;
    
    for (const msg of messages) {
      total += this.countSingle(msg.content);
    }
    
    return total;
  }
  
  /**
   * 检查是否超出预算
   */
  checkBudget(texts: string[], budget: number): {
    tokens: number;
    isOverBudget: boolean;
    remaining: number;
  } {
    const tokens = this.count(texts);
    return {
      tokens,
      isOverBudget: tokens > budget,
      remaining: Math.max(0, budget - tokens)
    };
  }
}