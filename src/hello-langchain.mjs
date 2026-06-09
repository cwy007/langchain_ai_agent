import "dotenv/config";
import {
  ChatOpenAI
} from "@langchain/openai"

const chat = new ChatOpenAI({
  modelName: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  }
})

const response = await chat.invoke("介绍下自己")

console.log(response.content)