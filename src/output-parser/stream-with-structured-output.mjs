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

const structuredModel = model.withStructuredOutput(schema);

const prompt = `详细介绍莫扎特的信息。
返回 json 格式的结构化数据，包含以下字段：
name（姓名）、
birth_year（出生年份）、
death_year（去世年份）、
nationality（国籍）、
occupation（职业）、
famous_works（著名作品列表）和
biography（简短传记）。`;

console.log("🌊 流式结构化输出演示（withStructuredOutput）\n");

try {
  const stream = await structuredModel.stream(prompt);

  let chunkCount = 0;
  let result = null;

  console.log("📡 接收流式数据:\n");

  for await (const chunk of stream) {
    chunkCount++;
    result = chunk;

    console.log(`[Chunk ${chunkCount}]`);
    console.log(JSON.stringify(chunk, null, 2));
  }

  console.log(`\n✅ 共接收 ${chunkCount} 个数据块\n`);

  if (result) {
    console.log("📊 最终结构化结果:\n");
    console.log(JSON.stringify(result, null, 2));

    console.log("\n📝 格式化输出:");
    console.log(`姓名: ${result.name}`);
    console.log(`出生年份: ${result.birth_year}`);
    console.log(`去世年份: ${result.death_year}`);
    console.log(`国籍: ${result.nationality}`);
    console.log(`职业: ${result.occupation}`);
    console.log(`著名作品: ${result.famous_works.join(', ')}`);
    console.log(`传记: ${result.biography}`);
  }

} catch (error) {
  console.error("\n❌ 错误:", error.message);
}

// 🌊 流式结构化输出演示（withStructuredOutput）

// 📡 接收流式数据:

// [Chunk 1]
// {
//   "name": "沃尔夫冈·阿马德乌斯·莫扎特",
//   "birth_year": 1756,
//   "death_year": 1791,
//   "nationality": "奥地利",
//   "occupation": "作曲家、钢琴家、指挥家",
//   "famous_works": [
//     "《费加罗的婚礼》",
//     "《唐·乔望尼》",
//     "《女人心》",
//     "《第40号交响曲》",
//     "《第41号交响曲》（朱庇特）",
//     "《土耳其进行曲》",
//     "《小星星变奏曲》",
//     "《魔笛》",
//     "《安魂曲》"
//   ],
//   "biography": "沃尔夫冈·阿马德乌斯·莫扎特（Wolfgang Amadeus Mozart，1756-1791）是古典主义时期最重要的作曲家之一。他出生于奥地利萨尔茨堡，自幼展现音乐天赋，被誉为神童。莫扎特在短暂的35年生命中创作了600多部作品，涵盖了歌剧、交响乐、室内乐、协奏曲等多种音乐形式。他的音乐以旋律优美、结构严谨、情感丰富而著称，对后世音乐发展产生了深远影响。莫扎特于1791年在维也纳去世，年仅35岁，但其不朽的音乐作品至今仍被广泛演奏和欣赏。"
// }

// ✅ 共接收 1 个数据块

// 📊 最终结构化结果:

// {
//   "name": "沃尔夫冈·阿马德乌斯·莫扎特",
//   "birth_year": 1756,
//   "death_year": 1791,
//   "nationality": "奥地利",
//   "occupation": "作曲家、钢琴家、指挥家",
//   "famous_works": [
//     "《费加罗的婚礼》",
//     "《唐·乔望尼》",
//     "《女人心》",
//     "《第40号交响曲》",
//     "《第41号交响曲》（朱庇特）",
//     "《土耳其进行曲》",
//     "《小星星变奏曲》",
//     "《魔笛》",
//     "《安魂曲》"
//   ],
//   "biography": "沃尔夫冈·阿马德乌斯·莫扎特（Wolfgang Amadeus Mozart，1756-1791）是古典主义时期最重要的作曲家之一。他出生于奥地利萨尔茨堡，自幼展现音乐天赋，被誉为神童。莫扎特在短暂的35年生命中创作了600多部作品，涵盖了歌剧、交响乐、室内乐、协奏曲等多种音乐形式。他的音乐以旋律优美、结构严谨、情感丰富而著称，对后世音乐发展产生了深远影响。莫扎特于1791年在维也纳去世，年仅35岁，但其不朽的音乐作品至今仍被广泛演奏和欣赏。"
// }

// 📝 格式化输出:
// 姓名: 沃尔夫冈·阿马德乌斯·莫扎特
// 出生年份: 1756
// 去世年份: 1791
// 国籍: 奥地利
// 职业: 作曲家、钢琴家、指挥家
// 著名作品: 《费加罗的婚礼》, 《唐·乔望尼》, 《女人心》, 《第40号交响曲》, 《第41号交响曲》（朱庇特）, 《土耳其进行曲》, 《小星星变奏曲》, 《魔笛》, 《安魂曲》
// 传记: 沃尔夫冈·阿马德乌斯·莫扎特（Wolfgang Amadeus Mozart，1756-1791）是古典主义时期最重要的作曲家之一。他出生于奥地利萨尔茨堡，自幼展现音乐天赋，被誉为神童。莫扎特在短暂的35年生命中创作了600多部作品，涵盖了歌剧、交响乐、室内乐、协奏曲等多种音乐形式。他的音乐以旋律优美、结构严谨、情感丰富而著称，对后世音乐发展产生了深远影响。莫扎特于1791年在维也纳去世，年仅35岁，但其不朽的音乐作品至今仍被广泛演奏和欣赏。