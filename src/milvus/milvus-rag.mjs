import "dotenv/config";
import {
  MilvusClient,
  MetricType
} from "@zilliz/milvus2-sdk-node";
import {
  ChatOpenAI,
  OpenAIEmbeddings
} from "@langchain/openai";

const COLLECTION_NAME = 'ai_diary';
const VECTOR_DIM = 1024;

// 初始化 OpenAI Chat 模型
const model = new ChatOpenAI({
  model: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
  temperature: 0.7,
});

// 初始化 OpenAI Embeddings 模型
const embeddings = new OpenAIEmbeddings({
  model: process.env.EMBEDDING_MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
  dimensions: VECTOR_DIM,
});

// 初始化 Milvus 客户端
const client = new MilvusClient({
  address: process.env.MILVUS_ADDRESS || "localhost:19530",
});

// 获取文本的向量表示
async function getEmbedding(text) {
  const result = await embeddings.embedQuery(text);
  return result;
}

// 从 milvus 中搜索相关文档
// topK 参数指定返回的相关文档数量
async function searchMilvus(queryText, topK = 2) {
  try {
    const queryVector = await getEmbedding(queryText);

    const searchResults = await client.search({
      collection_name: COLLECTION_NAME,
      vector: queryVector,
      limit: topK,
      metric_type: MetricType.COSINE,
      output_fields: ["id", 'content', 'date', 'mood', 'tags'],
    });

    return searchResults;
  } catch (error) {
    console.error("搜索 Milvus 时发生错误:", error);
    return [];
  }
}

// 使用 RAG 模式生成回答
async function generateAnswer(queryText, topK = 2) {
  try {
    console.log('='.repeat(50));
    console.log(`用户查询: ${queryText}`);
    console.log('='.repeat(50));

    const searchResults = await searchMilvus(queryText, topK);

    if (searchResults.length === 0) {
      return "抱歉，我没有找到相关的日记记录。";
    }

    // 打印检索到的日记和相似度分数
    console.log(`找到 ${searchResults.length} 条相关记录:`);
    searchResults.results.forEach((result, index) => {
      console.log(`${index + 1} [Score: ${result.score.toFixed(4)}]`);
      console.log(`ID: ${result.id}`);
      console.log(`内容: ${result.content}`);
      console.log(`日期: ${result.date}`);
      console.log(`心情: ${result.mood}`);
      console.log(`标签: ${result.tags.join(', ')}`);
      console.log('---'.repeat(20));
    });

    // 将检索到的相关文档内容拼接成一个字符串，作为模型的上下文
    const context = searchResults.results.map((result, index) => {
      return `[日记${index + 1}]\n内容: ${result.content}\n日期: ${result.date}\n心情: ${result.mood}\n标签: ${result.tags.join(', ')}\n`;
    }).join("\n\n=====\n\n");

    // 构建模型输入
    const prompt = `你是一个温暖贴心的AI日记助手。基于用户的日记内容回答问题，用亲切自然的语言。

    请根据以下日记内容回答问题：
    ${context}

    用户的问题: ${queryText}

    回答要求：
    1. 如果日记中有相关信息， 请结合日记内容给出详细、 温暖的回答
    2. 可以总结多篇日记的内容， 找出共同点或趋势
    3. 如果日记中没有相关信息， 请温和地告知用户
    4. 用第一人称 "你" 来称呼日记的作者
    5. 回答要有同理心， 让用户感到被理解和关心

    AI的回答:`;

    console.log("\n【AI 回答】");
    const response = await model.invoke(prompt);
    console.log(response.content);
    console.log("\n\n");
    return response.content;
  } catch (error) {
    console.error("生成回答时发生错误:", error);
    return "抱歉，生成回答时发生了错误。";
  }
}

async function main() {
  try {
    console.log("连接 Milvus 服务器...");
    await client.connectPromise;
    console.log("连接成功！");

    // 示例查询
    const queryText = "我最近做了什么让我感到快乐的事情？";
    // const queryText = "我想看看关于学习的日记";
    await generateAnswer(queryText, 2);
  } catch (error) {
    console.error("发生错误:", error);
  } finally {
    await client.closeConnection();
  }
}

main();