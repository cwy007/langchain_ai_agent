import "dotenv/config";
import "cheerio";
import {
  CheerioWebBaseLoader
} from "@langchain/community/document_loaders/web/cheerio";
import {
  RecursiveCharacterTextSplitter
} from "@langchain/textsplitters";

const url = "https://juejin.cn/post/7233327509919547452";
// const url = "https://docs.nestjs.cn/introduction/"

const cheerioLoader = new CheerioWebBaseLoader(url, {
  selector: '.main-area p',
});

const documents = await cheerioLoader.load();
console.log(documents);

const textSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: 400,
  chunkOverlap: 50,
  separators: ["。", "！", "？"]
})

const splitDocs = await textSplitter.splitDocuments(documents);

console.log(splitDocs);