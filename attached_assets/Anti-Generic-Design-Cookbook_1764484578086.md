# The 2025 Anti-Generic Design Prompt Cookbook

## 1. ROLE SETUP (Always Start Here)

    Act as an Editorial Art Director for a high-end architectural and cultural magazine (Kinfolk, Cereal, Apartamento, Architectural Digest). 
    Design digital interfaces that feel like physical objects. 
    Prioritize typography, negative space, print-era restraint, and warmth. 
    Avoid all visual tropes commonly produced by AI tools.

## 2. VISUAL LANGUAGE: THE MASTER KEYWORDS

### Use These Keywords Explicitly in Prompts

**Core Aesthetic Vocabulary:**\
Curated, Tactile, Archival, Softly-lit, Warm Minimalism, Quiet Luxury,
Editorial, Matte, Paper-like, Grain, Analog-feel

**Color Lexicon:**\
Warm Neutrals, Alabaster, Bone, Cream, Oat, Terracotta, Sepia-wash, Deep
Moss, Espresso, Forest Green, Charcoal Matte

**Texture Vocabulary:**\
Paper grain, Soft film grain, Ink-bleed edges, Risograph imperfection,
Natural fibers, Linen texture, Gentle analog noise, Matte shadows

**Typography Vocabulary:**\
High-contrast Serif, Literary Serif, Classic Editorial Typeface, Optical
size serif, Swiss International Style sans, Minimal grotesk

### Words to Explicitly BAN

Neon, Holographic, Electric Blue, Purple gradients, Chrome, Futuristic,
High-tech, Cyberpunk, Glowing, Glossy, Polished, Plastic, Glassmorphism,
Bubbly Rounded Sans, Hover-bounce animation, 3D blobs, Oversaturated
gradients

    Avoid neon, avoid gradients, avoid glowing lights, avoid glassmorphism, avoid plastic shine, avoid 3D blob shapes, avoid rounded bubbly UI, avoid futuristic or cyberpunk aesthetics.

