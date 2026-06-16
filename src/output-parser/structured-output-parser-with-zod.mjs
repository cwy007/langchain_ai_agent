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

// 初始化模型
const model = new ChatOpenAI({
  modelName: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  temperature: 0,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

// 使用 zod 定义复杂的输出结构
const scientistSchema = z.object({
  name: z.string().describe("科学家的全名"),
  birth_year: z.number().describe("出生年份"),
  death_year: z.number().optional().describe("去世年份，如果还在世则不填"),
  nationality: z.string().describe("国籍"),
  fields: z.array(z.string()).describe("研究领域列表"),
  awards: z.array(
    z.object({
      name: z.string().describe("奖项名称"),
      year: z.number().describe("获奖年份"),
      reason: z.string().optional().describe("获奖原因")
    })
  ).describe("获得的重要奖项列表"),
  major_achievements: z.array(z.string()).describe("主要成就列表"),
  famous_theories: z.array(
    z.object({
      name: z.string().describe("理论名称"),
      year: z.number().optional().describe("提出年份"),
      description: z.string().describe("理论简要描述")
    })
  ).describe("著名理论列表"),
  education: z.object({
    university: z.string().describe("主要毕业院校"),
    degree: z.string().describe("学位"),
    graduation_year: z.number().optional().describe("毕业年份")
  }).optional().describe("教育背景"),
  biography: z.string().describe("简短传记，100字以内")
});

// 从 zod schema 创建 parser
const parser = StructuredOutputParser.fromZodSchema(scientistSchema);

const question = `请介绍一下居里夫人（Marie Curie）的详细信息，包括她的教育背景、研究领域、获得的奖项、主要成就和著名理论。

${parser.getFormatInstructions()}`;

console.log('📋 生成的提示词:\n');
console.log(question);

try {
  console.log("🤔 正在调用大模型（使用 Zod Schema）...\n");

  const response = await model.invoke(question);

  console.log("📤 模型原始响应:\n");
  console.log(response.content);

  const result = await parser.parse(response.content);

  console.log("✅ StructuredOutputParser 自动解析并验证的结果:\n");
  console.log(JSON.stringify(result, null, 2));

  console.log("📊 格式化展示:\n");
  console.log(`👤 姓名: ${result.name}`);
  console.log(`📅 出生年份: ${result.birth_year}`);
  if (result.death_year) {
    console.log(`⚰️  去世年份: ${result.death_year}`);
  }
  console.log(`🌍 国籍: ${result.nationality}`);
  console.log(`🔬 研究领域: ${result.fields.join(', ')}`);

  console.log(`\n🎓 教育背景:`);
  if (result.education) {
    console.log(`   院校: ${result.education.university}`);
    console.log(`   学位: ${result.education.degree}`);
    if (result.education.graduation_year) {
      console.log(`   毕业年份: ${result.education.graduation_year}`);
    }
  }

  console.log(`\n🏆 获得的奖项 (${result.awards.length}个):`);
  result.awards.forEach((award, index) => {
    console.log(`   ${index + 1}. ${award.name} (${award.year})`);
    if (award.reason) {
      console.log(`      原因: ${award.reason}`);
    }
  });

  console.log(`\n💡 著名理论 (${result.famous_theories.length}个):`);
  result.famous_theories.forEach((theory, index) => {
    console.log(`   ${index + 1}. ${theory.name}${theory.year ? ` (${theory.year})` : ''}`);
    console.log(`      ${theory.description}`);
  });

  console.log(`\n🌟 主要成就 (${result.major_achievements.length}个):`);
  result.major_achievements.forEach((achievement, index) => {
    console.log(`   ${index + 1}. ${achievement}`);
  });

  console.log(`\n📖 传记:`);
  console.log(`   ${result.biography}`);

} catch (error) {
  console.error("❌ 错误:", error.message);
  if (error.name === 'ZodError') {
    console.error("验证错误详情:", error.errors);
  }
}

// 📋 生成的提示词:

// 请介绍一下居里夫人（Marie Curie）的详细信息，包括她的教育背景、研究领域、获得的奖项、主要成就和著名理论。

// You must format your output as a JSON value that adheres to a given "JSON Schema" instance.

// "JSON Schema" is a declarative language that allows you to annotate and validate JSON documents.

// For example, the example "JSON Schema" instance {{"properties": {{"foo": {{"description": "a list of test words", "type": "array", "items": {{"type": "string"}}}}}}, "required": ["foo"]}}
// would match an object with one required property, "foo". The "type" property specifies "foo" must be an "array", and the "description" property semantically describes it as "a list of test words". The items within "foo" must be strings.
// Thus, the object {{"foo": ["bar", "baz"]}} is a well-formatted instance of this example "JSON Schema". The object {{"properties": {{"foo": ["bar", "baz"]}}}} is not well-formatted.

// Your output will be parsed and type-checked according to the provided schema instance, so make sure all fields in your output match the schema exactly and there are no trailing commas!

// Here is the JSON Schema instance your output must adhere to. Include the enclosing markdown codeblock:
// ```json
// {"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"name":{"type":"string","description":"科学家的全名"},"birth_year":{"type":"number","description":"出生年份"},"death_year":{"description":"去世年份，如果还在世则不填","type":"number"},"nationality":{"type":"string","description":"国籍"},"fields":{"type":"array","items":{"type":"string"},"description":"研究领域列表"},"awards":{"type":"array","items":{"type":"object","properties":{"name":{"type":"string","description":"奖项名称"},"year":{"type":"number","description":"获奖年份"},"reason":{"description":"获奖原因","type":"string"}},"required":["name","year"],"additionalProperties":false},"description":"获得的重要奖项列表"},"major_achievements":{"type":"array","items":{"type":"string"},"description":"主要成就列表"},"famous_theories":{"type":"array","items":{"type":"object","properties":{"name":{"type":"string","description":"理论名称"},"year":{"description":"提出年份","type":"number"},"description":{"type":"string","description":"理论简要描述"}},"required":["name","description"],"additionalProperties":false},"description":"著名理论列表"},"education":{"description":"教育背景","type":"object","properties":{"university":{"type":"string","description":"主要毕业院校"},"degree":{"type":"string","description":"学位"},"graduation_year":{"description":"毕业年份","type":"number"}},"required":["university","degree"],"additionalProperties":false},"biography":{"type":"string","description":"简短传记，100字以内"}},"required":["name","birth_year","nationality","fields","awards","major_achievements","famous_theories","biography"],"additionalProperties":false}
// ```

// 🤔 正在调用大模型（使用 Zod Schema）...

// 📤 模型原始响应:

// {
//   "name": "居里夫人",
//   "birth_year": 1867,
//   "death_year": 1934,
//   "nationality": "波兰裔法国人",
//   "fields": [
//     "物理学",
//     "化学"
//   ],
//   "awards": [
//     {
//       "name": "诺贝尔物理学奖",
//       "year": 1903,
//       "reason": "与丈夫皮埃尔·居里共同获得，表彰他们在放射性现象方面的研究"
//     },
//     {
//       "name": "诺贝尔化学奖",
//       "year": 1911,
//       "reason": "表彰她在发现钋和镭元素方面做出的贡献"
//     }
//   ],
//   "major_achievements": [
//     "首次提出“放射性”概念并进行系统研究",
//     "发现了钋和镭两种新元素",
//     "开发了分离放射性同位素的技术",
//     "成为首位获得诺贝尔奖的女性",
//     "是唯一在两个不同科学领域获得诺贝尔奖的人"
//   ],
//   "famous_theories": [
//     {
//       "name": "放射性理论",
//       "year": 1898,
//       "description": "提出了原子具有放射性的理论，并区分了天然放射性和人工放射性。"
//     }
//   ],
//   "education": {
//     "university": "巴黎大学",
//     "degree": "物理学与数学学士",
//     "graduation_year": 1894
//   },
//   "biography": "玛丽·居里（1867–1934），原名玛丽亚·斯克沃多夫斯卡，是著名的物理学家和化学家。她因对放射性现象的研究而闻名世界，是第一位获得诺贝尔奖的女性，也是唯一在两个不同科学领域（物理学和化学）获得诺贝尔奖的人。她发现了钋和镭元素，并为现代核物理学奠定了基础。"
// }
// ✅ StructuredOutputParser 自动解析并验证的结果:

// {
//   "name": "居里夫人",
//   "birth_year": 1867,
//   "death_year": 1934,
//   "nationality": "波兰裔法国人",
//   "fields": [
//     "物理学",
//     "化学"
//   ],
//   "awards": [
//     {
//       "name": "诺贝尔物理学奖",
//       "year": 1903,
//       "reason": "与丈夫皮埃尔·居里共同获得，表彰他们在放射性现象方面的研究"
//     },
//     {
//       "name": "诺贝尔化学奖",
//       "year": 1911,
//       "reason": "表彰她在发现钋和镭元素方面做出的贡献"
//     }
//   ],
//   "major_achievements": [
//     "首次提出“放射性”概念并进行系统研究",
//     "发现了钋和镭两种新元素",
//     "开发了分离放射性同位素的技术",
//     "成为首位获得诺贝尔奖的女性",
//     "是唯一在两个不同科学领域获得诺贝尔奖的人"
//   ],
//   "famous_theories": [
//     {
//       "name": "放射性理论",
//       "year": 1898,
//       "description": "提出了原子具有放射性的理论，并区分了天然放射性和人工放射性。"
//     }
//   ],
//   "education": {
//     "university": "巴黎大学",
//     "degree": "物理学与数学学士",
//     "graduation_year": 1894
//   },
//   "biography": "玛丽·居里（1867–1934），原名玛丽亚·斯克沃多夫斯卡，是著名的物理学家和化学家。她因对放射性现象的研究而闻名世界，是第一位获得诺贝尔奖的女性，也是唯一在两个不同科学领域（物理学和化学）获得诺贝尔奖的人。她发现了钋和镭元素，并为现代核物理学奠定了基础。"
// }
// 📊 格式化展示:

// 👤 姓名: 居里夫人
// 📅 出生年份: 1867
// ⚰️  去世年份: 1934
// 🌍 国籍: 波兰裔法国人
// 🔬 研究领域: 物理学, 化学

// 🎓 教育背景:
//    院校: 巴黎大学
//    学位: 物理学与数学学士
//    毕业年份: 1894

// 🏆 获得的奖项 (2个):
//    1. 诺贝尔物理学奖 (1903)
//       原因: 与丈夫皮埃尔·居里共同获得，表彰他们在放射性现象方面的研究
//    2. 诺贝尔化学奖 (1911)
//       原因: 表彰她在发现钋和镭元素方面做出的贡献

// 💡 著名理论 (1个):
//    1. 放射性理论 (1898)
//       提出了原子具有放射性的理论，并区分了天然放射性和人工放射性。

// 🌟 主要成就 (5个):
//    1. 首次提出“放射性”概念并进行系统研究
//    2. 发现了钋和镭两种新元素
//    3. 开发了分离放射性同位素的技术
//    4. 成为首位获得诺贝尔奖的女性
//    5. 是唯一在两个不同科学领域获得诺贝尔奖的人

// 📖 传记:
//    玛丽·居里（1867–1934），原名玛丽亚·斯克沃多夫斯卡，是著名的物理学家和化学家。她因对放射性现象的研究而闻名世界，是第一位获得诺贝尔奖的女性，也是唯一在两个不同科学领域（物理学和化学）获得诺贝尔奖的人。她发现了钋和镭元素，并为现代核物理学奠定了基础。