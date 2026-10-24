export function shareText(item: { title: string; url: string; context?: string }): string {
  return `${item.context ? item.context + ' — ' : ''}${item.title}\n${item.url}`
}
