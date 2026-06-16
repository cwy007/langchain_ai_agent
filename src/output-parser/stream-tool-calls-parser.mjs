import 'dotenv/config';
import {
  ChatOpenAI
} from '@langchain/openai';
import {
  JsonOutputToolsParser
} from '@langchain/core/output_parsers/openai_tools';
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

// 1. 绑定工具并挂载解析器
const parser = new JsonOutputToolsParser(); // 作用：解析 tool_call_chunks 中的内容，拼接成符合 json 格式的对象，就算 chunk 中的内容不完整，也能正确解析出最终的结果
const chain = modelWithTool.pipe(parser);


try {
  // 2. 开启流
  const stream = await chain.stream("详细介绍牛顿的生平和成就");

  let lastContent = ""; // 记录已打印的完整内容
  let finalResult = null; // 存储最终的完整结果

  console.log("📡 实时输出流式内容:\n");

  for await (const chunk of stream) {
    // console.log(chunk);
    if (chunk.length > 0) {
      const toolCall = chunk[0];

      // 获取当前工具调用的完整参数内容
      // const currentContent = JSON.stringify(toolCall.args || {}, null, 2);

      // if (currentContent.length > lastContent.length) {
      //   const newText = currentContent.slice(lastContent.length);
      //   process.stdout.write(newText); // 实时输出到控制台
      //   lastContent = currentContent; // 更新已读进度
      // }

      console.log(toolCall.args);
    }
  }

  console.log("\n\n✅ 流式输出完成");

} catch (error) {
  console.error("\n❌ 错误:", error.message);
  console.error(error);
}

// 📡 实时输出流式内容:

