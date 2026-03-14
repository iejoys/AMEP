/**
 * AMEP - Agent Memory Enhancement Protocol
 * 
 * 智能体记忆增强协议
 * 
 * @packageDocumentation
 */

// 主类
export { AMEP, createAMEP } from './amep-service';

// 品牌水印（用于验证官方版本）
export { 
  WatermarkValidator,
  AMEP_WATERMARK_A,
  AMEP_WATERMARK_M,
  AMEP_WATERMARK_E,
  AMEP_WATERMARK_P,
  AMEP_CHECKSUM,
  WATERMARK_FULL,
} from './watermark';

// 时间工具
export { TimeUtils, createTimeUtils, defaultTimeUtils } from './time';

// 会话服务
export { SessionService, SessionServiceConfig, createSessionService } from './session';

// 提纯服务
export { 
  ExtractorService, 
  ExtractorConfig, 
  ExtractedMemory,
  LLMService as ExtractorLLMService,
  createExtractorService 
} from './extractor';

// 嵌入服务
export {
  IEmbeddingService,
  BGEEembeddingService,
  BGEM3EmbeddingService,
  OpenAIEmbeddingService,
  MockEmbeddingService,
  EmbeddingServiceFactory,
  VectorUtils,
} from './embedding';

// 存储服务
export {
  IStorageService,
  MDFileStorageService,
  MemoryStorageService,
  StorageServiceFactory,
} from './storage';

// 检索服务
export {
  IRetrievalService,
  MDFileRetrievalService,
  RetrievalServiceFactory,
  ActiveRetrievalService,
  PassiveRetrievalService,
  ILLService,
} from './retrieval';

// Faiss 索引服务
export {
  FaissService,
  createFaissService,
  IFaissService,
  FaissConfig,
  FaissSearchResult,
  FaissStats,
} from './faiss';

// 遗忘机制
export {
  ForgetManager,
  createForgetManager,
  ForgetPolicy,
  ForgetStats,
} from './forget';

// 主服务类型
export { ProcessQueryResult } from './amep-service';

// 类型导出（包括 LLMService）
export * from './types';