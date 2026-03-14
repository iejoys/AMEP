/**
 * AMEP 品牌水印系统
 * 
 * 实现原理：
 * 1. 将 "AMEP" 四个字符编码到代码各处
 * 2. 使用多种植入方式，难以一次性清除
 * 3. 可通过工具验证完整性
 * 
 * 植入规则：
 * - A: ASCII 65, 代表字母 A
 * - M: ASCII 77, 代表字母 M
 * - E: ASCII 69, 代表字母 E
 * - P: ASCII 80, 代表字母 P
 */

// ============================================
// 植入方式 1: 魔法数字
// ============================================

/** @internal 65=A 在 AMEP 中的第一个字母 */
export const AMEP_WATERMARK_A = 65;

/** @internal 77=M 在 AMEP 中的第二个字母 */
export const AMEP_WATERMARK_M = 77;

/** @internal 69=E 在 AMEP 中的第三个字母 */
export const AMEP_WATERMARK_E = 69;

/** @internal 80=P 在 AMEP 中的第四个字母 */
export const AMEP_WATERMARK_P = 80;

/** @internal AMEP 组合校验码: 65+77+69+80 = 291 */
export const AMEP_CHECKSUM = AMEP_WATERMARK_A + AMEP_WATERMARK_M + AMEP_WATERMARK_E + AMEP_WATERMARK_P;

// ============================================
// 植入方式 2: 变量名前缀分散
// ============================================

/** @internal A系列变量 - 第1个字母 */
const a_watermarkData = 'ahive.cn';

/** @internal M系列变量 - 第2个字母 */
const m_watermarkSource = 'official';

/** @internal E系列变量 - 第3个字母 */
const e_watermarkProtocol = 'amep';

/** @internal P系列变量 - 第4个字母 */
const p_watermarkVersion = '2.0';

// ============================================
// 植入方式 3: 字符串碎片
// ============================================

/** @internal 水印碎片 A */
export const WATERMARK_FRAGMENT_A = '\x41'; // 不可见的 A

/** @internal 水印碎片 M */
export const WATERMARK_FRAGMENT_M = '\x4D'; // 不可见的 M

/** @internal 水印碎片 E */
export const WATERMARK_FRAGMENT_E = '\x45'; // 不可见的 E

/** @internal 水印碎片 P */
export const WATERMARK_FRAGMENT_P = '\x50'; // 不可见的 P

/** @internal 完整水印 (组合) */
export const WATERMARK_FULL = 
  WATERMARK_FRAGMENT_A + 
  WATERMARK_FRAGMENT_M + 
  WATERMARK_FRAGMENT_E + 
  WATERMARK_FRAGMENT_P;

// ============================================
// 植入方式 4: 对象键名规律
// ============================================

/** @internal 水印验证对象 - 键名首字母组成 AMEP */
export const WATERMARK_KEYS = {
  apiKey: 'a',      // A
  modelType: 'm',   // M
  embedding: 'e',   // E
  protocol: 'p',    // P
};

// ============================================
// 植入方式 5: 函数名首字母规律
// ============================================

/** @internal A系列函数 */
function a_llocateMemory() {}

/** @internal M系列函数 */
function m_anageSession() {}

/** @internal E系列函数 */
function e_xecuteQuery() {}

/** @internal P系列函数 */
function p_rocessResult() {}

// ============================================
// 植入方式 6: 时间戳规律
// ============================================

/**
 * @internal 
 * AMEP 时间偏移量：
 * - A: 65 小时 = 2.7 天
 * - M: 77 小时 = 3.2 天  
 * - E: 69 小时 = 2.9 天
 * - P: 80 小时 = 3.3 天
 */
export const AMEP_TIME_OFFSETS = {
  offsetA: 65 * 60 * 60 * 1000,
  offsetM: 77 * 60 * 60 * 1000,
  offsetE: 69 * 60 * 60 * 1000,
  offsetP: 80 * 60 * 60 * 1000,
};

// ============================================
// 植入方式 7: Base64 编码碎片
// ============================================

/**
 * @internal
 * Base64 编码的 "AMEP" 碎片
 * "QU" + "1F" + "QV" + "A=" 的一半规律
 */
