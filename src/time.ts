/**
 * AMEP 时间工具模块
 * 
 * 统一处理时区相关的时间操作
 * 确保存储、检索、日志时间一致性
 */

import type { TimezoneConfig } from './types';

/**
 * 默认时区配置
 */
const DEFAULT_CONFIG: Required<TimezoneConfig> = {
  timezone: 'Asia/Shanghai',
  locale: 'zh-CN',
};

/**
 * 时间工具类
 * 
 * 使用方式：
 * ```typescript
 * const timeUtils = new TimeUtils({ timezone: 'Asia/Shanghai' });
 * 
 * // 获取当前日期字符串（用于文件夹命名）
 * const dateStr = timeUtils.formatDate(new Date()); // "2026-03-14"
 * 
 * // 获取时间戳（用于存储）
 * const timestamp = timeUtils.formatTimestamp(new Date()); // "2026-03-14 12:34:56"
 * ```
 */
export class TimeUtils {
  private config: Required<TimezoneConfig>;

  constructor(config?: TimezoneConfig) {
    this.config = {
      timezone: config?.timezone || DEFAULT_CONFIG.timezone,
      locale: config?.locale || DEFAULT_CONFIG.locale,
    };
  }

  /**
   * 获取时区
   */
  get timezone(): string {
    return this.config.timezone;
  }

  /**
   * 获取语言环境
   */
  get locale(): string {
    return this.config.locale;
  }

  /**
   * 格式化日期（用于文件夹命名）
   * 
   * @param date 日期对象
   * @returns 格式 "2026-03-14"
   */
  formatDate(date: Date = new Date()): string {
    const parts = this.getDateParts(date);
    return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  }

  /**
   * 格式化时间戳（用于存储和日志）
   * 
   * @param date 日期对象
   * @returns 格式 "2026-03-14 12:34:56"
   */
  formatTimestamp(date: Date = new Date()): string {
    const parts = this.getDateParts(date);
    return `${this.formatDate(date)} ${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}:${String(parts.second).padStart(2, '0')}`;
  }

  /**
   * 格式化 ISO 时间戳（带时区信息）
   * 
   * @param date 日期对象
   * @returns 格式 "2026-03-14T12:34:56+08:00"
   */
  formatISO(date: Date = new Date()): string {
    // 获取时区偏移（小时）
    const offset = this.getTimezoneOffset(date);
    const offsetHours = Math.floor(Math.abs(offset) / 60);
    const offsetMinutes = Math.abs(offset) % 60;
    const sign = offset >= 0 ? '+' : '-';
    
    const parts = this.getDateParts(date);
    const isoStr = `${this.formatDate(date)}T${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}:${String(parts.second).padStart(2, '0')}`;
    
    return `${isoStr}${sign}${String(offsetHours).padStart(2, '0')}:${String(offsetMinutes).padStart(2, '0')}`;
  }

