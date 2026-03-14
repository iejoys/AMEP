/**
 * AMEP 嵌入服务 - BGE 语义嵌入
 * 
 * 使用 @huggingface/transformers 实现 BGE 系列模型嵌入
 * 支持：bge-small-en, bge-small-zh, bge-base-en, bge-base-zh, bge-m3
 */

import { EmbeddingConfig, EmbeddingResult } from './types';

// 动态导入 @huggingface/transformers (可选依赖)
type FeatureExtractionPipeline = any;
type Tensor = any;

/**
 * BGE 模型配置
 */
interface BGEModelConfig {
  /** HuggingFace 模型 ID */
  modelId: string;
  /** 向量维度 */
  dimensions: number;
  /** 模型描述 */
  description: string;
}

/**
 * BGE 模型配置映射
 */
const BGE_MODELS: Record<string, BGEModelConfig> = {
  'bge-small': {
    modelId: 'onnx-community/bge-small-en-v1.5-ONNX',
    dimensions: 384,
    description: 'BGE Small English ONNX (384维)',
  },
  'bge-small-en': {
    modelId: 'onnx-community/bge-small-en-v1.5-ONNX',
    dimensions: 384,
    description: 'BGE Small English ONNX (384维)',
  },
  'bge-small-zh': {
    // 本地 ONNX 模型路径，需先运行 scripts/convert_to_onnx.py
    modelId: './models/bge-small-zh-v1.5-onnx',
    dimensions: 512,
    description: 'BGE Small Chinese ONNX (512维)',
  },
  'bge-base-en': {
    modelId: 'onnx-community/bge-base-en-v1.5-ONNX',
    dimensions: 768,
    description: 'BGE Base English ONNX (768维)',
  },
  'bge-base-zh': {
    modelId: 'onnx-community/bge-base-en-v1.5-ONNX',
    dimensions: 768,
    description: 'BGE Base (中文请使用 bge-m3 远程API)',
  },
  'bge-m3': {
    modelId: 'BAAI/bge-m3',
    dimensions: 1024,
    description: 'BGE M3 Multilingual (1024维) - 需要远程API',
  },
};

/**
 * 嵌入服务接口
 */
export interface IEmbeddingService {
  /**
   * 生成文本嵌入向量
   */
  embed(text: string): Promise<EmbeddingResult>;

  /**
   * 批量生成嵌入向量
   */
  embedBatch(texts: string[]): Promise<EmbeddingResult[]>;

  /**
   * 计算两个向量的余弦相似度
   */
  similarity(vec1: number[], vec2: number[]): number;

  /**
   * 获取向量维度
   */
  getDimensions(): number;

  /**
   * 健康检查
   */
  healthCheck(): Promise<boolean>;
}

/**
 * BGE 嵌入服务 (真正实现)
 * 
 * 使用 @huggingface/transformers 加载 BGE 系列模型
 */
export class BGEEembeddingService implements IEmbeddingService {
  private config: Required<EmbeddingConfig>;
  private cache: Map<string, number[]>;
  private initialized: boolean = false;
  private extractor: FeatureExtractionPipeline | null = null;
  private initPromise: Promise<void> | null = null;
  private modelConfig: BGEModelConfig;
  private dimensions: number = 384;

  constructor(config?: EmbeddingConfig) {
    this.config = {
      modelType: config?.modelType || 'bge-small',
      modelPath: config?.modelPath || '',
      apiUrl: config?.apiUrl || '',
      apiKey: config?.apiKey || '',
      batchSize: config?.batchSize || 8,
      enableCache: config?.enableCache ?? true,
    };
    this.cache = new Map();
    
    // 获取模型配置
    this.modelConfig = BGE_MODELS[this.config.modelType] || BGE_MODELS['bge-small'];
    this.dimensions = this.modelConfig.dimensions;
  }