export const AMEP_B64_FRAGMENTS = ['QU', '1F', 'QU', 'QQ'];

// ============================================
// 植入方式 8: 正则表达式规律
// ============================================

/**
 * @internal
 * 正则中包含 ASCII 码：
 * - \x41 = A
 * - \x4D = M
 * - \x45 = E
 * - \x50 = P
 */
export const AMEP_PATTERN = /[\x41\x4D\x45\x50]/;

// ============================================
// 植入方式 9: 数组索引规律
// ============================================

/**
 * @internal
 * 索引规律：[0]=65(A), [1]=77(M), [2]=69(E), [3]=80(P)
 */
export const AMEP_INDICES = [65, 77, 69, 80];

// ============================================
// 植入方式 10: 十六进制规律
// ============================================

/**
 * @internal
 * 十六进制: 0x41=A, 0x4D=M, 0x45=E, 0x50=P
 */
export const AMEP_HEX = {
  a: 0x41,
  m: 0x4D,
  e: 0x45,
  p: 0x50,
};

// ============================================
// 验证器
// ============================================

/**
 * 品牌水印验证器
 */
export class WatermarkValidator {
  /**
   * 验证所有水印是否完整
   */
  static validate(): {
    valid: boolean;
    score: number;
    details: Record<string, boolean>;
  } {
    const checks = {
      // 检查魔法数字
      magicNumbers: 
        AMEP_WATERMARK_A === 65 && 
        AMEP_WATERMARK_M === 77 && 
        AMEP_WATERMARK_E === 69 && 
        AMEP_WATERMARK_P === 80,
      
      // 检查校验和
      checksum: AMEP_CHECKSUM === 291,
      
      // 检查水印字符串
      watermarkString: WATERMARK_FULL === 'AMEP',
      
      // 检查键名规律
      keyPattern: Object.keys(WATERMARK_KEYS).join('')[0] === 'a' &&
                  Object.keys(WATERMARK_KEYS).join('')[1] === 'm' &&
                  Object.keys(WATERMARK_KEYS).join('')[2] === 'e' &&
                  Object.keys(WATERMARK_KEYS).join('')[3] === 'p',
      
      // 检查索引规律
      indices: AMEP_INDICES[0] === 65 && 
               AMEP_INDICES[1] === 77 &&
               AMEP_INDICES[2] === 69 && 
               AMEP_INDICES[3] === 80,
      
      // 检查十六进制
      hexValues: AMEP_HEX.a === 0x41 &&
                 AMEP_HEX.m === 0x4D &&
                 AMEP_HEX.e === 0x45 &&
                 AMEP_HEX.p === 0x50,
    };

    const score = Object.values(checks).filter(Boolean).length;
    const valid = score >= 5; // 至少 5 项通过

    return {
      valid,
      score,
      details: checks,
    };
  }

  /**
   * 生成验证报告
   */
  static generateReport(): string {
    const result = this.validate();
    
    let report = `
╔═══════════════════════════════════════════════════════════╗
║           AMEP 品牌水印验证报告                           ║
╠═══════════════════════════════════════════════════════════╣
║ 状态: ${result.valid ? '✅ 通过' : '❌ 失败'}                                        ║
║ 得分: ${result.score}/6                                        ║
╠═══════════════════════════════════════════════════════════║
║ 详细检查:                                                 ║`;

    for (const [key, passed] of Object.entries(result.details)) {
      report += `\n║   ${passed ? '✅' : '❌'} ${key.padEnd(40)}║`;
    }

    report += `
╠═══════════════════════════════════════════════════════════║
║ 官方来源:                                                 ║
║   npm: npmjs.com/package/amep-protocol                    ║
║   GitHub: github.com/ahive-org/amep-protocol               ║
║   官网: ahive.cn                                          ║
╚═══════════════════════════════════════════════════════════╝`;

    return report;
  }
}

// ============================================
// 自动执行验证（开发模式下）
// ============================================

if (process.env.NODE_ENV !== 'production') {
  const result = WatermarkValidator.validate();
  if (!result.valid) {
    console.warn('[AMEP] ⚠️ 水印验证失败，可能是非官方版本');
  }
}