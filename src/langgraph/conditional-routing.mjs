import {
  Annotation,
  END,
  START,
  StateGraph
} from "@langchain/langgraph";

const StateAnnotation = Annotation.Root({
  query: Annotation({
    reducer: (_prev, next) => next,
    default: () => "",
  }),
  route: Annotation({
    reducer: (_prev, next) => next,
    default: () => "chat",
  }),
  answer: Annotation({
    reducer: (_prev, next) => next,
    default: () => "",
  }),
});

const router = (state) => {
  const isMath = /[+\-*/]/.test(state.query);
  return {
    route: isMath ? "math" : "chat"
  };
};

const mathNode = (state) => {
  try {
    return {
      answer: String(eval(state.query))
    };
  } catch {
    return {
      answer: "表达式无法计算"
    };
  }
};

const chatNode = (state) => ({
  answer: `你说的是：${state.query}`
});

const graph = new StateGraph(StateAnnotation)
  .addNode("router", router)
  .addNode("math", mathNode)
  .addNode("chat", chatNode)
  .addEdge(START, "router")
  // 参数：source, pathFn, targetMap
  .addConditionalEdges("router", (state) => state.route, {
    math: "math",
    chat: "chat",
  })
  .addEdge("math", END)
  .addEdge("chat", END)
  .compile();

// 导出为 Mermaid：可复制到 https://mermaid.live 或 Markdown 的 ```mermaid 代码块
const drawable = await graph.getGraphAsync();
const mermaid = drawable.drawMermaid({
  withStyles: true
});
console.log(mermaid);

console.log(
  "result:",
  await graph.invoke({
    query: "你好"
  })
);

console.log(
  "result:",
  await graph.invoke({
    query: "10 * 8"
  })
);

// %%{init: {'flowchart': {'curve': 'linear'}}}%%
// graph TD;
// 	__start__([<p>__start__</p>]):::first
// 	router(router)
// 	math(math)
// 	chat(chat)
// 	__end__([<p>__end__</p>]):::last
// 	__start__ --> router;
// 	chat --> __end__;
// 	math --> __end__;
// 	router -.-> math;
// 	router -.-> chat;
// 	classDef default fill:#f2f0ff,line-height:1.2;
// 	classDef first fill-opacity:0;
// 	classDef last fill:#bfb6fc;

// result: { query: '你好', route: 'chat', answer: '你说的是：你好' }
// result: { query: '10 * 8', route: 'math', answer: '80' }