  /**
   * 初始化模型
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    // 防止重复初始化
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.doInitialize();
    return this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    console.log(`[AMEP] 正在初始化 ${this.modelConfig.description}...`);
    const startTime = Date.now();

    try {
      // 动态导入 @huggingface/transformers
      const { pipeline, env } = await import('@huggingface/transformers');
      
      // 确定模型路径
      let modelIdOrPath = this.modelConfig.modelId;
      
      // 如果提供了 modelPath，使用它作为完整路径
      if (this.config.modelPath) {
        // 检查是否是绝对路径
        const path = await import('path');
        const fs = await import('fs');
        
        let absolutePath = this.config.modelPath;
        
        // 如果是相对路径，转换为绝对路径
        if (!path.isAbsolute(this.config.modelPath)) {
          absolutePath = path.resolve(process.cwd(), this.config.modelPath);
        }
        
        // 验证路径是否存在
        if (fs.existsSync(absolutePath)) {
          modelIdOrPath = absolutePath;
          console.log(`[AMEP] 使用本地模型: ${absolutePath}`);
        } else {
          console.warn(`[AMEP] 本地模型路径不存在: ${absolutePath}`);
          console.warn(`[AMEP] 尝试从远程下载...`);
        }
      }
      
      // 配置模型缓存目录（用于远程下载）
      env.cacheDir = this.config.modelPath || './models';
      
      // 设置模型源
      if (this.config.apiUrl) {
        env.remoteHost = this.config.apiUrl;
        console.log(`[AMEP] 使用自定义模型源: ${this.config.apiUrl}`);
      } else {
        // 国内镜像
        env.remoteHost = 'https://hf-mirror.com';
        console.log('[AMEP] 使用国内镜像: https://hf-mirror.com');
      }

      // 创建特征提取 pipeline
      this.extractor = await pipeline(
        'feature-extraction',
        modelIdOrPath,
        {
          progress_callback: (progress: any) => {
            if (progress.status === 'downloading') {
              console.log(`[AMEP] 下载模型: ${progress.file} (${Math.round(progress.progress || 0)}%)`);
            }
          }
        }
      );

      this.initialized = true;
      const elapsed = Date.now() - startTime;
      console.log(`[AMEP] ${this.modelConfig.description} 初始化完成 (${elapsed}ms)`);

    } catch (error: any) {
      console.error('[AMEP] BGE 模型初始化失败:', error.message);
      console.log('[AMEP] 请确保已安装 @huggingface/transformers: npm install @huggingface/transformers');
      throw error;
    }
  }


  /**
   * 生成嵌入向量
   */
  async embed(text: string): Promise<EmbeddingResult> {
    await this.initialize();

    const startTime = Date.now();

    // 检查缓存
    if (this.config.enableCache && this.cache.has(text)) {
      return {
        embedding: this.cache.get(text)!,
        dimensions: this.dimensions,
        latency: Date.now() - startTime,
      };
    }

    if (!this.extractor) {
      throw new Error('BGE 模型未初始化');
    }

    // 执行嵌入
    const output = await this.extractor(text, {
      pooling: 'cls',
      normalize: true,
    });

    // 转换为数组
    const embedding = Array.from(output.data) as number[];

    // 缓存结果
    if (this.config.enableCache) {
      this.cache.set(text, embedding);
    }

    return {
      embedding,
      dimensions: this.dimensions,
      latency: Date.now() - startTime,
    };
  }

  /**
   * 批量生成嵌入向量
   */
  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];
    const batchSize = this.config.batchSize;

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      
      // 并行处理当前批次
      const batchResults = await Promise.all(
        batch.map(text => this.embed(text))
      );
      
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * 计算余弦相似度
   */
  similarity(vec1: number[], vec2: number[]): number {
    return VectorUtils.cosineSimilarity(vec1, vec2);
  }

  /**
   * 获取向量维度
   */
  getDimensions(): number {
    return this.dimensions;
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.initialize();
      const result = await this.embed('test');
      return result.embedding.length === this.dimensions;
    } catch {
      return false;
    }
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 获取缓存大小
   */
  getCacheSize(): number {
    return this.cache.size;
  }
}

/**
 * OpenAI 嵌入服务
 */
export class OpenAIEmbeddingService implements IEmbeddingService {
  private config: Required<EmbeddingConfig>;

  constructor(config: EmbeddingConfig) {
    this.config = {
      modelType: 'openai',
      modelPath: '',
      apiUrl: config.apiUrl || 'https://api.openai.com/v1',
      apiKey: config.apiKey || '',
      batchSize: config.batchSize || 32,
      enableCache: config.enableCache ?? true,
    };
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const startTime = Date.now();

    // 优先从环境变量读取密钥，避免在配置中明文存储
    const apiKey = process.env.AMEP_API_KEY || this.config.apiKey || '';
    if (this.config.apiKey && !process.env.AMEP_API_KEY) {
      console.warn('[AMEP] Warning: embedding apiKey present in config; prefer AMEP_API_KEY env var');
    }

    const response = await fetch(`${this.config.apiUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API 错误: ${response.status}`);
    }

