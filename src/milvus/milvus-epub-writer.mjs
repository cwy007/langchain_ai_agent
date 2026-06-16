import "dotenv/config";
import {
  join,
  parse
} from "path";
import {
  MilvusClient,
  DataType,
  MetricType,
  IndexType
} from "@zilliz/milvus2-sdk-node";
import {
  OpenAIEmbeddings
} from "@langchain/openai";
import {
  EPubLoader
} from "@langchain/community/document_loaders/fs/epub";
import {
  RecursiveCharacterTextSplitter
} from "@langchain/textsplitters";

const COLLECTION_NAME = 'ebook_collection';
const VECTOR_DIM = 1024;
const CHUNK_SIZE = 500; // 每个文本块的大小 500 字符
const EPUB_FILE_PATH = join(process.cwd(), "src/milvus/天龙八部.epub"); // 你的 EPUB 文件路径

const BOOK_NAME = parse(EPUB_FILE_PATH).name;

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

// 创建或获取集合
async function ensureCollection() {
  try {
    // 检查集合是否存在
    const hasCollection = await client.hasCollection({
      collection_name: COLLECTION_NAME,
    });

    if (!hasCollection.value) {
      console.log(`集合 ${COLLECTION_NAME} 不存在，正在创建...`);
      await client.createCollection({
        collection_name: COLLECTION_NAME,
        fields: [{
            name: "id",
            data_type: DataType.VarChar,
            max_length: 100,
            is_primary_key: true
          },
          {
            name: "vector",
            data_type: DataType.FloatVector,
            dim: VECTOR_DIM
          },
          {
            name: "book_id",
            data_type: DataType.VarChar,
            max_length: 100
          },
          {
            name: 'book_name',
            data_type: DataType.VarChar,
            max_length: 200
          },
          {
            name: 'chapter_num',
            data_type: DataType.Int32
          },
          {
            name: 'index',
            data_type: DataType.Int32
          },
          {
            name: 'content',
            data_type: DataType.VarChar,
            max_length: 10000
          },
        ]
      })
      console.log("集合创建成功！");

      // 创建索引
      console.log("正在创建索引...");
      await client.createIndex({
        collection_name: COLLECTION_NAME,
        field_name: 'vector',
        index_type: IndexType.IVF_FLAT,
        metric_type: MetricType.COSINE,
        params: {
          nlist: 1024
        }
      });
      console.log("索引创建成功！");

      // 加载集合
      console.log("正在加载集合...");
      try {
        await client.loadCollection({
          collection_name: COLLECTION_NAME,
        });
        console.log("集合加载成功！");
      } catch (error) {
        console.error("加载集合时发生错误:", error);
      }
    }
  } catch (error) {
    console.error("检查集合时发生错误:", error);
  }
}

// 将文档快批量插入 milvus（流式处理）
async function insertChunks(chunks, bookId, chapterNum) {
  try {
    if (chunks.length === 0) {
      return 0;
    }

    // 为每个文本块生成向量表示
    const insertData = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const vector = await getEmbedding(chunk);
      insertData.push({
        id: `${bookId}_chapter${chapterNum}_chunk${i}`,
        book_id: bookId,
        book_name: BOOK_NAME,
        chapter_num: chapterNum,
        index: i,
        content: chunk,
        vector: vector,
      });
    }

    // 批量插入数据
    const result = await client.insert({
      collection_name: COLLECTION_NAME,
      data: insertData,
    });

    return Number(result.insert_cnt) || 0;
  } catch (error) {
    console.log(`插入章节 ${chapterNum} 时发生错误:`, error);
    throw error;
  }
}

// 加载 EPUB 文件并进行流式处理（边处理边插入 Milvus）
async function loadAndProcessEpubStreaming(bookId) {
  try {
    console.log(`正在加载 EPUB 文件: ${EPUB_FILE_PATH}...`);

    // 使用 EPubLoader 加载 EPUB 文件，按章节拆分
    const loader = new EPubLoader(EPUB_FILE_PATH, {
      splitChapters: true,
    });
    const documents = await loader.load();
    console.log(`EPUB 文件加载完成，共 ${documents.length} 章。`);

    // 初始化文本分割器
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: CHUNK_SIZE,
      chunkOverlap: 50, // 可以设置重叠部分，增加上下文连贯性
    });

    let totalInserted = 0;

    // 逐章处理文档，进行二次分割并插入 Milvus
    for (let chapterIndex = 0; chapterIndex < documents.length; chapterIndex++) {
      const chapter = documents[chapterIndex];
      const chapterNum = chapterIndex + 1;

      console.log(`正在处理第 ${chapterNum}/${documents.length} 章...`);

      // 对章节内容进行二次分割，得到更小的文本块
      const chunks = await textSplitter.splitText(chapter.pageContent);
      console.log(`章节 ${chapterNum} 分割完成，共 ${chunks.length} 个文本块。`);

      if (chunks.length === 0) {
        console.log(`章节 ${chapterNum} 没有有效内容，跳过插入。`);
        continue;
      }

      console.log(`正在插入章节 ${chapterNum} 的文本块到 Milvus...`);

      // 将文本块批量插入 Milvus
      const insertedCount = await insertChunks(chunks, bookId, chapterNum);
      totalInserted += insertedCount;

      console.log(`章节 ${chapterNum} 插入完成，成功插入 ${insertedCount} 条记录。`);
    }

    console.log(`所有章节处理完成！总共插入 ${totalInserted} 条记录到 Milvus。`);
    return totalInserted;
  } catch (error) {
    console.error("加载 EPUB 文件时发生错误:", error);
  }
}

// 主函数
async function main() {
  try {
    console.log("=".repeat(50));
    console.log("电子书处理程序");
    console.log("=".repeat(50));

    // 连接 Milvus
    console.log("连接 Milvus 服务器...");
    await client.connectPromise;
    console.log("连接成功！");

    // 设置 book_id
    const bookId = 1;

    // 确保集合存在
    await ensureCollection();

    // 加载 EPUB 文件并处理
    const totalInserted = await loadAndProcessEpubStreaming(bookId);

    console.log('='.repeat(50));
    console.log(`处理完成！总共插入 ${totalInserted} 条记录到 Milvus。`);
    console.log('='.repeat(50));
  } catch (error) {
    console.error("主函数发生错误:", error);
    process.exit(1);
  }
}

main();