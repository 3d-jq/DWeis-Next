// Agent service proxy 的 renderer-local 单调代际。
// DWeis Next 无云绑定：原 remoteAgentServiceGeneration.ts 随远程工作区更名保留；
// session/registry 入口先预分配，异步 consumer 再按对象身份读取同一代际，避免 effect 乱序回切。
const generations = new WeakMap<object, number>();
let nextGeneration = 1;

export function agentServiceGeneration(agentService: object): number {
  const existing = generations.get(agentService);
  if (existing !== undefined) return existing;

  const generation = nextGeneration++;
  generations.set(agentService, generation);
  return generation;
}
