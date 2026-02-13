import * as React from "react"

const Slider = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => {
  return (
    <input
      type="range"
      className={`w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer ${className}`}
      ref={ref}
      {...props}
    />
  )
})
Slider.displayName = "Slider"

export { Slider }
