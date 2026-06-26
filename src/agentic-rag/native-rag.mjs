import "dotenv/config";
import {
  ChatOpenAI,
  OpenAIEmbeddings
} from "@langchain/openai";
import {
  Annotation,
  END,
  START,
  StateGraph
} from "@langchain/langgraph";
import {
  Milvus
} from "@langchain/community/vectorstores/milvus";

const COLLECTION_NAME = "ebook_collection";
const TOP_K = 5;

const GraphState = Annotation.Root({
  question: Annotation,
  k: Annotation,
  documents: Annotation,
  generation: Annotation,
});

const model = new ChatOpenAI({
  temperature: 0,
  model: process.env.MODEL_NAME,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
  apiKey: process.env.OPENAI_API_KEY,
});

const embeddings = new OpenAIEmbeddings({
  model: process.env.EMBEDDING_MODEL_NAME,
  dimensions: 1024,
});

let vectorStore;

async function retrieveRelevantContent(question, k = TOP_K) {
  try {
    const docsWithScores = await vectorStore.similaritySearchWithScore(question, k);
    return docsWithScores.map(([doc, score]) => ({
      score,
      content: doc.pageContent,
      id: doc.metadata?.id ?? "unknown",
      book_id: doc.metadata?.book_id ?? "未知",
      chapter_num: doc.metadata?.chapter_num ?? "未知",
      index: doc.metadata?.index ?? "未知",
    }));
  } catch (error) {
    console.error("检索内容时出错:", error.message);
    return [];
  }
}

const retrieveNode = async (state) => {
  const documents = await retrieveRelevantContent(state.question, state.k);
  return {
    question: state.question,
    k: state.k,
    documents,
  };
};

const generateNode = async (state) => {
  const context = state.documents
    .map(
      (item, i) =>
      `[片段 ${i + 1}]
章节: 第 ${item.chapter_num} 章
内容: ${item.content}`,
    )
    .join("\n\n━━━━━\n\n");


  const prompt = `你是一个专业的《天龙八部》小说助手。基于小说内容回答问题，用准确、详细的语言。

请根据以下《天龙八部》小说片段内容回答问题：
${context}

用户问题: ${state.question}

回答要求：
1. 如果片段中有相关信息，请结合小说内容给出详细、准确的回答
2. 可以综合多个片段的内容，提供完整的答案
3. 如果片段中没有相关信息，请如实告知用户
4. 回答要准确，符合小说的情节和人物设定
5. 可以引用原文内容来支持你的回答

AI 助手的回答:`;

  process.stdout.write("\n【AI 回答（流式）】\n");
  let generation = "";
  const stream = await model.stream(prompt);
  for await (const chunk of stream) {
    const text = typeof chunk.content === "string" ? chunk.content : "";
    if (!text) continue;
    generation += text;
    process.stdout.write(text);
  }
  process.stdout.write("\n");

  return {
    question: state.question,
    k: state.k,
    documents: state.documents,
    generation,
  };
};

const graph = new StateGraph(GraphState)
  .addNode("retrieve", retrieveNode)
  .addNode("generate", generateNode)
  .addEdge(START, "retrieve")
  .addEdge("retrieve", "generate")
  .addEdge("generate", END)
  .compile();

async function main() {
  const question = "阿朱的结局是什么？";
  const kArg = 5;

  // 导出为 Mermaid：可复制到 https://mermaid.live 或 Markdown 的 ```mermaid 代码块
  const drawable = await graph.getGraphAsync();
  const mermaid = drawable.drawMermaid({
    withStyles: true
  });
  console.log(mermaid);

  console.log("连接到 Milvus...");
  vectorStore = await Milvus.fromExistingCollection(embeddings, {
    collectionName: COLLECTION_NAME,
    url: "localhost:19530",
    textField: "content",
    primaryField: "id",
    vectorField: "vector",
    indexCreateOptions: {
      metric_type: "COSINE",
      index_type: "HNSW",
      params: {
        M: 16,
        efConstruction: 200
      },
      search_params: {
        ef: 64
      },
    },
  });
  vectorStore.indexSearchParams = {
    metric_type: "COSINE",
    params: JSON.stringify({
      ef: 64
    })
  };
  console.log("✓ 已连接\n");

  try {
    await vectorStore.client.loadCollection({
      collection_name: COLLECTION_NAME
    });
    console.log(`✓ 集合 ${COLLECTION_NAME} 已加载\n`);
  } catch (error) {
    if (!error.message.includes("already loaded")) {
      throw error;
    }
    console.log(`✓ 集合 ${COLLECTION_NAME} 已处于加载状态\n`);
  }

  console.log("=".repeat(80));
  console.log(`问题: ${question}`);
  console.log("=".repeat(80));

  const result = await graph.invoke({
    question,
    k: Number.isFinite(kArg) ? kArg : TOP_K,
    documents: [],
    generation: "",
  });

  console.log("\n【检索相关内容】");
  if (result.documents.length === 0) {
    console.log("未找到相关内容");
    console.log("\n【AI 回答】");
    console.log("抱歉，我没有找到相关的《天龙八部》内容。");
    return;
  } else {
    result.documents.forEach((item, i) => {
      console.log(`\n[片段 ${i + 1}] 相似度: ${item.score.toFixed(4)}`);
      console.log(`书籍: ${item.book_id}`);
      console.log(`章节: 第 ${item.chapter_num} 章`);
      console.log(`片段索引: ${item.index}`);
      console.log(
        `内容: ${item.content.substring(0, 200)}${item.content.length > 200 ? "..." : ""}`,
      );
    });
  }

  if (!result.generation) {
    console.log("\n【AI 回答】");
    console.log("模型未返回内容。");
  }
}

