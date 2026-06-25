import "dotenv/config";

import {
  HumanMessage
} from "@langchain/core/messages";
import {
  tool
} from "@langchain/core/tools";
import {
  END,
  MessagesAnnotation,
  START,
  StateGraph,
} from "@langchain/langgraph";
import {
  ToolNode,
  toolsCondition
} from "@langchain/langgraph/prebuilt";
import {
  ChatOpenAI
} from "@langchain/openai";
import {
  z
} from "zod";
import {
  getProductBySku
} from "./inventory-mock.mjs";

const getProductStock = tool(
  async ({
    sku
  }) => getProductBySku(sku), {
    name: "get_product_stock",
    description: "按 SKU 查商品名与库存，SKU 如 SKU-001。",
    schema: z.object({
      sku: z.string().describe("商品 SKU"),
    }),
  }
);

const tools = [getProductStock];
const llm = new ChatOpenAI({
  modelName: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
}).bindTools(tools);

async function agent(state) {
  const response = await llm.invoke(state.messages);
  return {
    messages: response
  };
}

const toolNode = new ToolNode(tools);

const graph = new StateGraph(MessagesAnnotation)
  .addNode("agent", agent)
  .addNode("tools", toolNode)
  .addEdge(START, "agent")
  .addConditionalEdges("agent", toolsCondition, ["tools", END]) // agent 里调用了工具就去 tools，否则直接结束
  .addEdge("tools", "agent") // 工具调用完后回到 agent
  .compile(); // 这里不需要 checkpointer，因为每次都是新会话

const result = await graph.invoke({
  messages: [
    new HumanMessage(
      "查一下 SKU-001 的库存还有多少，回答里带上商品名和数字。"
    ),
  ],
});

// 导出为 Mermaid：可复制到 https://mermaid.live 或 Markdown 的 ```mermaid 代码块
const drawable = await graph.getGraphAsync();
const mermaid = drawable.drawMermaid({
  withStyles: true
});
console.log(mermaid);

const last = result.messages.at(-1);
console.log(last?.content ?? result.messages);

// %%{init: {'flowchart': {'curve': 'linear'}}}%%
// graph TD;
// 	__start__([<p>__start__</p>]):::first
// 	agent(agent)
// 	tools(tools)
// 	__end__([<p>__end__</p>]):::last
// 	__start__ --> agent;
// 	tools --> agent;
// 	agent -.-> tools;
// 	agent -.-> __end__;
// 	classDef default fill:#f2f0ff,line-height:1.2;
// 	classDef first fill-opacity:0;
// 	classDef last fill:#bfb6fc;

// SKU-001 对应的是 **无线鼠标**，目前库存剩余 **42 件**。