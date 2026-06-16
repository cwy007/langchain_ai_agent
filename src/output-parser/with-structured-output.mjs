import 'dotenv/config';
import {
  ChatOpenAI
} from '@langchain/openai';
import {
  z
} from 'zod';

const model = new ChatOpenAI({
  modelName: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  temperature: 0,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

// 定义结构化输出的 schema
const scientistSchema = z.object({
  name: z.string().describe("科学家的全名"),
  birth_year: z.number().optional().describe("出生年份"),
  nationality: z.string().describe("国籍"),
  fields: z.array(z.string()).optional().describe("研究领域列表"),
});

// 使用 withStructuredOutput 方法
const structuredModel = model.withStructuredOutput(scientistSchema);

console.log("invoke model...")

try {
  // 调用模型
  const result = await structuredModel.invoke("介绍一下爱因斯坦, 要包含出生年份birth_year、国籍nationality和研究领域fields。 返回 json 格式的结构化数据");

  // console.log("result:", result);

  console.log("结构化结果:", JSON.stringify(result, null, 2));
  console.log(`\n姓名: ${result.name}`);
  console.log(`出生年份: ${result.birth_year}`);
  console.log(`国籍: ${result.nationality}`);
  console.log(`研究领域: ${result.fields?.join(', ')}`);

} catch (error) {
  console.error("调用模型时发生错误:", error);
}

// invoke model...
// 结构化结果: {
//   "name": "爱因斯坦",
//   "birth_year": 1879,
//   "nationality": "德国/美国",
//   "fields": [
//     "理论物理学",
//     "相对论",
//     "量子力学",
//     "统计物理学",
//     "宇宙学"
//   ]
// }

// 姓名: 爱因斯坦
// 出生年份: 1879
// 国籍: 德国/美国
// 研究领域: 理论物理学, 相对论, 量子力学, 统计物理学, 宇宙学