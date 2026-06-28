/**
 * 混合检索：LLM 重写为 3 条多角度问句 → 每条问句分别 ES + Milvus → 全量合并去重 → Rerank → LLM 作答。
 * LangGraph：START → query_augment → es_recall ∥ milvus_recall → merge → rerank → generate_answer → END。
 */
import "dotenv/config";
import {
  Client
} from "@elastic/elasticsearch";
import {
  Document
} from "@langchain/core/documents";
import {
  ChatPromptTemplate
} from "@langchain/core/prompts";
import {
  Milvus
} from "@langchain/community/vectorstores/milvus";
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
  DashScopeRerank
} from "../rerank/dashscope-rerank.mjs";
import {
  augmentQuery,
  retrievalQueryStrings,
} from "./query-augment.mjs";

const INDEX = "life_notes";

const HybridRetrievalState = Annotation.Root({
  query: Annotation(),
  queryAugmentation: Annotation(),
  esHits: Annotation(),
  milvusHits: Annotation(),
  merged: Annotation(),
  topDocuments: Annotation(),
  answer: Annotation(),
});

function docFromEsHit(hit) {
  const s = hit._source ?? {};
  const text = [s.note_title ?? s.title, s.note_body ?? s.content]
    .filter(Boolean)
    .join("\n");
  return new Document({
    pageContent: text,
    metadata: {
      id: hit._id,
      source: "es",
      ...s
    },
  });
}

/** ES 与 Milvus 结果拼接后仅按 metadata.id 去重，保留首次出现（通常 ES 在前） */
function merge(esDocs, milvusDocs) {
  const combined = [...(esDocs ?? []), ...(milvusDocs ?? [])].filter(
    (d) => d?.pageContent,
  );
  return dedupeDocsById(combined);
}

/** 去重键仅为 metadata.id（trim 后非空）；无 id 丢弃，不按正文去重；保留首次出现顺序 */
function dedupeDocsById(docs) {
  const seen = new Set();
  const out = [];
  for (const d of docs ?? []) {
    if (!d?.pageContent) continue;
    const id =
      d.metadata?.id != null ? String(d.metadata.id).trim() : "";
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(d);
  }
  return out;
}

function printDocs(label, docs) {
  console.log(`\n=== ${label} (${docs?.length ?? 0} 条) ===`);
  for (let i = 0; i < (docs ?? []).length; i++) {
    const d = docs[i];
    const preview = (d.pageContent ?? "").slice(0, 200).replace(/\n/g, " ");
    console.log(`[${i}] ${preview}${d.pageContent?.length > 200 ? "…" : ""}`);
    console.log(`    metadata:`, d.metadata ?? {});
  }
}

/** 打印 LLM 生成的多角度检索问句及逐条检索列表 */
function printQueryRewrite(original, augmentation) {
  const qs = augmentation?.queries ?? [];
  const forRetrieval = retrievalQueryStrings(original, augmentation);

  console.log(`\n--- 查询扩展（LLM 生成 ${qs.length} 条检索问句）---`);
  console.log("原始 query:", original ?? "");
  for (let i = 0; i < qs.length; i++) console.log(`  [${i + 1}] ${qs[i] ?? ""}`);
  console.log(
    `\n逐条 ES + Milvus（共 ${forRetrieval.length} 条检索串，含原始问题）:`,
  );
  for (let i = 0; i < forRetrieval.length; i++) {
    console.log(`  [${i + 1}] ${forRetrieval[i] ?? ""}`);
  }
}

function stringifyMessageContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return String(content ?? "");
  return content
    .map((c) =>
      typeof c === "string" ? c : typeof c?.text === "string" ? c.text : "",
    )
    .join("");
}

function formatDocsAsContext(docs) {
  return (docs ?? [])
    .map((d, i) => {
      const meta = d.metadata ?? {};
      const src = meta.source ?? "";
      const id = meta.id != null ? String(meta.id) : "";
      const head = id ? `[${i + 1}] id=${id}${src ? ` source=${src}` : ""}` : `[${i + 1}]`;
      return `${head}\n${d.pageContent ?? ""}`;
    })
    .join("\n\n---\n\n");
}

