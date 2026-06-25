import {
  Annotation,
  END,
  START,
  StateGraph
} from "@langchain/langgraph";

const StateAnnotation = Annotation.Root({
  tries: Annotation({
    reducer: (_prev, next) => next,
    default: () => 0,
  }),
  ok: Annotation({
    reducer: (_prev, next) => next,
    default: () => false,
  }),
  message: Annotation({
    reducer: (_prev, next) => next,
    default: () => "",
  }),
});

const attempt = (state) => {
  const tries = state.tries + 1;
  const ok = tries >= 3;
  return {
    tries,
    ok,
    message: ok ? `第 ${tries} 次成功` : `第 ${tries} 次失败，继续重试`,
  };
};

const graph = new StateGraph(StateAnnotation)
  .addNode("attempt", attempt)
  .addEdge(START, "attempt")
  .addConditionalEdges("attempt", (state) => (state.ok ? "done" : "retry"), {
    retry: "attempt",
    done: END,
  })
  .compile();

// 导出为 Mermaid：可复制到 https://mermaid.live 或 Markdown 的 ```mermaid 代码块
const drawable = await graph.getGraphAsync();
const mermaid = drawable.drawMermaid({
  withStyles: true
});
console.log(mermaid);

const result = await graph.invoke({
  tries: 0
});
console.log("result:", result);

// %%{init: {'flowchart': {'curve': 'linear'}}}%%
// graph TD;
// 	__start__([<p>__start__</p>]):::first
// 	attempt(attempt)
// 	__end__([<p>__end__</p>]):::last
// 	__start__ --> attempt;
// 	attempt -. &nbsp;done&nbsp; .-> __end__;
// 	attempt -. &nbsp;retry&nbsp; .-> attempt;
// 	classDef default fill:#f2f0ff,line-height:1.2;
// 	classDef first fill-opacity:0;
// 	classDef last fill:#bfb6fc;

// result: { tries: 3, ok: true, message: '第 3 次成功' }