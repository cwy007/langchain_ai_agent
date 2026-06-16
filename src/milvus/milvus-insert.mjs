import "dotenv/config";
import {
  MilvusClient,
  DataType,
  MetricType,
  IndexType
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

    // 创建集合
    console.log(`正在创建集合 ${COLLECTION_NAME}...`);
    await client.createCollection({
      collection_name: COLLECTION_NAME,
      fields: [{
          name: "id",
          data_type: DataType.VarChar,
          max_length: 50,
          is_primary_key: true
        },
        {
          name: "vector",
          data_type: DataType.FloatVector,
          dim: VECTOR_DIM
        },
        {
          name: "content",
          data_type: DataType.VarChar,
          max_length: 5000
        },
        {
          name: "date",
          data_type: DataType.VarChar,
          max_length: 50
        },
        {
          name: "mood",
          data_type: DataType.VarChar,
          max_length: 50
        },
        {
          name: "tags",
          data_type: DataType.Array,
          element_type: DataType.VarChar,
          max_capacity: 10,
          max_length: 50
        },
      ]
    });
    console.log("集合创建成功！");

    // 创建索引
    console.log("正在创建索引...");
    await client.createIndex({
      collection_name: COLLECTION_NAME,
      field_name: "vector",
      index_type: IndexType.IVF_FLAT,
      metric_type: MetricType.COSINE,
      params: {
        nlist: 1024
      }
    });
    console.log("索引创建成功！");

    // 加载集合
    console.log("正在加载集合...");
    await client.loadCollection({
      collection_name: COLLECTION_NAME,
    });
    console.log("集合加载成功！");

    // 插入日记数据
    console.log("正在插入日记数据...");
    const diaryContents = [{
        id: 'diary_001',
        content: '今天天气很好，去公园散步了，心情愉快。看到了很多花开了，春天真美好。',
        date: '2026-01-10',
        mood: 'happy',
        tags: ['生活', '散步']
      },
      {
        id: 'diary_002',
        content: '今天工作很忙，完成了一个重要的项目里程碑。团队合作很愉快，感觉很有成就感。',
        date: '2026-01-11',
        mood: 'excited',
        tags: ['工作', '成就']
      },
      {
        id: 'diary_003',
        content: '周末和朋友去爬山，天气很好，心情也很放松。享受大自然的感觉真好。',
        date: '2026-01-12',
        mood: 'relaxed',
        tags: ['户外', '朋友']
      },
      {
        id: 'diary_004',
        content: '今天学习了 Milvus 向量数据库，感觉很有意思。向量搜索技术真的很强大。',
        date: '2026-01-12',
        mood: 'curious',
        tags: ['学习', '技术']
      },
      {
        id: 'diary_005',
        content: '晚上做了一顿丰盛的晚餐，尝试了新菜谱。家人都说很好吃，很有成就感。',
        date: '2026-01-13',
        mood: 'proud',
        tags: ['美食', '家庭']
      }
    ];
    console.log("正在生成向量并插入数据...");
    const insertData = [];
    for (const diary of diaryContents) {
      const vector = await getEmbedding(diary.content);
      insertData.push({
        id: diary.id,
        vector: vector,
        content: diary.content,
        date: diary.date,
        mood: diary.mood,
        tags: diary.tags
      });
    }
    const insertResult = await client.insert({
      collection_name: COLLECTION_NAME,
      data: insertData
    });
    console.log("数据插入成功！", insertResult);

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await client.closeConnection();
  }
}

main();