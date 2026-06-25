import {
  Annotation,
  END,
  START,
  StateGraph
} from "@langchain/langgraph";

// 定义状态注解
const StateAnnotation = Annotation.Root({
  text: Annotation({
    reducer: (_prev, next) => next, // 合并逻辑
    default: () => "", // 默认值
  }),
});

// 定义状态转换函数
const step1 = (state) => ({
  text: `${state.text} -> step1`
});
const step2 = (state) => ({
  text: `${state.text} -> step2`
});

const graph = new StateGraph(StateAnnotation)
  .addNode("step1", step1)
  .addNode("step2", step2)
  .addEdge(START, "step1")
  .addEdge("step1", "step2")
  .addEdge("step2", END)
  .compile();

// 导出为 Mermaid：可复制到 https://mermaid.live 或 Markdown 的 ```mermaid 代码块
const drawable = await graph.getGraphAsync();
const mermaid = drawable.drawMermaid({
  withStyles: true
});
console.log(mermaid);

const result = await graph.invoke({
  text: "hello"
});
console.log("result:", result);

// %%{init: {'flowchart': {'curve': 'linear'}}}%%
// graph TD;
// 	__start__([<p>__start__</p>]):::first
// 	step1(step1)
// 	step2(step2)
// 	__end__([<p>__end__</p>]):::last
// 	__start__ --> step1;
// 	step1 --> step2;
// 	step2 --> __end__;
// 	classDef default fill:#f2f0ff,line-height:1.2;
// 	classDef first fill-opacity:0;
// 	classDef last fill:#bfb6fc;

// result: { text: 'hello -> step1 -> step2' }