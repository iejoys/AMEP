import * as fs from 'fs';
import * as path from 'path';

/**
 * 编译时生成器 - 生成查找代码
 */
export class Compiler {
  /**
   * 编译字典生成查找代码
   * @param inputPath 输入字典 JSON 路径
   * @param outputPath 输出 TypeScript 文件路径
   * @param format 生成格式（'switch' | 'object'）
   */
  async compile(
    inputPath: string,
    outputPath: string,
    format: 'switch' | 'object' = 'switch'
  ): Promise<void> {
    // 读取字典
    const content = await fs.promises.readFile(inputPath, 'utf8');
    const data = JSON.parse(content);
    const shortcuts = data.shortcuts || data;
    const entries = Object.entries(shortcuts);
    
    console.log(`[AMEP] 开始编译：${entries.length} 条缩写`);
    
    // 生成代码
    let code: string;
    if (format === 'switch') {
      code = this.generateSwitchCode(entries);
    } else {
      code = this.generateObjectCode(entries);
    }
    
    // 确保输出目录存在
    const dir = path.dirname(outputPath);
    await fs.promises.mkdir(dir, { recursive: true });
    
    // 写入文件
    await fs.promises.writeFile(outputPath, code, 'utf8');
    
    console.log(`[AMEP] 编译完成：${outputPath}`);
    console.log(`[AMEP] 生成 ${entries.length} 条查找规则`);
  }
  
  /**
   * 生成 switch 语句代码
   */
  private generateSwitchCode(entries: [string, string][]): string {
    return `// 自动生成的查找函数（编译时优化）
// 不要手动修改此文件
// 生成时间：${new Date().toISOString()}

/**
 * 获取完整编码（缩写 → 编码）
 */
export function getCode(shortcut: string): string | undefined {
  switch (shortcut) {
${entries.map(([k, v]) => `    case '${k}': return '${v}';`).join('\n')}
    default: return undefined;
  }
}

/**
 * 获取缩写（编码 → 缩写）
 */
export function getShortcut(code: string): string | undefined {
  switch (code) {
${entries.map(([k, v]) => `    case '${v}': return '${k}';`).join('\n')}
    default: return undefined;
  }
}
`;
  }
  
  /**
   * 生成对象查找代码
   */
  private generateObjectCode(entries: [string, string][]): string {
    const forwardMap = entries.map(([k, v]) => `  '${k}': '${v}'`).join(',\n');
    const reverseMap = entries.map(([k, v]) => `  '${v}': '${k}'`).join(',\n');
    
    return `// 自动生成的查找函数（编译时优化）
// 不要手动修改此文件
// 生成时间：${new Date().toISOString()}

const forwardMap: Record<string, string> = {
${forwardMap}
};

const reverseMap: Record<string, string> = {
${reverseMap}
};

/**
 * 获取完整编码（缩写 → 编码）
 */
export function getCode(shortcut: string): string | undefined {
  return forwardMap[shortcut];
}

/**
 * 获取缩写（编码 → 缩写）
 */
export function getShortcut(code: string): string | undefined {
  return reverseMap[code];
}
`;
  }
  
  /**
   * 批量编译多个字典
   */
  async compileBatch(
    configs: Array<{
      input: string;
      output: string;
      format?: 'switch' | 'object';
    }>
  ): Promise<void> {
    for (const config of configs) {
      await this.compile(config.input, config.output, config.format || 'switch');
    }
  }
}

/**
 * CLI 命令行工具
 */
export class CLI {
  /**
   * 运行 CLI
   */
  async run(args: string[]): Promise<void> {
    const options = this.parseArgs(args);
    
    if (options.help) {
      this.showHelp();
      return;
    }
    
    if (!options.input || !options.output) {
      console.error('错误：需要指定输入和输出文件');
      this.showHelp();
      process.exit(1);
    }
    
    const compiler = new Compiler();
    try {
      await compiler.compile(options.input, options.output, options.format || 'switch');
    } catch (error) {
      console.error('编译失败:', error);
      process.exit(1);
    }
  }
  
  /**
   * 解析命令行参数
   */
  private parseArgs(args: string[]): {
    input?: string;
    output?: string;
    format?: 'switch' | 'object';
    help?: boolean;
  } {
    const options: any = {};
    
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      
      if (arg === '--input' || arg === '-i') {
        options.input = args[++i];
      } else if (arg === '--output' || arg === '-o') {
        options.output = args[++i];
      } else if (arg === '--format' || arg === '-f') {
        options.format = args[++i] as 'switch' | 'object';
      } else if (arg === '--help' || arg === '-h') {
        options.help = true;
      }
    }
    
    return options;
  }
  
  /**
   * 显示帮助信息
   */
  private showHelp(): void {
    console.log(`
AMEP 编译时生成器

用法:
  amep-compile --input <字典.json> --output <查找.ts> [选项]

选项:
  -i, --input     输入字典 JSON 文件路径
  -o, --output    输出 TypeScript 文件路径
  -f, --format    生成格式（switch | object），默认：switch
  -h, --help      显示帮助信息

示例:
  amep-compile -i dictionaries/default.json -o src/generated/lookup.ts
  amep-compile -i dict.json -o lookup.ts -f object
`);
  }
}

// 导出
export { Compiler } from './compiler';
