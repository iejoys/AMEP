/**
 * 遗忘机制 - 自动清理过期记忆
 * 
 * 根据时间、访问频率、重要性等策略自动清理记忆
 */

import { IStorageService } from './storage';
import { IFaissService } from './faiss';
import { MemoryEntry } from './types';

/**
 * 遗忘策略配置
 */
export interface ForgetPolicy {
  /** 是否启用遗忘机制 */
  enabled?: boolean;
  /** 保留天数，超过则可能删除 */
  retentionDays?: number;
  /** 最少访问次数，低于此值可能被删除 */
  minAccessCount?: number;
  /** 最低重要性阈值 */
  minImportance?: number;
  /** 冷却期：最近 N 天访问过则保留 */
  cooldownDays?: number;
  /** 检查间隔（毫秒），默认 24 小时 */
  checkInterval?: number;
  /** 是否归档而非删除 */
  archiveInsteadOfDelete?: boolean;
  /** 归档目录 */
  archiveDir?: string;
}

/**
 * 遗忘统计
 */
export interface ForgetStats {
  /** 已删除数量 */
  deleted: number;
  /** 已归档数量 */
  archived: number;
  /** 保留数量 */
  kept: number;
  /** 检查时间 */
  checkedAt: Date;
}

/**
 * 遗忘管理器
 */
export class ForgetManager {
  private policy: Required<ForgetPolicy>;
  private storageService: IStorageService;
  private faissService: IFaissService | null;
  private checkTimer: NodeJS.Timeout | null = null;
  private running: boolean = false;

  constructor(
    storageService: IStorageService,
    faissService: IFaissService | null,
    policy?: ForgetPolicy
  ) {
    this.storageService = storageService;
    this.faissService = faissService;
    this.policy = {
      enabled: policy?.enabled ?? true,
      retentionDays: policy?.retentionDays || 90,
      minAccessCount: policy?.minAccessCount || 0,
      minImportance: policy?.minImportance || 0.1,
      cooldownDays: policy?.cooldownDays || 7,
      checkInterval: policy?.checkInterval || 24 * 60 * 60 * 1000,
      archiveInsteadOfDelete: policy?.archiveInsteadOfDelete || false,
      archiveDir: policy?.archiveDir || './data/amep/archive',
    };
  }

  /**
   * 启动定期检查
   */
  start(): void {
    if (!this.policy.enabled) {
      console.log('[AMEP] 遗忘机制已禁用');
      return;
    }

    if (this.checkTimer) {
      return;
    }

    this.checkTimer = setInterval(() => {
      this.checkAndClean().catch(console.error);
    }, this.policy.checkInterval);

    console.log(`[AMEP] 遗忘机制已启动，检查间隔: ${this.policy.checkInterval / 1000 / 60} 分钟`);
  }

  /**
   * 停止检查
   */
  stop(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
    console.log('[AMEP] 遗忘机制已停止');
  }

  /**
   * 执行清理
   */
  async checkAndClean(): Promise<ForgetStats> {
    if (this.running) {
      console.log('[AMEP] 遗忘清理正在进行中，跳过');
      return { deleted: 0, archived: 0, kept: 0, checkedAt: new Date() };
    }

    this.running = true;
    const stats: ForgetStats = {
      deleted: 0,
      archived: 0,
      kept: 0,
      checkedAt: new Date(),
    };

    try {
      console.log('[AMEP] 开始遗忘清理检查...');

      const storageStats = await this.storageService.getStats();

      // 遍历所有 userId/agentId 组合
      for (const key of Object.keys(storageStats.byAgent)) {
        const [userId, agentId] = key.split('/');
        if (!userId || !agentId) continue;

        const indexes = await this.storageService.loadAllIndexes(userId, agentId);

        for (const idx of indexes) {
          const entry = await this.storageService.get(idx.id);
          if (!entry) continue;

          if (this.shouldForget(entry)) {
            if (this.policy.archiveInsteadOfDelete) {
              await this.archiveEntry(entry);
              stats.archived++;
            } else {
              await this.deleteEntry(entry.id);
              stats.deleted++;
            }
          } else {
            stats.kept++;
          }
        }
      }

      console.log(`[AMEP] 遗忘清理完成: 删除 ${stats.deleted}, 归档 ${stats.archived}, 保留 ${stats.kept}`);
    } catch (error) {
      console.error('[AMEP] 遗忘清理失败:', error);
    } finally {
      this.running = false;
    }

    return stats;
  }

  /**
   * 判断是否应该遗忘
   */
  shouldForget(entry: MemoryEntry): boolean {
    const now = Date.now();
    const ageDays = (now - entry.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const daysSinceAccess = (now - entry.lastAccessed.getTime()) / (1000 * 60 * 60 * 24);

    // 1. 最近访问过，冷却期保护
    if (daysSinceAccess < this.policy.cooldownDays) {
      return false;
    }

    // 2. 高重要性保护（>= 0.8 永久保留）
    if (entry.importance >= 0.8) {
      return false;
    }

    // 3. 高频访问保护（访问次数 >= 10）
    if (entry.accessCount >= 10) {
      return false;
    }

    // 4. 超过保留期 + 低访问量 + 低重要性
    if (ageDays > this.policy.retentionDays) {
      if (entry.accessCount <= this.policy.minAccessCount && 
          entry.importance < this.policy.minImportance) {
        return true;
      }
    }

    // 5. 超过 2x 保留期，强制删除（除非极高重要性）
    if (ageDays > this.policy.retentionDays * 2 && entry.importance < 0.9) {
      return true;
    }

    return false;
  }

  /**
   * 更新策略
   */
  updatePolicy(policy: Partial<ForgetPolicy>): void {
    this.policy = { ...this.policy, ...policy };
    console.log('[AMEP] 遗忘策略已更新');
  }

  /**
   * 获取当前策略
   */
  getPolicy(): Required<ForgetPolicy> {
    return { ...this.policy };
  }

  // ==========================================
  // 私有方法
  // ==========================================

  private async deleteEntry(id: string): Promise<void> {
    // 从 Faiss 索引删除
    if (this.faissService) {
      this.faissService.remove(id);
    }

    // 从存储删除
    await this.storageService.delete(id);
  }

  private async archiveEntry(entry: MemoryEntry): Promise<void> {
    // TODO: 实现归档逻辑
    // 1. 写入归档文件
    // 2. 从活跃存储删除
    await this.deleteEntry(entry.id);
  }
}

/**
 * 创建遗忘管理器
 */
export function createForgetManager(
  storageService: IStorageService,
  faissService: IFaissService | null,
  policy?: ForgetPolicy
): ForgetManager {
  return new ForgetManager(storageService, faissService, policy);
}