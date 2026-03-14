# AMEP 人格图谱模块设计方案

## 一、概述

人格图谱模块用于从对话中提取、存储和进化用户/智能体的人格信息，实现更个性化的对话体验。

---

## 二、人格模型选择

### 1. 三层架构

| 层级 | 模型 | 用途 |
|------|------|------|
| 核心层 | Big Five (OCEAN) | 底层连续值维度，适合进化 |
| 映射层 | MBTI | 16种类型，用户易懂 |
| 表现层 | 偏好标签 | 沟通风格、话题偏好等 |

### 2. Big Five 维度

| 维度 | 英文 | 说明 | 高分特征 | 低分特征 |
|------|------|------|----------|----------|
| 开放性 | Openness | 求新求变 | 好奇、创意 | 保守、传统 |
| 尽责性 | Conscientiousness | 自律程度 | 有序、负责 | 随性、灵活 |
| 外向性 | Extraversion | 社交倾向 | 热情、活跃 | 内向、安静 |
| 宜人性 | Agreeableness | 合作倾向 | 友善、信任 | 批判、竞争 |
| 神经质 | Neuroticism | 情绪稳定 | 敏感、情绪化 | 稳定、冷静 |

---

## 三、数据结构

```typescript
/**
 * 人格画像
 */
interface PersonalityProfile {
  // 唯一标识
  id: string;
  userId: string;
  agentId: string;
  
  // Big Five 连续值 (0-100)
  bigFive: {
    openness: number;
    conscientiousness: number;
    extraversion: number;
    agreeableness: number;
    neuroticism: number;
  };
  
  // MBTI 类型（从 Big Five 映射）
  mbti: string;
  
  // 身份信息
  identity: {
    name?: string;
    nickname?: string;
    gender?: string;
    ageGroup?: string;
    occupation?: string;
    location?: string;
  };
  
  // 偏好
  preferences: {
    communicationStyle: 'direct' | 'indirect';
    formality: 'formal' | 'casual' | 'mixed';
    humorLevel: 'high' | 'medium' | 'low';
    responseLength: 'brief' | 'detailed';
    topics: string[];
    languages: string[];
  };
  
  // 与智能体关系
  relationship: {
    type: 'friend' | 'mentor' | 'assistant' | 'partner' | 'other';
    intimacy: number;           // 亲密度 0-100
    interactionCount: number;   // 交互次数
    firstMet: Date;
    lastInteraction: Date;
  };
  
  // 进化元数据
  meta: {
    version: number;
    createdAt: Date;
    lastUpdated: Date;
    stabilityScore: number;     // 稳定性 0-1
    updateCount: number;
  };
}

/**
 * 人格进化事件
 */
interface PersonalityEvolutionEvent {
  id: string;
  profileId: string;
  timestamp: Date;
  trigger: 'explicit' | 'inferred' | 'periodic';
  changes: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
  evidence: string[];          // 触发此变更的对话证据
  confidence: number;          // 变更置信度
}
```

---

## 四、核心功能

### 1. 人格提取

| 方法 | 触发条件 | 准确率 | 实现复杂度 |
|------|----------|--------|------------|
| 显式输入 | 用户主动设置 | 100% | 低 |
| LLM 推断 | 每隔 N 轮对话 | 70-80% | 中 |
| 行为推断 | 检测到特征行为 | 50-60% | 高 |

**LLM 推断实现**：

```typescript
// 使用 BFI-10 量表作为中间步骤
async function extractPersonality(messages: ChatMessage[]): Promise<Partial<PersonalityProfile>> {
  // 1. 让 LLM 先预测 BFI-10 各题得分
  const bfiPrompt = `根据以下对话，推断用户的人格特征：
  
对话内容：
${messages.map(m => `${m.role}: ${m.content}`).join('\n')}

请对以下 BFI-10 量表题目打分（1-5分）：
1. 我是一个话多的人
2. 我经常帮助别人
3. 我做事很有条理
4. 我经常情绪波动
5. 我喜欢尝试新事物
...（共10题）

