/**
 * 会话管理服务
 * 
 * 管理对话会话的生命周期，包括创建、消息记录、结束和提纯触发
 * 
 * v2.0 新增：
 * - 追加写入会话消息
 * - 实时归档机制
 * - 掉线保护
 */

import * as fs from 'fs';
import * as path from 'path';
import { sanitizeId, safeWriteFile, safeAppendFile, ensureWithinBase } from './security';
import { randomUUID } from 'crypto';
import {
  Session,
  SessionMessage,
  CreateSessionRequest,
} from './types';

/**
 * 归档回调类型
 */
export type ArchiveCallback = (sessionId: string, messages: SessionMessage[]) => Promise<void>;

/**
 * 添加消息结果
 */
export interface AddMessageResult {
  /** 是否触发了归档 */
  archived: boolean;
  /** 归档的消息数量 */
  archiveCount: number;
  /** 当前内存中消息数 */
  currentCount: number;
}

/**
 * 会话服务配置
 */
export interface SessionServiceConfig {
  /** 存储目录 */
  storageDir: string;
  /** 新鲜对话阈值（秒） */
  freshThreshold: number;
  /** 自动保存间隔（毫秒） */
  autoSaveInterval: number;
  /** 上下文最大消息数 */
  maxContextMessages: number;
  /** 无活动超时（秒） */
  inactiveTimeout: number;
  /** 检查间隔（秒） */
  checkInterval: number;
}

/**
 * 会话服务
 */
