/**
 * AMEP 存储服务 - MD 文件 + 向量索引存储
 * 
 * 目录结构：{basePath}/{userId}/{agentId}/{periodDir}/  ← MD 文件
 *          {basePath}/{userId}/{agentId}/index/        ← 索引文件
 * 
 * @copyright 2026 星未来软件工作室 (AHIVE.CN)
 * @see ahive.cn
 */

import * as fs from 'fs';
import * as path from 'path';
import { safeAppendFile, safeWriteFile, ensureWithinBase } from './security';
import {
  MemoryEntry, CreateMemoryRequest, StorageConfig,
  MemoryIndex, StoragePath, MemoryFragment, PeriodInfo, FileStorageStats,
  TimezoneConfig,
} from './types';
import { TimeUtils, defaultTimeUtils } from './time';

/**
 * @internal 生成唯一 ID
 * 
 * ID 格式: mem_{timestamp36}{random36}
 * 
 * 水印植入: 前缀 'mem' 中的 m=77(M), e=69(E) 属于 AMEP 序列
 * 时间戳部分的进制转换隐含 65(A)=10进制的 65, 80(P)=10进制的 80
 */
const generateId = (): string => {
  // A=65: 时间戳基数
  const a_base = 65;
  // M=77: 随机数长度
  const m_len = 77 % 10 + 2; // = 9
  // E=69: 时间戳偏移
  const e_offset = 69 % 60; // = 9
  // P=80: 最终校验
  const p_check = 80;
  
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, m_len);
  
  return `mem_${timestamp.toString(36)}${random}`;
};

export interface IStorageService {
  create(request: CreateMemoryRequest, embedding: number[]): Promise<MemoryEntry>;
  get(id: string): Promise<MemoryEntry | null>;
  delete(id: string): Promise<void>;
  createBatch(entries: Array<{ request: CreateMemoryRequest; embedding: number[]; }>): Promise<MemoryEntry[]>;
  loadAllIndexes(userId: string, agentId: string): Promise<MemoryIndex[]>;
  loadIndexesByPeriod(userId: string, agentId: string, periodName: string): Promise<MemoryIndex[]>;
  readMemoryContent(userId: string, agentId: string, filePath: string, offset: number, length: number): Promise<string>;
  readMemoryFile(userId: string, agentId: string, filePath: string): Promise<string>;
  getStats(): Promise<FileStorageStats>;
  initialize(): Promise<void>;
  close(): Promise<void>;
}

export class MDFileStorageService implements IStorageService {
  private config: Required<StorageConfig>;
  private initialized: boolean = false;
  private indexCache: Map<string, MemoryIndex[]> = new Map();
  private entryCache: Map<string, MemoryEntry> = new Map();
  private timeUtils: TimeUtils;

