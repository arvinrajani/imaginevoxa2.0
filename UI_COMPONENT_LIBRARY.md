# Pro Studio - Visual Component Reference

## 🎨 Quick Color Palette

### Primary Gradients
```
Cyan-Blue-Purple:  #06b6d4 → #3b82f6 → #8b5cf6
Amber-Orange:      #f59e0b → #f97316
Green-Emerald:     #10b981 → #059669
```

### Tab Colors
```
Generate:    Cyan (#06b6d4) → Blue (#3b82f6)
Composer:    Purple (#8b5cf6) → Pink (#ec4899)
Templates:   Blue (#3b82f6) → Indigo (#6366f1)
Schedule:    Green (#10b981) → Emerald (#059669)
Editor:      Orange (#f97316) → Red (#ef4444)
Assets:      Pink (#ec4899) → Rose (#f43f5e)
```

---

## 🖼️ Component Snippets

### Gradient Button
```tsx
<Button
  className="px-10 py-7 text-lg font-bold 
             bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 
             hover:from-cyan-600 hover:via-blue-600 hover:to-purple-600 
             shadow-2xl hover:shadow-cyan-500/50 
             transition-all hover:scale-105"
>
  Button Text
</Button>
```

### Glass Card
```tsx
<Card className="glass-card hover-lift">
  <div className="p-8">
    Content here
  </div>
</Card>
```

### PRO Badge
```tsx
<Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white">
  <Crown className="w-3 h-3 mr-1" />
  PRO
</Badge>
```

### Gradient Text
```tsx
<h1 className="text-6xl font-black">
  <span className="bg-gradient-to-r from-cyan-600 to-blue-600 
                   bg-clip-text text-transparent">
    Gradient Title
  </span>
</h1>
```

### Animated Background Blob
```tsx
<div className="absolute w-96 h-96 
                bg-cyan-400/20 
                rounded-full 
                blur-3xl 
                animate-pulse" />
```

### Progress Step (Active)
```tsx
<div className="w-14 h-14 rounded-2xl 
                bg-gradient-to-br from-cyan-500 to-blue-500 
                text-white shadow-lg shadow-cyan-500/50 
                flex items-center justify-center">
  <Icon className="w-6 h-6" />
</div>
```

### Color Pill
```tsx
<div className="flex items-center gap-3 
                px-5 py-3 
                bg-white/10 backdrop-blur-xl 
                rounded-2xl border border-white/20">
  <div className="flex gap-1.5">
    {brandColors.map((color, idx) => (
      <div
        key={idx}
        className="w-6 h-6 rounded-lg 
                   border-2 border-white/30 
                   shadow-lg 
                   transition-transform hover:scale-110"
        style={{ backgroundColor: color }}
      />
    ))}
  </div>
  <span className="text-white font-semibold">Brand Name</span>
</div>
```

---

## ⚡ Animation Classes

### Fade & Slide
```tsx
// Fade in from right
className="animate-in fade-in slide-in-from-right-4 duration-500"

// Fade in from bottom
className="animate-in fade-in slide-in-from-bottom-4 duration-500"

// Zoom in
className="animate-in fade-in zoom-in duration-500"
```

### Continuous Animations
```tsx
// Float
className="animate-float"

// Pulse
className="animate-pulse"

// Glow
className="animate-glow"

// Spin
className="animate-spin"

// Bounce
className="animate-bounce"
```

### Hover Effects
```tsx
// Lift on hover
className="hover-lift"

// Scale on hover
className="transition-transform hover:scale-105"

// Shadow on hover
className="hover:shadow-2xl hover:shadow-cyan-500/50"

// Shine on hover
className="premium-shine"
```

---

## 📐 Layout Patterns

### Feature Card Grid
```tsx
<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
  {features.map(feature => (
    <Card className="group hover-lift p-8">
      <div className="w-16 h-16 rounded-2xl 
                      bg-gradient-to-br from-cyan-500 to-cyan-600 
                      flex items-center justify-center 
                      mx-auto mb-6 
                      group-hover:scale-110 transition-transform">
        <Icon className="w-8 h-8 text-white" />
      </div>
      <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
      <p className="text-slate-600">{feature.description}</p>
    </Card>
  ))}
</div>
```

### Stats Banner
```tsx
<div className="grid grid-cols-3 gap-8">
  <div className="text-center">
    <div className="text-4xl font-black 
                    bg-gradient-to-r from-cyan-600 to-blue-600 
                    bg-clip-text text-transparent mb-2">
      3x
    </div>
    <div className="text-sm text-slate-600 font-medium">
      Faster Creation
    </div>
  </div>
  {/* Repeat for other stats */}
</div>
```

### Dark Premium Header
```tsx
<div className="relative p-8 rounded-3xl 
                bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 
                overflow-hidden">
  {/* Animated blobs */}
  <div className="absolute inset-0 opacity-10">
    <div className="absolute top-0 left-0 w-96 h-96 
                    bg-cyan-500 rounded-full blur-3xl animate-pulse" />
    <div className="absolute bottom-0 right-0 w-96 h-96 
                    bg-blue-500 rounded-full blur-3xl animate-pulse delay-1000" />
  </div>
  
  {/* Content */}
  <div className="relative">
    <h1 className="text-4xl font-black text-white">Title</h1>
    <p className="text-slate-300">Subtitle</p>
  </div>
</div>
```

---

## 🎯 Common Patterns

### Icon + Text Button
```tsx
<Button>
  <Icon className="w-5 h-5 mr-2" />
  Button Text
  <ArrowRight className="w-5 h-5 ml-2" />
</Button>
```

