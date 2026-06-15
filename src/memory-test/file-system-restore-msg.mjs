import "dotenv/config";
import {
  ChatOpenAI
} from '@langchain/openai';
import {
  FileSystemChatMessageHistory
} from '@langchain/community/stores/message/file_system';
import {
  HumanMessage,
  AIMessage,
  SystemMessage
} from '@langchain/core/messages';
import path from "node:path";

const model = new ChatOpenAI({
  temperature: 0,
  model: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
})

async function fileSystemHistoryRestoreTest() {
  // 指定存储文件的路径
  const filePath = path.join(process.cwd(), "chat_history.json");
  const sessionId = "user-session-001";

  // 系统提示词
  const systemMessage = new SystemMessage("你是一个友好的做菜助手，喜欢分享美食和烹饪技巧。");

  console.log("[恢复历史会话]");
  const history = new FileSystemChatMessageHistory({
    filePath,
    sessionId,
  });

  const messages = await history.getMessages();
  console.log(`从文件系统中恢复了 ${messages.length} 条消息:`);
  messages.forEach((msg, index) => {
    const type = msg.type === 'human' ? '用户' : msg.type === 'ai' ? '助手' : '系统';
    console.log(`${index + 1}. [${type}] ${msg.content.substring(0, 50)}${msg.content.length > 50 ? '...' : ''}`);
  })

  console.log("\n[第3轮对话]")
  const humanMessage3 = new HumanMessage("需要哪些食材？");
  await history.addMessage(humanMessage3);

  const messages3 = [systemMessage, ...(await history.getMessages())];
  const response3 = await model.invoke(messages3);
  await history.addMessage(response3);

  console.log("用户:", humanMessage3.content);
  console.log("助手:", response3.content);
  console.log("新的对话已经更新到文件系统中，路径:", filePath);
}

fileSystemHistoryRestoreTest().catch(console.error);