import * as core from './core.mjs';
const pending = new Map();
let next = 0;
export const native = Boolean(window.GachlaganNative || window.webkit?.messageHandlers?.gachlagan);
window.gachlaganResolve = ({ id, result, error }) => {
  const task = pending.get(id);
  if (!task) return;
  clearTimeout(task.timeout); pending.delete(id);
  error ? task.reject(new Error(error)) : task.resolve(result);
};
export async function request(op, args = {}) {
  if (!native) {
    if (op === 'seal') return core.seal(args.text, args.secret);
    if (op === 'open') return core.open(args.wire, args.secret);
    if (op === 'generate') return core.generateKey();
    if (op === 'insert' || op === 'plain' || op === 'backspace' || op === 'next') {
      window.parent.postMessage({ source: 'gachlagan', op, ...args }, window.location.origin); return true;
    }
    if (op === 'clipboard') return window.gachlaganPreviewClipboard ?? navigator.clipboard.readText();
    if (op === 'saveKey') throw new Error('The browser preview keeps keys in memory only.');
    if (op === 'loadKey') return '';
    return true;
  }
  return new Promise((resolve, reject) => {
    const id = ++next;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error('The keyboard did not respond. Try again.')); }, 20000);
    pending.set(id, { resolve, reject, timeout });
    const message = { id, op, ...args };
    if (window.GachlaganNative) window.GachlaganNative.postMessage(JSON.stringify(message));
    else window.webkit.messageHandlers.gachlagan.postMessage(message);
  });
}
