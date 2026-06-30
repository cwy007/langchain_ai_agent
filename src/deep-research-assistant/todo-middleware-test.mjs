import "dotenv/config";
import {
  ChatOpenAI
} from "@langchain/openai";
import {
  createAgent,
  HumanMessage,
  todoListMiddleware,
} from "langchain";

const model = new ChatOpenAI({
  model: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  temperature: 0,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL
  }
});

const agent = createAgent({
  model,
  tools: [],
  systemPrompt: "你是生活规划助手。收到需要多步完成的请求时，先用 write_todos 列出中文执行步骤，然后简要说明你的计划。",
  middleware: [todoListMiddleware()],
});

const query =
  "我下周末想带爸妈去杭州玩两天，帮我规划一下：交通怎么选、住哪里方便、必去景点和吃什么，预算控制在人均 1500 元左右。";

const result = await agent.invoke({
  messages: [new HumanMessage(query)],
});

console.log("todos:", JSON.stringify(result.todos, null, 2));
console.log("─".repeat(50));
console.log("回复:", result.messages.at(-1)?.content);

// todos: [
//   {
//     "content": "研究杭州交通方式，包括高铁/飞机到杭州的路线和时间",
//     "status": "in_progress"
//   },
//   {
//     "content": "查找适合家庭入住的酒店或民宿，考虑位置便利性",
//     "status": "pending"
//   },
//   {
//     "content": "规划必去景点，包括西湖、灵隐寺等经典景点",
//     "status": "pending"
//   },
//   {
//     "content": "了解当地特色美食及推荐餐厅",
//     "status": "pending"
//   },
//   {
//     "content": "制定详细行程安排，包含每日时间安排",
//     "status": "pending"
//   },
//   {
//     "content": "计算总预算并控制在人均1500元内",
//     "status": "pending"
//   }
// ]
// ──────────────────────────────────────────────────
// 回复: 我将为你规划一个带父母去杭州的周末两日游行程。我的计划是分步骤进行：

// 1. 首先研究杭州的交通方式，包括高铁和飞机的选择
// 2. 然后寻找适合家庭入住的住宿地点
// 3. 规划必去景点
// 4. 了解当地美食
// 5. 制定详细行程安排
// 6. 控制总预算在人均1500元内

// 现在我开始第一步，研究杭州的交通方式。