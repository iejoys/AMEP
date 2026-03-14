/**
 * Faiss 索引服务
 * 
 * 支持多种后端：faiss-node > hnswlib-node > pure-js
 */

import * as fs from 'fs';
import * as path from 'path';
import { IFaissService, FaissConfig, FaissSearchResult, FaissStats } from './types';

type BackendType = 'faiss-node' | 'hnswlib-node' | 'pure-js';

export class FaissService implements IFaissService {
  private config: Required<FaissConfig>;
  private index: any = null;
  private idToInternal: Map<string, number> = new Map();
  private internalToId: Map<number, string> = new Map();
  private nextInternalId: number = 0;
  private initialized: boolean = false;
  private backend: BackendType = 'pure-js';
  private saveTimer?: NodeJS.Timeout;
  private vectors: number[][] = [];  // pure-js 后端使用
  private lastSaveCount: number = 0;  // 上次保存时的数量

  constructor(config?: FaissConfig) {
    this.config = {
      indexType: config?.indexType || 'hnsw',
      dimensions: config?.dimensions || 384,
      hnsw: {
        M: config?.hnsw?.M || 32,
        efSearch: config?.hnsw?.efSearch || 64,
        efConstruction: config?.hnsw?.efConstruction || 64,
      },
      indexPath: config?.indexPath || './data/amep/faiss',
      autoSave: config?.autoSave ?? true,
      autoSaveInterval: config?.autoSaveInterval || 60000,
      maxElements: config?.maxElements || 1000000,
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('[AMEP] 正在初始化向量索引...');

    // 尝试加载 faiss-node
    try {
      // @ts-ignore - 可选依赖
      const faiss = await import('faiss-node');
      await this.initFaiss(faiss);
      this.backend = 'faiss-node';
    } catch (e) {
      // 尝试加载 hnswlib-node
      try {
        // @ts-ignore - 可选依赖
        const hnswlib = await import('hnswlib-node');
        await this.initHnswlib(hnswlib);
        this.backend = 'hnswlib-node';
      } catch (e2) {
        // 降级到纯 JS
        this.initPureJS();
        this.backend = 'pure-js';
      }
    }

    // 尝试加载已有索引
    await this.load();

    // 启动自动保存
    if (this.config.autoSave) {
      this.startAutoSave();
    }

    this.initialized = true;
    console.log(`[AMEP] 向量索引初始化完成 (后端: ${this.backend})`);
  }

  private async initFaiss(faiss: any): Promise<void> {
    const { M, efConstruction } = this.config.hnsw;

    this.index = new faiss.IndexHNSWFlat(
      this.config.dimensions,
      M
    );
    this.index.hnsw.efConstruction = efConstruction;
    this.vectors = [];  // faiss-node 需要额外存储向量用于检索

    console.log(`[AMEP] Faiss HNSW 索引初始化 (M=${M}, dim=${this.config.dimensions})`);
  }

  private async initHnswlib(hnswlib: any): Promise<void> {
    const { M, efConstruction, efSearch } = this.config.hnsw;

    this.index = new hnswlib.HierarchicalNSW(
      'cosine',
      this.config.dimensions,
      this.config.maxElements,
      M,
      efConstruction
    );
    this.index.setEf(efSearch);

    console.log(`[AMEP] hnswlib 索引初始化 (M=${M}, ef=${efSearch})`);
  }

  private initPureJS(): void {
    this.index = null;
    this.vectors = [];
    console.log('[AMEP] 纯 JS 向量索引初始化 (性能较低，建议安装 hnswlib-node)');
  }

  isAvailable(): boolean {
    return this.initialized;
  }

  add(id: string, vector: number[]): void {
    if (this.idToInternal.has(id)) {
      return;  // 已存在，跳过
    }

    const internalId = this.nextInternalId++;
    this.idToInternal.set(id, internalId);
    this.internalToId.set(internalId, id);

    if (this.backend === 'pure-js') {
      this.vectors.push(vector);
    } else if (this.index) {
      try {
        if (this.backend === 'hnswlib-node') {
          this.index.addPoint(vector, internalId);
        } else {
          this.index.add(vector);
          this.vectors.push(vector);  // faiss-node 需要额外存储
        }
      } catch (e) {
        console.error('[AMEP] 添加向量失败:', e);
      }
    }
  }

  addBatch(items: Array<{ id: string; vector: number[] }>): void {
    for (const item of items) {
      this.add(item.id, item.vector);
    }
  }

  search(queryVector: number[], k: number): FaissSearchResult[] {
    if (!this.initialized || this.idToInternal.size === 0) {
      return [];
    }

    const actualK = Math.min(k, this.idToInternal.size);

    if (this.backend === 'pure-js') {
      return this.searchPureJS(queryVector, actualK);
    } else if (this.backend === 'hnswlib-node' && this.index) {
      return this.searchHnswlib(queryVector, actualK);
    } else if (this.backend === 'faiss-node' && this.index) {
      return this.searchFaiss(queryVector, actualK);
    }

    return [];
  }

  private searchPureJS(query: number[], k: number): FaissSearchResult[] {
    console.log('[AMEP] searchPureJS: vectors=', this.vectors.length, 'k=', k);
    
    const scores: Array<{ internalId: number; score: number }> = [];

    for (let i = 0; i < this.vectors.length; i++) {
      const score = this.cosineSimilarity(query, this.vectors[i]);
      if (this.internalToId.has(i)) {
        scores.push({ internalId: i, score });
      }
    }

    scores.sort((a, b) => b.score - a.score);

    console.log('[AMEP] searchPureJS: top scores=', scores.slice(0, 3).map(s => ({ id: this.internalToId.get(s.internalId), score: s.score?.toFixed(4) })));

    return scores.slice(0, k).map(s => ({
      id: this.internalToId.get(s.internalId) || '',
      score: s.score,
      internalId: s.internalId,
    }));
  }

  private searchHnswlib(query: number[], k: number): FaissSearchResult[] {
    try {
      const results = this.index.searchKnn(query, k);

      return results.neighbors.map((internalId: number, i: number) => ({
        id: this.internalToId.get(internalId) || '',
        score: results.distances[i],
        internalId,
      }));
    } catch (e) {
      console.error('[AMEP] hnswlib 检索失败:', e);
      return [];
    }
  }

  private searchFaiss(query: number[], k: number): FaissSearchResult[] {
    try {
      const results = this.index.search(query, k);

      return results.labels.map((internalId: number, i: number) => {
        const id = this.internalToId.get(internalId) || '';
        const distance = results.distances[i];
        const score = 1 / (1 + distance);  // L2 距离转相似度

        return { id, score, internalId };
      });
    } catch (e) {
      console.error('[AMEP] faiss 检索失败:', e);
      return [];
    }
  }

  remove(id: string): boolean {
    const internalId = this.idToInternal.get(id);
    if (internalId === undefined) return false;

    this.idToInternal.delete(id);
    this.internalToId.delete(internalId);

    return true;
  }

  /**
   * 清空索引
   */
  clear(): void {
    this.idToInternal.clear();
    this.internalToId.clear();
    this.nextInternalId = 0;
    this.vectors = [];
    
    // 重新初始化索引
    if (this.backend === 'pure-js') {
      this.index = null;
      this.vectors = [];
    } else if (this.backend === 'hnswlib-node') {
      // hnswlib 需要重新创建
      const { M, efConstruction, efSearch } = this.config.hnsw;
      try {
        // @ts-ignore
        const hnswlib = require('hnswlib-node');
        this.index = new hnswlib.HierarchicalNSW(
          'cosine',
          this.config.dimensions,
          this.config.maxElements,
          M,
          efConstruction
        );
        this.index.setEf(efSearch);
      } catch (e) {
        console.error('[AMEP] 重新初始化 hnswlib 失败:', e);
      }
    }
    
    console.log('[AMEP] Faiss 索引已清空');
  }

  async save(): Promise<void> {
    if (this.idToInternal.size === 0) return;
    
    // 只在有变化时打印日志
    const hasChanges = this.idToInternal.size !== this.lastSaveCount;
    this.lastSaveCount = this.idToInternal.size;

    const indexPath = this.config.indexPath;
    await this.ensureDir(indexPath);

    try {
      // 保存 ID 映射
      const idMapPath = path.join(indexPath, 'id_map.json');
      const idMap = {
        version: '1.0.0',
        backend: this.backend,
        dimensions: this.config.dimensions,
        idToInternal: Object.fromEntries(this.idToInternal),
        nextInternalId: this.nextInternalId,
        savedAt: new Date().toISOString(),
      };
      await fs.promises.writeFile(idMapPath, JSON.stringify(idMap, null, 2));

      // 保存向量数据
      if (this.backend === 'pure-js' || this.backend === 'faiss-node') {
        const vectorsPath = path.join(indexPath, 'vectors.json');
        await fs.promises.writeFile(vectorsPath, JSON.stringify(this.vectors));
      }

      // 保存 hnswlib 索引
      if (this.backend === 'hnswlib-node' && this.index && this.index.writeIndex) {
        const hnswPath = path.join(indexPath, 'index.hnsw');
        await this.index.writeIndex(hnswPath);
      }

      // 只在有变化时打印日志
      if (hasChanges) {
        console.log(`[AMEP] 向量索引已保存: ${this.idToInternal.size} 条向量`);
      }
    } catch (e) {
      console.error('[AMEP] 保存索引失败:', e);
    }
  }

  async load(): Promise<void> {
    const indexPath = this.config.indexPath;
    const idMapPath = path.join(indexPath, 'id_map.json');

    if (!fs.existsSync(idMapPath)) return;

    try {
      const idMapData = JSON.parse(await fs.promises.readFile(idMapPath, 'utf8'));

      // 恢复 ID 映射
      this.idToInternal = new Map(
        Object.entries(idMapData.idToInternal).map(([k, v]) => [k, v as number])
      );
      this.nextInternalId = idMapData.nextInternalId || this.idToInternal.size;

      // 重建内部映射
      for (const [id, internal] of this.idToInternal) {
        this.internalToId.set(internal, id);
      }

      // 加载向量数据
      const vectorsPath = path.join(indexPath, 'vectors.json');
      if (fs.existsSync(vectorsPath)) {
        this.vectors = JSON.parse(await fs.promises.readFile(vectorsPath, 'utf8'));
      }

      // 加载 hnswlib 索引
      if (this.backend === 'hnswlib-node' && this.index && this.index.readIndex) {
        const hnswPath = path.join(indexPath, 'index.hnsw');
        if (fs.existsSync(hnswPath)) {
          await this.index.readIndex(hnswPath);
        }
      }

      console.log(`[AMEP] 向量索引已加载: ${this.idToInternal.size} 条向量`);
    } catch (e) {
      console.error('[AMEP] 加载索引失败:', e);
    }
  }

  getStats(): FaissStats {
    return {
      count: this.idToInternal.size,
      indexType: this.config.indexType,
      memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024,
      loaded: this.initialized,
      backend: this.backend,
    };
  }

  close(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
    }
    this.save().catch(console.error);
  }

  private startAutoSave(): void {
    this.saveTimer = setInterval(() => {
      this.save().catch(console.error);
    }, this.config.autoSaveInterval);
  }

  private async ensureDir(dir: string): Promise<void> {
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true });
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

/**
 * 创建 Faiss 服务实例
 */
export function createFaissService(config?: FaissConfig): IFaissService {
  return new FaissService(config);
}