### Feature Card with Icon
```tsx
<Card className="group hover:shadow-2xl transition-all duration-500">
  <div className="w-12 h-12 rounded-full 
                  bg-cyan-100 
                  flex items-center justify-center 
                  mx-auto mb-4 
                  group-hover:bg-cyan-200 transition-colors">
    <Icon className="w-6 h-6 text-cyan-600" />
  </div>
  <h3 className="font-semibold mb-2">Title</h3>
  <p className="text-sm text-gray-600">Description</p>
</Card>
```

### Progress Indicator
```tsx
<div className="flex items-center justify-center gap-3">
  {steps.map((step, idx) => (
    <>
      <div className={`
        w-14 h-14 rounded-2xl flex items-center justify-center
        ${isActive ? 'bg-gradient-to-br from-cyan-500 to-blue-500 text-white' : 
          isComplete ? 'bg-gradient-to-br from-green-500 to-emerald-500 text-white' :
          'bg-slate-100 text-slate-400'}
      `}>
        {isComplete ? <CheckCircle2 /> : <Icon />}
      </div>
      {idx < steps.length - 1 && (
        <div className="relative w-20 h-1">
          <div className="absolute inset-0 bg-slate-200 rounded-full" />
          <div className={`absolute inset-0 rounded-full 
                          ${isComplete ? 'w-full bg-green-500' : 'w-0'}`} />
        </div>
      )}
    </>
  ))}
</div>
```

---

## 🎨 Color Utilities

### Background Gradients
```tsx
// Light backgrounds
className="bg-gradient-to-br from-slate-50 via-cyan-50/50 to-blue-50/50"

// Dark backgrounds  
className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900"

// Card backgrounds
className="bg-gradient-to-br from-white to-slate-50"
```

### Text Gradients
```tsx
// Primary gradient
className="bg-gradient-to-r from-cyan-600 via-blue-600 to-purple-600 
           bg-clip-text text-transparent"

// Success gradient
className="bg-gradient-to-r from-green-600 to-emerald-600 
           bg-clip-text text-transparent"

// Premium gradient
className="bg-gradient-to-r from-amber-500 to-orange-500 
           bg-clip-text text-transparent"
```

### Shadow Effects
```tsx
// Standard shadow
className="shadow-lg"

// Colored shadow (glow)
className="shadow-2xl shadow-cyan-500/50"

// Hover shadow
className="hover:shadow-2xl hover:shadow-cyan-500/50 transition-shadow"
```

---

## 📱 Responsive Patterns

### Mobile-First Grid
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
```

### Responsive Text
```tsx
<h1 className="text-4xl md:text-5xl lg:text-6xl font-bold">
```

### Responsive Spacing
```tsx
<div className="px-4 md:px-8 lg:px-12 py-6 md:py-10">
```

### Stack to Horizontal
```tsx
<div className="flex flex-col sm:flex-row items-center gap-4">
```

---

## 🎪 Special Effects

### Glass Morphism
```tsx
className="bg-white/10 backdrop-blur-xl border border-white/20"
```

### Neumorphism (Soft)
```tsx
className="bg-gray-100 shadow-inner"
```

### Glow Text
```tsx
className="text-cyan-400 drop-shadow-[0_0_10px_rgba(6,182,212,0.5)]"
```

### Frosted Glass
```tsx
className="bg-white/80 backdrop-blur-md"
```

### Metallic Gradient
```tsx
className="bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200"
```

---

## 🔧 Utility Classes (studio.css)

### Custom Classes
- `.glass-card` - Glass morphism card
- `.hover-lift` - Hover elevation
- `.premium-shine` - Shine on hover
- `.animate-float` - Floating animation
- `.animate-glow` - Glow pulse
- `.gradient-text-animated` - Animated gradient text
- `.fade-in-viewport` - Viewport entry
- `.stagger-children` - Staggered animations

### Usage
```tsx
<Card className="glass-card hover-lift premium-shine">
  <div className="animate-float">
    <Icon className="animate-glow" />
  </div>
</Card>
```

---

## 🎯 Icon Sizes

```tsx
// Micro (badges)
className="w-3 h-3"  // 12px

// Small (tabs)
className="w-4 h-4"  // 16px

// Medium (buttons)
className="w-5 h-5"  // 20px

// Large (features)
className="w-8 h-8"  // 32px

// Hero
className="w-16 h-16"  // 64px
```

---

## 🎨 Border Radius Scale

```tsx
// Small
className="rounded-lg"    // 8px

// Medium
className="rounded-xl"    // 12px

// Large
className="rounded-2xl"   // 16px

// XL
className="rounded-3xl"   // 24px

// Full
className="rounded-full"  // 9999px
```

---

## ⚡ Performance Tips

1. Use `transform` and `opacity` for animations (GPU accelerated)
2. Avoid animating `width`, `height`, or `top/left`
3. Add `will-change` for frequently animated elements
4. Use CSS transitions over JavaScript when possible
5. Debounce scroll/resize listeners
6. Lazy load images with `loading="lazy"`

---

## 📚 Component Library

All components in `/components/studio/`:
- `brand-analyzer.tsx` - Brand DNA extraction
- `visual-style-wizard.tsx` - Style configuration
- `asset-manager.tsx` - Logo/banner uploads
- `post-generator.tsx` - AI post creation
- `image-editor.tsx` - Canvas editor
- `advanced-composer.tsx` - Multi-layer composition
- `smart-scheduler.tsx` - AI scheduling
- `brand-stamp-designer.tsx` - Watermark creator
- `template-library.tsx` - 8 professional templates

---

**Pro Studio - Enterprise-Grade Design System**
*Version 1.0 | February 2026*
