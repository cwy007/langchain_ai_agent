import "dotenv/config";
import {
  MilvusClient
} from "@zilliz/milvus2-sdk-node";

const COLLECTION_NAME = 'ai_diary';

const client = new MilvusClient({
  address: process.env.MILVUS_ADDRESS || "localhost:19530",
})

async function main() {
  try {
    console.log("连接Milvus服务器...");
    await client.getVersion();
    console.log("连接成功！");

    // 1.删除单条记录
    console.log("正在删除单条记录...");
    const idToDelete = "diary_001";
    const deleteResult = await client.delete({
      collection_name: COLLECTION_NAME,
      filter: `id == "${idToDelete}"`,
    });
    console.log("单条记录删除完成！", deleteResult);

    // 2.删除多条记录
    console.log("正在删除多条记录...");
    const idsToDelete = ["diary_002", "diary_003"];
    const deleteManyResult = await client.delete({
      collection_name: COLLECTION_NAME,
      filter: `id in ["${idsToDelete.join('", "')}"]`,
    });
    console.log("多条记录删除完成！", deleteManyResult);

    // 3.删除满足条件的记录
    console.log("正在删除满足条件的记录...");
    const deleteByConditionResult = await client.delete({
      collection_name: COLLECTION_NAME,
      filter: `mood == 'proud'`, // 删除心情为proud的记录
    });
    console.log("满足条件的记录删除完成！", deleteByConditionResult);

  } catch (error) {
    console.error("发生错误:", error);
  }
}

main();