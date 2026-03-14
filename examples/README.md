# AMEP 使用示例

本目录包含 AMEP 协议库的各种使用示例。

---

## 📦 基础示例

### 1. 快速开始

```typescript
// examples/basic.ts
import { AMEP } from 'amep-protocol';

// 创建引擎
const amep = new AMEP.Engine({
  dictionary: './dictionaries/default.json'
});

// 编码
const compressed = amep.encode('PREF|LANG:ZH+FMT:LIST+STYL:BREV');
console.log(compressed);  // "ZH-STD"

// 解码
const original = amep.decode('ZH-STD');
console.log(original);  // "PREF|LANG:ZH+FMT:LIST+STYL:BREV"
```

---

### 2. 自定义字典

```typescript
// examples/custom-dictionary.ts
import { AMEP, Dictionary } from 'amep-protocol';

// 创建字典
const dict = new Dictionary();
dict.addShortcut('MY-SHORTCUT', 'FULL|CODE+HERE');
dict.addShortcut('ANOTHER', 'ANOTHER|CODE+THERE');

// 使用自定义字典
const amep = new AMEP.Engine({
  dictionary: dict.export()
});

const compressed = amep.encode('FULL|CODE+HERE');
console.log(compressed);  // "MY-SHORTCUT"
```

---

### 3. 批量处理

```typescript
// examples/batch-processing.ts
import { AMEP } from 'amep-protocol';

const amep = new AMEP.Engine({
  dictionary: './dictionaries/default.json'
});

// 批量编码
const codes = [
  'PREF|LANG:ZH+FMT:LIST+STYL:BREV',
  'TASK|TYPE:CODE+ACTION:GENERATE',
  'FEEDBACK|SENTIMENT:POSITIVE+QUALITY:HIGH'
];

const compressed = amep.encodeBatch(codes);
console.log(compressed);  // ["ZH-STD", "TASK-CODE", "FB-GOOD"]

// 批量解码
const shortcuts = ['ZH-STD', 'TASK-CODE', 'FB-GOOD'];
const original = amep.decodeBatch(shortcuts);
console.log(original);
```

---

### 4. 解析和格式化

```typescript
// examples/parse-stringify.ts
import { AMEP } from 'amep-protocol';

// 解析
const parsed = AMEP.parse('PREF|LANG:ZH+FMT:LIST+STYL:BREV');
console.log(parsed);
// { category: 'PREF', fields: { LANG: 'ZH', FMT: 'LIST', STYL: 'BREV' } }

// 格式化为自然语言
const natural = AMEP.stringify('PREF|LANG:ZH+FMT:LIST+STYL:BREV');
console.log(natural);
// "用户偏好：使用中文语言，列表格式，简洁风格"
```

---

### 5. 自动学习

```typescript
// examples/auto-learning.ts
import { AMEP, Dictionary, AutoLearner } from 'amep-protocol';

// 创建字典和学习器
const dict = new Dictionary();
const learner = new AutoLearner(dict, {
  learnThreshold: 10,  // 出现 10 次才学习
  minCompressionRatio: 0.5  // 压缩率≥50%
});

// 模拟对话
for (let i = 0; i < 15; i++) {
  learner.observe('TASK|LANG:PYTHON+FRAMEWORK:FASTAPI');
}

// 检查是否已学习
console.log(dict.hasShortcut('PY-FASTAPI'));  // true
console.log(dict.getCode('PY-FASTAPI'));  // "TASK|LANG:PYTHON+FRAMEWORK:FASTAPI"
```

---

### 6. 编译时生成

```typescript
// examples/compiled-usage.ts
import { AMEP } from 'amep-protocol';
import { getCode, getShortcut } from './generated/lookup';  // 编译时生成

// 使用编译时优化器
const amep = new AMEP.Engine({
  optimizer: 'compiled',
  lookupFunctions: { getCode, getShortcut }
});

// 超快查找（0.3ms/百万次）
const compressed = amep.encode('PREF|LANG:ZH+FMT:LIST+STYL:BREV');
console.log(compressed);  // "ZH-STD"
```

---

### 7. FST 优化器

```typescript
// examples/fst-usage.ts
import { AMEP, Dictionary, FSTOptimizer } from 'amep-protocol';

// 创建字典
const dict = new Dictionary();
dict.loadFromObject({
  'ZH-STD': 'PREF|LANG:ZH+FMT:LIST+STYL:BREV',
  'PY-FASTAPI': 'TASK|LANG:PYTHON+FRAMEWORK:FASTAPI'
});

// 创建 FST 优化器
const fst = new FSTOptimizer();
fst.build(dict);

// 使用 FST 查找
console.log(fst.getCode('ZH-STD'));  // "PREF|LANG:ZH+FMT:LIST+STYL:BREV"
console.log(fst.getShortcut('PREF|LANG:ZH+FMT:LIST+STYL:BREV'));  // "ZH-STD"

// 性能测试
const result = fst.benchmark(1000000);
console.log(`FST lookup time: ${result.lookupTime}ms`);
```

---

### 8. 记忆管理

```typescript
// examples/memory-management.ts
import { AMEP } from 'amep-protocol';

class MemoryManager {
  private amep: AMEP.Engine;
  
  constructor() {
    this.amep = new AMEP.Engine({
      dictionary: './dictionaries/default.json'
    });
  }
  
  // 保存记忆
  async saveMemory(type: string, content: string) {
    // 转为 AMEP 编码
    const code = this.convertToAMEP(type, content);
    
    // 压缩
    const compressed = this.amep.compress(code);
    
    // 存储到文件
    await this.writeToFile(compressed);
  }
  
  // 读取记忆
  async loadMemory(id: string): Promise<string> {
    // 从文件读取
    const compressed = await this.readFromFile(id);
    
    // 解压
    const code = this.amep.decompress(compressed);
    
    // 转为自然语言
    return AMEP.stringify(code);
  }
  
  private convertToAMEP(type: string, content: string): string {
    // 根据类型和内容生成 AMEP 编码
    // 这里简化处理
    return `${type}|CONTENT:${content}`;
  }
  
  private async writeToFile(compressed: string): Promise<void> {
    // 写入文件逻辑
  }
  
  private async readFromFile(id: string): Promise<string> {
    // 读取文件逻辑
    return '';
  }
}
```

---

## 🚀 运行示例

```bash
# 安装依赖
npm install

# 构建
npm run build

# 运行示例
npx ts-node examples/basic.ts
npx ts-node examples/custom-dictionary.ts
npx ts-node examples/batch-processing.ts
```

---

## 📝 编译时生成

```bash
# 编译字典生成查找代码
npm run compile-dict -- \
  --input dictionaries/default.json \
  --output examples/generated/lookup.ts \
  --format switch
```

---

更多示例请参考官方文档：https://github.com/ahive-org/amep-protocol
