import { translateUiText, type Language } from "./translations";

const originalText = new WeakMap<Text, string>();
const translatedText = new WeakMap<Text, string>();
const originalAttributes = new WeakMap<Element, Map<string, string>>();
const translatedAttributes = new WeakMap<Element, Map<string, string>>();

/** Translate known interface copy while leaving guest names and other stored data untouched. */
export function observeUiTranslations(language: Language): () => void {
  const attributes = ["aria-label", "placeholder", "title"];

  const visit = (root: Node) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    const nodes: Node[] = [root];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const textNode = node as Text;
        if (!textNode.data.trim()) continue;
        const lastOutput = translatedText.get(textNode);
        if (lastOutput === undefined || textNode.data !== lastOutput) originalText.set(textNode, textNode.data);
        const source = originalText.get(textNode) ?? textNode.data;
        const output = translateUiText(language, source);
        if (output !== textNode.data) textNode.data = output;
        translatedText.set(textNode, output);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        if (element.closest("script,style,noscript")) continue;
        const originals = originalAttributes.get(element) ?? new Map<string, string>();
        const outputs = translatedAttributes.get(element) ?? new Map<string, string>();
        for (const attribute of attributes) {
          const current = element.getAttribute(attribute);
          if (current === null) continue;
          if (!outputs.has(attribute) || current !== outputs.get(attribute)) originals.set(attribute, current);
          const source = originals.get(attribute) ?? current;
          const output = translateUiText(language, source);
          if (current !== output) element.setAttribute(attribute, output);
          outputs.set(attribute, output);
        }
        originalAttributes.set(element, originals);
        translatedAttributes.set(element, outputs);
      }
    }
  };

  visit(document.body);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData" && mutation.target.parentNode) visit(mutation.target.parentNode);
      else for (const node of mutation.addedNodes) visit(node);
      if (mutation.type === "attributes") visit(mutation.target);
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: attributes,
  });
  return () => observer.disconnect();
}
