import 'dotenv/config';
import {
  ChatOpenAI
} from '@langchain/openai';
import {
  tool
} from "@langchain/core/tools";
import {
  HumanMessage,
  SystemMessage,
  ToolMessage
} from "@langchain/core/messages";
import fs from "node:fs/promises";
import {
  z
} from "zod";

// 初始化模型
const model = new ChatOpenAI({
  modelName: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  temperature: 0, // ai 的创造性，设置为0表示要求 ai 以最确定性的方式回复，适合需要准确结果的场景
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  }
})

// 定义一个工具，用于读取文件内容
const readFileTool = tool(
  async ({
    filePath
  }) => {
    const content = await fs.readFile(filePath, "utf-8");
    console.log(`[工具调用] read_file("${filePath}") - 成功读取 ${content.length} 字符`);
    return content;
  }, {
    name: "read_file",
    description: '用此工具来读取文件内容。当用户要求读取文件、查看代码、分析文件内容时，调用此工具。输入文件路径（可以是相对路径或绝对路径）。',
    schema: z.object({
      filePath: z.string().describe("要读取的文件路径"),
    })
  }
)

const tools = [
  readFileTool,
]

// 将工具绑定到模型上，使模型能够调用工具
const modelWithTools = model.bindTools(tools);

const messages = [
  new SystemMessage(`你是一个编程助手，可以使用工具读取文件并解释代码。

    工作流程：
    1. 用户需要读取文件时，立即调用工具 read_file 工具
    2. 等待工具返回文本内容
    3. 基于文件内容进行分析和解释

    可用工具：
    - read_file(filePath: string): 读取指定路径的文件内容，并返回文本。

    `),
  new HumanMessage("请帮我读取一下 src/tool-file-read.mjs 文件的内容并解释代码。")
];

// 让模型处理消息，模型会根据消息内容决定是否调用工具
let response = await modelWithTools.invoke(messages);

// console.log("模型回复：", response)
// 模型回复： AIMessage {
//   "id": "chatcmpl-1fb2925d-2c45-9df6-832a-9c5d67235cb9",
//   "content": "我将帮你读取并解释这个文件的内容。让我先读取文件。\n",
//   "additional_kwargs": {
//     "tool_calls": [{
//       "function": "[Object]",
//       "id": "call_b7f19c00ba8a4f29a8839c1e",
//       "index": 0,
//       "type": "function"
//     }]
//   },
//   "response_metadata": {
//     "tokenUsage": {
//       "promptTokens": 414,
//       "completionTokens": 43,
//       "totalTokens": 457
//     },
//     "finish_reason": "tool_calls",
//     "model_provider": "openai",
//     "model_name": "qwen3-coder-flash"
//   },
//   "tool_calls": [{
//     "name": "read_file",
//     "args": {
//       "filePath": "src/tool-file-read.mjs"
//     },
//     "type": "tool_call",
//     "id": "call_b7f19c00ba8a4f29a8839c1e"
//   }],
//   "invalid_tool_calls": [],
//   "usage_metadata": {
//     "output_tokens": 43,
//     "input_tokens": 414,
//     "total_tokens": 457,
//     "input_token_details": {
//       "cache_read": 0
//     },
//     "output_token_details": {}
//   }
// }
messages.push(response); // 将模型回复添加到消息列表中，供后续分析使用

// 检查模型回复中是否包含工具调用，如果有则执行工具调用并将结果反馈给模型，模型可能会基于工具结果继续分析或进行更多工具调用
while (response.tool_calls && response.tool_calls.length > 0) {
  console.log(`\n 检查到 ${response.tool_calls.length} 个工具调用，正在处理...`);

  // 执行所有的工具调用
  const toolResults = await Promise.all(
    response.tool_calls.map(async (toolCall) => {
      console.log(`正在执行工具调用: ${toolCall.name} with args ${JSON.stringify(toolCall.args)}`);
      const tool = tools.find((t) => t.name === toolCall.name); // 从工具列表中找到对应的工具
      if (!tool) {
        console.error(`未找到工具: ${toolCall.name}`);
        return {
          id: toolCall.id,
          error: `错误： 工具 ${toolCall.name} 未找到`
        };
      }

      try {
        const result = await tool.invoke(toolCall.args); // 调用工具并获取结果
        console.log(`工具调用成功: ${toolCall.name} - 结果长度: ${result.length}`);
        return {
          id: toolCall.id,
          result
        };
      } catch (error) {
        console.error(`工具调用失败: ${toolCall.name} - 错误: ${error.message}`);
        return {
          id: toolCall.id,
          error: `错误： 工具 ${toolCall.name} 调用失败 - ${error.message}`
        };
      }
    })
  )

  for (const toolResult of toolResults) {
    // 将工具结果添加到消息列表中，供模型后续分析使用
    messages.push(new ToolMessage({
      content: toolResult.result || toolResult.error,
      tool_call_id: toolResult.id, // 关联工具调用 ID，模型可以根据这个 ID 知道这是哪个工具调用的结果
    }));
  }

  response = await modelWithTools.invoke(messages); // 让模型基于新的消息列表继续处理，模型可能会进行分析或继续调用工具
  messages.push(response); // 将模型回复添加到消息列表中，供后续分析使用
}

console.log("\n最终模型回复：", response.content);