    const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
    const embedding = data.data[0].embedding;

    return {
      embedding,
      dimensions: embedding.length,
      latency: Date.now() - startTime,
    };
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    const startTime = Date.now();

    const apiKey = process.env.AMEP_API_KEY || this.config.apiKey || '';

    const response = await fetch(`${this.config.apiUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: texts,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API 错误: ${response.status}`);
    }

    const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
    const latency = Date.now() - startTime;

    return data.data.map((item) => ({
      embedding: item.embedding,
      dimensions: item.embedding.length,
      latency,
    }));
  }

  similarity(vec1: number[], vec2: number[]): number {
    return VectorUtils.cosineSimilarity(vec1, vec2);
  }

  getDimensions(): number {
    return 1536;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.embed('test');
      return result.embedding.length > 0;
    } catch {
      return false;
    }
  }
}

/**
 * BGE-M3 远程嵌入服务
 * 
 * BGE-M3 模型较大（~2.2GB），建议通过远程 API 调用
 */
export class BGEM3EmbeddingService implements IEmbeddingService {
  private config: Required<EmbeddingConfig>;
  private cache: Map<string, number[]>;

  constructor(config: EmbeddingConfig) {
    this.config = {
      modelType: 'bge-m3',
      modelPath: '',
      apiUrl: config.apiUrl || 'http://localhost:8000/embed',
      apiKey: config.apiKey || '',
      batchSize: config.batchSize || 32,
      enableCache: config.enableCache ?? true,
    };
    this.cache = new Map();
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const startTime = Date.now();

    if (this.config.enableCache && this.cache.has(text)) {
      return {
        embedding: this.cache.get(text)!,
        dimensions: 1024,
        latency: Date.now() - startTime,
      };
    }

    // 优先从环境变量读取密钥，避免在配置中明文存储
    const apiKey = process.env.AMEP_API_KEY || this.config.apiKey || '';
    if (this.config.apiKey && !process.env.AMEP_API_KEY) {
      console.warn('[AMEP] Warning: embedding apiKey present in config; prefer AMEP_API_KEY env var');
    }

    const response = await fetch(this.config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey && { 'Authorization': `Bearer ${apiKey}` }),
      },
      body: JSON.stringify({
        model: 'bge-m3',
        input: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`BGE-M3 API 错误: ${response.status}`);
    }

    const data = await response.json() as { embedding?: number[]; data?: Array<{ embedding: number[] }> };
    const embedding = data.embedding || data.data?.[0]?.embedding;

    if (!embedding) {
      throw new Error('BGE-M3 API 返回格式错误');
    }

    if (this.config.enableCache) {
      this.cache.set(text, embedding);
    }

    return {
      embedding,
      dimensions: embedding.length,
      latency: Date.now() - startTime,
    };
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    const startTime = Date.now();

    // 优先从环境变量读取密钥，避免在配置中明文存储
    const apiKey = process.env.AMEP_API_KEY || this.config.apiKey || '';
    if (this.config.apiKey && !process.env.AMEP_API_KEY) {
      console.warn('[AMEP] Warning: embedding apiKey present in config; prefer AMEP_API_KEY env var');
    }

    const response = await fetch(this.config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey && { 'Authorization': `Bearer ${apiKey}` }),
      },
      body: JSON.stringify({
        model: 'bge-m3',
        input: texts,
      }),
    });

    if (!response.ok) {
      throw new Error(`BGE-M3 API 错误: ${response.status}`);
    }

    const data = await response.json() as { data: Array<{ embedding: number[] }> };
    const latency = Date.now() - startTime;

    return data.data.map((item) => ({
      embedding: item.embedding,
      dimensions: item.embedding.length,
      latency,
    }));
  }

  similarity(vec1: number[], vec2: number[]): number {
    return VectorUtils.cosineSimilarity(vec1, vec2);
  }

  getDimensions(): number {
    return 1024;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.embed('test');
      return result.embedding.length === 1024;
    } catch {
      return false;
    }
  }
}

/**
 * 模拟嵌入服务 (用于测试，无需安装依赖)
 */
export class MockEmbeddingService implements IEmbeddingService {
  private cache: Map<string, number[]>;
  private dimensions: number;

