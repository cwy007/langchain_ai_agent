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
    baseURL: process.env.OPENAI_BASE_URL
  },
  apiKey: process.env.OPENAI_API_KEY,
});

const embeddings = new OpenAIEmbeddings({
  model: process.env.EMBEDDING_MODEL_NAME,
  dimensions: 1024,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL
  },
  apiKey: process.env.OPENAI_API_KEY,
});

const GraphState = Annotation.Root({
  question: Annotation,
  k: Annotation,
  strategy: Annotation,
  routeReason: Annotation,
  retrievedDocs: Annotation,
  localContext: Annotation,
  webContext: Annotation,
  evaluation: Annotation,
  generation: Annotation,
});

let vectorStore;

async function retrieveRelevantContent(query, k) {
  try {
    const docsWithScores = await vectorStore.similaritySearchWithScore(query, k);
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

const RouteSchema = z.object({
  strategy: z.enum(["simple", "complex"]),
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
    retrievedDocs: [],
    localContext: "",
    webContext: "",
    evaluation: "",
    generation: "",
  };
};

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

const retrieveLocalNode = async (state) => {
  console.log("---LOCAL_RETRIEVE---");
  const retrievedDocs = await retrieveRelevantContent(state.question, state.k);
  console.log(`本地检索命中: ${retrievedDocs.length} 条`);
  const localContext = (retrievedDocs ?? []).map((d) => d.content).join("\n\n");
  return {
    retrievedDocs,
    localContext,
  };
};

const EvaluateSchema = z.object({
  enough: z.boolean(),
  missing: z.array(z.string()).max(6),
  reason: z.string(),
  web_query: z.string().optional(),
});

const evaluateNode = async (state) => {
  const hasWeb = Boolean(state.webContext && String(state.webContext).trim());
  console.log(hasWeb ? "---EVALUATE_CONTEXT_WITH_WEB---" : "---EVALUATE_LOCAL_CONTEXT---");
  const evaluator = llm.withStructuredOutput(EvaluateSchema);
  const out = await evaluator.invoke(`你是信息充分性评估器。判断当前上下文是否足以回答用户问题。

用户问题：${state.question}

已检索上下文（来自本地知识库）：
${state.localContext || "（空）"}

${hasWeb ? `联网搜索结果：\n${state.webContext || "（空）"}\n` : ""}

输出字段：
- enough: 是否足够回答（true/false）
- missing: 若不够，列出缺失信息点（最多 6 条）
- reason: 简短原因
${hasWeb ? "" : "- web_query: 若不够，给出一个适合联网搜索的中文查询句（完整句，不用代词；为空也可）"}
`);

  console.log(`${hasWeb ? "二次评估" : "评估"}: enough=${out.enough} (${out.reason})`);
  if (!out.enough && out.missing?.length) {
    out.missing.forEach((m, i) => console.log(`  缺失${i + 1}: ${m}`));
  }
  return {
    evaluation: JSON.stringify(out),
  };
};

/**
 * Call Bocha Web Search API
 */
async function bochaWebSearch(query, count) {
  const apiKey = process.env.BOCHA_API_KEY;
  if (!apiKey) {
    throw new Error("Bocha Web Search 的 API Key 未配置（环境变量 BOCHA_API_KEY）。");
  }
  const url = "https://api.bochaai.com/v1/web-search";
  const body = {
    query,
    freshness: "noLimit",
    summary: true,
    count: count ?? 10,
  };

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new Error(`搜索 API 请求失败（网络错误）：${error.message}`);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`搜索 API 请求失败，状态码: ${response.status}, 错误信息: ${errorText}`);
  }

  let json;
  try {
    json = await response.json();
  } catch (error) {
    throw new Error(`搜索结果解析失败：${error.message}`);
  }

  if (json?.code !== 200 || !json?.data) {
    throw new Error(`搜索 API 返回失败：${json?.msg ?? "未知错误"}`);
  }

  const webpages = json.data.webPages?.value ?? [];
  if (!webpages.length) {
    return "未找到相关结果。";
  }

  return webpages
    .map(
      (page, idx) => `引用: ${idx + 1}
标题: ${page.name}
URL: ${page.url}
摘要: ${page.summary}
网站名称: ${page.siteName}
网站图标: ${page.siteIcon}
发布时间: ${page.dateLastCrawled}`,
    )
    .join("\n\n");
}