  constructor(config?: StorageConfig, timezoneConfig?: TimezoneConfig) {
    // 合并默认配置
    this.config = {
      type: config?.type || 'file',
      basePath: config?.basePath || config?.path || './data/amep',
      path: config?.basePath || config?.path || './data/amep',  // 兼容旧代码
      memoryDir: config?.memoryDir || '',
      sessionDir: config?.sessionDir || '',
      cacheDir: config?.cacheDir || '',
      periodHours: config?.periodHours || 8,
      retentionDays: config?.retentionDays || 90,
      autoSave: config?.autoSave ?? true,
      autoSaveInterval: config?.autoSaveInterval || 60000,
      maxMemories: config?.maxMemories || 100000,
    };
    
    // 初始化时间工具
    this.timeUtils = new TimeUtils(timezoneConfig);
    
    // 解析路径
    if (!this.config.memoryDir) {
      this.config.memoryDir = `${this.config.basePath}/memory`;
    }
    if (!this.config.sessionDir) {
      this.config.sessionDir = `${this.config.basePath}/sessions`;
    }
    if (!this.config.cacheDir) {
      this.config.cacheDir = `${this.config.basePath}/cache`;
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    // 确保基础目录存在
    await this.ensureDir(this.config.basePath);
    await this.ensureDir(this.config.memoryDir);
    await this.ensureDir(this.config.sessionDir);
    await this.ensureDir(this.config.cacheDir);
    
    this.initialized = true;
    console.log(`[AMEP] MD 存储初始化: ${this.config.basePath}`);
  }

  async close(): Promise<void> {
    this.indexCache.clear();
    this.entryCache.clear();
    this.initialized = false;
  }

  async create(request: CreateMemoryRequest, embedding: number[]): Promise<MemoryEntry> {
    const now = new Date();
    const userId = request.userId || 'default_user';
    const agentId = request.agentId || 'default';
    
    const entry: MemoryEntry = {
      id: generateId(), agentId, userId, type: 'context' as any,
      content: request.content, embedding, importance: request.importance ?? 0.5, confidence: 1.0,
      accessCount: 0, lastAccessed: now, createdAt: now, updatedAt: now, sessionId: request.sessionId,
    };

    const sp = this.getStoragePath(userId, agentId, now);
    
    // 创建目录: {basePath}/{userId}/{agentId}/{periodDir}/
    await this.ensureDir(path.join(this.config.basePath, userId));
    await this.ensureDir(path.join(this.config.basePath, userId, agentId));
    await this.ensureDir(path.join(this.config.basePath, userId, agentId, sp.periodDir));
    await this.ensureDir(path.join(this.config.basePath, userId, agentId, 'index'));

    // mdPath 和 idxPath 使用相对路径（相对于 basePath）
    const mdPath = path.join(userId, agentId, sp.periodDir, sp.hourFile);
    const idxPath = path.join(userId, agentId, 'index', sp.indexFile);
    
    const { offset, length } = await this.appendMD(mdPath, entry);
    await this.appendIndex(idxPath, {
      id: entry.id, 
      file: path.join(sp.periodDir, sp.hourFile),  // 包含 periodDir 的完整相对路径
      offset, length, embedding,
      timestamp: this.timeUtils.formatTimestamp(now),  // 使用时区格式化的时间戳
      sessionId: request.sessionId, userId, agentId,
    });

    this.entryCache.set(entry.id, entry);
    return entry;
  }

  async get(id: string): Promise<MemoryEntry | null> { return this.entryCache.get(id) || null; }
  async delete(id: string): Promise<void> { console.warn('[AMEP] MD存储不支持单条删除'); }
  
  async createBatch(items: Array<{ request: CreateMemoryRequest; embedding: number[]; }>): Promise<MemoryEntry[]> {
    const entries: MemoryEntry[] = [];
    for (const item of items) entries.push(await this.create(item.request, item.embedding));
    return entries;
  }

  async loadAllIndexes(userId: string, agentId: string): Promise<MemoryIndex[]> {
    const idxDir = path.join(this.config.basePath, userId, agentId, 'index');
    if (!fs.existsSync(idxDir)) return [];
    
    const all: MemoryIndex[] = [];
    for (const f of await fs.promises.readdir(idxDir)) {
      try {
        const filePath = path.join(idxDir, f);
        const content = await fs.promises.readFile(filePath, 'utf8');
        
        if (f.endsWith('.jsonl')) {
          // 新格式：每行一条 JSON
          for (const line of content.trim().split('\n')) {
            if (line.trim()) {
              all.push(JSON.parse(line));
            }
          }
        } else if (f.endsWith('.json')) {
          // 旧格式：整个数组（兼容）
          all.push(...JSON.parse(content));
        }
      } catch (e) {
        // 忽略解析错误
      }
    }
    return all;
  }

  async loadIndexesByPeriod(userId: string, agentId: string, periodName: string): Promise<MemoryIndex[]> {
    const key = `${userId}:${agentId}:${periodName}`;
    if (this.indexCache.has(key)) return this.indexCache.get(key)!;
    
    const idxDir = path.join(this.config.basePath, userId, agentId, 'index');
    
    // 优先尝试 .jsonl 格式
    let idxFile = path.join(idxDir, `${periodName}.jsonl`);
    if (fs.existsSync(idxFile)) {
      const content = await fs.promises.readFile(idxFile, 'utf8');
      const idx: MemoryIndex[] = [];
      for (const line of content.trim().split('\n')) {
        if (line.trim()) {
          idx.push(JSON.parse(line));
        }
      }
      this.indexCache.set(key, idx);
      return idx;
    }
    
    // 兼容旧 .json 格式
    idxFile = path.join(idxDir, `${periodName}.json`);
    if (fs.existsSync(idxFile)) {
      const idx = JSON.parse(await fs.promises.readFile(idxFile, 'utf8'));
      this.indexCache.set(key, idx);
      return idx;
    }
    
    return [];
  }

  async readMemoryContent(userId: string, agentId: string, filePath: string, offset: number, length: number): Promise<string> {
    const fp = path.join(this.config.basePath, userId, agentId, filePath);
    if (!fs.existsSync(fp)) return '';
    
    const fd = await fs.promises.open(fp, 'r');
    const buf = Buffer.alloc(length);
    await fd.read(buf, 0, length, offset);
    await fd.close();
    return buf.toString('utf8');
  }

  async readMemoryFile(userId: string, agentId: string, filePath: string): Promise<string> {
    const fp = path.join(this.config.basePath, userId, agentId, filePath);
    return fs.existsSync(fp) ? await fs.promises.readFile(fp, 'utf8') : '';
  }

  async getStats(): Promise<FileStorageStats> {
    const stats: FileStorageStats = { totalMemories: 0, totalFiles: 0, totalIndexFiles: 0, byAgent: {}, storageSize: 0 };
    if (!fs.existsSync(this.config.basePath)) return stats;
    
    // 遍历 userId 目录
    for (const userId of await fs.promises.readdir(this.config.basePath)) {
      const userDir = path.join(this.config.basePath, userId);
      if (!(await fs.promises.stat(userDir)).isDirectory()) continue;
      
      // 遍历 agentId 目录
      for (const agentId of await fs.promises.readdir(userDir)) {
        const agentDir = path.join(userDir, agentId);
        if (!(await fs.promises.stat(agentDir)).isDirectory()) continue;
        
        const idx = await this.loadAllIndexes(userId, agentId);
        const key = `${userId}/${agentId}`;
        stats.byAgent[key] = idx.length;
        stats.totalMemories += idx.length;
        
        const iDir = path.join(agentDir, 'index');
        if (fs.existsSync(iDir)) stats.totalIndexFiles += (await fs.promises.readdir(iDir)).length;
        stats.storageSize += await this.dirSize(agentDir);
      }
    }
    return stats;
  }

  private getStoragePath(userId: string, agentId: string, date: Date): StoragePath {
    const pi = this.getPeriod(date);
    const parts = this.timeUtils.getDateParts(date);
    const h = String(parts.hour).padStart(2, '0');
    const nextHour = String(parts.hour + 1).padStart(2, '0');
    return {
      agentDir: agentId, 
      periodDir: pi.folderName, 
      hourFile: `${h}-${nextHour}.md`,
      indexFile: pi.indexFileName,
      mdFilePath: path.join(userId, agentId, pi.folderName, `${h}-${nextHour}.md`),
      indexFilePath: path.join(userId, agentId, 'index', pi.indexFileName),
    };
  }

  private getPeriod(date: Date): PeriodInfo {
    // 使用配置的时区
    const parts = this.timeUtils.getDateParts(date);
    const h = parts.hour;
    const s = Math.floor(h / this.config.periodHours) * this.config.periodHours;
    const e = s + this.config.periodHours;
    // 使用时区格式化的日期
    const d = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
    // 索引文件改为 .jsonl 格式（追加写入，并发安全）
    return { startHour: s, endHour: e, folderName: `${d}_${String(s).padStart(2,'0')}-${String(e).padStart(2,'0')}`, indexFileName: `${d}_${String(s).padStart(2,'0')}-${String(e).padStart(2,'0')}.jsonl` };
  }

  private async appendMD(fp: string, entry: MemoryEntry): Promise<{ offset: number; length: number }> {
    const full = path.join(this.config.basePath, fp);
    let offset = fs.existsSync(full) ? (await fs.promises.stat(full)).size : 0;
    // 使用时区格式化的时间戳
    const timestamp = this.timeUtils.formatTimestamp(entry.createdAt);
    const content = `# ${entry.id}\n时间: ${timestamp}\n用户: ${entry.userId}\n${entry.sessionId ? '会话: ' + entry.sessionId : ''}\n\n${entry.content}\n\n---\n\n`;

    await safeAppendFile(this.config.basePath, fp, content);
    return { offset, length: Buffer.byteLength(content, 'utf8') };
  }

  /**
   * 追加索引项（使用 .jsonl 格式）
   * 
   * 特点：
   * - 每行一条 JSON 记录
   * - 追加写入，原子操作
   * - 并发安全，无读写冲突
   */
  private async appendIndex(fp: string, item: MemoryIndex): Promise<void> {
    // 1. 更新内存缓存
    const cacheKey = fp.replace(/\\/g, '/');
    const cached = this.indexCache.get(cacheKey) || [];
    cached.push(item);
    this.indexCache.set(cacheKey, cached);
    
    // 2. 追加写入文件（每行一条，原子操作）
    const line = JSON.stringify(item) + '\n';
    await safeAppendFile(this.config.basePath, fp, line);
  }

  private async ensureDir(d: string): Promise<void> { if (!fs.existsSync(d)) await fs.promises.mkdir(d, { recursive: true }); }
  
  private async dirSize(d: string): Promise<number> {
    let s = 0;
    for (const i of await fs.promises.readdir(d)) { 
      const p = path.join(d, i); 
      s += (await fs.promises.stat(p)).isDirectory() ? await this.dirSize(p) : (await fs.promises.stat(p)).size; 
    }
    return s;
  }
}



export class MemoryStorageService implements IStorageService {
  private memories: Map<string, MemoryEntry> = new Map();
  async initialize(): Promise<void> {}
  async close(): Promise<void> {}
  async create(r: CreateMemoryRequest, e: number[]): Promise<MemoryEntry> {
    const n = new Date();
    const ent: MemoryEntry = { id: generateId(), agentId: r.agentId, userId: r.userId || '', type: 'context' as any, content: r.content, embedding: e, importance: r.importance ?? 0.5, confidence: 1.0, accessCount: 0, lastAccessed: n, createdAt: n, updatedAt: n, sessionId: r.sessionId };
    this.memories.set(ent.id, ent); return ent;
  }
  async get(id: string): Promise<MemoryEntry | null> { return this.memories.get(id) || null; }
  async delete(id: string): Promise<void> { this.memories.delete(id); }
  async createBatch(items: Array<{ request: CreateMemoryRequest; embedding: number[]; }>): Promise<MemoryEntry[]> { const r: MemoryEntry[] = []; for (const i of items) r.push(await this.create(i.request, i.embedding)); return r; }
  async loadAllIndexes(userId: string, agentId: string): Promise<MemoryIndex[]> { return []; }
  async loadIndexesByPeriod(userId: string, agentId: string, periodName: string): Promise<MemoryIndex[]> { return []; }
  async readMemoryContent(userId: string, agentId: string, filePath: string, offset: number, length: number): Promise<string> { return ''; }
  async readMemoryFile(userId: string, agentId: string, filePath: string): Promise<string> { return ''; }
  async getStats(): Promise<FileStorageStats> { return { totalMemories: this.memories.size, totalFiles: 0, totalIndexFiles: 0, byAgent: {}, storageSize: 0 }; }
}

export class StorageServiceFactory {
  static create(config?: StorageConfig, timezoneConfig?: TimezoneConfig): IStorageService {
    return config?.type === 'file' 
      ? new MDFileStorageService(config, timezoneConfig) 
      : new MemoryStorageService();
  }
}