export async function copyTextToClipboard(value: string) {
  await navigator.clipboard.writeText(value);
}
