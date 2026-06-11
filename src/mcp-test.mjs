import "dotenv/config";
import {
  MultiServerMCPClient
} from '@langchain/mcp-adapters';
import {
  ChatOpenAI
} from '@langchain/openai';
import chalk from 'chalk';
import {
  HumanMessage,
  SystemMessage,
  ToolMessage
} from '@langchain/core/messages';

const model = new ChatOpenAI({
  modelName: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

const mcpClient = new MultiServerMCPClient({
  mcpServers: {
    'my-mcp-server': {
      command: 'node',
      args: [
        '/Users/chanweiyan/workspace/noder/ai-agent/tool_test/src/my-mcp-server.mjs',
      ],
    },
    "amap-maps-streamableHTTP": {
      "url": `https://mcp.amap.com/mcp?key=${process.env.AMAP_API_KEY}`
    },
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        ...((process.env.ALLOWED_PATHS || "").split(','))
      ]
    },
    "chrome-devtools": {
      "command": "npx",
      "args": [
        "-y",
        "chrome-devtools-mcp@latest"
      ]
    }
  },
});

const tools = await mcpClient.getTools();
const modelWithTools = model.bindTools(tools);

async function runAgentWithTools(query, maxIterations = 30) {
  const messages = [
    new HumanMessage(query)
  ]

  for (let i = 0; i < maxIterations; i++) {
    console.log(chalk.bgGreen(`⌛️ 正在等待 AI 思考...`));
    const response = await modelWithTools.invoke(messages);
    messages.push(response);

    // 检查是否有工具调用
    if (!response.tool_calls || response.tool_calls.length === 0) {
      console.log(`\n ✨ AI 最终回复： ${response.content}\n`);
      return response.content;
    }

    console.log(`🔍 检查到 ${response.tool_calls.length} 个工具调用`);
    console.log(chalk.bgBlue(`🔧 AI 调用了工具: ${response.tool_calls.map(call => call.name).join(', ')}`));
    // 如果有工具调用，继续循环等待工具结果
    for (const toolCall of response.tool_calls) {
      const foundTool = tools.find(tool => tool.name === toolCall.name);
      if (foundTool) {
        const toolResult = await foundTool.invoke(toolCall.args);
        messages.push(new ToolMessage({
          content: typeof toolResult === 'string' ? toolResult : toolResult.text,
          tool_call_id: toolCall.id,
        }));
      }
    }
  }

  return messages[messages.length - 1].content; // 返回最后一次 AI 回复的内容
}

// await runAgentWithTools("北京南站附近的酒店，以及去的路线，路线规划生成文档保存到 /Users/chanweiyan/Desktop 的一个 md 文件")

await runAgentWithTools("北京南站附近的酒店，最近的 3 个酒店，拿到酒店图片，打开浏览器，展示每个酒店的图片，每个 tab 一个 url 展示，并且在把那个页面标题改为酒店名");


// await mcpClient.close();