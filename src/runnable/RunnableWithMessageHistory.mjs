import 'dotenv/config';
import {
  RunnableWithMessageHistory
} from "@langchain/core/runnables";
import {
  InMemoryChatMessageHistory
} from "@langchain/core/chat_history";
import {
  ChatOpenAI
} from "@langchain/openai";
import {
  ChatPromptTemplate,
  MessagesPlaceholder
} from "@langchain/core/prompts";
import {
  StringOutputParser
} from "@langchain/core/output_parsers";

const model = new ChatOpenAI({
  modelName: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  temperature: 0.3,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

const prompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    "你是一个简洁、有帮助的中文助手，会用 1-2 句话回答用户问题，重点给出明确、有用的信息。",
  ],
  new MessagesPlaceholder("history"),
  ["human", "{question}"],
]);

const simpleChain = prompt.pipe(model).pipe(new StringOutputParser());

const messageHistories = new Map();

const getMessageHistory = (sessionId) => {
  if (!messageHistories.has(sessionId)) {
    messageHistories.set(sessionId, new InMemoryChatMessageHistory());
  }
  return messageHistories.get(sessionId);
};

// RunnableWithMessageHistory 创建带消息历史的链
const chain = new RunnableWithMessageHistory({
  runnable: simpleChain,
  // sessionId 如何获取？可以在调用链时传入
  // 例如 chain.invoke(input, { configurable: { sessionId: "user-123" } })
  getMessageHistory: (sessionId) => getMessageHistory(sessionId),
  inputMessagesKey: "question", // 输入问题的 key
  historyMessagesKey: "history", // 历史消息的 key
});

// 测试：第一次对话
console.log('--- 第一次对话（提供信息） ---');
const result1 = await chain.invoke({
  question: "我的名字是神光，我来自山东，我喜欢编程、写作、金铲铲。",
}, {
  // configurable 的作用是允许在调用链时传入一些可配置的参数，例如 sessionId，用于区分不同用户的对话历史
  configurable: {
    sessionId: "user-123", // 使用相同的 sessionId 来保持对话历史
  },
});
console.log('问题: 我的名字是神光，我来自山东，我喜欢编程、写作、金铲铲。');
console.log('回答:', result1);
console.log(); // 为了在控制台输出中添加一个空行，使不同对话的输出之间有视觉上的分隔，便于阅读。

// 测试：第二次对话
console.log('--- 第二次对话（询问之前的信息） ---');
const result2 = await chain.invoke({
  question: "我刚才说我来自哪里？",
}, {
  configurable: {
    sessionId: "user-123",
  },
});
console.log('问题: 我刚才说我来自哪里？');
console.log('回答:', result2);
console.log();

// 测试：第三次对话
console.log('--- 第三次对话（继续询问） ---');
const result3 = await chain.invoke({
  question: "我的爱好是什么？",
}, {
  configurable: {
    sessionId: "user-123",
  },
});
console.log('问题: 我的爱好是什么？');
console.log('回答:', result3);
console.log();

// --- 第一次对话（提供信息） ---
// 问题: 我的名字是神光，我来自山东，我喜欢编程、写作、金铲铲。
// 回答: 神光你好！编程、写作和游戏都是很棒的兴趣组合，既能锻炼逻辑又能表达自我。愿你在这条路上玩得开心，也产出好内容～

// --- 第二次对话（询问之前的信息） ---
// 问题: 我刚才说我来自哪里？
// 回答: 你刚才说来自山东。

// --- 第三次对话（继续询问） ---
// 问题: 我的爱好是什么？
// 回答: 你的爱好是编程、写作和金铲铲。