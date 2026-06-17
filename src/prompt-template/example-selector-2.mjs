import 'dotenv/config';
import {
  ChatOpenAI,
  OpenAIEmbeddings
} from '@langchain/openai';
import {
  FewShotPromptTemplate,
  PromptTemplate,
} from '@langchain/core/prompts';
import {
  SemanticSimilarityExampleSelector
} from '@langchain/core/example_selectors';
import {
  Milvus
} from '@langchain/community/vectorstores/milvus';

// 演示：使用 SemanticSimilarityExampleSelector 基于「语义相似度」自动从 Milvus 中选择 few-shot 示例

const COLLECTION_NAME =
  process.env.MILVUS_COLLECTION_NAME ?? 'weekly_report_examples';
const VECTOR_DIM = 1024;

// 1. 初始化 Chat 模型
const model = new ChatOpenAI({
  temperature: 0,
  model: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

// 2. 初始化 embeddings
const embeddings = new OpenAIEmbeddings({
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.EMBEDDING_MODEL_NAME,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
  dimensions: VECTOR_DIM,
});

// 3. 定义单条示例 Prompt 模板
const examplePrompt = PromptTemplate.fromTemplate(
  `用户场景：{scenario}
生成的周报片段：
{report_snippet}
---`
);

// 4. 连接 Milvus，并基于已存在的集合创建向量库
const milvusAddress = process.env.MILVUS_ADDRESS ?? 'localhost:19530';

const vectorStore = await Milvus.fromExistingCollection(embeddings, {
  collectionName: COLLECTION_NAME,
  clientConfig: {
    address: milvusAddress,
  },
  // 与 weekly-report-examples-writer-milvus.mjs 中创建的索引保持一致
  indexCreateOptions: {
    index_type: 'IVF_FLAT',
    metric_type: 'COSINE',
    params: {
      nlist: 1024
    },
    search_params: {
      nprobe: 10,
    },
  },
});

const exampleSelector = new SemanticSimilarityExampleSelector({
  vectorStore,
  k: 2, // 每次只选出语义上最相近的 2 条示例
});

// 5. 用 selector 构建 FewShotPromptTemplate
const fewShotPrompt = new FewShotPromptTemplate({
  examplePrompt,
  exampleSelector,
  prefix: '下面是一些不同类型的周报示例，你可以从中学习语气和结构（系统会自动从 Milvus 选出和当前场景最相近的示例）：\n',
  suffix: '\n\n现在请根据上面的示例风格，为下面这个场景写一份新的周报：\n' +
    '场景描述：{current_scenario}\n' +
    '请输出一份适合发给老板和团队同步的 Markdown 周报草稿。',
  inputVariables: ['current_scenario'],
});

// 6. 演示：给定几个不同的场景描述，让 selector 挑出语义上最接近的示例
const currentScenario1 =
  '我们本周主要是在清理历史技术债：重构老旧的订单模块、补齐核心接口的单测，' +
  '同时也完善了一些文档，方便后面新人接手。整体没有对外大范围发布的新功能。';

// 一个语义上明显不同的场景：偏「首发上线 + 对外宣传」
const currentScenario2 =
  '本周完成新一代运营看板的首批功能上线，重点打通埋点和实时数仓链路，' +
  '并面向运营和市场同学做了多场宣讲，希望更多同学开始使用新能力。';

console.log('\n===== 场景 1：技术债清理为主 =====\n');
const finalPrompt1 = await fewShotPrompt.format({
  current_scenario: currentScenario1,
});
console.log(finalPrompt1);

console.log('\n\n===== 场景 2：新功能首发 + 对外宣传 =====\n');
const finalPrompt2 = await fewShotPrompt.format({
  current_scenario: currentScenario2,
});
console.log(finalPrompt2);

// 如果需要真正调用模型，可以解开下面注释
// const stream = await model.stream(finalPrompt);
// console.log('\n=== AI 输出 ===');
// for await (const chunk of stream) {
//   process.stdout.write(chunk.content);
// }


// ===== 场景 1：技术债清理为主 =====

// 下面是一些不同类型的周报示例，你可以从中学习语气和结构（系统会自动从 Milvus 选出和当前场景最相近的示例）：


// 用户场景：技术债清理为主，核心工作是重构、单测补齐、文档完善，节奏偏稳，不强调对外大新闻。
// 生成的周报片段：
// - 对老旧结算模块进行分层重构，拆出 3 个独立子模块，代码结构更加清晰；
// - 补齐 25 条关键路径单元测试用例，整体覆盖率从 55% 提升到 68%；
// - 完成 2 份系统设计文档补全，方便后续同学接手维护。
// ---

// 用户场景：以老系统拆分和代码瘦身为主，更多是内部质量提升，重点在于风险可控和长期维护成本下降。
// 生成的周报片段：
// - 拆分历史「大单体」服务中的账务子模块，沉淀为独立结算服务，减少跨模块耦合；
// - 清理 30+ 条废弃接口和配置项，并在网关层加保护，降低后续演进阻力；
// - 对关键重构路径补充回滚预案和演练手册，保证发布过程可控。
// ---



// 现在请根据上面的示例风格，为下面这个场景写一份新的周报：
// 场景描述：我们本周主要是在清理历史技术债：重构老旧的订单模块、补齐核心接口的单测，同时也完善了一些文档，方便后面新人接手。整体没有对外大范围发布的新功能。
// 请输出一份适合发给老板和团队同步的 Markdown 周报草稿。


// ===== 场景 2：新功能首发 + 对外宣传 =====

// 下面是一些不同类型的周报示例，你可以从中学习语气和结构（系统会自动从 Milvus 选出和当前场景最相近的示例）：


// 用户场景：新功能首发，更多是对外展示亮点，如新看板、新能力上线，适合发给大量跨部门同学。
// 生成的周报片段：
// - 上线「运营实时看板」，支持业务实时查看核心转化漏斗；
// - 打通埋点 → DWD → 实时服务链路，为后续精细化运营提供基础；
// - 组织 2 场跨部门分享，帮助非技术同学理解新能力的业务价值。
// ---

// 用户场景：重大版本发布节奏紧凑，需要对外同步一揽子新能力，强调可视化展示和业务价值。
// 生成的周报片段：
// - 正式发布「增长分析 2.0」版本，新增留存分群、活动追踪等 5 项核心能力；
// - 与市场同学联合输出发布解读文档，并在周会中向核心干系人进行路演；
// - 配合运营梳理了 3 条重点推广场景，推动更多业务线接入新能力。
// ---



// 现在请根据上面的示例风格，为下面这个场景写一份新的周报：
// 场景描述：本周完成新一代运营看板的首批功能上线，重点打通埋点和实时数仓链路，并面向运营和市场同学做了多场宣讲，希望更多同学开始使用新能力。
// 请输出一份适合发给老板和团队同步的 Markdown 周报草稿。