// {}
// { name: '艾' }
// { name: '艾萨克·牛' }
// { name: '艾萨克·牛顿' }
// { name: '艾萨克·牛顿', birth_year: 1 }
// { name: '艾萨克·牛顿', birth_year: 1643 }
// { name: '艾萨克·牛顿', birth_year: 1643, death_year: 172 }
// { name: '艾萨克·牛顿', birth_year: 1643, death_year: 1727 }
// {
//   name: '艾萨克·牛顿',
//   birth_year: 1643,
//   death_year: 1727,
//   nationality: '英国'
// }
// {
//   name: '艾萨克·牛顿',
//   birth_year: 1643,
//   death_year: 1727,
//   nationality: '英国',
//   fields: [ '物理学', '数学', '天文学' ]
// }
// {
//   name: '艾萨克·牛顿',
//   birth_year: 1643,
//   death_year: 1727,
//   nationality: '英国',
//   fields: [ '物理学', '数学', '天文学' ],
//   achievements: [ '万有引力定律', '运动三定律', '微积分的发明', '反射望远镜的发明' ]
// }
// {
//   name: '艾萨克·牛顿',
//   birth_year: 1643,
//   death_year: 1727,
//   nationality: '英国',
//   fields: [ '物理学', '数学', '天文学' ],
//   achievements: [ '万有引力定律', '运动三定律', '微积分的发明', '反射望远镜的发明' ],
//   biography: '艾萨'
// }
// {
//   name: '艾萨克·牛顿',
//   birth_year: 1643,
//   death_year: 1727,
//   nationality: '英国',
//   fields: [ '物理学', '数学', '天文学' ],
//   achievements: [ '万有引力定律', '运动三定律', '微积分的发明', '反射望远镜的发明' ],
//   biography: '艾萨克·牛顿'
// }
// {
//   name: '艾萨克·牛顿',
//   birth_year: 1643,
//   death_year: 1727,
//   nationality: '英国',
//   fields: [ '物理学', '数学', '天文学' ],
//   achievements: [ '万有引力定律', '运动三定律', '微积分的发明', '反射望远镜的发明' ],
//   biography: '艾萨克·牛顿（Isaac Newton'
// }
// {
//   name: '艾萨克·牛顿',
//   birth_year: 1643,
//   death_year: 1727,
//   nationality: '英国',
//   fields: [ '物理学', '数学', '天文学' ],
//   achievements: [ '万有引力定律', '运动三定律', '微积分的发明', '反射望远镜的发明' ],
//   biography: '艾萨克·牛顿（Isaac Newton）是英国著名的'
// }
// {
//   name: '艾萨克·牛顿',
//   birth_year: 1643,
//   death_year: 1727,
//   nationality: '英国',
//   fields: [ '物理学', '数学', '天文学' ],
//   achievements: [ '万有引力定律', '运动三定律', '微积分的发明', '反射望远镜的发明' ],
//   biography: '艾萨克·牛顿（Isaac Newton）是英国著名的物理学家、数学'
// }
// {
//   name: '艾萨克·牛顿',
//   birth_year: 1643,
//   death_year: 1727,
//   nationality: '英国',
//   fields: [ '物理学', '数学', '天文学' ],
//   achievements: [ '万有引力定律', '运动三定律', '微积分的发明', '反射望远镜的发明' ],
//   biography: '艾萨克·牛顿（Isaac Newton）是英国著名的物理学家、数学家和天文学'
// }
// {
//   name: '艾萨克·牛顿',
//   birth_year: 1643,
//   death_year: 1727,
//   nationality: '英国',
//   fields: [ '物理学', '数学', '天文学' ],
//   achievements: [ '万有引力定律', '运动三定律', '微积分的发明', '反射望远镜的发明' ],
//   biography: '艾萨克·牛顿（Isaac Newton）是英国著名的物理学家、数学家和天文学家，被广泛'
// }
// {
//   name: '艾萨克·牛顿',
//   birth_year: 1643,
//   death_year: 1727,
//   nationality: '英国',
//   fields: [ '物理学', '数学', '天文学' ],
//   achievements: [ '万有引力定律', '运动三定律', '微积分的发明', '反射望远镜的发明' ],
//   biography: '艾萨克·牛顿（Isaac Newton）是英国著名的物理学家、数学家和天文学家，被广泛认为是科学史上'
// }
// {
//   name: '艾萨克·牛顿',
//   birth_year: 1643,
//   death_year: 1727,
//   nationality: '英国',
//   fields: [ '物理学', '数学', '天文学' ],
//   achievements: [ '万有引力定律', '运动三定律', '微积分的发明', '反射望远镜的发明' ],
//   biography: '艾萨克·牛顿（Isaac Newton）是英国著名的物理学家、数学家和天文学家，被广泛认为是科学史上最具影响力的人物之一'
// }
// {
//   name: '艾萨克·牛顿',
//   birth_year: 1643,
//   death_year: 1727,
//   nationality: '英国',
//   fields: [ '物理学', '数学', '天文学' ],
//   achievements: [ '万有引力定律', '运动三定律', '微积分的发明', '反射望远镜的发明' ],
//   biography: '艾萨克·牛顿（Isaac Newton）是英国著名的物理学家、数学家和天文学家，被广泛认为是科学史上最具影响力的人物之一。他于1'
// }
// {
//   name: '艾萨克·牛顿',
//   birth_year: 1643,
//   death_year: 1727,
//   nationality: '英国',
//   fields: [ '物理学', '数学', '天文学' ],
//   achievements: [ '万有引力定律', '运动三定律', '微积分的发明', '反射望远镜的发明' ],
//   biography: '艾萨克·牛顿（Isaac Newton）是英国著名的物理学家、数学家和天文学家，被广泛认为是科学史上最具影响力的人物之一。他于1643年'
// }
// {
//   name: '艾萨克·牛顿',
//   birth_year: 1643,
//   death_year: 1727,
//   nationality: '英国',
//   fields: [ '物理学', '数学', '天文学' ],
//   achievements: [ '万有引力定律', '运动三定律', '微积分的发明', '反射望远镜的发明' ],
//   biography: '艾萨克·牛顿（Isaac Newton）是英国著名的物理学家、数学家和天文学家，被广泛认为是科学史上最具影响力的人物之一。他于1643年出生于英格兰，1'
// }
// {
//   name: '艾萨克·牛顿',
//   birth_year: 1643,
//   death_year: 1727,
//   nationality: '英国',
//   fields: [ '物理学', '数学', '天文学' ],
//   achievements: [ '万有引力定律', '运动三定律', '微积分的发明', '反射望远镜的发明' ],
//   biography: '艾萨克·牛顿（Isaac Newton）是英国著名的物理学家、数学家和天文学家，被广泛认为是科学史上最具影响力的人物之一。他于1643年出生于英格兰，1727年'
// }
// {
//   name: '艾萨克·牛顿',
//   birth_year: 1643,
//   death_year: 1727,
//   nationality: '英国',
//   fields: [ '物理学', '数学', '天文学' ],
//   achievements: [ '万有引力定律', '运动三定律', '微积分的发明', '反射望远镜的发明' ],
//   biography: '艾萨克·牛顿（Isaac Newton）是英国著名的物理学家、数学家和天文学家，被广泛认为是科学史上最具影响力的人物之一。他于1643年出生于英格兰，1727年去世。牛顿'
// }
// {
//   name: '艾萨克·牛顿',
//   birth_year: 1643,
//   death_year: 1727,
//   nationality: '英国',
//   fields: [ '物理学', '数学', '天文学' ],
//   achievements: [ '万有引力定律', '运动三定律', '微积分的发明', '反射望远镜的发明' ],
//   biography: '艾萨克·牛顿（Isaac Newton）是英国著名的物理学家、数学家和天文学家，被广泛认为是科学史上最具影响力的人物之一。他于1643年出生于英格兰，1727年去世。牛顿在物理学上的贡献'
// }
// {
//   name: '艾萨克·牛顿',
//   birth_year: 1643,
//   death_year: 1727,
//   nationality: '英国',
//   fields: [ '物理学', '数学', '天文学' ],
//   achievements: [ '万有引力定律', '运动三定律', '微积分的发明', '反射望远镜的发明' ],
//   biography: '艾萨克·牛顿（Isaac Newton）是英国著名的物理学家、数学家和天文学家，被广泛认为是科学史上最具影响力的人物之一。他于1643年出生于英格兰，1727年去世。牛顿在物理学上的贡献包括提出万有'
// }
// {
//   name: '艾萨克·牛顿',
//   birth_year: 1643,
//   death_year: 1727,
//   nationality: '英国',
//   fields: [ '物理学', '数学', '天文学' ],
//   achievements: [ '万有引力定律', '运动三定律', '微积分的发明', '反射望远镜的发明' ],
//   biography: '艾萨克·牛顿（Isaac Newton）是英国著名的物理学家、数学家和天文学家，被广泛认为是科学史上最具影响力的人物之一。他于1643年出生于英格兰，1727年去世。牛顿在物理学上的贡献包括提出万有引力定律和运动'
// }
// {
//   name: '艾萨克·牛顿',
//   birth_year: 1643,
//   death_year: 1727,
//   nationality: '英国',
//   fields: [ '物理学', '数学', '天文学' ],
//   achievements: [ '万有引力定律', '运动三定律', '微积分的发明', '反射望远镜的发明' ],
//   biography: '艾萨克·牛顿（Isaac Newton）是英国著名的物理学家、数学家和天文学家，被广泛认为是科学史上最具影响力的人物之一。他于1643年出生于英格兰，1727年去世。牛顿在物理学上的贡献包括提出万有引力定律和运动三定律，奠定了'
// }
// {
//   name: '艾萨克·牛顿',
//   birth_year: 1643,
//   death_year: 1727,
//   nationality: '英国',
//   fields: [ '物理学', '数学', '天文学' ],
//   achievements: [ '万有引力定律', '运动三定律', '微积分的发明', '反射望远镜的发明' ],
//   biography: '艾萨克·牛顿（Isaac Newton）是英国著名的物理学家、数学家和天文学家，被广泛认为是科学史上最具影响力的人物之一。他于1643年出生于英格兰，1727年去世。牛顿在物理学上的贡献包括提出万有引力定律和运动三定律，奠定了经典力学的基础。'
// }
// {
//   name: '艾萨克·牛顿',
//   birth_year: 1643,
//   death_year: 1727,
//   nationality: '英国',
//   fields: [ '物理学', '数学', '天文学' ],
//   achievements: [ '万有引力定律', '运动三定律', '微积分的发明', '反射望远镜的发明' ],
//   biography: '艾萨克·牛顿（Isaac Newton）是英国著名的物理学家、数学家和天文学家，被广泛认为是科学史上最具影响力的人物之一。他于1643年出生于英格兰，1727年去世。牛顿在物理学上的贡献包括提出万有引力定律和运动三定律，奠定了经典力学的基础。他还独立发明了'
// }
// {
//   name: '艾萨克·牛顿',
//   birth_year: 1643,
//   death_year: 1727,
//   nationality: '英国',
//   fields: [ '物理学', '数学', '天文学' ],
//   achievements: [ '万有引力定律', '运动三定律', '微积分的发明', '反射望远镜的发明' ],
//   biography: '艾萨克·牛顿（Isaac Newton）是英国著名的物理学家、数学家和天文学家，被广泛认为是科学史上最具影响力的人物之一。他于1643年出生于英格兰，1727年去世。牛顿在物理学上的贡献包括提出万有引力定律和运动三定律，奠定了经典力学的基础。他还独立发明了微积分，并设计'
// }
// {
//   name: '艾萨克·牛顿',
//   birth_year: 1643,
//   death_year: 1727,
//   nationality: '英国',
//   fields: [ '物理学', '数学', '天文学' ],
//   achievements: [ '万有引力定律', '运动三定律', '微积分的发明', '反射望远镜的发明' ],
//   biography: '艾萨克·牛顿（Isaac Newton）是英国著名的物理学家、数学家和天文学家，被广泛认为是科学史上最具影响力的人物之一。他于1643年出生于英格兰，1727年去世。牛顿在物理学上的贡献包括提出万有引力定律和运动三定律，奠定了经典力学的基础。他还独立发明了微积分，并设计了反射望远'
// }
// {
//   name: '艾萨克·牛顿',
//   birth_year: 1643,
//   death_year: 1727,
//   nationality: '英国',
//   fields: [ '物理学', '数学', '天文学' ],
//   achievements: [ '万有引力定律', '运动三定律', '微积分的发明', '反射望远镜的发明' ],
//   biography: '艾萨克·牛顿（Isaac Newton）是英国著名的物理学家、数学家和天文学家，被广泛认为是科学史上最具影响力的人物之一。他于1643年出生于英格兰，1727年去世。牛顿在物理学上的贡献包括提出万有引力定律和运动三定律，奠定了经典力学的基础。他还独立发明了微积分，并设计了反射望远镜。他的著作'
// }
// {
//   name: '艾萨克·牛顿',
//   birth_year: 1643,
//   death_year: 1727,
//   nationality: '英国',
//   fields: [ '物理学', '数学', '天文学' ],
//   achievements: [ '万有引力定律', '运动三定律', '微积分的发明', '反射望远镜的发明' ],
//   biography: '艾萨克·牛顿（Isaac Newton）是英国著名的物理学家、数学家和天文学家，被广泛认为是科学史上最具影响力的人物之一。他于1643年出生于英格兰，1727年去世。牛顿在物理学上的贡献包括提出万有引力定律和运动三定律，奠定了经典力学的基础。他还独立发明了微积分，并设计了反射望远镜。他的著作《自然哲学的'
// }
// {
//   name: '艾萨克·牛顿',
//   birth_year: 1643,
//   death_year: 1727,
//   nationality: '英国',
//   fields: [ '物理学', '数学', '天文学' ],
//   achievements: [ '万有引力定律', '运动三定律', '微积分的发明', '反射望远镜的发明' ],
//   biography: '艾萨克·牛顿（Isaac Newton）是英国著名的物理学家、数学家和天文学家，被广泛认为是科学史上最具影响力的人物之一。他于1643年出生于英格兰，1727年去世。牛顿在物理学上的贡献包括提出万有引力定律和运动三定律，奠定了经典力学的基础。他还独立发明了微积分，并设计了反射望远镜。他的著作《自然哲学的数学原理》（'
// }
// {
//   name: '艾萨克·牛顿',
//   birth_year: 1643,
//   death_year: 1727,
//   nationality: '英国',
//   fields: [ '物理学', '数学', '天文学' ],
//   achievements: [ '万有引力定律', '运动三定律', '微积分的发明', '反射望远镜的发明' ],
//   biography: '艾萨克·牛顿（Isaac Newton）是英国著名的物理学家、数学家和天文学家，被广泛认为是科学史上最具影响力的人物之一。他于1643年出生于英格兰，1727年去世。牛顿在物理学上的贡献包括提出万有引力定律和运动三定律，奠定了经典力学的基础。他还独立发明了微积分，并设计了反射望远镜。他的著作《自然哲学的数学原理》（通常称为《原理'
// }
// {
//   name: '艾萨克·牛顿',
//   birth_year: 1643,
//   death_year: 1727,
//   nationality: '英国',
//   fields: [ '物理学', '数学', '天文学' ],
//   achievements: [ '万有引力定律', '运动三定律', '微积分的发明', '反射望远镜的发明' ],
//   biography: '艾萨克·牛顿（Isaac Newton）是英国著名的物理学家、数学家和天文学家，被广泛认为是科学史上最具影响力的人物之一。他于1643年出生于英格兰，1727年去世。牛顿在物理学上的贡献包括提出万有引力定律和运动三定律，奠定了经典力学的基础。他还独立发明了微积分，并设计了反射望远镜。他的著作《自然哲学的数学原理》（通常称为《原理》）是科学'
// }
// {
//   name: '艾萨克·牛顿',
//   birth_year: 1643,
//   death_year: 1727,
//   nationality: '英国',
//   fields: [ '物理学', '数学', '天文学' ],
//   achievements: [ '万有引力定律', '运动三定律', '微积分的发明', '反射望远镜的发明' ],
//   biography: '艾萨克·牛顿（Isaac Newton）是英国著名的物理学家、数学家和天文学家，被广泛认为是科学史上最具影响力的人物之一。他于1643年出生于英格兰，1727年去世。牛顿在物理学上的贡献包括提出万有引力定律和运动三定律，奠定了经典力学的基础。他还独立发明了微积分，并设计了反射望远镜。他的著作《自然哲学的数学原理》（通常称为《原理》）是科学史上的里程碑。'
// }


// ✅ 流式输出完成