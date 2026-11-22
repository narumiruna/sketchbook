import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./app"
import { installEditorialFonts } from "./editorial-fonts"
import "katex/dist/katex.min.css"
import "./styles.css"

installEditorialFonts(document)

const session = {
  documentId: new URLSearchParams(location.search).get("documentId") ?? "",
  token: new URLSearchParams(location.hash.slice(1)).get("token") ?? "",
}
const root = document.getElementById("root")
if (!root) throw new Error("Missing viewer root")
createRoot(root).render(
  <StrictMode>
    <App session={session} />
  </StrictMode>,
)
