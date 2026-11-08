import { type ComponentProps, useId } from "react"

type Icon = "minus" | "plus" | "fit" | "reset" | "expand" | "collapse" | "source" | "diagram"

const paths: Record<Icon, string> = {
  minus: "M5 12h14",
  plus: "M5 12h14M12 5v14",
  fit: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M8 8h8v8H8z",
  reset: "M4 10a8 8 0 1 1 1 7M4 4v6h6",
  expand: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5",
  collapse: "M3 8h5V3m8 0v5h5M8 21v-5H3m13 5v-5h5",
  source: "m8 6-6 6 6 6m8-12 6 6-6 6M14 4l-4 16",
  diagram: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
}

export function DiagramControl({
  label,
  icon,
  ...props
}: { label: string; icon: Icon } & Omit<ComponentProps<"button">, "children">) {
  const tooltipId = useId()
  return (
    <span className="diagram-control-wrap">
      <button
        {...props}
        type="button"
        className="diagram-control"
        aria-label={label}
        aria-describedby={tooltipId}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d={paths[icon]} />
        </svg>
      </button>
      <span id={tooltipId} className="diagram-tooltip" role="tooltip">
        {label}
      </span>
    </span>
  )
}