  constructor(config?: EmbeddingConfig) {
    this.cache = new Map();
    const modelType = config?.modelType || 'bge-small';
    this.dimensions = BGE_MODELS[modelType]?.dimensions || 384;
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const startTime = Date.now();

    if (this.cache.has(text)) {
      return {
        embedding: this.cache.get(text)!,
        dimensions: this.dimensions,
        latency: Date.now() - startTime,
      };
    }

    // 生成确定性伪向量
    const embedding = this.generatePseudoEmbedding(text);
    this.cache.set(text, embedding);

    return {
      embedding,
      dimensions: this.dimensions,
      latency: Date.now() - startTime,
    };
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    return Promise.all(texts.map(text => this.embed(text)));
  }

  similarity(vec1: number[], vec2: number[]): number {
    return VectorUtils.cosineSimilarity(vec1, vec2);
  }

  getDimensions(): number {
    return this.dimensions;
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }

  private generatePseudoEmbedding(text: string): number[] {
    const embedding: number[] = [];
    
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }

    const seed = Math.abs(hash);
    for (let i = 0; i < this.dimensions; i++) {
      const value = Math.sin(seed + i * 0.1) * 0.5;
      embedding.push(value);
    }

    // 归一化
    const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    if (norm > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= norm;
      }
    }

    return embedding;
  }
}

/**
 * 嵌入服务工厂
 */
export class EmbeddingServiceFactory {
  /**
   * 创建嵌入服务
   */
  static create(config: EmbeddingConfig): IEmbeddingService {
    const modelType = config.modelType || 'bge-small';
    
    // OpenAI
    if (modelType === 'openai') {
      return new OpenAIEmbeddingService(config);
    }
    
    // BGE-M3 (远程 API)
    if (modelType === 'bge-m3') {
      if (!config.apiUrl) {
        console.warn('[AMEP] BGE-M3 需要配置 apiUrl，将使用 mock 实现');
        return new MockEmbeddingService(config);
      }
      return new BGEM3EmbeddingService(config);
    }
    
    // Mock
    if (modelType === 'mock') {
      return new MockEmbeddingService(config);
    }
    
    // BGE 系列 (bge-small, bge-small-en, bge-small-zh, bge-base-en, bge-base-zh)
    return new BGEEembeddingService(config);
  }

  /**
   * 创建嵌入服务 (带降级)
   */
  static async createWithFallback(config: EmbeddingConfig): Promise<IEmbeddingService> {
    const modelType = config.modelType || 'bge-small';
    
    if (modelType === 'openai') {
      return new OpenAIEmbeddingService(config);
    }

    if (modelType === 'bge-m3') {
      if (!config.apiUrl) {
        console.warn('[AMEP] BGE-M3 需要配置 apiUrl，将使用 mock 实现');
        return new MockEmbeddingService(config);
      }
      return new BGEM3EmbeddingService(config);
    }

    if (modelType === 'mock') {
      return new MockEmbeddingService(config);
    }

    // 尝试 BGE 本地模型
    try {
      const service = new BGEEembeddingService(config);
      await service.healthCheck();
      return service;
    } catch (error) {
      console.warn('[AMEP] BGE 模型不可用，降级到模拟实现');
      console.warn('[AMEP] 安装真正的嵌入支持: npm install @huggingface/transformers');
      return new MockEmbeddingService(config);
    }
  }
}

/**
 * 向量工具函数
 */
export class VectorUtils {
  /**
   * 计算余弦相似度
   */
  static cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      throw new Error('向量维度不匹配');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * 向量归一化
   */
  static normalize(vec: number[]): number[] {
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    if (norm === 0) return vec;
    return vec.map(v => v / norm);
  }

  /**
   * 向量加法
   */
  static add(vec1: number[], vec2: number[]): number[] {
    if (vec1.length !== vec2.length) {
      throw new Error('向量维度不匹配');
    }
    return vec1.map((v, i) => v + vec2[i]);
  }

  /**
   * 向量减法
   */
  static subtract(vec1: number[], vec2: number[]): number[] {
    if (vec1.length !== vec2.length) {
      throw new Error('向量维度不匹配');
    }
    return vec1.map((v, i) => v - vec2[i]);
  }

  /**
   * 向量点积
   */
  static dot(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      throw new Error('向量维度不匹配');
    }
    return vec1.reduce((sum, v, i) => sum + v * vec2[i], 0);
  }

  /**
   * 欧几里得距离
   */
  static euclideanDistance(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      throw new Error('向量维度不匹配');
    }
    return Math.sqrt(
      vec1.reduce((sum, v, i) => sum + Math.pow(v - vec2[i], 2), 0)
    );
  }
}

// 兼容旧版本的别名
export const LocalEmbeddingService = BGEEembeddingService;