const ANSWER_PROMPT = ChatPromptTemplate.fromMessages([
  [
    "system",
    `你是阅读用户「生活笔记」知识库并作答的助手。
规则：
- 只根据下方「检索片段」推断答案；片段里没有的信息不要编造。
- 若片段不足以回答，明确说明「笔记里未提到」，并可给出一句保守建议。
- 回答简洁有条理，可使用简短列表；口吻自然中文。`,
  ],
  [
    "human",
    `用户问题：{query}

检索片段：
{context}`,
  ],
]);

const NO_CONTEXT_PROMPT = ChatPromptTemplate.fromMessages([
  [
    "system",
    `你是阅读用户「生活笔记」知识库并作答的助手。当前没有检索到任何片段。
请用一两句话说明无法从笔记中回答，并礼貌询问用户是否换个说法或补充关键词。`,
  ],
  ["human", "用户问题：{query}"],
]);

export function compileHybridRetrievalGraph(esClient, milvus, reranker, chatModel) {
  const ES_K = 15;
  const MILVUS_K = 15;

  return new StateGraph(HybridRetrievalState)
    .addNode("query_augment", async (state) => ({
      queryAugmentation: await augmentQuery(chatModel, state.query ?? ""),
    }))
    .addNode("es_recall", async (state) => {
      const qs = retrievalQueryStrings(state.query, state.queryAugmentation);
      const n = Math.max(1, qs.length);
      const kEach = Math.max(2, Math.ceil(ES_K / n));
      const batches = await Promise.all(
        qs.map((q) =>
          esClient.search({
            index: INDEX,
            size: kEach,
            query: {
              multi_match: {
                query: q,
                fields: ["note_title", "note_body", "title", "content"],
                type: "best_fields",
                analyzer: "ik_smart",
              },
            },
          }),
        ),
      );
      const flat = batches.flatMap((res) =>
        (res.hits?.hits ?? []).map(docFromEsHit),
      );
      return {
        esHits: dedupeDocsById(flat)
      };
    })
    .addNode("milvus_recall", async (state) => {
      const qs = retrievalQueryStrings(state.query, state.queryAugmentation);
      const n = Math.max(1, qs.length);
      const kEach = Math.max(2, Math.ceil(MILVUS_K / n));
      const batches = await Promise.all(
        qs.map((q) => milvus.similaritySearch(q, kEach)),
      );
      const flat = batches.flat();
      return {
        milvusHits: dedupeDocsById(flat)
      };
    })
    .addNode("merge", async (state) => ({
      merged: merge(state.esHits, state.milvusHits),
    }))
    .addNode("rerank", async (state) => {
      const merged = state.merged ?? [];
      if (!merged.length) return {
        topDocuments: []
      };
      const topDocuments = await reranker.compressDocuments(merged, state.query);
      return {
        topDocuments
      };
    })
    .addNode("generate_answer", async (state) => {
      const query = state.query ?? "";
      const docs = state.topDocuments ?? [];
      if (!docs.length) {
        const chain = NO_CONTEXT_PROMPT.pipe(chatModel);
        const msg = await chain.invoke({
          query
        });
        return {
          answer: stringifyMessageContent(msg.content).trim()
        };
      }
      const chain = ANSWER_PROMPT.pipe(chatModel);
      const msg = await chain.invoke({
        query,
        context: formatDocsAsContext(docs),
      });
      return {
        answer: stringifyMessageContent(msg.content).trim()
      };
    })
    .addEdge(START, "query_augment")
    .addEdge("query_augment", "es_recall")
    .addEdge("query_augment", "milvus_recall")
    .addEdge(["es_recall", "milvus_recall"], "merge")
    .addEdge("merge", "rerank")
    .addEdge("rerank", "generate_answer")
    .addEdge("generate_answer", END)
    .compile();
}

const esClient = new Client({
  node: "http://localhost:9200"
});
const embeddings = new OpenAIEmbeddings({
  model: process.env.EMBEDDING_MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});
