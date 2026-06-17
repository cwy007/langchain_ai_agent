import 'dotenv/config';
import {
  RunnablePassthrough,
  RunnableLambda,
  RunnableSequence,
  RunnableMap
} from "@langchain/core/runnables";

const chain = RunnableSequence.from([
  // RunnableLambda.from((input) => ({
  //   concept: input
  // })),
  // RunnableMap.from({
  //   original: new RunnablePassthrough(),
  //   processed: RunnableLambda.from((obj) => ({
  //     concept: input,
  //     upper: obj.concept.toUpperCase(),
  //     length: obj.concept.length,
  //   }))
  // })
  //
  // 上面写法等价于下面这种更简洁的写法
  // Langchain 会将函数转成 RunnableLambda，将对象转成 RunnableMap
  (input) => ({
    concept: input
  }),
  {
    original: new RunnablePassthrough(),
    processed: (obj) => ({
      concept: obj.concept,
      upper: obj.concept.toUpperCase(),
      length: obj.concept.length,
    })
  }
]);

const input = "神说要有光";
const result = await chain.invoke(input);
console.log(result);

// {
//   original: { concept: '神说要有光' },
//   processed: { concept: '神说要有光', upper: '神说要有光', length: 5 }
// }