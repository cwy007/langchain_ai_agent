import 'dotenv/config';
import {
  ChatOpenAI
} from '@langchain/openai';
import {
  StructuredOutputParser
} from '@langchain/core/output_parsers';
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

// 使用 zod 定义结构化输出格式
const schema = z.object({
  name: z.string().describe("姓名"),
  birth_year: z.number().describe("出生年份"),
  death_year: z.number().describe("去世年份"),
  nationality: z.string().describe("国籍"),
  occupation: z.string().describe("职业"),
  famous_works: z.array(z.string()).describe("著名作品列表"),
  biography: z.string().describe("简短传记")
});

const parser = StructuredOutputParser.fromZodSchema(schema);

const prompt = `详细介绍莫扎特的信息。\n\n${parser.getFormatInstructions()}`;

console.log("🌊 流式结构化输出演示\n");

try {
  const stream = await model.stream(prompt);

  let fullContent = '';
  let chunkCount = 0;

  console.log("📡 接收流式数据:\n");

  for await (const chunk of stream) {
    chunkCount++;
    const content = chunk.content;
    fullContent += content;

    process.stdout.write(content); // 实时显示流式文本
  }

  console.log(`\n\n✅ 共接收 ${chunkCount} 个数据块\n`);

  // 解析完整内容为结构化数据
  const result = await parser.parse(fullContent);

  console.log("📊 解析后的结构化结果:\n");
  console.log(JSON.stringify(result, null, 2));

  console.log("\n📝 格式化输出:");
  console.log(`姓名: ${result.name}`);
  console.log(`出生年份: ${result.birth_year}`);
  console.log(`去世年份: ${result.death_year}`);
  console.log(`国籍: ${result.nationality}`);
  console.log(`职业: ${result.occupation}`);
  console.log(`著名作品: ${result.famous_works.join(', ')}`);
  console.log(`传记: ${result.biography}`);

} catch (error) {
  console.error("\n❌ 错误:", error.message);
}

// 🌊 流式结构化输出演示

// 📡 接收流式数据:

// {
//   "name": "莫扎特",
//   "birth_year": 1756,
//   "death_year": 1791,
//   "nationality": "奥地利",
//   "occupation": "作曲家、钢琴家",
//   "famous_works": [
//     "第40号交响曲",
//     "第41号交响曲",
//     "费加罗的婚礼",
//     "唐·乔万尼",
//     "女人心",
//     "土耳其进行曲",
//     "小星星变奏曲"
//   ],
//   "biography": "沃尔夫冈·阿马德乌斯·莫扎特（Wolfgang Amadeus Mozart，1756-1791）是奥地利古典主义时期的杰出作曲家，被誉为音乐史上最伟大的天才之一。他自幼展现非凡的音乐天赋，在欧洲各地巡演并创作了大量经典作品。莫扎特一生虽然短暂，但留下了600多部作品，涵盖了交响乐、歌剧、室内乐、协奏曲等多种音乐形式，对后世音乐发展产生了深远影响。他的音乐以旋律优美、结构严谨、情感丰富而著称，代表了古典主义音乐的最高成就。"
// }

// ✅ 共接收 72 个数据块

// 📊 解析后的结构化结果:

// {
//   "name": "莫扎特",
//   "birth_year": 1756,
//   "death_year": 1791,
//   "nationality": "奥地利",
//   "occupation": "作曲家、钢琴家",
//   "famous_works": [
//     "第40号交响曲",
//     "第41号交响曲",
//     "费加罗的婚礼",
//     "唐·乔万尼",
//     "女人心",
//     "土耳其进行曲",
//     "小星星变奏曲"
//   ],
//   "biography": "沃尔夫冈·阿马德乌斯·莫扎特（Wolfgang Amadeus Mozart，1756-1791）是奥地利古典主义时期的杰出作曲家，被誉为音乐史上最伟大的天才之一。他自幼展现非凡的音乐天赋，在欧洲各地巡演并创作了大量经典作品。莫扎特一生虽然短暂，但留下了600多部作品，涵盖了交响乐、歌剧、室内乐、协奏曲等多种音乐形式，对后世音乐发展产生了深远影响。他的音乐以旋律优美、结构严谨、情感丰富而著称，代表了古典主义音乐的最高成就。"
// }

// 📝 格式化输出:
// 姓名: 莫扎特
// 出生年份: 1756
// 去世年份: 1791
// 国籍: 奥地利
// 职业: 作曲家、钢琴家
// 著名作品: 第40号交响曲, 第41号交响曲, 费加罗的婚礼, 唐·乔万尼, 女人心, 土耳其进行曲, 小星星变奏曲
// 传记: 沃尔夫冈·阿马德乌斯·莫扎特（Wolfgang Amadeus Mozart，1756-1791）是奥地利古典主义时期的杰出作曲家，被誉为音乐史上最伟大的天才之一。他自幼展现非凡的音乐天赋，在欧洲各地巡演并创作了大量经典作品。莫扎特一生虽然短暂，但留下了600多部作品，涵盖了交响乐、歌剧、室内乐、协奏曲等多种音乐形式，对后世音乐发展产生了深远影响。他的音乐以旋律优美、结构严谨、情感丰富而著称，代表了古典主义音乐的最高成就。