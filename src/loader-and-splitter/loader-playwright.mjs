import "dotenv/config";
import {
  ChatOpenAI,
  OpenAIEmbeddings
} from '@langchain/openai';
import {
  RecursiveCharacterTextSplitter
} from '@langchain/textsplitters';
import {
  MemoryVectorStore
} from '@langchain/classic/vectorstores/memory';
import {
  PlaywrightWebBaseLoader
} from "@langchain/community/document_loaders/web/playwright";

const model = new ChatOpenAI({
  temperature: 0,
  model: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
})

const embeddings = new OpenAIEmbeddings({
  model: process.env.EMBEDDING_MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
})

const url = "https://juejin.cn/post/7233327509919547452";

const loader = new PlaywrightWebBaseLoader(url, {
  launchOptions: {
    headless: true,
  },
  gotoOptions: {
    timeout: 60000,
    waitUntil: "domcontentloaded",
  },
  /** Pass a function to evaluate in the browser page */
  async evaluate(page) {
    // Here, you can implement custom logic to extract the content
    const content = await page.locator('.main-area').textContent();
    return content;
  },
});


const documents = await loader.load();
console.log(documents);

console.assert(documents.length === 1, "应该只加载到一个文档");
console.log(`Total characters in document: ${documents[0].pageContent.length}`);

const textSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: 500,
  chunkOverlap: 50,
  separators: ["。", "！", "？"]
})

const splitDocuments = await textSplitter.splitDocuments(documents);
console.log(`文档分隔完成，共分成 ${splitDocuments.length} 个块`);

console.log('正在创建向量存储...');
const vectorStore = await MemoryVectorStore.fromDocuments(splitDocuments, embeddings);
console.log('向量存储创建完成 \n');

// const retriever = vectorStore.asRetriever({
//   k: 2
// });

const questions = [
  '父亲的去世对作者的人生态度产生了怎样的根本性逆转？',
]

// RAG 流程：对每个问题进行检索和回答
for (const question of questions) {
  console.log("=".repeat(80));
  console.log(`问题：${question}`);
  console.log("=".repeat(80));

  // 使用 retriever 检索相关文档
  // const retrievedDocs = await retriever.invoke(question);

  // 使用 similaritySearchWithScore 获取相似度评分
  const scoredResults = await vectorStore.similaritySearchWithScore(question, 2);

  // 打印检索到的文档和相似度评分
  console.log("\n【检索到的文档及相似度评分】")
  scoredResults.forEach(([doc, score], idx) => {
    console.log(`\n[文档 ${idx + 1}] 相似度评分: ${score}`);
    console.log(`内容: ${doc.pageContent}`);
    console.log(`元数据: ${JSON.stringify(doc.metadata)}`);
  });

  // 构建提示词
  const context = scoredResults.map(([doc, score], i) => `[片段${i + 1}]\n ${doc.pageContent}`).join("\n\n======\n\n");

  const prompt = `你是一个文章辅助阅读助手，根据文章内容来解答：

  文章内容：${context}

  问题：${question}
  你的回答：`;

  console.log("\n 【AI会带】")
  const answer = await model.invoke(prompt);
  console.log(answer);
  console.log("\n\n");
}