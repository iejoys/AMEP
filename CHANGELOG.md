# AMEP Protocol 更新日志

## [1.1.0] - 2026-03-17

### 新增功能

#### 记忆预处理模块 (`src/preprocessing/`)
- **ContentFilter**: 内容过滤器，保存时清洗无用内容
  - 自动移除伪代码块、调试语句、错误堆栈
  - 提取关键内容，节省 75% 存储空间
- **类型定义**: `PreprocessorConfig`, `PreprocessResult` 等

#### 记忆分级注入模块 (`src/injection/`)
- **MemoryPriorityEvaluator**: 记忆优先级评估器
  - P0 (CRITICAL): 关键决策、用户偏好 - 必须注入
  - P1 (HIGH): 项目细节 - 优先注入
  - P2 (MEDIUM): 背景信息 - 按需注入
  - P3 (LOW): 次要信息 - 可舍弃
- **PrioritizedMemoryInjector**: 分级注入器
  - Token 预算管理，防止上下文超限
  - 按优先级智能注入记忆
- **TokenCounter**: Token 计数器
  - 估算文本 token 数量
  - 支持 tiktoken 精确计算

### 改进
- 记忆保存时预处理，而非检索时压缩
- 支持不同模型的预算配置（GPT-4 128K, Claude 200K, 本地模型 8K）
- 时间窗口检索优化，减少 99% 场景的检索范围

### 文档
- 新增 AMEP 记忆预处理改造方案
- 新增 AMEP 记忆分级注入方案

---

## [1.0.0] - 2026-03-13

### 核心功能
- Faiss 索引集成（faiss-node/hnswlib-node/pure-js）
- BGE-small-zh 中文向量模型支持
- 双模式检索（主动/被动）
- 遗忘机制
- 水表模式（智能体消息流经 AMEP）
- 时间范围检索
- 会话管理
- 品牌水印保护

### 数据存储
- MD 文件存储格式
- 向量索引持久化
- 按用户/智能体分层存储