  /**
   * 获取日期的各个部分（考虑时区）
   */
  getDateParts(date: Date): {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
    dayOfWeek: number;
  } {
    // 使用 Intl.DateTimeFormat 获取指定时区的日期部分
    const formatter = new Intl.DateTimeFormat(this.config.locale, {
      timeZone: this.config.timezone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const getPart = (type: string): number => {
      const part = parts.find(p => p.type === type);
      return part ? parseInt(part.value, 10) : 0;
    };

    return {
      year: getPart('year'),
      month: getPart('month'),
      day: getPart('day'),
      hour: getPart('hour'),
      minute: getPart('minute'),
      second: getPart('second'),
      dayOfWeek: this.getDayOfWeek(date),
    };
  }

  /**
   * 获取星期几（0=周日, 1=周一, ..., 6=周六）
   */
  getDayOfWeek(date: Date): number {
    const formatter = new Intl.DateTimeFormat(this.config.locale, {
      timeZone: this.config.timezone,
      weekday: 'short',
    });
    const weekday = formatter.format(date);
    
    // 中文的星期映射
    const weekMap: Record<string, number> = {
      '日': 0, '周日': 0, '星期日': 0,
      '一': 1, '周一': 1, '星期一': 1,
      '二': 2, '周二': 2, '星期二': 2,
      '三': 3, '周三': 3, '星期三': 3,
      '四': 4, '周四': 4, '星期四': 4,
      '五': 5, '周五': 5, '星期五': 5,
      '六': 6, '周六': 6, '星期六': 6,
    };
    
    return weekMap[weekday] ?? new Date(date.toLocaleString('en-US', { timeZone: this.config.timezone })).getDay();
  }

  /**
   * 获取时区偏移（分钟）
   */
  getTimezoneOffset(date: Date = new Date()): number {
    // 获取指定时区与 UTC 的偏移
    const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(date.toLocaleString('en-US', { timeZone: this.config.timezone }));
    return (tzDate.getTime() - utcDate.getTime()) / (60 * 1000);
  }

  /**
   * 获取今天的开始时间（当天 00:00:00）
   */
  getTodayStart(): Date {
    const parts = this.getDateParts(new Date());
    return new Date(parts.year, parts.month - 1, parts.day, 0, 0, 0);
  }

  /**
   * 获取昨天的日期范围
   */
  getYesterdayRange(): { start: Date; end: Date } {
    const today = this.getTodayStart();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return { start: yesterday, end: today };
  }

  /**
   * 获取最近 N 天的日期范围
   */
  getRecentDaysRange(days: number): { start: Date; end: Date } {
    const now = new Date();
    const parts = this.getDateParts(now);
    const today = new Date(parts.year, parts.month - 1, parts.day, 0, 0, 0);
    const start = new Date(today);
    start.setDate(start.getDate() - days);
    return { start, end: now };
  }

  /**
   * 从时间戳字符串解析日期
   * 
   * 支持格式：
   * - "2026-03-14 12:34:56" (本地时间)
   * - "2026-03-14T12:34:56+08:00" (ISO 带时区)
   * - "2026-03-14T12:34:56Z" (UTC)
   */
  parseTimestamp(timestamp: string): Date {
    // 尝试 ISO 格式
    if (timestamp.includes('T')) {
      return new Date(timestamp);
    }
    
    // 本地时间格式 "2026-03-14 12:34:56"
    const match = timestamp.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
    if (match) {
      const [, year, month, day, hour, minute, second] = match;
      return new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour),
        parseInt(minute),
        parseInt(second)
      );
    }
    
    // 回退到 Date 解析
    return new Date(timestamp);
  }

  /**
   * 解析日期范围字符串
   * 
   * 支持格式：
   * - "今日" / "今天"
   * - "昨天"
   * - "最近一周" / "最近一个月" / "最近三个月"
   * - "2026.3.10-2026.3.13"
   * - "2026.3.10 12:00-2026.3.13 18:00"
   */
  parseTimeRange(timeRange: string): { start: Date; end: Date } | null {
    const now = new Date();
    const parts = this.getDateParts(now);
    const today = new Date(parts.year, parts.month - 1, parts.day, 0, 0, 0);

    // 预设时间范围
    if (timeRange === '今日' || timeRange === '今天') {
      return { start: today, end: now };
    }
    
    if (timeRange === '昨天') {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return { start: yesterday, end: today };
    }
    
    if (timeRange === '最近一周') {
      return this.getRecentDaysRange(7);
    }
    
    if (timeRange === '最近一个月') {
      return this.getRecentDaysRange(30);
    }
    
    if (timeRange === '最近三个月') {
      return this.getRecentDaysRange(90);
    }

    // 具体日期格式：2026.3.10-2026.3.13
    const dateRangeMatch = timeRange.match(
      /(\d{4})\.(\d{1,2})\.(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2}))?(?:-(\d{4})\.(\d{1,2})\.(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2}))?)?/
    );
    
    if (dateRangeMatch) {
      const [, startYear, startMonth, startDay, startHour, startMin, endYear, endMonth, endDay, endHour, endMin] = dateRangeMatch;
      
      const start = new Date(
        parseInt(startYear),
        parseInt(startMonth) - 1,
        parseInt(startDay),
        parseInt(startHour || '0'),
        parseInt(startMin || '0')
      );
      
      if (endYear) {
        const end = new Date(
          parseInt(endYear),
          parseInt(endMonth) - 1,
          parseInt(endDay),
          parseInt(endHour || '23'),
          parseInt(endMin || '59'),
          59
        );
        return { start, end };
      }
      
      // 只有开始日期，结束日期为当天 23:59:59
      const end = new Date(
        parseInt(startYear),
        parseInt(startMonth) - 1,
        parseInt(startDay),
        23, 59, 59
      );
      return { start, end };
    }

    return null;
  }
}

/**
 * 默认时间工具实例（中国时区）
 */
export const defaultTimeUtils = new TimeUtils();

/**
 * 创建时间工具实例
 */
export function createTimeUtils(config?: TimezoneConfig): TimeUtils {
  return new TimeUtils(config);
}

export default TimeUtils;