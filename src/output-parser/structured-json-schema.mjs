import 'dotenv/config';
import {
  ChatOpenAI
} from '@langchain/openai';
import chalk from 'chalk';
import {
  z
} from 'zod';
import {
  zodToJsonSchema
} from "zod-to-json-schema";
import {
  HumanMessage,
  SystemMessage
} from '@langchain/core/messages';

const scientistSchema = z.object({
  name: z.string().describe("科学家的全名"),
  birth_year: z.number().describe("出生年份"),
  field: z.string().describe("主要研究领域"),
  achievements: z.array(z.string()).describe("主要成就列表")
}).strict();

// 将 Zod 转换为原生的 JSON Schema 格式
const nativeJsonSchema = zodToJsonSchema(scientistSchema);

const model = new ChatOpenAI({
  modelName: "qwen-max",
  temperature: 0,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
  modelKwargs: { // 通过 modelKwargs 传入原生参数
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "scientist_info",
        strict: true,
        schema: nativeJsonSchema // 这里的 nativeJsonSchema 就是转换后的对象
      }
    }
  }
});

async function testNativeJsonSchema() {
  console.log(chalk.bgMagenta("🧪 测试原生 JSON Schema 模式...\n"));

  const res = await model.invoke([
    new SystemMessage("你是一个信息提取助手，请直接返回 JSON 数据。"),
    new HumanMessage("介绍一下杨振宁，请确保提供他的姓名name、出生年份birth_year、主要成就列表achievements和所有主要研究领域field，并以 JSON 格式返回")
  ]);

  console.log(chalk.green("\n✅ 收到响应 (纯净 JSON):"));
  console.log(res.content);

  const data = JSON.parse(res.content);
  console.log(chalk.cyan("\n📋 解析后的对象:"));
  console.log(data);
}

testNativeJsonSchema().catch(console.error);

// 🧪 测试原生 JSON Schema 模式...


// ✅ 收到响应 (纯净 JSON):
// {
//   "name": "杨振宁",
//   "birth_year": 1922,
//   "achievements": [
//     "与李政道共同提出宇称不守恒理论，获得1957年诺贝尔物理学奖",
//     "提出杨-米尔斯规范场论，为粒子物理标准模型奠定了基础",
//     "在统计力学、凝聚态物理等领域也有重要贡献"
//   ],
//   "field": [
//     "理论物理",
//     "粒子物理",
//     "统计力学",
//     "凝聚态物理"
//   ]
// }

// 📋 解析后的对象:
// {
//   name: '杨振宁',
//   birth_year: 1922,
//   achievements: [
//     '与李政道共同提出宇称不守恒理论，获得1957年诺贝尔物理学奖',
//     '提出杨-米尔斯规范场论，为粒子物理标准模型奠定了基础',
//     '在统计力学、凝聚态物理等领域也有重要贡献'
//   ],
//   field: [ '理论物理', '粒子物理', '统计力学', '凝聚态物理' ]
// }