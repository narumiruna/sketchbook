import instrument from "@fontsource/instrument-serif/latin-400.css?inline"
import instrumentExt from "@fontsource/instrument-serif/latin-ext-400.css?inline"
import geist from "@fontsource-variable/geist?inline"
import geistMono from "@fontsource-variable/geist-mono?inline"
import notoSans from "@fontsource-variable/noto-sans-tc?inline"
import notoSerif from "@fontsource-variable/noto-serif-tc?inline"

const fonts = [instrument, instrumentExt, geist, geistMono, notoSans, notoSerif]
  .join("\n")
  .replace(/(Geist(?: Mono)?|Noto (?:Sans|Serif) TC) Variable/g, "$1")

export function installEditorialFonts(document: Document) {
  const style = document.createElement("style")
  style.textContent = fonts
  document.head.prepend(style)
}
