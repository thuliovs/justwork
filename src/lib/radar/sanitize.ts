const BLOCK_TAG = /<\/?(?:address|article|aside|blockquote|br|div|dl|dt|dd|figcaption|figure|footer|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tr|ul)[^>]*>/giu;

export function sanitizeDescriptionHtml(value: string | null | undefined) {
  if (!value) return "";
  return value
    .replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1\s*>/giu, "")
    .replace(BLOCK_TAG, "\n")
    .replace(/<[^>]+>/gu, "")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/\n[ \t]+/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}
