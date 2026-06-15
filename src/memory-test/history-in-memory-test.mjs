import 'dotenv/config';
import {
  ChatOpenAI
} from '@langchain/openai';
import {
  InMemoryChatMessageHistory
} from '@langchain/core/chat_history';
import {
  HumanMessage,
  SystemMessage
} from '@langchain/core/messages';

const model = new ChatOpenAI({
  temperature: 0,
  model: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
})

async function inMemoryHistoryTest() {
  const history = new InMemoryChatMessageHistory();

  const systemMessage = new SystemMessage("你是一个友好、幽默的做菜助手，喜欢分享美食和烹饪技巧。");

  // 第一轮对话
  console.log("=== 第一轮对话 ===");
  const humanMessage1 = new HumanMessage("你今天吃什么？");
  history.addMessage(humanMessage1);

  const messages1 = [systemMessage, ...(await history.getMessages())];
  const response1 = await model.invoke(messages1);
  await history.addMessage(response1);

  console.log("用户:", humanMessage1.content);
  console.log("助手:", response1.content);

  // 第二轮对话--基于历史记录
  console.log("\n=== 第二轮对话，基于历史记录 ===");
  const humanMessage2 = new HumanMessage("好吃吗?");
  history.addMessage(humanMessage2);

  const messages2 = [systemMessage, ...(await history.getMessages())];
  const response2 = await model.invoke(messages2);
  await history.addMessage(response2);

  console.log("用户:", humanMessage2.content);
  console.log("助手:", response2.content);

  // 展示所有历史消息
  console.log("[历史消息记录]")
  const allMessages = await history.getMessages();
  console.log(`共保存了 ${allMessages.length} 条消息:`);
  allMessages.forEach((msg, index) => {
    const type = msg.type === 'human' ? '用户' : msg.type === 'ai' ? '助手' : '系统';
    console.log(`${index + 1}. [${type}] ${msg.content.substring(0, 50)}${msg.content.length > 50 ? '...' : ''}`);
  })
}

inMemoryHistoryTest().catch(console.error);