## 3. LAYOUT PRINCIPLES (THE PRINT-TO-DIGITAL RULESET)

    Use a magazine-style layout. 
    Avoid generic card grids or symmetrical SaaS layouts. 
    Use asymmetrical composition with intentional imbalance. 
    Use abundant negative space.
    Frame content with 1px solid lines (charcoal #333 or #222). 
    Use no drop shadows.
    Use sharp corners (radius 0–2px only).

    Headline sits far left or far right.
    Body text offset in a quiet, airy column.
    Use large editorial typography with generous line-height.

    Spacing: Think in spreads, not components.
    Visual pacing: Slow, calm, elegant.

## 4. THE CORE DESIGN RECIPE (Use for UI Generators)

    Create a digital interface with a Warm Editorial aesthetic.

    BACKGROUND:
    - Use a matte, warm neutral (#FDFCF8 or slightly darker cream).
    - Absolutely no gradients.

    TYPOGRAPHY:
    - Headlines: High-contrast serif (Tiempos, Editorial New, Vollkorn, or Playfair Display).
      Weight: Bold or Semi-bold. 
      Tracking: -0.02em. 
      Optical sizing on.
    - Body text: Minimal Swiss sans (Inter, Geist, Helvetica Now).
      Line-height: 1.5–1.65 for airiness.
    - Use large editorial scale (e.g., 48–64px display serif).

    COLOR SYSTEM:
    - Primary: Deep Moss (#0F2C1F) or Espresso (#2B1F1A).
    - Secondary: Terracotta (#D96F52) or Soft Clay (#C7896C).
    - Neutrals: Alabaster, Ivory, Warm Gray (#C4C0B8).
    - Never use blue as a primary.

    UI ELEMENTS:
    - No rounded corners (radius 0–2px only).
    - No shadows. Use thin 1px separators only.
    - Buttons: Flat, text-first, simple border or underline.

    IMAGERY:
    - All images framed with 1px charcoal border.
    - Apply subtle film grain, matte texture.
    - Lighting: soft natural light, no artificial glow.

    INTERACTION:
    - Slow ease-out transitions (0.4–0.6s).
    - No bounce or spring animations.

    CONSTRAINTS:
    No futuristic icons.
    No AI-looking blobby gradients.
    No neon color.
    No glossy plastic textures.

## 5. THE MIDJOURNEY / FLUX IMAGE GENERATOR RECIPE

    /imagine
    A refined, high-fidelity UI mockup styled like a modern editorial magazine.
    Warm creamy background, matte textures, soft natural diffused lighting.
    High-contrast serif headings, minimal Swiss sans body copy.
    Forest green accents, thin 1px charcoal frames around images.
    Asymmetrical composition, abundant negative space.
    Shot on 35mm film with gentle grain and analog character.
    Muted palette: alabaster, terracotta, moss, bone, charcoal.

    --no neon, --no gradient, --no glowing lights, --no techno shapes
    --no 3d, --no plastic gloss, --no glassmorphism, --no purple or electric blue
    --style raw --ar 3:2

## 6. TYPOGRAPHY PROMPT PACK

    Typography must feel premium and editorial.
    Headlines: High-contrast serif (Tiempos / Editorial New / Playfair Display / Lyon Display).
    Body: Minimal grotesk (Inter / Geist / Helvetica Now).
    Use generous line-height and tight headline tracking for an editorial feel.
    Avoid rounded sans, avoid futuristic fonts, avoid bubbly geometric type.

## 7. COLOR PALETTE PROMPT PACK

    Use a warm, tactile palette:
    Cream (#FDFCF8)
    Alabaster (#F7F3EA)
    Bone (#EDE7D9)
    Terracotta (#D96F52)
    Deep Moss (#0F2C1F)
    Charcoal matte (#2A2A2A)
    Warm gray (#C4C0B8)

    Avoid cold palettes, avoid neon, avoid electric blue.
    Colors must feel analog, matte, earth-based.

## 8. MAGIC ANALOG EFFECTS

    Apply minimal analog imperfections:
    - mild film grain
    - paper texture
    - soft vignette
    - subtle ink bleed
    - printed-page contrast curve
    - very soft shadowing like studio photography on matte objects
    No digital shine or glossy reflections.

## 9. COMPONENT GENERATION PROMPT

    Generate this component using a print-inspired layout.
    Do not use shadows or gradients.
    Use a thin 1px charcoal (#333) line for separation.
    Typography must follow editorial rules: serif headline, minimal sans body.
    Use warm matte background (#FDFCF8).
    Spacing must be airy and purposeful.
    Alignment should be asymmetrical, never perfectly centered.

## 10. PAGE GENERATION PROMPT

    Create a landing page in a Warm Editorial aesthetic.

    HERO:
    - Oversized serif headline aligned left.
    - Subtle Swiss sans subtext far right.
    - Matte cream background.
    - Soft film-grain hero image with a 1px charcoal frame.

    SECTIONS:
    - Use asymmetrical layouts throughout.
    - Combine large serif typography with small minimal body text.
    - Allow whitespace to dominate the page.
    - Include thin horizontal rules (1px solid #222) for structure.

    CTA:
    - Simple serif text button.
    - No background color, no shadow, underline on hover.

    OVERALL:
    - Avoid any generic SaaS look.
    - Avoid blue primary.
    - Avoid card grids.
    - Avoid rounded UI elements.

## 11. "DO WHAT I MEAN, NOT WHAT AI TRENDS DO" SAFETY BLOCK

    Do NOT follow typical AI-generated design trends.
    Do NOT use components, spacing, or grids common in AI UI generators.
    Avoid all futuristic / cyberpunk / glossy / gradient styles.
    Prioritize human warmth, tactility, print influence, and editorial elegance.

## 12. THE FINAL MASTER PROMPT

    Create a digital interface in a Warm Editorial, Human-Centric aesthetic.
    Act as an Editorial Art Director for Kinfolk or Architectural Digest.

    AESTHETIC:
    - Warm neutrals, matte textures, analog grain.
    - High-contrast serif headlines, Swiss sans body.
    - Asymmetrical magazine-style layout.
    - Abundant negative space.
    - Thin 1px charcoal borders.
    - No gradients, no neon, no glowing, no rounded corners, no shadows.

    TYPOGRAPHY:
    - Serif: Tiempos/Editorial New/Playfair (large, tight tracking).
    - Sans: Inter/Geist (airy line-height).

    COLORS:
    - Cream, bone, alabaster, terracotta, deep moss, charcoal matte.

    IMAGES:
    - Soft natural lighting, film grain, matte finish.
    - Framed with thin 1px border.

    INTERACTION:
    - Slow, subtle ease-out transitions.
    - No bounce, no glossy effects.

    AVOID:
    Neon, blue primary, glassmorphism, plastic shine, 3D blobs, futurism, tech gradients.

    GOAL:
    Make the design feel curated, tactile, analog, editorial, human, and premium.
    Make it look nothing like a generic AI-generated UI.
