/**
 * Faiss 索引服务类型定义
 */

/**
 * Faiss 配置
 */
export interface FaissConfig {
  /** 索引类型 */
  indexType?: 'hnsw' | 'flat' | 'ivf';

  /** 向量维度，默认 384 */
  dimensions?: number;

  /** HNSW 参数 */
  hnsw?: {
    /** 连接数，默认 32 */
    M?: number;
    /** 搜索时的候选数，默认 64 */
    efSearch?: number;
    /** 构建时的候选数，默认 64 */
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

/**
 * Faiss 检索结果
 */
export interface FaissSearchResult {
  /** 记忆 ID */
  id: string;

  /** 相似度分数 */
  score: number;

  /** 内部索引 ID */
  internalId: number;
}

/**
 * Faiss 统计信息
 */
export interface FaissStats {
  /** 向量数量 */
  count: number;

  /** 索引类型 */
  indexType: string;

  /** 内存占用 (MB) */
  memoryUsage: number;

  /** 是否已加载 */
  loaded: boolean;

  /** 后端类型 */
  backend: 'faiss-node' | 'hnswlib-node' | 'pure-js';
}

/**
 * Faiss 服务接口
 */
export interface IFaissService {
  initialize(): Promise<void>;
  add(id: string, vector: number[]): void;
  addBatch(items: Array<{ id: string; vector: number[] }>): void;
  search(vector: number[], k: number): FaissSearchResult[];
  remove(id: string): boolean;
  clear(): void;
  save(): Promise<void>;
  load(): Promise<void>;
  getStats(): FaissStats;
  close(): void;
  isAvailable(): boolean;
}