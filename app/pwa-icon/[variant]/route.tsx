import { ImageResponse } from "next/og";
import { PWA_ICON_VARIANTS, PWA_THEME_COLOR, parsePwaIconVariant } from "@/lib/pwa";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return PWA_ICON_VARIANTS.map((variant) => ({ variant }));
}

/** Family-graph glyph: two parents joined by a union line, with two children below. */
function FamilyGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <g stroke="#ffffff" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M36 30 H64" />
        <path d="M50 30 V52 M30 52 H70 M30 52 V62 M70 52 V62" />
      </g>
      <circle cx="28" cy="30" r="11" fill="#93c5fd" stroke="#ffffff" strokeWidth="4" />
      <circle cx="72" cy="30" r="11" fill="#f9a8d4" stroke="#ffffff" strokeWidth="4" />
      <circle cx="30" cy="73" r="10" fill="#ffffff" />
      <circle cx="70" cy="73" r="10" fill="#ffffff" />
    </svg>
  );
}

export async function GET(_request: Request, { params }: { params: Promise<{ variant: string }> }) {
  const { variant } = await params;
  const parsed = parsePwaIconVariant(variant);
  if (!parsed) return new Response("Not found", { status: 404 });

  const { size, maskable } = parsed;
  // Maskable icons must keep content inside the central 80% safe zone and fill the full canvas.
  const glyphSize = Math.round(size * (maskable ? 0.62 : 0.78));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(135deg, ${PWA_THEME_COLOR} 0%, #7c3aed 100%)`,
          borderRadius: maskable ? 0 : Math.round(size * 0.22),
        }}
      >
        <FamilyGlyph size={glyphSize} />
      </div>
    ),
    {
      width: size,
      height: size,
      headers: { "Cache-Control": "public, max-age=31536000, immutable" },
    },
  );
}