返回 JSON 格式：{"scores": [1-5, ...], "evidence": ["证据1", ...]}`;

  const response = await llm.chat([{ role: 'user', content: bfiPrompt }]);
  
  // 2. 根据题目得分计算 Big Five 维度
  const bigFive = calculateBigFive(response.scores);
  
  // 3. 映射到 MBTI
  const mbti = mapToMBTI(bigFive);
  
  return { bigFive, mbti };
}
```

### 2. 人格挂载

启动时加载人格图谱到上下文：

```typescript
// 在水表模式中挂载人格
async function buildPromptWithPersonality(options: ProcessMessageOptions): Promise<string> {
  // 1. 加载人格图谱
  const profile = await personalityService.getProfile(options.userId, options.agentId);
  
  // 2. 构建人格描述
  const personalityDesc = profile ? `
【用户画像】
- 性格类型：${profile.mbti}
- 沟通风格：${profile.preferences.communicationStyle === 'direct' ? '直接' : '含蓄'}
- 正式程度：${profile.preferences.formality === 'formal' ? '正式' : '随意'}
- 话题偏好：${profile.preferences.topics.join('、')}
${profile.identity.nickname ? `- 昵称：${profile.identity.nickname}` : ''}
` : '';

  // 3. 注入到系统提示词
  return options.systemPrompt + '\n' + personalityDesc;
}
```

### 3. 人格进化

**DEEPER 三目标奖励**：

```
更新奖励 = α × 保持稳定特质
         + β × 反映近期行为  
         + γ × 提升预测能力
```

**触发策略**：

| 触发条件 | 更新类型 | 强度 | 说明 |
|----------|----------|------|------|
| 用户明确设置 | 覆盖更新 | 强 | 直接覆盖原值 |
| 累计 50+ 轮对话 | 微调更新 | 弱 | 加权平均 |
| 检测到行为变化 | 细化更新 | 中 | 根据证据调整 |
| 每周周期检查 | 增量更新 | 弱 | 验证+微调 |

**实现**：

```typescript
async function evolvePersonality(
  profile: PersonalityProfile,
  newEvidence: string[],
  trigger: 'explicit' | 'inferred' | 'periodic'
): Promise<PersonalityProfile> {
  const stabilityThreshold = 0.7;
  
  // 1. 提取新的人格特征
  const newTraits = await extractPersonality(newEvidence);
  
  // 2. 计算更新权重
  const weight = trigger === 'explicit' ? 1.0 
               : trigger === 'inferred' ? 0.3 
               : 0.1;
  
  // 3. 稳定性检查
  if (profile.meta.stabilityScore > stabilityThreshold && trigger !== 'explicit') {
    // 人格已稳定，只做微调
    return weightedMerge(profile, newTraits, weight * 0.5);
  }
  
  // 4. 执行更新
  const updated = weightedMerge(profile, newTraits, weight);
  
  // 5. 记录进化事件
  await recordEvolution(profile.id, profile, updated, newEvidence, trigger);
  
  return updated;
}
```

---

## 五、与 AMEP 集成

### 1. 模块结构

```
src/
  personality/
    types.ts           # 类型定义
    profile.ts         # 人格画像管理
    extractor.ts       # 人格提取器
    evolution.ts       # 进化引擎
    storage.ts         # 存储服务
    mbti-mapper.ts     # Big Five → MBTI 映射
    index.ts           # 导出
```

### 2. 集成点

```
AMEP 水表模式流程：

用户消息
    │
    ▼
┌─────────────────────┐
│ 1. 加载人格图谱      │ ← 新增
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 2. 构建系统提示词    │
│    （包含人格信息）   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 3. 检索判断          │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 4. 调用 LLM          │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ 5. 人格进化检测      │ ← 新增
└──────────┬──────────┘
           │
           ▼
      返回响应
```

### 3. 扩展 MemoryType

