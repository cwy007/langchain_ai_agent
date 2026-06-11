import "dotenv/config";
import {
  MultiServerMCPClient
} from "@langchain/mcp-adapters"
import {
  ChatOpenAI
} from "@langchain/openai"
import chalk from "chalk";
import {
  HumanMessage,
  SystemMessage,
  ToolMessage
} from "@langchain/core/messages"

const model = new ChatOpenAI({
  modelName: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  }
})

const mcpClient = new MultiServerMCPClient({
  mcpServers: {
    'my-mcp-server': {
      command: "node",
      args: [
        "/Users/chanweiyan/workspace/noder/ai-agent/tool_test/src/my-mcp-server.mjs"
      ]
    }
  }
})

const tools = await mcpClient.getTools();
const modelWithTools = model.bindTools(tools);

const res = await mcpClient.listResources();
console.log("资源列表：", res)

let resourceContent = '';
for (const [serverName, resources] of Object.entries(res)) {
  for (const resource of resources) {
    const content = await mcpClient.readResource(serverName, resource.uri);
    // console.log(content);
    resourceContent += content[0].text;
  }
}

async function runAgentWithTools(query, maxIterations = 30) {
  const messages = [
    new SystemMessage(resourceContent), // 将资源内容作为系统提示
    new HumanMessage(query)
  ];

  for (let i = 0; i < maxIterations; i++) {
    console.log(chalk.bgGreen(`⌛️ 正在等待 AI 思考...`));
    const response = await modelWithTools.invoke(messages);
    messages.push(response);

    // 检查是否有工具调用
    if (!response.tool_calls || response.tool_calls.length === 0) {
      console.log(`\n✨ AI 最终回复： ${response.content}\n`);
      return response.content; // 没有工具调用，结束循环，返回最终结果
    }

    console.log(`🔍 检查到 ${response.tool_calls.length} 个工具调用`)
    console.log(`🔧 工具调用 ${response.tool_calls.map(call => call.name).join(", ")}`)

    // 执行工具调用
    for (const toolCall of response.tool_calls) {
      const foundTool = tools.find(tool => tool.name === toolCall.name);
      if (foundTool) {
        const toolResult = await foundTool.invoke(toolCall.args);
        messages.push(
          new ToolMessage({
            content: toolResult,
            tool_call_id: toolCall.id,
          })
        )
      }
    }

  }

  return messages[messages.length - 1].content;
}

// await runAgentWithTools("查一下用户 002 的信息");

await runAgentWithTools("MCP Server 的使用指南是什么？");

// process.exit(0);
await mcpClient.close()