const milvus = await Milvus.fromExistingCollection(embeddings, {
  url: "http://localhost:19530",
  collectionName: INDEX,
  textField: "doc_text",
  vectorField: "embedding",
});
const reranker = new DashScopeRerank({
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.RERANK_MODEL_NAME,
  topN: 3,
  baseUrl: process.env.RERANK_URL,
});

const chatModel = new ChatOpenAI({
  model: process.env.MODEL_NAME,
  apiKey: process.env.OPENAI_API_KEY,
  temperature: 0.2,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL
  },
});

/** 示例用户 query（字符串列表） */
const SAMPLE_QUERIES = [
  // "PO-20250409-K9 滤芯订单",
  "家里无线老是断断续续的咋整啊",
  // "那个黑凉粉粉怎么冲不结块",
  // "明火炖太久汤汁又黏又涩，起锅前要怎么处理才不腻",
];

const graph = compileHybridRetrievalGraph(esClient, milvus, reranker, chatModel);

const drawable = await graph.getGraphAsync();
console.log(drawable.drawMermaid());
console.log();

for (const query of SAMPLE_QUERIES) {
  console.log(`query: ${query}`);

  const state = await graph.invoke({
    query
  });

  printQueryRewrite(state.query, state.queryAugmentation);
  console.log("\n（原始 JSON）", JSON.stringify(state.queryAugmentation));

  printDocs("Elasticsearch 检索", state.esHits);
  printDocs("Milvus 检索", state.milvusHits);
  printDocs("重排后保留", state.topDocuments ?? []);

  console.log("\n=== 大模型生成回答 ===\n");
  console.log(state.answer ?? "");
}

// %%{init: {'flowchart': {'curve': 'linear'}}}%%
// graph TD;
//         __start__([<p>__start__</p>]):::first
//         query_augment(query_augment)
//         es_recall(es_recall)
//         milvus_recall(milvus_recall)
//         merge(merge)
//         rerank(rerank)
//         generate_answer(generate_answer)
//         __end__([<p>__end__</p>]):::last
//         __start__ --> query_augment;
//         es_recall --> merge;
//         generate_answer --> __end__;
//         merge --> rerank;
//         milvus_recall --> merge;
//         query_augment --> es_recall;
//         query_augment --> milvus_recall;
//         rerank --> generate_answer;
//         classDef default fill:#f2f0ff,line-height:1.2;
//         classDef first fill-opacity:0;
//         classDef last fill:#bfb6fc;


// query: 家里无线老是断断续续的咋整啊
// DashScope rerank results: [
//   { index: 3, relevance_score: 0.8229965211052472 },
//   { index: 2, relevance_score: 0.6571139706354765 },
//   { index: 4, relevance_score: 0.48405846051185114 }
// ]

// --- 查询扩展（LLM 生成 3 条检索问句）---
// 原始 query: 家里无线老是断断续续的咋整啊
//   [1] 家里WiFi频繁断连如何解决
//   [2] 家庭无线网络不稳定经常掉线怎么办
//   [3] 家用路由器信号间歇性中断解决方法

// 逐条 ES + Milvus（共 4 条检索串，含原始问题）:
//   [1] 家里无线老是断断续续的咋整啊
//   [2] 家里WiFi频繁断连如何解决
//   [3] 家庭无线网络不稳定经常掉线怎么办
//   [4] 家用路由器信号间歇性中断解决方法

// （原始 JSON） {"queries":["家里WiFi频繁断连如何解决","家庭无线网络不稳定经常掉线怎么办","家用路由器信号间歇性中断解决方法"]}