export class SessionService {
  private config: Required<SessionServiceConfig>;
  private activeSessions: Map<string, Session>;
  private saveTimers: Map<string, NodeJS.Timeout>;
  private initialized: boolean = false;
  private archiveCallback: ArchiveCallback | null = null;
  private inactiveCheckTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<SessionServiceConfig> = {}) {
    this.config = {
      storageDir: config.storageDir || './data/amep/cache',
      freshThreshold: config.freshThreshold || 3600, // 1 小时
      autoSaveInterval: config.autoSaveInterval || 30000, // 30 秒
      maxContextMessages: config.maxContextMessages || 20, // 10 轮对话
      inactiveTimeout: config.inactiveTimeout || 300, // 5 分钟
      checkInterval: config.checkInterval || 60, // 1 分钟
    };
    this.activeSessions = new Map();
    this.saveTimers = new Map();
  }

  /**
   * 设置归档回调
   */
  setArchiveCallback(callback: ArchiveCallback): void {
    this.archiveCallback = callback;
  }

  /**
   * 初始化服务
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // 确保存储目录存在
    await this.ensureDirectory(this.config.storageDir);
    
    // 恢复活跃会话
    await this.restoreActiveSessions();
    
    // 启动掉线保护检查
    this.startInactiveCheck();

    this.initialized = true;
    console.log('[AMEP] 会话服务初始化完成');
  }

  /**
   * 关闭服务
   */
  async close(): Promise<void> {
    // 停止掉线保护检查
    if (this.inactiveCheckTimer) {
      clearInterval(this.inactiveCheckTimer);
      this.inactiveCheckTimer = null;
    }
    
    // 保存所有活跃会话
    for (const [sessionId] of this.activeSessions) {
      await this.saveSession(sessionId);
      this.clearSaveTimer(sessionId);
    }
    this.activeSessions.clear();
    this.initialized = false;
  }

  /**
   * 创建会话
   */
  async createSession(request: CreateSessionRequest): Promise<Session> {
    const now = new Date();
    const session: Session = {
      id: 'session_' + randomUUID().replace(/-/g, '').substring(0, 12),
      userId: request.userId,
      agentId: request.agentId,
      startTime: now,
      messages: [],
      messageCount: 0,
      status: 'active',
      lastActivity: now,
    };

    this.activeSessions.set(session.id, session);
    await this.saveSession(session.id);
    this.startAutoSave(session.id);

    console.log(`[AMEP] 创建会话: ${session.id}`);
    return session;
  }

  /**
   * 获取会话
   */
  getSession(sessionId: string): Session | undefined {
    return this.activeSessions.get(sessionId);
  }

  /**
   * 添加消息
   * 
   * 支持：
   * - 消息追加写入到文件
   * - 超限实时归档
   */
  async addMessage(sessionId: string, message: Omit<SessionMessage, 'timestamp'>): Promise<AddMessageResult> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    if (session.status !== 'active') {
      throw new Error(`会话已结束: ${sessionId}`);
    }

    const fullMessage: SessionMessage = {
      ...message,
      timestamp: new Date(),
    };

    session.messages.push(fullMessage);
    session.messageCount++;
    session.lastActivity = new Date();
    
    // 追加写入消息到文件
    await this.appendMessageToFile(session, fullMessage);

    // 检查是否需要实时归档
    let archived = false;
    let archiveCount = 0;
    
    if (session.messages.length > this.config.maxContextMessages && this.archiveCallback) {
      // 计算需要归档的消息
      const messagesToArchive = session.messages.slice(0, session.messages.length - this.config.maxContextMessages);
      
      if (messagesToArchive.length > 0) {
        console.log(`[AMEP] 实时归档: ${messagesToArchive.length} 条消息`);
        
        // 触发归档回调
        await this.archiveCallback(sessionId, messagesToArchive);
        
        // 从内存中移除已归档消息
        session.messages = session.messages.slice(-this.config.maxContextMessages);
        
        archived = true;
        archiveCount = messagesToArchive.length;
      }
    }

    return {
      archived,
      archiveCount,
      currentCount: session.messages.length,
    };
  }

  /**
   * 结束会话
   */
  async endSession(sessionId: string): Promise<Session> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    // 更新状态
    session.status = 'ended';
    session.endTime = new Date();

    // 保存到历史文件
    await this.archiveSession(session);

    // 清理
    this.clearSaveTimer(sessionId);
    this.activeSessions.delete(sessionId);

    console.log(`[AMEP] 结束会话: ${sessionId}, 消息数: ${session.messageCount}`);
    return session;
  }

  /**
   * 获取用户最近活跃会话
   */
  getRecentSession(userId: string, agentId?: string): Session | undefined {
    let recent: Session | undefined;
    let recentTime = 0;

    for (const session of this.activeSessions.values()) {
      if (session.userId !== userId) continue;
      if (agentId && session.agentId !== agentId) continue;
      if (session.status !== 'active') continue;

      if (session.lastActivity.getTime() > recentTime) {
        recentTime = session.lastActivity.getTime();
        recent = session;
      }
    }

    return recent;
  }

  /**
   * 检查会话是否新鲜
   */
  isFresh(sessionId: string): boolean {
    const session = this.activeSessions.get(sessionId);
    if (!session) return false;

    const elapsed = (Date.now() - session.lastActivity.getTime()) / 1000;
    return elapsed < this.config.freshThreshold;
  }

  /**
   * 获取活跃会话数
   */
  getActiveSessionCount(): number {
    return this.activeSessions.size;
  }

  /**
   * 获取所有活跃会话
   */
  getActiveSessions(): Session[] {
    return Array.from(this.activeSessions.values());
  }

  // ==========================================
  // 历史会话加载（用于记忆永续）
  // ==========================================

  /**
   * 加载最近的历史会话
   * 用于在智能体启动时恢复上下文
   */
  async loadRecentArchivedSession(userId: string, agentId?: string): Promise<Session | null> {
    const sessionsDir = this.config.storageDir.replace('/cache', '/sessions');
    
    if (!fs.existsSync(sessionsDir)) {
      return null;
    }

    // 获取所有月份目录
    const monthDirs = fs.readdirSync(sessionsDir)
      .filter(f => fs.statSync(path.join(sessionsDir, f)).isDirectory())
      .sort((a, b) => b.localeCompare(a)); // 降序，最新的在前

    if (monthDirs.length === 0) {
      return null;
    }

    // 查找最新的匹配会话
    for (const monthDir of monthDirs) {
      const monthPath = path.join(sessionsDir, monthDir);
      const sessionFiles = fs.readdirSync(monthPath)
        .filter(f => f.endsWith('.json'))
        .sort((a, b) => b.localeCompare(a)); // 降序，最新的在前

      for (const file of sessionFiles) {
        try {
          const filePath = path.join(monthPath, file);
          const content = fs.readFileSync(filePath, 'utf-8');
          const session: Session = JSON.parse(content);

          // 匹配用户和智能体
          if (session.userId === userId) {
            if (!agentId || session.agentId === agentId) {
              console.log(`[AMEP] 加载历史会话: ${session.id}, 消息数: ${session.messageCount}`);
              return session;
            }
          }
        } catch (e) {
          console.error(`[AMEP] 加载会话文件失败: ${file}`, e);
        }
      }
    }

    return null;
  }

  /**
   * 获取最近的对话上下文
   * 自动从历史会话中提取最近的对话
   */
  async getRecentContext(userId: string, agentId?: string, maxMessages: number = 10): Promise<{
    messages: SessionMessage[];
    sessionId: string | null;
    timestamp: Date | null;
  }> {
    // 先查找活跃会话
    const activeSession = this.getRecentSession(userId, agentId);
    if (activeSession && activeSession.messages.length > 0) {
      return {
        messages: activeSession.messages.slice(-maxMessages),
        sessionId: activeSession.id,
        timestamp: activeSession.lastActivity,
      };
    }

    // 查找历史会话
    const archivedSession = await this.loadRecentArchivedSession(userId, agentId);
    if (archivedSession && archivedSession.messages.length > 0) {
      return {
        messages: archivedSession.messages.slice(-maxMessages),
        sessionId: archivedSession.id,
        timestamp: archivedSession.lastActivity ? new Date(archivedSession.lastActivity) : null,
      };
    }

    return {
      messages: [],
      sessionId: null,
      timestamp: null,
    };
  }

  // ==========================================
  // 私有方法
  // ==========================================

  private async ensureDirectory(dir: string): Promise<void> {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * 恢复活跃会话
   * 从 cache 目录读取未过期的会话
   */
  private async restoreActiveSessions(): Promise<void> {
    if (!fs.existsSync(this.config.storageDir)) return;
    
    const files = await fs.promises.readdir(this.config.storageDir);
    const now = Date.now();
    const freshMs = this.config.freshThreshold * 1000;
    
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      
      try {
        const filePath = path.join(this.config.storageDir, file);
        const content = await fs.promises.readFile(filePath, 'utf-8');
        const session: Session = JSON.parse(content);
        
        // 恢复 Date 对象
        session.startTime = new Date(session.startTime);
        session.lastActivity = new Date(session.lastActivity);
        if (session.endTime) session.endTime = new Date(session.endTime);
        session.messages = session.messages.map(m => ({
          ...m,
          timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
        }));
        
        // 只恢复未过期的活跃会话
        const elapsed = now - session.lastActivity.getTime();
        if (elapsed < freshMs && session.status === 'active') {
          this.activeSessions.set(session.id, session);
          this.startAutoSave(session.id);
          console.log(`[AMEP] 恢复会话: ${session.id}, 消息数: ${session.messageCount}`);
        }
      } catch (e) {
        console.error(`[AMEP] 恢复会话失败: ${file}`, e);
      }
    }
  }

  private startAutoSave(sessionId: string): void {
    if (this.saveTimers.has(sessionId)) return;

    const timer = setInterval(() => {
      this.saveSession(sessionId).catch(console.error);
    }, this.config.autoSaveInterval);

    this.saveTimers.set(sessionId, timer);
  }

  private clearSaveTimer(sessionId: string): void {
    const timer = this.saveTimers.get(sessionId);
    if (timer) {
      clearInterval(timer);
      this.saveTimers.delete(sessionId);
    }
  }

  private async saveSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    const safeId = sanitizeId(sessionId);
    const relative = `${safeId}.json`;
    const data = JSON.stringify(session, null, 2);

    await safeWriteFile(this.config.storageDir, relative, data);
  }

  private async archiveSession(session: Session): Promise<void> {
    // 创建历史目录（按月份）
    const now = new Date();
    const monthDir = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const archiveDir = path.join(
      this.config.storageDir.replace('/cache', '/sessions'),
      monthDir
    );

    await this.ensureDirectory(archiveDir);

    // 保存历史文件
    const dateStr = now.toISOString().split('T')[0];
    const fileName = `${dateStr}_${session.id}.json`;
    const data = JSON.stringify(session, null, 2);
    const archiveBase = this.config.storageDir.replace('/cache', '/sessions');
    const relativeArchivePath = path.join(monthDir, fileName);
    await safeWriteFile(archiveBase, relativeArchivePath, data);

    // 删除缓存文件（确保在安全目录内）
    const cacheFile = path.resolve(this.config.storageDir, `${session.id}.json`);
    try {
      if (fs.existsSync(cacheFile) && ensureWithinBase(this.config.storageDir, cacheFile)) {
        await fs.promises.unlink(cacheFile);
      }
    } catch (e) {
      console.error('[AMEP] 删除缓存文件失败:', e);
    }
  }

  /**
   * 追加消息到文件
   */
  private async appendMessageToFile(session: Session, message: SessionMessage): Promise<void> {
    const sessionsDir = this.config.storageDir.replace('/cache', '/sessions');
    const userDir = path.join(sessionsDir, session.userId, session.agentId);
    
    await this.ensureDirectory(userDir);
    
    const logFile = path.join(userDir, `${session.id}.log`);
    const line = JSON.stringify({
      role: message.role,
      content: message.content,
      timestamp: message.timestamp ? message.timestamp.toISOString() : new Date().toISOString(),
    }) + '\n';
    
    await safeAppendFile(sessionsDir, path.join(session.userId, session.agentId, `${session.id}.log`), line);
  }

  /**
   * 启动掉线保护检查
   */
  private startInactiveCheck(): void {
    if (this.inactiveCheckTimer) return;
    
    this.inactiveCheckTimer = setInterval(() => {
      this.checkInactiveSessions().catch(console.error);
    }, this.config.checkInterval * 1000);
    
    console.log(`[AMEP] 掉线保护已启动，超时: ${this.config.inactiveTimeout}秒，检查间隔: ${this.config.checkInterval}秒`);
  }

  /**
   * 检查超时会话
   */
  private async checkInactiveSessions(): Promise<void> {
    const now = Date.now();
    const timeoutMs = this.config.inactiveTimeout * 1000;
    
    for (const [sessionId, session] of this.activeSessions) {
      const elapsed = now - session.lastActivity.getTime();
      
      if (elapsed > timeoutMs) {
        console.log(`[AMEP] 会话超时，自动归档: ${sessionId}`);
        await this.archiveAndCloseSession(sessionId);
      }
    }
  }

  /**
   * 归档并关闭会话
   */
  async archiveAndCloseSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;
    
    // 触发归档回调（归档所有剩余消息）
    if (this.archiveCallback && session.messages.length > 0) {
      await this.archiveCallback(sessionId, session.messages);
    }
    
    // 归档会话文件
    await this.archiveSession(session);
    
    // 清理
    this.clearSaveTimer(sessionId);
    this.activeSessions.delete(sessionId);
  }
}

/**
 * 创建会话服务实例
 */
export function createSessionService(config?: Partial<SessionServiceConfig>): SessionService {
  return new SessionService(config);
}