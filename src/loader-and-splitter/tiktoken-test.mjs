import {
  getEncoding,
  getEncodingNameForModel,
} from "js-tiktoken";

const modelName = "gpt-4";
const encodingName = getEncodingNameForModel(modelName);
console.log(`模型 ${modelName} 使用的编码方式是 ${encodingName}`);

const enc = getEncoding(encodingName);
console.log('apple', enc.encode('apple').length);
console.log('pineapple', enc.encode('pineapple').length);
console.log('苹果', enc.encode('苹果').length);
console.log('吃饭', enc.encode('吃饭').length);
console.log('一二三', enc.encode('一二三').length);

console.log('-'.repeat(50));

console.log(`模型 gpt-5 使用的编码方式是 ${getEncodingNameForModel("gpt-5")}`);
const enc5 = getEncoding(getEncodingNameForModel("gpt-5"));
console.log('apple', enc5.encode('apple').length);
console.log('pineapple', enc5.encode('pineapple').length);
console.log('苹果', enc5.encode('苹果').length);
console.log('吃饭', enc5.encode('吃饭').length);
console.log('一二三', enc5.encode('一二三').length);