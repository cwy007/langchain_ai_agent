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
  birth_year: z.number().describe("出生年份"),
  death_year: z.number().optional().describe("去世年份，如果还在世则不填"),
  nationality: z.string().describe("国籍"),
  fields: z.array(z.string()).describe("研究领域列表"),
  achievements: z.array(z.string()).describe("主要成就"),
  biography: z.string().describe("简短传记")
});

// 绑定工具到模型
const modelWithTool = model.bindTools([{
  name: "extract_scientist_info",
  description: "提取和结构化科学家的详细信息",
  schema: scientistSchema
}]);

console.log("🌊 流式 Tool Calls 演示 - 直接打印原始 tool_calls_chunk\n");

try {
  // 开启流式输出
  const stream = await modelWithTool.stream("详细介绍牛顿的生平和成就");

  console.log("📡 实时输出流式 tool_calls_chunk:\n");

  let chunkIndex = 0;

  for await (const chunk of stream) {
    chunkIndex++;
    // console.log(chunk);
    // 直接打印每个 chunk 的 tool_calls 信息
    if (chunk.tool_call_chunks && chunk.tool_call_chunks.length > 0) {
      process.stdout.write(chunk.tool_call_chunks[0].args);
    }
  }

  console.log(`\n\n✅ 共接收 ${chunkIndex} 个数据块\n`);

  console.log("\n\n✅ 流式输出完成");

} catch (error) {
  console.error("\n❌ 错误:", error.message);
  console.error(error);
}

// 🌊 流式 Tool Calls 演示 - 直接打印原始 tool_calls_chunk

// 📡 实时输出流式 tool_calls_chunk:

// {"name": "艾萨克·牛顿", "birth_year": 1643, "death_year": 1727, "nationality": "英国", "fields":
// ["物理学", "数学", "天文学"]

// , "achievements":
// ["万有引力定律", "运动三定律", "微积分的发明", "反射望远镜的发明"]

// , "biography": "艾萨克·牛顿（Isaac Newton）是英国著名的物理学家、数学家和天文学家，被广泛认为是科学史上最具影响力的人物之一。他于1643年出生于英格兰，1727年去世。牛顿在物理学上的贡献包括提出万有引力定律和运动三定律，奠定了经典力学的基础。他还独立发明了微积分，并设计了反射望远镜。他的著作《自然哲学的数学原理》（通常称为《原理》）是科学史上的里程碑。"}

// ✅ 共接收 49 个数据块



// ✅ 流式输出完成