import "dotenv/config";
import {
  MilvusClient,
  MetricType
} from "@zilliz/milvus2-sdk-node";
import {
  ChatOpenAI,
  OpenAIEmbeddings
} from "@langchain/openai";

const COLLECTION_NAME = 'ebook_collection';
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
      output_fields: ["id", 'book_id', 'chapter_num', 'index', 'content'],
    });

    return searchResults.results;
  } catch (error) {
    console.error("搜索 Milvus 时出错:", error);
    throw error;
  }
}

async function answerQuery(queryText, topK = 2) {
  try {
    console.log('='.repeat(50));
    console.log(`用户查询: ${queryText}`);
    console.log('='.repeat(50));

    console.log("正在搜索相关文档...");
    const searchResults = await searchMilvus(queryText, topK);
    console.log(`找到 ${searchResults.length} 条相关文档`);

    // 打印搜索结果
    searchResults.forEach((result, index) => {
      console.log(`\n[片段 ${index + 1}] 相似度得分: ${result.score.toFixed(4)}`);
      console.log(`来源: 书籍ID=${result.book_id}, 章节=${result.chapter_num}, 索引=${result.index}`);
      console.log(`内容: ${result.content}`);
    })

    // 构建上下文
    const context = searchResults.map((result, index) => {
      return `[片段 ${index + 1}]
      章节: ${result.chapter_num}
      内容: ${result.content}`;
    }).join('\n\n======\n\n');

    // 构建提示词
    const prompt = `你是一个专业的《天龙八部》小说助手。基于小说内容回答问题，用准确、详细的语言。

请根据以下《天龙八部》小说片段内容回答问题：
${context}

用户问题: ${queryText}

回答要求：
1. 如果片段中有相关信息，请结合小说内容给出详细、准确的回答
2. 可以综合多个片段的内容，提供完整的答案
3. 如果片段中没有相关信息，请如实告知用户
4. 回答要准确，符合小说的情节和人物设定
5. 可以引用原文内容来支持你的回答

AI 助手的回答:`;

    // 调用模型生成回答
    console.log('='.repeat(50));
    console.log('\n【AI 回答】')
    const response = await model.invoke(prompt);
    console.log(response.content);
    console.log('\n')
    return response.content;
  } catch (error) {
    console.error("回答查询时发生错误:", error);
    return "很抱歉，回答查询时发生了错误。";
  }
}

async function main() {
  try {
    console.log("连接 Milvus 服务器...");
    await client.connectPromise;
    console.log("连接成功！");

    // 确保集合已加载
    try {
      await client.loadCollection({
        collection_name: COLLECTION_NAME,
      });
      console.log(`集合 ${COLLECTION_NAME} 已加载`);
    } catch (error) {
      console.error(`加载集合 ${COLLECTION_NAME} 时出错:`, error);
    }

    // 问一个关于天龙八部小说的问题
    // const question = "段誉会什么武功？";
    const question = "鸠摩智会什么武功？";
    await answerQuery(question, 3);
  } catch (error) {
    console.error("发生错误:", error);
  }
}

main();