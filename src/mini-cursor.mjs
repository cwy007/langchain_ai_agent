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
import {
  readFileTool,
  writeFileTool,
  executeCommandTool,
  listDirectoryTool
} from "./tool-file-read.mjs";
import chalk from "chalk";

const model = new ChatOpenAI({
  modelName: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  temperature: 0,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  }
})

const tools = [
  readFileTool,
  writeFileTool,
  executeCommandTool,
  listDirectoryTool,
]

const modelWithTools = model.bindTools(tools);

async function runAgentWithTools(query, maxIterations = 30) {
  const messages = [
    new SystemMessage(`你是一个项目管理助手，使用工具完成任务。

当前工作目录：${process.cwd()}

工具：
1. read_file - 读取文件
2. write_file - 写入文件
3. execute_command - 执行命令行指令
4. list_directory - 列出目录内容

重要规则 - execute_command:
- workingDirectory 参数会自动切换到指定目录
- 当使用 workingDirectory 时，绝对不要在command中使用cd
- 错误示例： { command: "cd react-todo-app && pnpm install", workingDirectory: "react-todo-app" }
这是错误的，因为 workingDirectory 已经切换到 react-todo-app 了，command 中再使用 cd 就会出问题。
- 正确示例： { command: "pnpm install", workingDirectory: "react-todo-app" }
这样就对了！workingDirectory 切换到 react-todo-app 后，command 直接执行 pnpm install 就可以了。

回复要简洁，只说做了什么
`),
    new HumanMessage(query),
  ];

  for (let i = 0; i < maxIterations; i++) {
    console.log(chalk.bgGreen(`⌛️ 正在等待AI回复... (第 ${i + 1} 轮)`));
    const response = await modelWithTools.invoke(messages);
    messages.push(response); // 将模型回复添加到消息列表中，供后续分析使用

    // 没有工具调用了，说明AI回复结束了，可以返回最终结果了
    if (!response.tool_calls || response.tool_calls.length === 0) {
      console.log(`没有检测到工具调用，AI回复结束。`);
      return `\n ✨ AI最终回复：\n ${response.content}`; // 返回最终的AI回复内容
    }

    // 检查模型回复中是否包含工具调用，如果有则执行工具调用并将结果反馈给模型，模型可能会基于工具结果继续分析或进行更多工具调用
    for (const toolCall of response.tool_calls) {
      // console.log(`🔧 正在执行工具: ${toolCall.name}，参数: ${JSON.stringify(toolCall.arguments)}`);
      try {
        const tool = tools.find(t => t.name === toolCall.name);
        const toolResult = await tool.invoke(toolCall.args);
        // console.log(`✅ 工具执行成功，结果: ${toolResult}`);
        // 将工具结果作为 ToolMessage 添加到消息列表中，供模型后续分析使用
        messages.push(new ToolMessage({
          content: toolResult,
          tool_call_id: toolCall.id,
        }));
      } catch (error) {
        console.error(`❌ 工具执行失败，错误: ${error.message}`);
        // 将错误信息作为 ToolMessage 添加到消息列表中，供模型后续分析使用
        messages.push(new ToolMessage({
          content: `工具执行失败: ${error.message}`,
          tool_call_id: toolCall.id,
        }));
      }
    }
  }

  return messages[messages.length - 1].content; // 如果达到最大迭代次数，返回最后一次AI回复的内容
}

const todoListInstructions = `创建一个功能丰富的 React todoList 应用：

1.创建项目：echo -3 "n\nn" | pnpm create vite react-todo-app --template react-ts
2.修改 src/App.tsx,实现完整功能的 TodoList:
  - 添加、删除、编辑、标记完成
  - 分类筛选（全部/进行中/已完成）
  - 统计信息显示
  - localStorage 数据持久化
3.添加复杂样式：
  - 渐变背景（蓝到紫）
  - 卡片阴影、圆角
  - 悬停效果
4.添加动画
  - 添加/删除时的过渡动画
  - 使用 CSS transitions
5.列出目录确认

注意：使用 pnpm，功能要完整，样式要美观，要有动画效果

之后在 react-todo-app 项目中：
1.使用 pnpm install 安装依赖
2.使用 pnpm run dev 启动项目
3.确认项目能正常运行，访问 http://localhost:5173/ 能看到 todoList 应用界面
`

try {
  await runAgentWithTools(todoListInstructions);
} catch (error) {
  console.error(`\n❌错误: ${error.message}`);
}