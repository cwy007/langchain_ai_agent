import {
  createInterface
} from "node:readline/promises";
import {
  Annotation,
  Command,
  END,
  MemorySaver,
  START,
  StateGraph,
  interrupt,
} from "@langchain/langgraph";

const StateAnnotation = Annotation.Root({
  actionSummary: Annotation({
    reducer: (_prev, next) => next,
    default: () => "",
  }),
  userInput: Annotation({
    reducer: (_prev, next) => next,
    default: () => "",
  }),
});

/** 展示一笔待确认的转账 */
const showTransfer = () => ({
  actionSummary: "向张三转账 ¥100（模拟，不会真扣款）",
});

/** 停在这里等人输入；resume 的值会写进 userInput */
const waitConfirm = (state) => {
  const text = interrupt({
    hint: "终端里输入「确认」或备注后回车，图才会继续",
    actionSummary: state.actionSummary,
  });
  return {
    userInput: String(text)
  };
};

const graph = new StateGraph(StateAnnotation)
  .addNode("showTransfer", showTransfer)
  .addNode("waitConfirm", waitConfirm)
  .addEdge(START, "showTransfer")
  .addEdge("showTransfer", "waitConfirm")
  .addEdge("waitConfirm", END)
  .compile({
    checkpointer: new MemorySaver()
  });

// 导出为 Mermaid：可复制到 https://mermaid.live 或 Markdown 的 ```mermaid 代码块
const drawable = await graph.getGraphAsync();
const mermaid = drawable.drawMermaid({
  withStyles: true
});
console.log(mermaid);

const config = {
  configurable: {
    thread_id: "interrupt-demo"
  }
};

const paused = await graph.invoke({}, config);
console.log("\n待你确认：", paused.__interrupt__?. [0]?.value);

// 让用户在终端输入 resume 的值
const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});
const line = (await rl.question("> ")).trim();
await rl.close();

if (!line) {
  console.error("未输入，退出。");
  process.exit(1);
}

const done = await graph.invoke(new Command({
  resume: line
}), config);
console.log("结果：", done);

// %%{init: {'flowchart': {'curve': 'linear'}}}%%
// graph TD;
// 	__start__([<p>__start__</p>]):::first
// 	showTransfer(showTransfer)
// 	waitConfirm(waitConfirm)
// 	__end__([<p>__end__</p>]):::last
// 	__start__ --> showTransfer;
// 	showTransfer --> waitConfirm;
// 	waitConfirm --> __end__;
// 	classDef default fill:#f2f0ff,line-height:1.2;
// 	classDef first fill-opacity:0;
// 	classDef last fill:#bfb6fc;


// 待你确认： {
//   hint: '终端里输入「确认」或备注后回车，图才会继续',
//   actionSummary: '向张三转账 ¥100（模拟，不会真扣款）'
// }
// > 确认转账
// 结果： { actionSummary: '向张三转账 ¥100（模拟，不会真扣款）', userInput: '确认转账' }