const webSearchNode = async (state) => {
  console.log("---WEB_SEARCH---");
  const parsed = (() => {
    try {
      return JSON.parse(state.evaluation || "{}");
    } catch {
      return {};
    }
  })();
  const query = (parsed.web_query ?? "").trim() || state.question;
  console.log(`联网查询: ${query}`);
  const webContext = await bochaWebSearch(query, 8);
  console.log(`联网结果长度: ${webContext.length}`);
  return {
    webContext
  };
};

const generateNode = async (state) => {
  console.log("---GENERATE---");
  const context = [state.localContext, state.webContext].filter(Boolean).join("\n\n===== 联网补充 =====\n\n");
  process.stdout.write("\n【AI 回答（流式）】\n");
  let generation = "";
  const stream = await llm.stream(`你是一个严谨的中文问答助手。优先依据上下文作答，不要编造。

上下文（本地知识库 + 可选联网补充）：
${context || "（空）"}

用户问题：${state.question}

回答要求：
1. 如果上下文足够，给出清晰、可核对的回答；需要时引用“引用: n / URL”或小说片段来支撑。
2. 如果上下文仍不足以确定关键事实，明确说明“不确定/无法从上下文确认”，并说明缺失点。
3. 不要输出表情符号。

回答：`);
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

function afterRoute(state) {
  return state.strategy === "simple" ? "direct_answer" : "local_retrieve";
}

function afterEvaluateLocal(state) {
  if (state.webContext && String(state.webContext).trim()) {
    return "generate";
  }
  const parsed = (() => {
    try {
      return JSON.parse(state.evaluation || "{}");
    } catch {
      return {};
    }
  })();
  return parsed.enough === true ? "generate" : "web_search";
}

const graph = new StateGraph(GraphState)
  .addNode("route_question", routeQuestionNode)
  .addNode("direct_answer", directAnswerNode)
  .addNode("local_retrieve", retrieveLocalNode)
  .addNode("evaluate_local", evaluateNode)
  .addNode("web_search", webSearchNode)
  .addNode("generate", generateNode)
  .addEdge(START, "route_question")
  .addConditionalEdges("route_question", afterRoute, {
    direct_answer: "direct_answer",
    local_retrieve: "local_retrieve",
  })
  .addEdge("local_retrieve", "evaluate_local")
  .addConditionalEdges("evaluate_local", afterEvaluateLocal, {
    generate: "generate",
    web_search: "web_search",
  })
  .addEdge("web_search", "evaluate_local")
  .addEdge("direct_answer", END)
  .addEdge("generate", END)
  .compile();

async function main() {
  const question =
    "请回答《天龙八部》小说里“雁门关事件”的主谋是谁，并说明其儿子的最终结局；另外请补充：在《天龙八部》2013 版电视剧中，这段“雁门关事件”主要出现在哪几集？请给出可核对的来源链接。";
  const k = 8;

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
    if (!error.message.includes("already loaded")) throw error;
    console.log("✓ 集合 ebook_collection 已处于加载状态\n");
  }

  console.log("=".repeat(80));
  console.log(`问题: ${question}`);
  console.log("=".repeat(80));

  const result = await graph.invoke({
    question,
    k,
    strategy: "",
    routeReason: "",
    retrievedDocs: [],
    localContext: "",
    webContext: "",
    evaluation: "",
    generation: "",
  });

  console.log(`\n最终策略: ${result.strategy}`);
  if (!result.generation?.trim()) {
    console.log("模型未返回内容。");
  }
}

main()