// === Elasticsearch 检索 (4 条) ===
// [0] 净水器滤芯更换记录 官网登记的机身序列 SN-MILO-77821；上次换的是第三代 RO 复合滤芯，配件订单号 PO-20250409-K9；下次提醒换前置 PP 棉。
//     metadata: {
//   id: 'life_05',
//   source: 'es',
//   note_title: '净水器滤芯更换记录',
//   note_body: '官网登记的机身序列 SN-MILO-77821；上次换的是第三代 RO 复合滤芯，配件订单号 PO-20250409-K9；下次提醒换前置 PP 棉。',
//   tags: [ '家务', '维保' ],
//   mood: '琐事',
//   priority: 1,
//   created_at: '2026-06-28T12:27:58.895Z',
//   updated_at: '2026-06-28T12:27:58.895Z'
// }
// [1] 租房合同划的重点句 第八条写的是押一付三提前三十日书面通知；手写补充了一句「甲方不得以不正当理由扣减退房押金」记得双方都签了字。
//     metadata: {
//   id: 'life_07',
//   source: 'es',
//   note_title: '租房合同划的重点句',
//   note_body: '第八条写的是押一付三提前三十日书面通知；手写补充了一句「甲方不得以不正当理由扣减退房押金」记得双方都签了字。',
//   tags: [ '租房', '法律' ],
//   mood: '谨慎',
//   priority: 3,
//   created_at: '2026-06-28T12:27:58.895Z',
//   updated_at: '2026-06-28T12:27:58.895Z'
// }
// [2] 出差酒店网速玄学 同一个SSID走廊尽头满格会议室里假信号；连手机热点写周报反而稳；视频会议尽量靠窗座位别躲在最里间死角。
//     metadata: {
//   id: 'life_10',
//   source: 'es',
//   note_title: '出差酒店网速玄学',
//   note_body: '同一个SSID走廊尽头满格会议室里假信号；连手机热点写周报反而稳；视频会议尽量靠窗座位别躲在最里间死角。',
//   tags: [ '差旅', '办公' ],
//   mood: '无奈',
//   priority: 2,
//   created_at: '2026-06-28T12:27:58.895Z',
//   updated_at: '2026-06-28T12:27:58.895Z'
// }
// [3] 路由器偶尔断流排查笔记 先重启光猫再重启路由；信道改成自动或固定 36；固件升级到官网最新版；还不行就还原出厂单独测网线。
//     metadata: {
//   id: 'life_04',
//   source: 'es',
//   note_title: '路由器偶尔断流排查笔记',
//   note_body: '先重启光猫再重启路由；信道改成自动或固定 36；固件升级到官网最新版；还不行就还原出厂单独测网线。',
//   tags: [ '数码', '折腾' ],
//   mood: '烦躁',
//   priority: 2,
//   created_at: '2026-06-28T12:27:58.895Z',
//   updated_at: '2026-06-28T12:27:58.895Z'
// }

// === Milvus 检索 (6 条) ===
// [0] 路由器偶尔断流排查笔记 先重启光猫再重启路由；信道改成自动或固定 36；固件升级到官网最新版；还不行就还原出厂单独测网线。
//     metadata: {
//   id: 'life_04',
//   note_title: '路由器偶尔断流排查笔记',
//   note_body: '先重启光猫再重启路由；信道改成自动或固定 36；固件升级到官网最新版；还不行就还原出厂单独测网线。',
//   mood: '烦躁',
//   priority: 2,
//   tags: '数码,折腾'
// }
// [1] 出差酒店网速玄学 同一个SSID走廊尽头满格会议室里假信号；连手机热点写周报反而稳；视频会议尽量靠窗座位别躲在最里间死角。
//     metadata: {
//   id: 'life_10',
//   note_title: '出差酒店网速玄学',
//   note_body: '同一个SSID走廊尽头满格会议室里假信号；连手机热点写周报反而稳；视频会议尽量靠窗座位别躲在最里间死角。',
//   mood: '无奈',
//   priority: 2,
//   tags: '差旅,办公'
// }
// [2] 半夜趴窗台透气 脑子停不下来就一直复盘白天在会上说的话，越想越清醒；干脆开窗吹两分钟冷风，把手机扔到客厅充电再回屋。
//     metadata: {
//   id: 'life_09',
//   note_title: '半夜趴窗台透气',
//   note_body: '脑子停不下来就一直复盘白天在会上说的话，越想越清醒；干脆开窗吹两分钟冷风，把手机扔到客厅充电再回屋。',
//   mood: '飘',
//   priority: 2,
//   tags: '情绪,失眠'
// }
// [3] 阳台绿植浇水频率 绿萝见干再浇，龟背竹叶面可以偶尔喷水；夏天蒸发快早上看一眼土表，冬天少浇防止烂根。
//     metadata: {
//   id: 'life_03',
//   note_title: '阳台绿植浇水频率',
//   note_body: '绿萝见干再浇，龟背竹叶面可以偶尔喷水；夏天蒸发快早上看一眼土表，冬天少浇防止烂根。',
//   mood: '碎碎念',
//   priority: 1,
//   tags: '家务,植物'
// }
// [4] 晚饭后遛狗路线 小区东门出去沿河岸走一圈大概四十分钟，记得带拾便袋和水壶；下雨天改地下停车场那层绕两圈也行。
//     metadata: {
//   id: 'life_02',
//   note_title: '晚饭后遛狗路线',
//   note_body: '小区东门出去沿河岸走一圈大概四十分钟，记得带拾便袋和水壶；下雨天改地下停车场那层绕两圈也行。',
//   mood: '放松',
//   priority: 3,
//   tags: '宠物,散步'
// }
// [5] 净水器滤芯更换记录 官网登记的机身序列 SN-MILO-77821；上次换的是第三代 RO 复合滤芯，配件订单号 PO-20250409-K9；下次提醒换前置 PP 棉。
//     metadata: {
//   id: 'life_05',
//   note_title: '净水器滤芯更换记录',
//   note_body: '官网登记的机身序列 SN-MILO-77821；上次换的是第三代 RO 复合滤芯，配件订单号 PO-20250409-K9；下次提醒换前置 PP 棉。',
//   mood: '琐事',
//   priority: 1,
//   tags: '家务,维保'
// }

