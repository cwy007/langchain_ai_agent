import "dotenv/config";

import {
  HumanMessage
} from "@langchain/core/messages";
import {
  ChatOpenAI
} from "@langchain/openai";
import {
  MemorySaver
} from "@langchain/langgraph";
import {
  createAgent,
  tool
} from "langchain";
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

const model = new ChatOpenAI({
  modelName: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

const agent = createAgent({
  model,
  tools: [getProductStock],
  systemPrompt: "你是仓库助手。问库存时必须调用 get_product_stock（模拟数据），禁止编造。",
  checkpointer: new MemorySaver(),
});

const result = await agent.invoke({
  messages: [new HumanMessage("SKU-002 还剩多少库存？")]
}, {
  configurable: {
    thread_id: "demo-thread"
  }
});

// 导出为 Mermaid：可复制到 https://mermaid.live 或 Markdown 的 ```mermaid 代码块
const drawable = await agent.graph.getGraphAsync();
const mermaid = drawable.drawMermaid({
  withStyles: true
});
console.log(mermaid);

const last = result.messages.at(-1);
console.log(last?.content ?? result);

// %%{init: {'flowchart': {'curve': 'linear'}}}%%
// graph TD;
// 	__start__([<p>__start__</p>]):::first
// 	model_request(model_request)
// 	tools(tools)
// 	__end__([<p>__end__</p>]):::last
// 	__start__ --> model_request;
// 	tools --> model_request;
// 	model_request -.-> tools;
// 	model_request -.-> __end__;
// 	classDef default fill:#f2f0ff,line-height:1.2;
// 	classDef first fill-opacity:0;
// 	classDef last fill:#bfb6fc;

// SKU-002 **机械键盘** 当前库存为 **7 件**。