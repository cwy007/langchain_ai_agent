import "dotenv/config";
import "cheerio";
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
  CheerioWebBaseLoader
} from '@langchain/community/document_loaders/web/cheerio';

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

// 使用 Cheerio 加载网页内容
// 有很大的概率获取不到文章内容，建议使用 PlaywrightWebBaseLoader 来加载网页
const cheerioLoader = new CheerioWebBaseLoader(url, {
  selector: '.main-area p',
});

const documents = await cheerioLoader.load();
console.log(documents);

console.assert(documents.length === 1, "应该只加载到一个文档");
console.log(`Total characters in document: ${documents[0].pageContent.length}`);

// const textSplitter = new RecursiveCharacterTextSplitter({
//   chunkSize: 500,
//   chunkOverlap: 50,
//   separators: ["。", "！", "？"]
// })

// const splitDocuments = await textSplitter.splitDocuments(documents);
// console.log(`文档分隔完成，共分成 ${splitDocuments.length} 个块`);

// console.log('正在创建向量存储...');
// const vectorStore = await MemoryVectorStore.fromDocuments(splitDocuments, embeddings);
// console.log('向量存储创建完成 \n');

// const retriever = vectorStore.asRetriever({
//   k: 2
// });

// const questions = [
//   '父亲的去世对作者的人生态度产生了怎样的根本性逆转？',
// ]

// // RAG 流程：对每个问题进行检索和回答
// for (const question of questions) {
//   console.log("=".repeat(80));
//   console.log(`问题：${question}`);
//   console.log("=".repeat(80));

//   // 检索相关文档
//   const relevantDocs = await retriever.invoke(question);
//   console.log(`检索到 ${relevantDocs.length} 个相关文档：`);
//   relevantDocs.forEach((doc, idx) => {
//     console.log(`\n--- 文档 ${idx + 1} ---`);
//     console.log(doc.pageContent);
//   });

//   // 构建提示词
//   const prompt = `根据以下文档内容，回答问题：\n\n${relevantDocs.map((doc, idx) => `文档 ${idx + 1}:\n${doc.pageContent}`).join('\n\n')}\n\n问题：${question}\n回答：`;

//   // 使用模型生成答案
//   const answer = await model.invoke(prompt);
//   console.log(`\n模型回答`);
//   console.log(answer);
// }