main();

// %%{init: {'flowchart': {'curve': 'linear'}}}%%
// graph TD;
// 	__start__([<p>__start__</p>]):::first
// 	retrieve(retrieve)
// 	generate(generate)
// 	__end__([<p>__end__</p>]):::last
// 	__start__ --> retrieve;
// 	generate --> __end__;
// 	retrieve --> generate;
// 	classDef default fill:#f2f0ff,line-height:1.2;
// 	classDef first fill-opacity:0;
// 	classDef last fill:#bfb6fc;

// 连接到 Milvus...
// ✓ 已连接

// ✓ 集合 ebook_collection 已加载

// ================================================================================
// 问题: 阿朱的结局是什么？
// ================================================================================

// 【AI 回答（流式）】
// 根据提供的片段，阿朱的结局是她被萧峰误杀，死在了萧峰的怀中。

// 具体情节如下：阿朱原是段正淳与阮星竹的私生女，自幼被送人。当她得知萧峰要杀段正淳报仇时，为了化解这场仇怨，她易容成段正淳的模样前去赴约。萧峰在雷雨之夜并未认出，全力一掌打在了假扮段正淳的阿朱身上。片段3中描述了阿朱生命垂危之际，还嘱咐妹妹阿紫以后要照看萧峰，随后“脑袋垂了下来，一头秀发披在他肩上，一动也不动了”，萧峰探她脉搏和鼻息，确认她已气绝身亡。阿紫也在旁怒道：“你打死了我姊姊！”萧峰自己也承认：“不错，是我打死了你姊姊。”

// 因此，阿朱最终死于萧峰掌下，香消玉殒。

// 【检索相关内容】

// [片段 1] 相似度: 0.6278
// 书籍: 1
// 章节: 第 74 章
// 片段索引: 3
// 内容: 阿朱微微一笑，说道：“是啊！我原该高兴。”萧峰见她笑得十分勉强，说道：“今晚杀了此人之后，咱们即行北上，到雁门关外驰马打猎、牧牛放羊，再也不踏进关内一步了。唉，阿朱，我在见到段正淳之前，本曾立誓要杀得他一家鸡犬不留。但见此人倒有义气，心想一人做事一人当，那也不用找他家人了。”阿朱道：“你这一念之仁，多积阴德，必有后福。”萧峰纵声长笑，说道：“我这双手下不知已杀了多少人，还有什么阴德后福？”

// 他见...

// [片段 2] 相似度: 0.6276
// 书籍: 1
// 章节: 第 74 章
// 片段索引: 12
// 内容: 阿朱微笑道：“够了，够了，我不喜欢你待我太好。我无法无天起来，那就没人管了。大哥，我……我躲在竹屋后面，偷听爹爹、妈妈，和阿紫妹妹说话。原来我爹爹另外有妻子的，他和妈妈不是正式夫妻，先是生下了我，第二年又生下了我妹妹。后来我爹爹要回大理，我妈妈不放他走，两人大吵了一场，我妈妈还打了他，爹爹可没还手。后来……后来……没有法子，只好分手。我外公家教很严，要是知道了这件事，定会杀了我妈妈的。我妈妈不敢把...

// [片段 3] 相似度: 0.6177
// 书籍: 1
// 章节: 第 74 章
// 片段索引: 17
// 内容: 阿紫小嘴一扁，道：“我躲在桥底下，本想瞧你和我爹爹打架，看个热闹，哪知你打的竟是我姊姊。两个人唠唠叨叨，情话说个不完，我才不爱听呢。你们谈情说爱那也罢了，怎地拉扯到了我身上？”说着走近身来。

// 阿朱道：“好妹妹，以后，萧大哥照看你，你……你也照看他……”

// 阿紫格格一笑，说道：“这个粗鲁难看的蛮子，我才不理他呢。”

// 萧峰蓦地里觉得怀中的阿朱身子一颤，脑袋垂了下来，一头秀发披在他肩上，一动也不动了...

// [片段 4] 相似度: 0.6132
// 书籍: 1
// 章节: 第 65 章
// 片段索引: 18
// 内容: 她最后这两句话极是有力，乔峰一听，心中一凛，立时知道是错怪了她，左手快如闪电般伸出，抓住她肩头，拉着她靠近山壁，免得她失足掉下深谷，说道：“不错，我师父不是你杀的。”他师父玄苦大师是玄慈、玄寂、玄难诸高僧的师兄弟，武功造诣，已达当世第一流境界。他所以逝世，并非中毒，更非受了兵刃暗器之伤，乃是被极厉害的掌力震碎脏腑。阿朱小小年纪，怎能有这般深厚的内力？倘若她内力能震死玄苦大师，那么玄慈这一记大金刚掌...

// [片段 5] 相似度: 0.6084
// 书籍: 1
// 章节: 第 59 章
// 片段索引: 66
// 内容: 乔峰初时认定止清奸诈险毒，自己父母和师父之死，定和他有极大关连，是以不惜耗费真力，救他性命，要着落在他身上查明诸般真相，心下早已打定主意，如他不说，便要以种种惨酷难熬的毒刑拷打逼迫。哪知此人真面目一现，竟然是那个娇小玲珑、俏美可喜的小姑娘阿朱，当真是做梦也料想不到。乔峰虽和阿朱、阿碧二人见过数面，又曾从西夏武士的手中救了她二人出来，但并不知阿朱精于易容之术，倘若换作段誉，便早就猜到了。

// 乔峰这时...