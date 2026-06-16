import 'dotenv/config';
import {
  MilvusClient,
  MetricType
} from '@zilliz/milvus2-sdk-node';
import {
  OpenAIEmbeddings
} from '@langchain/openai';

const COLLECTION_NAME = 'ebook_collection';
const VECTOR_DIM = 1024;

const embeddings = new OpenAIEmbeddings({
  model: process.env.EMBEDDING_MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
  dimensions: VECTOR_DIM,
});

const client = new MilvusClient({
  address: process.env.MILVUS_ADDRESS || "localhost:19530",
})

async function getEmbedding(text) {
  const result = await embeddings.embedQuery(text);
  return result;
}

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

    return searchResults;
  } catch (error) {
    console.error("搜索 Milvus 时出错:", error);
    throw error;
  }
}

async function main() {
  try {
    console.log("连接Milvus服务器...");
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

    // 向量搜索
    const queryText = "段誉会什么武功？";
    console.log('='.repeat(50));
    console.log(`查询文本: ${queryText}`);
    console.log('='.repeat(50));
    const searchResults = await searchMilvus(queryText, 3);

    console.log(`搜索完成，找到 ${searchResults.length} 条相关记录:`);
    searchResults.results.forEach((result, index) => {
      console.log(`${index + 1} [Score: ${result.score.toFixed(4)}]`);
      console.log(`ID: ${result.id}`);
      console.log(`Book ID: ${result.book_id}`);
      console.log(`章节: ${result.chapter_num}`);
      console.log(`索引: ${result.index}`);
      console.log(`内容: ${result.content}`);
      console.log('---'.repeat(20));
    });
  } catch (error) {
    console.error("发生错误:", error);
  }
}

main();