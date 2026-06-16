import "dotenv/config";
import {
  MilvusClient,
  MetricType
} from "@zilliz/milvus2-sdk-node";
import {
  OpenAIEmbeddings
} from "@langchain/openai";

const COLLECTION_NAME = 'ai_diary';
const VECTOR_DIM = 1024;

const embeddings = new OpenAIEmbeddings({
  model: process.env.EMBEDDING_MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
  dimensions: VECTOR_DIM,
})

const client = new MilvusClient({
  address: process.env.MILVUS_ADDRESS || "localhost:19530",
})

async function getEmbedding(text) {
  const result = await embeddings.embedQuery(text);
  return result;
}

async function main() {
  try {
    console.log("连接Milvus服务器...");
    await client.getVersion();
    console.log("连接成功！");

    // 向量搜索
    console.log("正在进行向量搜索...");
    const queryText = "我想看看关于学习的日记";
    // const queryText = "我想看看关于做饭的日记";
    // const queryText = "我想看看关于户外活动的日记";
    console.log('='.repeat(50));
    console.log(`查询文本: ${queryText}`);
    console.log('='.repeat(50));

    const queryVector = await getEmbedding(queryText);

    const searchResults = await client.search({
      collection_name: COLLECTION_NAME,
      vector: queryVector,
      limit: 2,
      metric_type: MetricType.COSINE,
      output_fields: ["id", 'content', 'date', 'mood', 'tags'],
    });

    console.log(searchResults)

    console.log(`搜索完成，找到 ${searchResults.length} 条相关记录:`);
    searchResults.results.forEach((result, index) => {
      console.log(`${index + 1} [Score: ${result.score.toFixed(4)}]`);
      console.log(`ID: ${result.id}`);
      console.log(`内容: ${result.content}`);
      console.log(`日期: ${result.date}`);
      console.log(`心情: ${result.mood}`);
      console.log(`标签: ${result.tags.join(', ')}`);
      console.log('---'.repeat(20));
    });
  } catch (error) {
    console.error("发生错误:", error);
  }
}

main();