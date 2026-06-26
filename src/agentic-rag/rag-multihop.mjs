import "dotenv/config";
import {
  z
} from "zod";
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

const llm = new ChatOpenAI({
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
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * complex：先拆解子问题序列，再按序检索
 */
const GraphState = Annotation.Root({
  question: Annotation,
  k: Annotation,
  strategy: Annotation,
  routeReason: Annotation,
  /** 拆解得到的有序子问题，仅用于检索 */
  subQuestions: Annotation,
  /** 下一轮 retrieve 要用的下标（指向 subQuestions 中尚未检索的那一条） */
  nextSubIdx: Annotation,
  documents: Annotation,
  currentQuery: Annotation,
  retrievalCount: Annotation,
  maxRetrievals: Annotation,
  plannedNext: Annotation,
  generation: Annotation,
});

let vectorStore;

async function retrieveRelevantContent(question, k) {
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

/** 按 id 合并；同 id 保留更高 score */
function mergeUnique(existingDocs, newDocs) {
  const map = new Map();
  for (const d of [...existingDocs, ...newDocs]) {
    const key = String(d.id);
    const prev = map.get(key);
    if (!prev || Number(d.score) > Number(prev.score)) {
      map.set(key, d);
    }
  }
  return Array.from(map.values()).sort((a, b) => Number(b.score) - Number(a.score));
}

const RouteSchema = z.object({
  strategy: z.enum(["simple", "complex"]),
  reason: z.string(),
});

const DecomposeSchema = z.object({
  sub_questions: z.array(z.string()).min(1).max(8),
  reason: z.string(),
});

const NextStepSchema = z.object({
  nextAction: z.enum(["retrieve", "generate"]),
  reason: z.string(),
});

const routeQuestionNode = async (state) => {
  console.log("---ROUTE_QUESTION---");
  const router = llm.withStructuredOutput(RouteSchema);
  const route = await router.invoke(`
你是问答路由器。请判断用户问题是否需要外部检索。

规则：
- simple: 常识问答、简短定义、无需特定小说细节即可回答。
- complex: 需要《天龙八部》具体情节、人物关系、章节事实、原文细节或证据支持。

用户问题：${state.question}
`);

  console.log(`路由策略: ${route.strategy} (${route.reason})`);
  return {
    strategy: route.strategy,
    routeReason: route.reason,
    retrievalCount: 0,
    maxRetrievals: state.maxRetrievals ?? 8,
    documents: [],
    subQuestions: [],
    nextSubIdx: 0,
    currentQuery: "",
  };
};

const decomposeQuestionNode = async (state) => {
  console.log("---DECOMPOSE_QUESTION---");
  const decomposer = llm.withStructuredOutput(DecomposeSchema);
  const out = await decomposer.invoke(`你是《天龙八部》多跳问答的「子问题拆解器」。

用户原始问题：
${state.question}

任务：将问题拆成**有序**子问题列表 sub_questions，用于**依次向量检索**。要求：
1. 链式推理、多层关系、因果先后的问题，必须拆成多条；单跳即可答的也可只输出 1 条。
2. 每条子问题必须是**可独立检索**的完整中文问句，**禁止**使用「他/她/此人/上文」等指代；可写全人物名与事件名。
3. 顺序必须符合推理链：先搞清前置实体/事实，再查后续结论。
4. **不要**把整句原题原样复制成唯一一条（除非确实无法拆分）；不要拆成过碎的关键词列表。
5. 输出 1～8 条即可。

请输出 sub_questions 与简短 reason。`);

  const subQuestions = out.sub_questions.map((s) => s.trim()).filter(Boolean);
  if (subQuestions.length === 0) {
    throw new Error("decompose_question: sub_questions 为空");
  }

  console.log(`拆解 ${subQuestions.length} 条子问题 (${out.reason})`);
  subQuestions.forEach((q, i) => {
    console.log(`  [${i + 1}] ${q}`);
  });

  return {
    subQuestions,
    nextSubIdx: 0,
    currentQuery: subQuestions[0],
  };
};

const retrieveNode = async (state) => {
  const subs = state.subQuestions ?? [];
  const idx = state.nextSubIdx ?? 0;
  const q = subs[idx]?.trim();
  if (!q) {
    throw new Error(`retrieve: 子问题下标 ${idx} 无有效文本（共 ${subs.length} 条）`);
  }

  const round = state.retrievalCount + 1;
  console.log(`---RETRIEVE (第 ${round} 轮，子问题 ${idx + 1}/${subs.length})---`);
  console.log(`查询: ${q}`);

  const newDocs = await retrieveRelevantContent(q, state.k);
  const merged = mergeUnique(state.documents ?? [], newDocs);

  if (newDocs.length === 0) {
    console.log("本轮未命中文档");
  } else {
    console.log(`本轮命中 ${newDocs.length} 条，累计去重后 ${merged.length} 条`);
    newDocs.forEach((item, i) => {
      const preview =
        item.content.length > 120 ? `${item.content.substring(0, 120)}...` : item.content;
      console.log(
        `[R${i + 1}] score=${Number(item.score).toFixed(4)} chapter=${item.chapter_num} index=${item.index}`,
      );
      console.log(`      ${preview}`);
    });
  }

  return {
    documents: merged,
    retrievalCount: round,
    nextSubIdx: idx + 1,
    currentQuery: q,
  };
};

const planNextStepNode = async (state) => {
  console.log("---PLAN_NEXT_STEP---");
  const subs = state.subQuestions ?? [];
  const nextIdx = state.nextSubIdx ?? 0;
  const remaining = subs.length - nextIdx;

  const subList = subs.map((s, i) => `${i + 1}. ${s}${i < nextIdx ? " （已检索）" : i === nextIdx ? " （下一轮将检索，若选择继续）" : " （未检索）"}`).join("\n");

  const docStr =
    state.documents.length === 0 ?
    "（尚无检索结果）" :
    state.documents
    .slice(0, 6)
    .map(
      (d, i) =>
      `[${i + 1}] score=${Number(d.score).toFixed(4)} 第${d.chapter_num}章: ${d.content.slice(0, 200)}${d.content.length > 200 ? "..." : ""}`,
    )
    .join("\n\n");

  const prompt = `你是多跳 RAG 规划器。检索查询已由前置步骤拆解为**有序子问题**；若需继续检索，下一轮将自动使用「下一条子问题」做向量检索，你**不要**自拟新的检索句。

用户原始问题：${state.question}

子问题序列：
${subList || "（无）"}

已检索轮数：${state.retrievalCount}；剩余未检索子问题条数：${remaining}
最大检索轮数上限：${state.maxRetrievals}

已召回文档摘要：
${docStr}

请判断下一步：
1) 已有足够依据回答用户原始问题 → nextAction=generate
2) 仍缺关键事实、且仍存在未检索的子问题、且未超过轮数上限 → nextAction=retrieve

硬性规则：
- 若剩余未检索子问题条数为 0，必须 nextAction=generate。
- 若已检索轮数已达到或超过最大检索轮数，必须 nextAction=generate。`;

  const model = llm.withStructuredOutput(NextStepSchema);
  const {
    nextAction,
    reason
  } = await model.invoke(prompt);

  let finalNext = nextAction;
  if (state.retrievalCount >= state.maxRetrievals) finalNext = "generate";
  if (remaining <= 0) finalNext = "generate";

  console.log(`[决策] plannedNext=${finalNext} (模型建议=${nextAction}) (${reason})`);

  return {
    plannedNext: finalNext,
  };
};

function afterRoute(state) {
  return state.strategy === "simple" ? "direct_answer" : "decompose_question";
}

function afterPlan(state) {
  return state.plannedNext === "retrieve" ? "retrieve" : "generate";
}

const directAnswerNode = async (state) => {
  console.log("---DIRECT_ANSWER---");
  process.stdout.write("\n【AI 回答（流式）】\n");
  let generation = "";
  const stream = await llm.stream(`你是一个中文问答助手，请直接简洁回答问题。

问题：${state.question}
`);
  for await (const chunk of stream) {
    const text = typeof chunk.content === "string" ? chunk.content : "";
    if (!text) continue;
    generation += text;
    process.stdout.write(text);
  }
  process.stdout.write("\n");
  return {
    generation
  };
};

const generateNode = async (state) => {
  console.log("---GENERATE---");
  const context = state.documents
    .map(
      (item, i) =>
      `[片段 ${i + 1}]
章节: 第 ${item.chapter_num} 章
内容: ${item.content}`,
    )
    .join("\n\n━━━━━\n\n");
  process.stdout.write("\n【AI 回答（流式）】\n");
  let generation = "";
  const stream = await llm.stream(`你是一个专业的《天龙八部》小说助手。基于小说内容回答问题，用准确、详细的语言。

请根据以下《天龙八部》小说片段内容回答问题：
${context || "（未检索到相关内容）"}

用户问题: ${state.question}

回答要求：
1. 如果片段中有相关信息，请结合小说内容给出详细、准确的回答
2. 可以综合多个片段的内容，提供完整的答案
3. 如果片段中没有相关信息，请如实告知用户
4. 回答要准确，符合小说的情节和人物设定
5. 可以引用原文内容来支持你的回答

AI 助手的回答:`);
  for await (const chunk of stream) {
    const text = typeof chunk.content === "string" ? chunk.content : "";
    if (!text) continue;
    generation += text;
    process.stdout.write(text);
  }
  process.stdout.write("\n");
  return {
    generation
  };
};

const graph = new StateGraph(GraphState)
  .addNode("route_question", routeQuestionNode)
  .addNode("direct_answer", directAnswerNode)
  .addNode("decompose_question", decomposeQuestionNode)
  .addNode("retrieve", retrieveNode)
  .addNode("plan_next_step", planNextStepNode)
  .addNode("generate", generateNode)
  .addEdge(START, "route_question")
  .addConditionalEdges("route_question", afterRoute, {
    direct_answer: "direct_answer",
    decompose_question: "decompose_question",
  })
  .addEdge("decompose_question", "retrieve")
  .addEdge("retrieve", "plan_next_step")
  .addConditionalEdges("plan_next_step", afterPlan, {
    retrieve: "retrieve",
    generate: "generate",
  })
  .addEdge("direct_answer", END)
  .addEdge("generate", END)
  .compile();

async function main() {
  const question =
    "《天龙八部》中「四大恶人」排行第二的是谁？此人之子在身世揭晓前，其生父在武林中的公开身份是什么？";
  const k = 5;

  const drawable = await graph.getGraphAsync();
  console.log(drawable.drawMermaid({
    withStyles: true
  }));

  console.log("连接到 Milvus...");
  vectorStore = await Milvus.fromExistingCollection(embeddings, {
    collectionName: "ebook_collection",
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
      collection_name: "ebook_collection"
    });
    console.log("✓ 集合 ebook_collection 已加载\n");
  } catch (error) {
    if (!error.message.includes("already loaded")) {
      throw error;
    }
    console.log("✓ 集合 ebook_collection 已处于加载状态\n");
  }

  console.log("=".repeat(80));
  console.log(`问题: ${question}`);
  console.log("=".repeat(80));

  const result = await graph.invoke({
    question,
    k: Number.isFinite(k) ? k : 5,
    strategy: "",
    routeReason: "",
    subQuestions: [],
    nextSubIdx: 0,
    documents: [],
    currentQuery: "",
    retrievalCount: 0,
    maxRetrievals: 8,
    plannedNext: "",
    generation: "",
  });

  if (result.strategy === "complex") {
    if (result.subQuestions?.length) {
      console.log("\n【子问题序列】");
      result.subQuestions.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
    }
    console.log("\n【检索相关内容（累计）】");
    if (result.documents.length === 0) {
      console.log("未找到相关内容");
    } else {
      result.documents.forEach((item, i) => {
        console.log(`\n[片段 ${i + 1}] 相似度: ${Number(item.score).toFixed(4)}`);
        console.log(`书籍: ${item.book_id}`);
        console.log(`章节: 第 ${item.chapter_num} 章`);
        console.log(`片段索引: ${item.index}`);
        console.log(
          `内容: ${item.content.substring(0, 200)}${item.content.length > 200 ? "..." : ""}`,
        );
      });
    }
    console.log(`\n检索轮数: ${result.retrievalCount} / ${result.maxRetrievals}`);
  }

  console.log(`\n最终策略: ${result.strategy}`);
  if (!result.generation?.trim()) {
    console.log("模型未返回内容。");
  }
}

main().catch((err) => {
  console.error("运行失败:", err);
  process.exit(1);
});


// %%{init: {'flowchart': {'curve': 'linear'}}}%%
// graph TD;
// 	__start__([<p>__start__</p>]):::first
// 	route_question(route_question)
// 	direct_answer(direct_answer)
// 	decompose_question(decompose_question)
// 	retrieve(retrieve)
// 	plan_next_step(plan_next_step)
// 	generate(generate)
// 	__end__([<p>__end__</p>]):::last
// 	__start__ --> route_question;
// 	decompose_question --> retrieve;
// 	direct_answer --> __end__;
// 	generate --> __end__;
// 	retrieve --> plan_next_step;
// 	route_question -.-> direct_answer;
// 	route_question -.-> decompose_question;
// 	plan_next_step -.-> retrieve;
// 	plan_next_step -.-> generate;
// 	classDef default fill:#f2f0ff,line-height:1.2;
// 	classDef first fill-opacity:0;
// 	classDef last fill:#bfb6fc;

// 连接到 Milvus...
// ✓ 已连接

// ✓ 集合 ebook_collection 已加载

// ================================================================================
// 问题: 《天龙八部》中「四大恶人」排行第二的是谁？此人之子在身世揭晓前，其生父在武林中的公开身份是什么？
// ================================================================================
// ---ROUTE_QUESTION---
// 路由策略: complex (问题需要《天龙八部》具体情节和人物关系细节)
// ---DECOMPOSE_QUESTION---
// 拆解 4 条子问题 (原问题包含两层依赖：先确定「四大恶人」排行第二的人物（叶二娘），再锁其子（虚竹），进而找到该子亲生父亲（玄慈），最后查玄慈在身世揭晓前的武林公开身份。这条链式推理必须依次完成，否则无法定位最终答案。)
//   [1] 《天龙八部》中「四大恶人」排行第二的是谁？
//   [2] 叶二娘的儿子是谁？
//   [3] 虚竹的亲生父亲是谁？
//   [4] 玄慈在武林中的公开身份是什么？
// ---RETRIEVE (第 1 轮，子问题 1/4)---
// 查询: 《天龙八部》中「四大恶人」排行第二的是谁？
// 本轮命中 5 条，累计去重后 5 条
// [R1] score=0.5956 chapter=17 index=53
//       突然间半空中飘来有如游丝般的轻轻哭声，声音甚是凄婉，隐隐约约似乎是个女子在哭叫：“我的儿啊，我的儿啊！”南海鳄神“呸”的一声，在地下吐了口痰，说道：“哭丧的来啦！”提高声音叫道：“哭甚么丧？老子在这儿等得久了。”那声音仍是若有若无的叫道：“...
// [R2] score=0.5904 chapter=71 index=35
//       云中鹤一瞥眼见到萧峰，吃了一惊，反身便走，迎向从湖畔小径走来的三人。那三人左边一个蓬头短服，是“凶神恶煞”南海鳄神；右边一个女子怀抱小儿，是“无恶不作”叶二娘。居中一个身披青袍，撑着两根细铁杖，脸如僵尸，正是四恶之首，号称“恶贯满盈”的段延...
// [R3] score=0.5851 chapter=131 index=52
//       南海鳄神道：“二姊，你人也死了，岳老三不跟你争这排名啦，你算老二便了。”这些年来，他说甚么也要和叶二娘一争雄长，想在武功上胜过她而居“天下第二恶人”之位，此刻竟肯退让，实是大大不易，只因他既伤痛叶二娘之死，又敬佩她的义烈。
// [R4] score=0.5769 chapter=17 index=20
//       段誉听到“四大恶人”四字，心想原来他是钟灵之父钟万仇请来的朋友，不妨拉拉钟万仇的交情，或许有点用处，待听他说“这话倒也有理”，忙道：“江湖上到处都说南海鳄神是大大的英雄好汉，别说决不欺侮受了伤的女子，便是受了伤的男子也不打。大家又说，南海鳄...
// [R5] score=0.5523 chapter=140 index=9
//       南海鳄神搔了搔头皮，道：“不是，不是！决不转性，决不转性！只不过四大恶人少了一个，不免有点不带劲。我一抓到云老四的头发，给他一拖，不由得也向谷下掉去，幸好段老大武功了得，一杖伸将过来，给我抓住了。可是我们三人四百来斤的份量，这一拖一拉，一扯...
// ---PLAN_NEXT_STEP---
// [决策] plannedNext=retrieve (模型建议=retrieve) (已召回摘要确认了叶二娘排行第二，但未涉及叶二娘之子（虚竹）及其生父玄慈的公开身份（少林方丈），这些关键事实缺失。剩余子问题可供检索，且未达轮数上限。)
// ---RETRIEVE (第 2 轮，子问题 2/4)---
// 查询: 叶二娘的儿子是谁？
// 本轮命中 5 条，累计去重后 10 条
// [R1] score=0.6735 chapter=20 index=8
//       木婉清登即恍然：“原来叶二娘在无量山中再也找不到小儿，竟将无量剑掌门人的小儿掳了来。”

// 叶二娘道：“左先生，令郎生得真有趣，我抱来玩玩，明天就还给你。你不用着急。”说着在山山的脸颊上亲了亲，轻轻抚摸他头发，显得不胜爱怜。左山山见到父亲，大...
// [R2] score=0.6598 chapter=131 index=29
//       叶二娘道：“孩子，你今年二十四岁，这二十四年来，我白天也想你，黑夜也想念你，我气不过人家有儿子，我自己儿子却给天杀的贼子偷去了。我……我只好去偷人家的儿子。可是……可是……别人的儿子，哪有自己亲生的好？”

// 南海鳄神哈哈大笑，说道：“三妹！...
// [R3] score=0.6527 chapter=131 index=31
//       叶二娘连连摇头，道：“我不能说。”

// 黑衣僧缓缓说道：“叶二娘，你本来是个好好的姑娘，温柔美貌，端庄贞淑。可是在你十八岁那年，受了一个武功高强、大有身份的男子所诱，失身于他，生下了这个孩子，是不是？”叶二娘木然不动，过了好一会儿，才点头道：...
// [R4] score=0.6527 chapter=131 index=33
//       黑衣僧声音仍是十分平淡，一似无动于衷，继续问道：“你孩儿一生下来，你就想要他当和尚么？”叶二娘道：“不是，不是的。”黑衣僧人道：“那么，为甚么要在他身上烧这些佛门的香疤？”叶二娘道：“我不知道，我不知道！”黑衣僧朗声道：“你不肯说，我却知道...
// [R5] score=0.6490 chapter=131 index=30
//       坐在大树下一直不言不动的黑衣僧人忽然站起身来，缓缓说道：“你这孩儿是给人家偷去的，还是抢去的？你面上这六道血痕，从何而来？”

// 叶二娘突然变色，尖声叫道：“你……你是谁？你……你怎知道？”黑衣僧道：“你难道不认得我么？”叶二娘尖声大叫：“啊...
// ---PLAN_NEXT_STEP---
// [决策] plannedNext=retrieve (模型建议=retrieve) (当前文档摘要仅指出叶二娘之子虚竹的生父是一位佛门高僧，尚未明确提及具体姓名（如玄慈）及其在武林中的公开身份。为完整回答用户问题，需要继续检索子问题3“虚竹的亲生父亲是谁？”以获取关键信息。)
// ---RETRIEVE (第 3 轮，子问题 3/4)---
// 查询: 虚竹的亲生父亲是谁？
// 本轮命中 5 条，累计去重后 15 条
// [R1] score=0.6994 chapter=131 index=51
//       虚竹叫道：“娘，娘！你……你……不可……”伸手扶起母亲，只见一柄匕首插在她心口，只露出个刀柄，眼见是不活了。虚竹急忙点她伤口四周的穴道，又以真气运到玄慈方丈体内，手忙脚乱，欲待同时救活两人。

// 薛慕华奔将过来相助，但见二人心停气绝，已无法可...
// [R2] score=0.6277 chapter=131 index=28
//       虚竹大吃一惊，他双股之上确是各有九点香疤。他自幼便是如此，从来不知来历，也羞于向同侪启齿，有时沐浴之际见到，还道自己与佛门有缘，天然生就，因而更坚了向慕佛法之心。这时陡然听到叶二娘的话，当真有如半空中打了个霹雳，颤声道：“是，是！我……我两...
// [R3] score=0.6182 chapter=131 index=40
//       群雄先听萧远山说道虚竹之父乃是个“有道高僧”，此刻又听叶二娘说他武林中声誉甚隆，地位甚高，几件事一凑合，难道此人竟是少林寺中一位辈份甚高的僧人？各人眼光不免便向少林寺一干白须飘飘的老僧射了过去。

// 忽听得玄慈方丈说道：“善哉，善哉！既造业因...
// [R4] score=0.6175 chapter=110 index=14
//       虚竹本来不想把指环戴在手上，只是知道此物要紧，生怕掉了，不敢放在怀里，听那女童问起，笑道：“那也不是什么好玩的物事。”

// 那女童伸出手来，抓住他左腕，察看指环。她将虚竹的手掌侧来侧去，看了良久。虚竹忽觉她抓着自己的小手不住发颤，侧过头来，只...
// [R5] score=0.6067 chapter=98 index=28
//       虚竹赔笑道：“小僧棋艺低劣，胡乱下子，志在救人。这盘棋小僧是不会下的，请老前辈原谅。”

// 苏星河脸色一沉，厉声道：“先师布下此局，恭请天下高手破解。倘若破解不得，那是无妨，若有后殃，也是咎由自取。但如有人前来捣乱棋局，渎亵了先师毕生的心血，...
// ---PLAN_NEXT_STEP---
// [决策] plannedNext=generate (模型建议=generate) (已检索文档中多处出现'玄慈方丈'，明确显示其公开身份为少林寺方丈，结合前三轮已确认的四大恶人老二叶二娘、其子虚竹、生父玄慈，信息已足以回答用户原始问题，无需继续检索第4个子问题。)
// ---GENERATE---

// 【AI 回答（流式）】
// 《天龙八部》中「四大恶人」排行第二的是**叶二娘**，其外号为“无恶不作”。
// 她的儿子是虚竹，在虚竹身世揭晓之前，其生父在武林中的公开身份是**少林寺方丈玄慈**，乃武林中人人敬仰的德高望重之士。

// **依据片段详解：**
// - 片段11中，南海鳄神直接说明：“这婆娘‘无恶不作’叶二娘，‘四大恶人’之一。她这个‘恶’字排在第二。”由此确认叶二娘位居第二。
// - 片段8中，当虚竹背上香疤的秘密被揭开，叶二娘相认后，玄慈方丈当众坦言：“虚竹，你过来！……你在寺中二十四年，我竟始终不知你便是我的儿子！”同一片段随即写道：“玄慈方丈德高望重，武林中人无不钦仰，谁能想到他竟会做出这等事来？”明确点出玄慈在事发前的公开身份是少林寺方丈，且深孚众望。
// - 片段9中，天山童姥因七宝指环问及虚竹师承时，也提到：“你是少林派中第三十七代弟子。玄慈、玄悲、玄苦、玄难这些小和尚，都是你的师祖？”这从侧面印证了玄慈在少林寺中辈分尊崇，是虚竹的师祖辈，而虚竹此时尚不知自身身世。

// 因此，叶二娘之子虚竹的生父，在真相大白前，正是以少林寺方丈玄慈的身份闻名武林。

// 【子问题序列】
//   1. 《天龙八部》中「四大恶人」排行第二的是谁？
//   2. 叶二娘的儿子是谁？
//   3. 虚竹的亲生父亲是谁？
//   4. 玄慈在武林中的公开身份是什么？

// 【检索相关内容（累计）】

// [片段 1] 相似度: 0.6994
// 书籍: 1
// 章节: 第 131 章
// 片段索引: 51
// 内容: 虚竹叫道：“娘，娘！你……你……不可……”伸手扶起母亲，只见一柄匕首插在她心口，只露出个刀柄，眼见是不活了。虚竹急忙点她伤口四周的穴道，又以真气运到玄慈方丈体内，手忙脚乱，欲待同时救活两人。

// 薛慕华奔将过来相助，但见二人心停气绝，已无法可救，劝道：“师叔节哀。两位老人家是不能救的了。”

// 虚竹却不死心，运了好半晌北冥真气，父母两人却哪里有半点动静？虚竹悲从中来，忍不住放声大哭。二十四年来，他一直...

// [片段 2] 相似度: 0.6735
// 书籍: 1
// 章节: 第 20 章
// 片段索引: 8
// 内容: 木婉清登即恍然：“原来叶二娘在无量山中再也找不到小儿，竟将无量剑掌门人的小儿掳了来。”

// 叶二娘道：“左先生，令郎生得真有趣，我抱来玩玩，明天就还给你。你不用着急。”说着在山山的脸颊上亲了亲，轻轻抚摸他头发，显得不胜爱怜。左山山见到父亲，大声叫唤：“爸爸，爸爸！”左子穆伸出左手，走近几步，说道：“小儿顽劣不堪，没甚么好玩的，请即赐还，在下感激不尽。”他见到儿子，说话登时客气了，只怕这女子手上使劲，...

// [片段 3] 相似度: 0.6598
// 书籍: 1
// 章节: 第 131 章
// 片段索引: 29
// 内容: 叶二娘道：“孩子，你今年二十四岁，这二十四年来，我白天也想你，黑夜也想念你，我气不过人家有儿子，我自己儿子却给天杀的贼子偷去了。我……我只好去偷人家的儿子。可是……可是……别人的儿子，哪有自己亲生的好？”

// 南海鳄神哈哈大笑，说道：“三妹！你老是去偷人家白白胖胖的娃儿来玩，玩够了便捏死了他，原来为了自己儿子给人家偷去啦。岳老二问你甚么缘故，你总是不肯说！很好！妙极！虚竹小子，你妈妈是我义妹，你快叫...

// [片段 4] 相似度: 0.6527
// 书籍: 1
// 章节: 第 131 章
// 片段索引: 31
// 内容: 叶二娘连连摇头，道：“我不能说。”

// 黑衣僧缓缓说道：“叶二娘，你本来是个好好的姑娘，温柔美貌，端庄贞淑。可是在你十八岁那年，受了一个武功高强、大有身份的男子所诱，失身于他，生下了这个孩子，是不是？”叶二娘木然不动，过了好一会儿，才点头道：“是。不过不是他引诱我，是我去引诱他的。”黑衣僧道：“这男子只顾到自己的声名前程，全不顾念你一个年纪轻轻的姑娘，未嫁生子，处境是何等的凄惨。”叶二娘道：“不，不...

// [片段 5] 相似度: 0.6527
// 书籍: 1
// 章节: 第 131 章
// 片段索引: 33
// 内容: 黑衣僧声音仍是十分平淡，一似无动于衷，继续问道：“你孩儿一生下来，你就想要他当和尚么？”叶二娘道：“不是，不是的。”黑衣僧人道：“那么，为甚么要在他身上烧这些佛门的香疤？”叶二娘道：“我不知道，我不知道！”黑衣僧朗声道：“你不肯说，我却知道。只因为这孩儿的父亲，乃是佛门子弟，是一位大大有名的有道高僧。”

// 叶二娘一声呻吟，再也支持不住，晕倒在地。

// 群雄登时大哗，眼见叶二娘这等神情，那黑衣僧所言显...

// [片段 6] 相似度: 0.6490
// 书籍: 1
// 章节: 第 131 章
// 片段索引: 30
// 内容: 坐在大树下一直不言不动的黑衣僧人忽然站起身来，缓缓说道：“你这孩儿是给人家偷去的，还是抢去的？你面上这六道血痕，从何而来？”

// 叶二娘突然变色，尖声叫道：“你……你是谁？你……你怎知道？”黑衣僧道：“你难道不认得我么？”叶二娘尖声大叫：“啊！是你，就是你！”纵身向他扑去，奔到离他身子丈余之处，突然立定，伸手戟指，咬牙切齿，愤怒已极，却也不敢近前。

// 黑衣僧道：“不错，你孩子是我抢去的，你脸上这六道...

// [片段 7] 相似度: 0.6277
// 书籍: 1
// 章节: 第 131 章
// 片段索引: 28
// 内容: 虚竹大吃一惊，他双股之上确是各有九点香疤。他自幼便是如此，从来不知来历，也羞于向同侪启齿，有时沐浴之际见到，还道自己与佛门有缘，天然生就，因而更坚了向慕佛法之心。这时陡然听到叶二娘的话，当真有如半空中打了个霹雳，颤声道：“是，是！我……我两股上各有九点香疤，是你……是娘……是你给我烧的？”

// 叶二娘放声大哭，叫道：“是啊，是啊！若不是我给你烧的，我怎么知道？我……我找到儿子了，找到我亲生乖儿子了！...

// [片段 8] 相似度: 0.6182
// 书籍: 1
// 章节: 第 131 章
// 片段索引: 40
// 内容: 群雄先听萧远山说道虚竹之父乃是个“有道高僧”，此刻又听叶二娘说他武林中声誉甚隆，地位甚高，几件事一凑合，难道此人竟是少林寺中一位辈份甚高的僧人？各人眼光不免便向少林寺一干白须飘飘的老僧射了过去。

// 忽听得玄慈方丈说道：“善哉，善哉！既造业因，便有业果。虚竹，你过来！”虚竹走到方丈身前屈膝跪下。玄慈向他端相良久，伸手轻轻抚摸他的头顶，脸上充满温柔慈爱，说道：“你在寺中二十四年，我竟始终不知你便是我的...

// [片段 9] 相似度: 0.6175
// 书籍: 1
// 章节: 第 110 章
// 片段索引: 14
// 内容: 虚竹本来不想把指环戴在手上，只是知道此物要紧，生怕掉了，不敢放在怀里，听那女童问起，笑道：“那也不是什么好玩的物事。”

// 那女童伸出手来，抓住他左腕，察看指环。她将虚竹的手掌侧来侧去，看了良久。虚竹忽觉她抓着自己的小手不住发颤，侧过头来，只见她一双清澈的大眼中充满了泪水。又过好一会，她才放开虚竹的手掌。

// 那女童道：“这枚七宝指环，你是从哪里偷来的？”语音严峻，如审盗贼。虚竹心下不悦，说道：“出家...

// [片段 10] 相似度: 0.6067
// 书籍: 1
// 章节: 第 98 章
// 片段索引: 28
// 内容: 虚竹赔笑道：“小僧棋艺低劣，胡乱下子，志在救人。这盘棋小僧是不会下的，请老前辈原谅。”

// 苏星河脸色一沉，厉声道：“先师布下此局，恭请天下高手破解。倘若破解不得，那是无妨，若有后殃，也是咎由自取。但如有人前来捣乱棋局，渎亵了先师毕生的心血，纵然人多势众，嘿嘿，老夫虽然又聋又哑，却也要誓死周旋到底。”他叫做“聋哑老人”，其实既不聋，又不哑，此刻早已张耳听声，开口说话，竟然仍自称“又聋又哑”，只是他说...

// [片段 11] 相似度: 0.5956
// 书籍: 1
// 章节: 第 17 章
// 片段索引: 53
// 内容: 突然间半空中飘来有如游丝般的轻轻哭声，声音甚是凄婉，隐隐约约似乎是个女子在哭叫：“我的儿啊，我的儿啊！”南海鳄神“呸”的一声，在地下吐了口痰，说道：“哭丧的来啦！”提高声音叫道：“哭甚么丧？老子在这儿等得久了。”那声音仍是若有若无的叫道：“我的儿啊，为娘的想得你好苦啊！”

// 木婉清奇道：“是你妈妈来了吗？”南海鳄神怒道：“甚么我的妈妈？胡说八道！这婆娘‘无恶不作’叶二娘，‘四大恶人’之一。她这个‘...

// [片段 12] 相似度: 0.5904
// 书籍: 1
// 章节: 第 71 章
// 片段索引: 35
// 内容: 云中鹤一瞥眼见到萧峰，吃了一惊，反身便走，迎向从湖畔小径走来的三人。那三人左边一个蓬头短服，是“凶神恶煞”南海鳄神；右边一个女子怀抱小儿，是“无恶不作”叶二娘。居中一个身披青袍，撑着两根细铁杖，脸如僵尸，正是四恶之首，号称“恶贯满盈”的段延庆。

// 段延庆在中原罕有露面，是以萧峰和这“天下第一大恶人”并不相识，但段正淳等在大理领教过他的手段，知道叶二娘、岳老三等人虽然厉害，也不难对付，这段延庆委实非...

// [片段 13] 相似度: 0.5851
// 书籍: 1
// 章节: 第 131 章
// 片段索引: 52
// 内容: 南海鳄神道：“二姊，你人也死了，岳老三不跟你争这排名啦，你算老二便了。”这些年来，他说甚么也要和叶二娘一争雄长，想在武功上胜过她而居“天下第二恶人”之位，此刻竟肯退让，实是大大不易，只因他既伤痛叶二娘之死，又敬佩她的义烈。

// [片段 14] 相似度: 0.5769
// 书籍: 1
// 章节: 第 17 章
// 片段索引: 20
// 内容: 段誉听到“四大恶人”四字，心想原来他是钟灵之父钟万仇请来的朋友，不妨拉拉钟万仇的交情，或许有点用处，待听他说“这话倒也有理”，忙道：“江湖上到处都说南海鳄神是大大的英雄好汉，别说决不欺侮受了伤的女子，便是受了伤的男子也不打。大家又说，南海鳄神连单身男人也不打，对手越多，他打起来越高兴，这才显得他老人家武功高强。”

// 南海鳄神眯着一对圆眼，笑吟吟的听着，不住点头，问道：“这话倒也有理。你听谁说的？”...

// [片段 15] 相似度: 0.5523
// 书籍: 1
// 章节: 第 140 章
// 片段索引: 9
// 内容: 南海鳄神搔了搔头皮，道：“不是，不是！决不转性，决不转性！只不过四大恶人少了一个，不免有点不带劲。我一抓到云老四的头发，给他一拖，不由得也向谷下掉去，幸好段老大武功了得，一杖伸将过来，给我抓住了。可是我们三人四百来斤的份量，这一拖一拉，一扯一带，将段老大也给牵了下来。他一杖甩出，钩住了松树，正想慢慢设法上来，不料来了个吐蕃国的矮胖子，拿起斧头，便斫松树。”

// 钟灵道：“这矮胖子是吐蕃国人么？他又为...

// 检索轮数: 3 / 8

// 最终策略: complex