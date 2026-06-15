import "dotenv/config";
import {
  ChatOpenAI
} from '@langchain/openai';
import {
  InMemoryChatMessageHistory
} from '@langchain/core/chat_history';
import {
  HumanMessage,
  SystemMessage,
  AIMessage,
  getBufferString
} from '@langchain/core/messages';

const model = new ChatOpenAI({
  temperature: 0,
  model: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
})

// 总结策略
async function testSummarization() {
  const history = new InMemoryChatMessageHistory();
  const maxMessages = 6; // 超过 6 条消息时触发总结

  const messages = [{
      type: 'human',
      content: '我想学做红烧肉，你能教我吗？'
    },
    {
      type: 'ai',
      content: '当然可以！红烧肉是一道经典的中式菜肴。首先需要准备五花肉、冰糖、生抽、老抽、料酒等材料。'
    },
    {
      type: 'human',
      content: '五花肉需要切多大块？'
    },
    {
      type: 'ai',
      content: '建议切成3-4厘米见方的块，这样既容易入味，口感也更好。切好后可以用开水焯一下去除血沫。'
    },
    {
      type: 'human',
      content: '炒糖色的时候有什么技巧吗？'
    },
    {
      type: 'ai',
      content: '炒糖色是关键步骤。用小火慢慢炒，等冰糖完全融化变成焦糖色，冒小泡时就可以下肉了。注意不要炒过头，否则会发苦。'
    },
    {
      type: 'human',
      content: '需要炖多长时间？'
    },
    {
      type: 'ai',
      content: '一般需要炖40-60分钟，用小火慢炖，直到肉变得软糯入味。可以用筷子戳一下，能轻松戳透就说明好了。'
    },
    {
      type: 'human',
      content: '最后收汁的时候要注意什么？'
    },
    {
      type: 'ai',
      content: '收汁时要用大火，不断翻动，让汤汁均匀包裹在肉块上。看到汤汁变得浓稠，颜色红亮就可以出锅了。'
    },
  ];

  for (const msg of messages) {
    if (msg.type === 'human') {
      await history.addMessage(new HumanMessage(msg.content));
    } else if (msg.type === 'ai') {
      await history.addMessage(new AIMessage(msg.content));
    }
  }

  let allMessages = await history.getMessages();

  console.log(`原始消息数量: ${allMessages.length}`);
  console.log(`原始消息内容:`, allMessages.map((msg, index) => {
    return `${msg.constructor.name}: ${msg.content}`;
  }).join('\n'));

  // 如果消息过多，触发总结
  if (allMessages.length > maxMessages) {
    const keepRecent = 2; // 保留最近 2 条消息

    // 分离要保留的消息和要总结的消息
    const recentMessages = allMessages.slice(-keepRecent);
    const messagesToSummarize = allMessages.slice(0, -keepRecent);

    console.log(`\n历史消息过多，开始总结...`);
    console.log(`需要总结的消息数量: ${messagesToSummarize.length}`);
    console.log(`保留的最近消息数量: ${recentMessages.length}`);

    // 总结将被丢弃的旧消息
    const summary = await summarizeMessages(messagesToSummarize);
    console.log(`总结内容: ${summary.content}`);

    // 清空历史消息
    await history.clear();
    // // 将总结作为系统消息添加到历史中
    // const summaryMessage = new SystemMessage(`对话总结: ${summary.content}`);
    // await history.addMessage(summaryMessage);

    // 只保留最近的消息
    for (const msg of recentMessages) {
      await history.addMessage(msg);
    }

    allMessages = await history.getMessages();
    console.log(`\n总结后的消息数量: ${allMessages.length}`);
    console.log(`总结后的消息内容:`, allMessages.map((msg, index) => {
      return `${msg.constructor.name}: ${msg.content}`;
    }).join('\n'));
  }
}

// 总结历史消息的函数
async function summarizeMessages(messages) {
  if (messages.length === 0) {
    return "";
  }

  const conversationText = getBufferString(messages, '用户', '助手');
  console.log(`\n生成总结的对话内容:\n`, conversationText);


  const summaryPrompt = `请总结以下对话的核心内容，保留关键信息和要点，尽量简洁:

  ${conversationText}

  总结：`;


  const response = await model.invoke([
    new SystemMessage(summaryPrompt),
  ]);
  return response;
}

testSummarization().catch(console.error);