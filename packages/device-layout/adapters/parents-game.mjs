// Parents' game adapter (AUG-1024). Scoped after stack inspection on that
// ticket; until then it refuses rather than producing an empty, passing snapshot.
// If the stack is Godot, reuse ./godot.mjs; if it is web/RN, reuse ./snapscore.mjs.
export function fromParentsGame() {
  throw new Error('parents-game adapter not scoped yet (AUG-1024): inspect the stack, then map it onto godot.mjs or snapscore.mjs');
}
