import "dotenv/config";
import {
  MilvusClient
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

    // 更新数据
    console.log("正在更新数据...");
    const idToUpdate = "diary_001"; // 要更新的记录ID
    const updatedContent = {
      id: idToUpdate,
      content: "今天是个好日子，我学会了如何使用 Milvus 进行向量搜索！",
      date: "2024-06-01",
      mood: "开心",
      tags: ["学习", "Milvus", "向量搜索"],
    }

    // 获取新的向量表示
    const updatedVector = await getEmbedding(updatedContent.content);
    const updateData = {
      ...updatedContent,
      vector: updatedVector,
    };

    // 使用 upsert 方法更新数据，如果记录不存在则插入新记录
    const updateResult = await client.upsert({
      collection_name: COLLECTION_NAME,
      data: [updateData],
    });

    console.log("数据更新完成！", updateResult);
  } catch (error) {
    console.error("发生错误:", error);
  }
}

main();