// === 重排后保留 (3 条) ===
// [0] 路由器偶尔断流排查笔记 先重启光猫再重启路由；信道改成自动或固定 36；固件升级到官网最新版；还不行就还原出厂单独测网线。
//     metadata: {
//   id: 'life_04',
//   source: 'es',
//   note_title: '路由器偶尔断流排查笔记',
//   note_body: '先重启光猫再重启路由；信道改成自动或固定 36；固件升级到官网最新版；还不行就还原出厂单独测网线。',
//   tags: [ '数码', '折腾' ],
//   mood: '烦躁',
//   priority: 2,
//   created_at: '2026-06-28T12:27:58.895Z',
//   updated_at: '2026-06-28T12:27:58.895Z'
// }
// [1] 出差酒店网速玄学 同一个SSID走廊尽头满格会议室里假信号；连手机热点写周报反而稳；视频会议尽量靠窗座位别躲在最里间死角。
//     metadata: {
//   id: 'life_10',
//   source: 'es',
//   note_title: '出差酒店网速玄学',
//   note_body: '同一个SSID走廊尽头满格会议室里假信号；连手机热点写周报反而稳；视频会议尽量靠窗座位别躲在最里间死角。',
//   tags: [ '差旅', '办公' ],
//   mood: '无奈',
//   priority: 2,
//   created_at: '2026-06-28T12:27:58.895Z',
//   updated_at: '2026-06-28T12:27:58.895Z'
// }
// [2] 半夜趴窗台透气 脑子停不下来就一直复盘白天在会上说的话，越想越清醒；干脆开窗吹两分钟冷风，把手机扔到客厅充电再回屋。
//     metadata: {
//   id: 'life_09',
//   note_title: '半夜趴窗台透气',
//   note_body: '脑子停不下来就一直复盘白天在会上说的话，越想越清醒；干脆开窗吹两分钟冷风，把手机扔到客厅充电再回屋。',
//   mood: '飘',
//   priority: 2,
//   tags: '情绪,失眠'
// }

// === 大模型生成回答 ===

// 根据笔记里记录的排查方法，你可以试试这几步：

// - 先重启光猫，再重启路由器（顺序别反了）
// - 把无线信道改成自动，或者直接固定到 36
// - 去官网把路由器固件升级到最新版
// - 如果还不行，就还原出厂设置，单独用网线直连测试一下稳定性

// 笔记里没提到其他解决方案，如果这些都不管用，建议你联系宽带客服看看是不是线路本身的问题。