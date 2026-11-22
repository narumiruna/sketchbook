export function drawing(label: string, width = 420, height = 120): string {
  const text = label.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#e5edf3"/><text x="16" y="32" font-size="18" fill="#20364b">${text}</text></svg>`
}