```typescript
enum MemoryType {
  PREFERENCE = 'preference',
  EXPERIENCE = 'experience',
  LESSON = 'lesson',
  SKILL = 'skill',
  RELATIONSHIP = 'relationship',
  CONTEXT = 'context',
  PERSONALITY = 'personality',    // 新增：人格信息
  PERSONALITY_EVENT = 'personality_event',  // 新增：进化事件
}
```

---

## 六、MBTI 映射算法

```typescript
/**
 * Big Five → MBTI 映射
 * 
 * MBTI 四个维度：
 * - E/I: Extraversion vs Introversion
 * - S/N: Sensing vs Intuition
 * - T/F: Thinking vs Feeling
 * - J/P: Judging vs Perceiving
 */
function mapToMBTI(bigFive: BigFive): string {
  // E/I: 外向性
  const EI = bigFive.extraversion > 50 ? 'E' : 'I';
  
  // S/N: 开放性（高开放性 → N，低开放性 → S）
  const SN = bigFive.openness > 50 ? 'N' : 'S';
  
  // T/F: 宜人性（高宜人性 → F，低宜人性 → T）
  const TF = bigFive.agreeableness > 50 ? 'F' : 'T';
  
  // J/P: 尽责性（高尽责性 → J，低尽责性 → P）
  const JP = bigFive.conscientiousness > 50 ? 'J' : 'P';
  
  return EI + SN + TF + JP;
}
```

---

## 七、存储设计

### 1. 文件结构

```
data/amep/
  personality/
    {userId}_{agentId}.json    # 人格画像
    events/
      {userId}_{agentId}.jsonl  # 进化事件日志
```

### 2. 画像文件格式

```json
{
  "id": "profile_xxx",
  "userId": "user-001",
  "agentId": "ahive",
  "bigFive": {
    "openness": 75,
    "conscientiousness": 60,
    "extraversion": 40,
    "agreeableness": 80,
    "neuroticism": 30
  },
  "mbti": "INFJ",
  "identity": {
    "nickname": "嫣儿称呼的用户",
    "occupation": "程序员"
  },
  "preferences": {
    "communicationStyle": "direct",
    "formality": "casual",
    "humorLevel": "high",
    "topics": ["编程", "游戏", "美食"]
  },
  "relationship": {
    "type": "friend",
    "intimacy": 65,
    "interactionCount": 150
  },
  "meta": {
    "version": 3,
    "createdAt": "2026-03-01T00:00:00Z",
    "lastUpdated": "2026-03-14T00:00:00Z",
    "stabilityScore": 0.75,
    "updateCount": 3
  }
}
```

---

## 八、实现路径

### 阶段一：MVP（1-2天）

- [ ] 类型定义
- [ ] 存储服务
- [ ] 手动设置人格
- [ ] Prompt 挂载

### 阶段二：V1（3-5天）

- [ ] LLM 人格提取
- [ ] Big Five → MBTI 映射
- [ ] 增量更新机制
- [ ] AMEP 集成

### 阶段三：V2（5-7天）

- [ ] DEEPER 进化机制
- [ ] 稳定性检查
- [ ] 进化事件记录
- [ ] 可视化界面

---

## 九、参考项目

| 项目 | 说明 | GitHub |
|------|------|--------|
| DEEPER | 动态人格更新 | sheep333c/DEEPER |
| PsyDI | MBTI 测量智能体 | opendilab/PsyDI |
| PersLLM | 个性化 LLM | Ellenzzn/PersLLM |
| Mem0 | AI Agent 记忆层 | mem0ai/mem0 |

---

## 十、风险与挑战

| 挑战 | 应对策略 |
|------|----------|
| 隐式人格识别困难 | 使用强化微调，结合多种信号 |
| 人格漂移 | 设置稳定性阈值，超阈值才更新 |
| 隐私问题 | 本地存储 + 用户可控的遗忘机制 |
| 评估困难 | 使用 LoCoMo 等基准测试 |

---

*文档版本: 1.0*
*创建时间: 2026-03-14*