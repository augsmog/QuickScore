export function createLiveShareOperationGate() {
  let generation = 0;
  return {
    begin: () => ++generation,
    invalidate: () => ++generation,
    isCurrent: (operationId: number) => generation === operationId,
  };
}