// %%{init: {'flowchart': {'curve': 'linear'}}}%%
// graph TD;
// 	__start__([<p>__start__</p>]):::first
// 	route_question(route_question)
// 	direct_answer(direct_answer)
// 	local_retrieve(local_retrieve)
// 	evaluate_local(evaluate_local)
// 	web_search(web_search)
// 	generate(generate)
// 	__end__([<p>__end__</p>]):::last
// 	__start__ --> route_question;
// 	direct_answer --> __end__;
// 	generate --> __end__;
// 	local_retrieve --> evaluate_local;
// 	web_search --> evaluate_local;
// 	route_question -.-> direct_answer;
// 	route_question -.-> local_retrieve;
// 	evaluate_local -.-> generate;
// 	evaluate_local -.-> web_search;
// 	classDef default fill:#f2f0ff,line-height:1.2;
// 	classDef first fill-opacity:0;
// 	classDef last fill:#bfb6fc;

// 连接到 Milvus...
// ✓ 已连接

// ✓ 集合 ebook_collection 已加载

// ================================================================================
// 问题: 请回答《天龙八部》小说里“雁门关事件”的主谋是谁，并说明其儿子的最终结局；另外请补充：在《天龙八部》2013 版电视剧中，这段“雁门关事件”主要出现在哪几集？请给出可核对的来源链接。
// ================================================================================
// ---ROUTE_QUESTION---
// 路由策略: complex (用户问题涉及《天龙八部》小说中“雁门关事件”的主谋、其儿子的结局，以及2013版电视剧的具体集数，这些都需要具体情节、人物关系和版本细节，属于复杂问题，需要外部检索。)
// ---LOCAL_RETRIEVE---
// 本地检索命中: 8 条
// ---EVALUATE_LOCAL_CONTEXT---
// 评估: enough=false (上下文已明确雁门关事件主谋为慕容博，但并未提供其子慕容复的最终结局，也未涉及2013版电视剧的相关信息，更无来源链接。)
//   缺失1: 慕容复的最终结局（小说中他最终发疯，但上下文未提及）
//   缺失2: 2013版电视剧《天龙八部》中雁门关事件主要出现的集数
//   缺失3: 可核对的来源链接（电视剧集数对应的出处）
// ---WEB_SEARCH---
// 联网查询: 天龙八部 2013版 电视剧 雁门关事件 出现在第几集
// 联网结果长度: 7566
// ---EVALUATE_CONTEXT_WITH_WEB---
// 二次评估: enough=false (上下文已明确雁门关事件的主谋是慕容博，并提供了2013版电视剧该情节出现在第15集的来源链接，但未给出慕容复（慕容博儿子）的最终结局信息。)
//   缺失1: 慕容复的最终结局
// ---GENERATE---

// 【AI 回答（流式）】
// 根据上下文小说片段可以明确，“雁门关事件”的主谋是**慕容博**。小说中写道：“萧远山和萧峰对望一眼，直到此刻，他父子方知这个假传音讯、挑拨生祸之人竟是慕容博。”玄慈也回忆，当年正是慕容博向他假传契丹武士要夺取少林武学典籍的讯息，才导致中原豪杰在雁门关外伏击萧远山一家，酿成惨剧。

// 关于慕容博之子**慕容复的最终结局**，上下文提供的片段中并未直接描述。依据《天龙八部》原著，慕容复在复国大梦彻底破灭后，精神失常，在燕子坞的一片土坟上头戴纸冠，接受一群孩童朝拜，做着皇帝梦。由于此信息未在给定的上下文片段中出现，特此说明。

// 至于《天龙八部》2013版电视剧中“雁门关事件”的出现集数，根据联网补充信息，这段剧情主要出现在**第十五集**。报道中明确指出：“今晚播出的第十五集最大的看点是雁门关大战，钟汉良饰演的年轻时期萧远山登场……‘乔峰从此姓萧’也在半天内被刷上热门话题。”

// 可核对的来源链接：
// - 引用: 1 标题: 《天龙》雁门关大战 钟汉良分饰父子二人
//   URL: https://ent.sina.com.cn/v/m/2013-12-30/15504071674.shtml
// - 引用: 2 标题: 《天龙八部》雁门关大战 钟汉良一人分饰父子-搜狐娱乐
//   URL: https://yule.sohu.com/20131230/n392659869.shtml

// 最终策略: complex