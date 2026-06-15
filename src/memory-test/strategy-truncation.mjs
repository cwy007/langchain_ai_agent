import {
  InMemoryChatMessageHistory
} from '@langchain/core/chat_history';
import {
  HumanMessage,
  AIMessage,
  trimMessages
} from '@langchain/core/messages';
import {
  getEncoding
} from 'js-tiktoken';

// 1.按消息数量截断
async function testTruncationByMessageCount() {
  console.log("=== 测试按消息数量截断 ===");
  const history = new InMemoryChatMessageHistory();
  const maxMessages = 4;

  const messages = [{
      type: 'human',
      content: '我叫张三'
    },
    {
      type: 'ai',
      content: '你好张三，很高兴认识你！'
    },
    {
      type: 'human',
      content: '我今年25岁'
    },
    {
      type: 'ai',
      content: '25岁正是青春年华，有什么我可以帮助你的吗？'
    },
    {
      type: 'human',
      content: '我喜欢编程'
    },
    {
      type: 'ai',
      content: '编程很有趣！你主要用什么语言？'
    },
    {
      type: 'human',
      content: '我住在北京'
    },
    {
      type: 'ai',
      content: '北京是个很棒的城市！'
    },
    {
      type: 'human',
      content: '我的职业是软件工程师'
    },
    {
      type: 'ai',
      content: '软件工程师是个很有前景的职业！'
    },
  ];

  // 添加消息到历史记录
  for (const msg of messages) {
    if (msg.type === 'human') {
      history.addMessage(new HumanMessage(msg.content));
    } else if (msg.type === 'ai') {
      history.addMessage(new AIMessage(msg.content));
    }
  }

  // 获取截断后的消息
  const allMessages = await history.getMessages();
  const truncatedMessages = allMessages.slice(-maxMessages);
  console.log(`原始消息数量: ${allMessages.length}`);
  console.log(`截断后消息数量: ${truncatedMessages.length}`);
  truncatedMessages.forEach((msg, index) => {
    const type = msg.type === 'human' ? '用户' : msg.type === 'ai' ? '助手' : '系统';
    console.log(`${index + 1}. [${type}] ${msg.content}`);
  });
}

// testTruncationByMessageCount().catch(console.error);

// 计算消息数组的总 token 数量
function countTokens(messages) {
  const encoding = getEncoding('cl100k_base');
  let totalTokens = 0;
  // console.log('typeof messages:', typeof messages, Array.isArray(messages));
  // if (!Array.isArray(messages)) {
  //   console.warn('Expected an array of messages, but got:', messages);
  //   return 0;
  // }
  messages.forEach(msg => {
    const tokens = encoding.encode(msg.content);
    totalTokens += tokens.length;
  });
  return totalTokens;
}

// 2.按Token数量截断
async function testTruncationByTokenCount() {
  console.log("\n=== 测试按Token数量截断 ===");
  const history = new InMemoryChatMessageHistory();
  const maxTokens = 100;

  const messages = [{
      type: 'human',
      content: '我叫李四'
    },
    {
      type: 'ai',
      content: '你好李四，很高兴认识你！'
    },
    {
      type: 'human',
      content: '我是一名设计师'
    },
    {
      type: 'ai',
      content: '设计师是个很有创造力的职业！你主要做什么类型的设计？'
    },
    {
      type: 'human',
      content: '我喜欢艺术和音乐'
    },
    {
      type: 'ai',
      content: '艺术和音乐都是很好的爱好，它们能激发创作灵感。'
    },
    {
      type: 'human',
      content: '我擅长 UI/UX 设计'
    },
    {
      type: 'ai',
      content: 'UI/UX 设计非常重要，好的用户体验能让产品更成功！'
    },
  ];

  // 添加消息到历史记录
  for (const msg of messages) {
    if (msg.type === 'human') {
      history.addMessage(new HumanMessage(msg.content));
    } else if (msg.type === 'ai') {
      history.addMessage(new AIMessage(msg.content));
    }
  }

  // 获取截断后的消息
  const allMessages = await history.getMessages();

  // 使用 trimMessages 函数按 token 数量截断消息
  const truncatedMessages = await trimMessages(allMessages, {
    maxTokens,
    tokenCounter: countTokens,
    strategy: 'last' // 从最后开始保留消息，直到达到 maxTokens 限制
  });
  const totalTokens = countTokens(truncatedMessages);

  console.log(`总 token 数量: ${totalTokens}/${maxTokens}`);
  console.log(`保留的消息数量: ${truncatedMessages.length}`);
  console.log("截断后的消息:", truncatedMessages.map((msg, index) => {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    const tokens = countTokens([msg]);
    return `${index + 1}. [${msg.constructor.name}] (Tokens: ${tokens}) ${content}`;
  }).join('\n'));
}

// testTruncationByTokenCount().catch(console.error);

async function runAll() {
  await testTruncationByMessageCount();
  await testTruncationByTokenCount();
}

runAll();