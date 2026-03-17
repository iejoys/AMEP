/**
 * 内容过滤器
 * 
 * 在记忆保存时过滤无用内容，如伪代码、格式标记等
 * 
 * @module preprocessing/ContentFilter
 */

import { ContentFilterRule } from './types';

/**
 * 默认过滤规则
 */
export const DEFAULT_FILTER_RULES: ContentFilterRule[] = [
  // 代码块 - 移除（代码可从仓库恢复）
  {
    name: 'code_block',
    pattern: /^```[\s\S]*?^```/gm,
    action: 'remove',
    description: '移除代码块，代码可从仓库恢复'
  },
  
  // 内联代码 - 提取内容
  {
    name: 'inline_code',
    pattern: /`([^`]+)`/g,
    action: 'extract',
    description: '提取内联代码内容'
  },
  
  // Markdown 格式标记
  {
    name: 'markdown_format',
    pattern: /[*_~#]{2,}/g,
    action: 'remove',
    description: '移除格式标记'
  },
  
  // 错误堆栈
  {
    name: 'error_stack',
    pattern: /Error:[\s\S]*?at\s+.*/g,
    action: 'remove',
    description: '移除错误堆栈'
  },
  
  // 调试语句
  {
    name: 'debug_statement',
    pattern: /(console\.(log|error|warn|debug)\([^)]*\);?|print\([^)]*\);?|System\.out\.print[^;]*;)/g,
    action: 'remove',
    description: '移除调试语句'
  },
  
  // TODO/FIXME 注释
  {
    name: 'todo_comments',
    pattern: /\/\/\s*(TODO|FIXME|XXX|HACK)[^\n]*/gi,
    action: 'remove',
    description: '移除 TODO 注释'
  },
  
  // 多个空行合并
  {
    name: 'empty_lines',
    pattern: /\n{3,}/g,
    action: 'remove',
    description: '合并多个空行'
  },
];

/**
 * 内容过滤器
 */
export class ContentFilter {
  private rules: ContentFilterRule[];
  
  constructor(rules?: ContentFilterRule[]) {
    this.rules = rules || DEFAULT_FILTER_RULES;
  }
  
  /**
   * 过滤内容
   */
  filter(content: string): {
    filtered: string;
    removed: { rule: string; count: number }[];
  } {
    let filtered = content;
    const removed: { rule: string; count: number }[] = [];
    
    for (const rule of this.rules) {
      const matches = filtered.match(rule.pattern);
      
      if (matches && matches.length > 0) {
        if (rule.action === 'remove') {
          filtered = filtered.replace(rule.pattern, '');
        } else if (rule.action === 'extract') {
          // 提取内容，去除标记
          filtered = filtered.replace(rule.pattern, '$1');
        }
        
        removed.push({
          rule: rule.name,
          count: matches.length
        });
      }
    }
    
    // 清理空白
    filtered = filtered
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    
    return { filtered, removed };
  }
  
  /**
   * 添加自定义规则
   */
  addRule(rule: ContentFilterRule): void {
    this.rules.push(rule);
  }
  
  /**
   * 禁用规则
   */
  disableRule(name: string): void {
    this.rules = this.rules.filter(r => r.name !== name);
  }
  
  /**
   * 获取当前规则
   */
  getRules(): ContentFilterRule[] {
    return [...this.rules];
  }
}